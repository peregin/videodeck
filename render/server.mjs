import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir, readdir, rm } from 'fs/promises';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import {
  DEFAULT_MAX_COMPLETED_JOBS,
  DEFAULT_MAX_RENDER_DIRECTORIES,
  DEFAULT_SLIDE_THEME,
  DEFAULT_STILL_SECONDS,
  DEFAULT_TRANSITION,
  FPS,
  estimateSlideSeconds,
  getThemeId,
  getTransition,
  isValidTheme,
  isValidTransition,
  isValidVoice,
  parseJobTimestamp,
  parseSlides,
  toPercent,
} from '../shared/videodeck-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const renderEntry = path.join(projectRoot, 'render', 'index.tsx');
const rendersRoot = path.join(projectRoot, 'renders');
const defaultPort = Number(process.env.PORT || 3210);

const jobs = new Map();
let kokoroPromise = null;

const stageTemplate = () => [
  { id: 'parse', label: 'Parse Slides', status: 'pending', message: 'Waiting for render job.', progress: 0 },
  { id: 'voice', label: 'Generate Kokoro Voice', status: 'pending', message: 'Waiting for narration synthesis.', progress: 0 },
  { id: 'compose', label: 'Prepare Remotion Composition', status: 'pending', message: 'Waiting for composition props.', progress: 0 },
  { id: 'render', label: 'Render Final Video', status: 'pending', message: 'Waiting for video render.', progress: 0 },
];

const createJob = () => {
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    jobId,
    status: 'queued',
    message: 'Render queued.',
    videoUrl: null,
    stages: stageTemplate(),
  };
  jobs.set(jobId, job);
  pruneCompletedJobs();
  return job;
};

const updateStage = (jobId, stageId, next) => {
  const job = jobs.get(jobId);
  if (!job) return;

  job.stages = job.stages.map((stage) => (stage.id === stageId ? { ...stage, ...next } : stage));
  if (next.message) {
    job.message = next.message;
  }
};

const setJobStatus = (jobId, status, message) => {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = status;
  job.message = message;
};

const getKokoro = async () => {
  if (!kokoroPromise) {
    const { KokoroTTS } = await import('kokoro-js');
    kokoroPromise = KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8',
      device: 'cpu',
    });
  }

  return kokoroPromise;
};

const pruneCompletedJobs = () => {
  const terminalJobs = [...jobs.values()]
    .filter((job) => job.status === 'completed' || job.status === 'failed')
    .sort((left, right) => parseJobTimestamp(left.jobId) - parseJobTimestamp(right.jobId));

  const excess = terminalJobs.length - DEFAULT_MAX_COMPLETED_JOBS;
  if (excess <= 0) {
    return;
  }

  for (const job of terminalJobs.slice(0, excess)) {
    jobs.delete(job.jobId);
  }
};

const pruneRenderOutputs = async () => {
  const entries = await readdir(rendersRoot, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => parseJobTimestamp(left.name) - parseJobTimestamp(right.name));

  const excess = directories.length - DEFAULT_MAX_RENDER_DIRECTORIES;
  if (excess <= 0) {
    return;
  }

  await Promise.all(
    directories.slice(0, excess).map((entry) => rm(path.join(rendersRoot, entry.name), { recursive: true, force: true })),
  );
};

const getBundleUrl = async (jobId) => {
  return bundle({
    entryPoint: renderEntry,
    onProgress: (progress) => {
      const percent = toPercent(progress);
      updateStage(jobId, 'compose', {
        status: 'running',
        progress: percent,
        message: `Bundling Remotion composition (${percent}%).`,
      });
    },
    publicDir: null,
  });
};

const runRenderJob = async (jobId, payload) => {
  const outputDir = path.join(rendersRoot, jobId);
  const outputFile = path.join(outputDir, 'videodeck.mp4');

  try {
    setJobStatus(jobId, 'running', 'Parsing markdown slides.');
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });

    updateStage(jobId, 'parse', {
      status: 'running',
      progress: 20,
      message: 'Parsing markdown into slides.',
    });

    const slides = parseSlides(payload.markdown);
    if (slides.length === 0) {
      throw new Error('No slides were found in the markdown source.');
    }

    updateStage(jobId, 'parse', {
      status: 'completed',
      progress: 100,
      message: `Parsed ${slides.length} slide${slides.length === 1 ? '' : 's'}.`,
    });

    updateStage(jobId, 'voice', {
      status: 'running',
      progress: 5,
      message: 'Checking narration requirements.',
    });

    const hasNarration = slides.some((slide) => slide.speakerNote);
    const kokoro = hasNarration ? await getKokoro() : null;
    if (!hasNarration) {
      updateStage(jobId, 'voice', {
        status: 'completed',
        progress: 100,
        message: 'No speaker notes found. Skipping narration synthesis.',
      });
    }

    const renderedSlides = [];
    for (let index = 0; index < slides.length; index += 1) {
      const slide = slides[index];
      let audioUrl = null;
      let durationInFrames = DEFAULT_STILL_SECONDS * FPS;

      if (slide.speakerNote) {
        updateStage(jobId, 'voice', {
          status: 'running',
          progress: Math.round(((index + 0.2) / slides.length) * 100),
          message: `Synthesizing slide ${index + 1} narration with Kokoro.`,
        });

        const audio = await kokoro.generate(slide.speakerNote, { voice: payload.voice, speed: 1 });
        const audioPath = path.join(outputDir, `slide-${index}.wav`);
        await audio.save(audioPath);

        const seconds = audio.audio.length / audio.sampling_rate;
        durationInFrames = Math.max(Math.round((seconds + 0.6) * FPS), DEFAULT_STILL_SECONDS * FPS);
        audioUrl = `http://localhost:${defaultPort}/renders/${jobId}/slide-${index}.wav`;
      } else {
        const estimatedSeconds = estimateSlideSeconds(slide);
        durationInFrames = estimatedSeconds * FPS;
      }

      renderedSlides.push({
        ...slide,
        audioUrl,
        durationInFrames,
      });

      if (hasNarration) {
        updateStage(jobId, 'voice', {
          status: 'running',
          progress: Math.round(((index + 1) / slides.length) * 100),
          message: `Completed Kokoro narration for ${index + 1} / ${slides.length} slides.`,
        });
      }
    }

    if (hasNarration) {
      updateStage(jobId, 'voice', {
        status: 'completed',
        progress: 100,
        message: 'Kokoro narration is ready.',
      });
    }

    updateStage(jobId, 'compose', {
      status: 'running',
      progress: 10,
      message: 'Preparing Remotion composition.',
    });

    const totalDurationInFrames = renderedSlides.reduce((sum, slide) => sum + slide.durationInFrames, 0);
    const inputProps = {
      slides: renderedSlides,
      slideTheme: getThemeId(payload.slideTheme),
      transition: getTransition(payload.transition),
      showCaptions: payload.showCaptions,
      totalDurationInFrames,
    };

    const serveUrl = await getBundleUrl(jobId);
    const composition = await selectComposition({
      serveUrl,
      id: 'VideoDeckComposition',
      inputProps,
    });

    updateStage(jobId, 'compose', {
      status: 'completed',
      progress: 100,
      message: 'Remotion composition is ready.',
    });

    updateStage(jobId, 'render', {
      status: 'running',
      progress: 2,
      message: 'Rendering final MP4.',
    });

    await renderMedia({
      serveUrl,
      composition,
      codec: 'h264',
      outputLocation: outputFile,
      inputProps,
      overwrite: true,
      onProgress: (progress) => {
        const percent = toPercent(progress.progress);
        updateStage(jobId, 'render', {
          status: 'running',
          progress: percent,
          message: `Rendering final MP4 (${percent}%).`,
        });
      },
    });

    updateStage(jobId, 'render', {
      status: 'completed',
      progress: 100,
      message: 'Final MP4 render completed.',
    });

    const job = jobs.get(jobId);
    if (!job) return;
    job.videoUrl = `/renders/${jobId}/videodeck.mp4`;
    setJobStatus(jobId, 'completed', 'Render complete. Your video is ready.');
    pruneCompletedJobs();
    await pruneRenderOutputs();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Render failed.';
    setJobStatus(jobId, 'failed', message);

    const currentJob = jobs.get(jobId);
    if (!currentJob) return;
    const runningStage = currentJob.stages.find((stage) => stage.status === 'running')?.id ?? 'render';
    updateStage(jobId, runningStage, {
      status: 'failed',
      message,
    });
    pruneCompletedJobs();
  }
};

const attachRenderRoutes = (app) => {
  app.use(express.json({ limit: '2mb' }));
  app.use('/renders', express.static(rendersRoot));

  app.get('/api/render/:jobId', (request, response) => {
    const job = jobs.get(request.params.jobId);
    if (!job) {
      response.status(404).json({ message: 'Render job not found.' });
      return;
    }

    response.json(job);
  });

  app.post('/api/render', async (request, response) => {
    const { markdown, voice, slideTheme, transition, showCaptions } = request.body ?? {};

    if (typeof markdown !== 'string' || !markdown.trim()) {
      response.status(400).send('`markdown` is required.');
      return;
    }

    if (typeof voice !== 'string' || !voice.trim()) {
      response.status(400).send('`voice` is required.');
      return;
    }

    if (!isValidVoice(voice)) {
      response.status(400).send('`voice` must be one of the supported Kokoro voices.');
      return;
    }

    if (slideTheme !== undefined && !isValidTheme(slideTheme)) {
      response.status(400).send(`\`slideTheme\` must be one of the supported themes. Default is \`${DEFAULT_SLIDE_THEME}\`.`);
      return;
    }

    if (transition !== undefined && !isValidTransition(transition)) {
      response.status(400).send(`\`transition\` must be one of the supported transitions. Default is \`${DEFAULT_TRANSITION}\`.`);
      return;
    }

    const job = createJob();
    response.status(202).json(job);

    void runRenderJob(job.jobId, {
      markdown,
      voice,
      slideTheme,
      transition,
      showCaptions: Boolean(showCaptions),
    });
  });

  app.post('/api/narration-preview', async (request, response) => {
    const { text, voice } = request.body ?? {};

    if (typeof text !== 'string' || !text.trim()) {
      response.status(400).send('`text` is required.');
      return;
    }

    if (typeof voice !== 'string' || !voice.trim()) {
      response.status(400).send('`voice` is required.');
      return;
    }

    if (!isValidVoice(voice)) {
      response.status(400).send('`voice` must be one of the supported Kokoro voices.');
      return;
    }

    try {
      const kokoro = await getKokoro();
      const audio = await kokoro.generate(text, { voice, speed: 1 });
      const wav = audio.toWav();
      response.setHeader('Content-Type', 'audio/wav');
      response.send(Buffer.from(wav));
    } catch (error) {
      response.status(500).send(error instanceof Error ? error.message : 'Narration preview failed.');
    }
  });
};

const createRenderApp = () => {
  const app = express();
  attachRenderRoutes(app);
  return app;
};

const startRenderServer = async (port = defaultPort) => {
  await mkdir(rendersRoot, { recursive: true });
  await pruneRenderOutputs();
  const app = createRenderApp();

  return app.listen(port, () => {
    console.log(`Video render server listening on http://localhost:${port}`);
  });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await startRenderServer(defaultPort);
}

export { attachRenderRoutes, createRenderApp, defaultPort, runRenderJob, startRenderServer };

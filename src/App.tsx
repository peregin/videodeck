import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Clock3,
  FileText,
  LoaderCircle,
  Maximize,
  Pause,
  Play,
  Settings2,
  Type,
  Video,
  Waves,
  XCircle,
} from 'lucide-react';

const KOKORO_VOICES = [
  { id: 'af_sarah', name: 'Sarah' },
  { id: 'af_kore', name: 'Kore' },
  { id: 'am_fenrir', name: 'Fenrir' },
  { id: 'am_puck', name: 'Puck' },
  { id: 'af_bella', name: 'Bella' },
  { id: 'af_nicole', name: 'Nicole' },
  { id: 'am_michael', name: 'Michael' },
];

const SLIDE_THEMES = {
  modern: 'bg-slate-950 text-white',
  classic: 'bg-white text-slate-900',
  neon: 'bg-black text-cyan-400 border-2 border-cyan-500/30',
  warm: 'bg-orange-50 text-stone-800',
} as const;

const TRANSITIONS = [
  { id: 'fade', name: 'Smooth Fade' },
  { id: 'slide', name: 'Horizontal Slide' },
  { id: 'zoom', name: 'Dynamic Zoom' },
] as const;

const DEFAULT_MARKDOWN = `
# Welcome to VideoDeck
![Tech](https://images.unsplash.com/photo-1498940757830-82f7813bf178?w=1200&q=80)
VideoDeck turns markdown into a narrated slide presentation with **Kokoro voice generation** and *Remotion video rendering*.
> Write once. Preview instantly. Render when ready.
This studio lets you edit markdown, review slide timing, listen to narration, and export the whole presentation as a final video.
Speaker Note: Welcome to VideoDeck. This first slide explains that the app turns markdown into narrated slides and a final rendered presentation video.
---
## How It Works
1. Write your presentation in markdown
2. Split slides with \`---\`
3. Add a \`Speaker Note:\` line for narration
- Choose a Kokoro voice
- Preview slide timing and narration
- Render the full video when the deck is ready
![Studio](https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=1200&q=80)
Speaker Note: This slide explains the workflow. You author markdown, split slides, add speaker notes, preview the results, and then render the final video.
---
## Markdown Features Rendered
### Supported Styling
Use **bold text**, *italic emphasis*, and inline \`code\` inside normal paragraphs.
- Bullet lists become styled talking points
1. Numbered lists become sequential steps
> Quotes turn into highlighted callouts
\`\`\`
const message = "Code blocks are rendered too";
\`\`\`
![Visual](https://images.unsplash.com/photo-1773001899177-7f642f65fd4c?w=800&q=80)
Speaker Note: This slide showcases the markdown syntax that VideoDeck renders visually, including headings, emphasis, lists, quotes, inline code, and code blocks.
---
## From Preview to Final Video
Press **Render Final Video** to generate the complete MP4.
- The pipeline parses slides
- Kokoro generates narration
- Remotion assembles the final video
Use **Cinema Mode** to watch the deck in a focused fullscreen presentation view before or after rendering.
![Cinema](https://images.unsplash.com/photo-1589535189132-7221b70db02a?w=1200&q=80)
Speaker Note: The final slide explains that once the preview looks right, VideoDeck can render the whole presentation into a finished video, and Cinema Mode gives you a clean viewing experience.
`;

type Slide = {
  content: string;
  speakerNote: string;
  image: string | null;
  title: string;
  body: string[];
};

type RenderStage = {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  message: string;
  progress: number;
};

type RenderJob = {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  message: string;
  videoUrl: string | null;
  stages: RenderStage[];
};

const estimateSlideSeconds = (slide: Slide) => {
  if (slide.speakerNote) {
    const words = slide.speakerNote.split(/\s+/).filter(Boolean).length;
    return Math.max(3, Math.ceil(words / 2.6));
  }

  const bodyWords = slide.body.join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.ceil(bodyWords / 3));
};

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const renderInlineMarkdown = (text: string) => {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);

  return tokens.map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={`${token}-${index}`} className="font-black text-white">{token.slice(2, -2)}</strong>;
    }

    if (token.startsWith('*') && token.endsWith('*')) {
      return <em key={`${token}-${index}`} className="italic text-white/90">{token.slice(1, -1)}</em>;
    }

    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={`${token}-${index}`} className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[0.9em] text-emerald-200">
          {token.slice(1, -1)}
        </code>
      );
    }

    return <span key={`${token}-${index}`}>{token}</span>;
  });
};

const renderSlideBody = (lines: string[]) => {
  const blocks: JSX.Element[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line === '```') {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && lines[index] !== '```') {
        codeLines.push(lines[index]);
        index += 1;
      }

      blocks.push(
        <pre key={`code-${index}`} className="overflow-x-auto rounded-2xl border border-white/10 bg-black/50 p-4 text-sm text-emerald-200">
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    if (line.startsWith('### ')) {
      blocks.push(
        <h3 key={`h3-${index}`} className="text-2xl font-black text-white/90">
          {renderInlineMarkdown(line.slice(4))}
        </h3>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      blocks.push(
        <div key={`ul-${index}`} className="flex items-start gap-3 text-lg md:text-2xl">
          <span className="mt-1 text-emerald-300">•</span>
          <p className="font-medium text-white/80">{renderInlineMarkdown(line.replace(/^[-*]\s+/, ''))}</p>
        </div>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const match = line.match(/^(\d+)\.\s+(.*)$/);
      blocks.push(
        <div key={`ol-${index}`} className="flex items-start gap-3 text-lg md:text-2xl">
          <span className="mt-0.5 min-w-6 font-black text-emerald-300">{match?.[1]}.</span>
          <p className="font-medium text-white/80">{renderInlineMarkdown(match?.[2] ?? line)}</p>
        </div>,
      );
      continue;
    }

    if (line.startsWith('>')) {
      blocks.push(
        <blockquote key={`quote-${index}`} className="border-l-4 border-emerald-400/60 bg-black/20 px-4 py-3 text-lg italic text-white/90 md:text-2xl">
          {renderInlineMarkdown(line.replace(/^>\s?/, ''))}
        </blockquote>,
      );
      continue;
    }

    blocks.push(
      <p key={`p-${index}`} className="text-lg font-medium leading-snug text-white/80 md:text-2xl">
        {renderInlineMarkdown(line)}
      </p>,
    );
  }

  return blocks;
};

const parseSlides = (source: string): Slide[] =>
  source
    .split(/^\s*---\s*$/m)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const speakerNoteMatch = block.match(/^\s*Speaker Note:\s*(.*)$/im);
      const speakerNote = speakerNoteMatch ? speakerNoteMatch[1].trim() : '';
      const content = block.replace(/^\s*Speaker Note:\s*.*$/im, '').trim();
      const title = content.match(/^#+\s*(.*)/m)?.[1]?.trim() || 'Untitled Slide';
      const body = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && !line.startsWith('!['));

      return {
        content,
        speakerNote,
        image: content.match(/!\[.*\]\((.*)\)/)?.[1] || null,
        title,
        body,
      };
    });

const getStageIcon = (status: RenderStage['status']) => {
  if (status === 'completed') return <CheckCircle2 size={16} className="text-emerald-400" />;
  if (status === 'failed') return <XCircle size={16} className="text-rose-400" />;
  if (status === 'running') return <LoaderCircle size={16} className="animate-spin text-indigo-400" />;
  return <Clock3 size={16} className="text-slate-500" />;
};

export default function VideoDeck() {
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [voice, setVoice] = useState(KOKORO_VOICES[0].id);
  const [slideTheme, setSlideTheme] = useState<keyof typeof SLIDE_THEMES>('modern');
  const [transition, setTransition] = useState<(typeof TRANSITIONS)[number]['id']>('fade');
  const [showCaptions, setShowCaptions] = useState(true);
  const [isCinemaMode, setIsCinemaMode] = useState(false);
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [playingSlideIndex, setPlayingSlideIndex] = useState<number | null>(null);
  const [loadingSlideIndex, setLoadingSlideIndex] = useState<number | null>(null);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);

  const slides = useMemo(() => parseSlides(markdown), [markdown]);
  const currentSlide = slides[currentSlideIndex] ?? slides[0];
  const isRendering = renderJob?.status === 'queued' || renderJob?.status === 'running';
  const slidesWithEstimates = useMemo(
    () =>
      slides.map((slide) => ({
        ...slide,
        estimatedSeconds: estimateSlideSeconds(slide),
      })),
    [slides],
  );
  const totalEstimatedSeconds = useMemo(
    () => slidesWithEstimates.reduce((sum, slide) => sum + slide.estimatedSeconds, 0),
    [slidesWithEstimates],
  );

  useEffect(() => {
    setCurrentSlideIndex((index) => Math.min(index, Math.max(slides.length - 1, 0)));
  }, [slides.length]);

  useEffect(() => {
    return () => {
      previewAudio?.pause();
      if (previewAudio?.src.startsWith('blob:')) {
        URL.revokeObjectURL(previewAudio.src);
      }
    };
  }, [previewAudio]);

  useEffect(() => {
    if (!renderJob?.jobId || !isRendering) return;

    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/render/${renderJob.jobId}`);
      if (!response.ok) return;

      const nextJob = (await response.json()) as RenderJob;
      setRenderJob(nextJob);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [renderJob?.jobId, isRendering]);

  const handleRenderVideo = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown,
          voice,
          slideTheme,
          transition,
          showCaptions,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Render request failed.');
      }

      const nextJob = (await response.json()) as RenderJob;
      setRenderJob(nextJob);
    } catch (error) {
      setRenderJob({
        jobId: 'local-error',
        status: 'failed',
        message: error instanceof Error ? error.message : 'Render request failed.',
        videoUrl: null,
        stages: [],
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNarrationPreview = async (slide: Slide, slideIndex: number) => {
    if (!slide.speakerNote) return;

    if (playingSlideIndex === slideIndex && previewAudio) {
      previewAudio.pause();
      previewAudio.currentTime = 0;
      setPlayingSlideIndex(null);
      return;
    }

    setLoadingSlideIndex(slideIndex);

    try {
      previewAudio?.pause();
      if (previewAudio?.src.startsWith('blob:')) {
        URL.revokeObjectURL(previewAudio.src);
      }

      const response = await fetch('/api/narration-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: slide.speakerNote,
          voice,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        setPlayingSlideIndex(null);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setPlayingSlideIndex(null);
        URL.revokeObjectURL(url);
      };

      setPreviewAudio(audio);
      setPlayingSlideIndex(slideIndex);
      await audio.play();
    } catch (error) {
      setRenderJob({
        jobId: 'preview-error',
        status: 'failed',
        message: error instanceof Error ? error.message : 'Narration preview failed.',
        videoUrl: null,
        stages: renderJob?.stages ?? [],
      });
      setPlayingSlideIndex(null);
    } finally {
      setLoadingSlideIndex(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-200">
      {!isCinemaMode && (
        <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0f0f12]/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20 ring-1 ring-emerald-400/30">
                <Clapperboard size={18} className="text-emerald-300" />
              </div>
              <div>
                <p className="text-lg font-black tracking-tight text-white">VideoDeck Render Studio</p>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Kokoro + Remotion Pipeline</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden rounded-full border border-white/5 bg-white/5 px-3 py-1 text-xs font-medium text-slate-400 md:flex">
                {slides.length} slides
              </div>
              <button
                onClick={handleRenderVideo}
                disabled={isSubmitting || isRendering || slides.length === 0}
                className="flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting || isRendering ? <LoaderCircle size={14} className="animate-spin" /> : <Video size={14} />}
                Render Final Video
              </button>
              <button
                onClick={() => setIsCinemaMode(true)}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <Maximize size={18} />
              </button>
            </div>
          </div>
        </header>
      )}

      <main className={`mx-auto flex max-w-[1600px] flex-col md:flex-row ${isCinemaMode ? 'fixed inset-0 z-[100] max-w-none bg-black' : ''}`}>
        {!isCinemaMode && (
          <aside className="w-full border-r border-white/5 bg-[#0f0f12] md:w-[420px]">
            <div className="space-y-6 p-5">
              <section className="space-y-3">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">
                  <FileText size={12} /> Markdown Source
                </label>
                <textarea
                  value={markdown}
                  onChange={(event) => setMarkdown(event.target.value)}
                  className="h-80 w-full resize-none rounded-2xl border border-white/5 bg-black/40 p-4 font-mono text-xs leading-relaxed outline-none transition focus:ring-1 focus:ring-emerald-500"
                  placeholder="--- Slide Split ---"
                />
              </section>

              <section className="space-y-4 border-t border-white/5 pt-6">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">
                  <Settings2 size={12} /> Render Settings
                </label>

                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300">Kokoro Voice</span>
                  <select
                    value={voice}
                    onChange={(event) => setVoice(event.target.value)}
                    className="w-full rounded-lg border border-white/5 bg-[#1a1a1e] p-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {KOKORO_VOICES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300">Presentation Theme</span>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.keys(SLIDE_THEMES).map((item) => (
                      <button
                        key={item}
                        onClick={() => setSlideTheme(item as keyof typeof SLIDE_THEMES)}
                        className={`rounded-lg border px-3 py-2 text-[10px] font-bold uppercase transition ${
                          slideTheme === item
                            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                            : 'border-white/5 bg-white/5 text-slate-500 hover:border-white/10'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300">Transition</span>
                  <select
                    value={transition}
                    onChange={(event) => setTransition(event.target.value as (typeof TRANSITIONS)[number]['id'])}
                    className="w-full rounded-lg border border-white/5 bg-[#1a1a1e] p-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {TRANSITIONS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-3">
                  <div className="flex items-center gap-2">
                    <Type size={14} className="text-emerald-300" />
                    <span className="text-xs font-bold text-slate-200">Rendered Captions</span>
                  </div>
                  <button
                    onClick={() => setShowCaptions((value) => !value)}
                    className={`relative h-5 w-10 rounded-full transition-colors ${showCaptions ? 'bg-emerald-500' : 'bg-slate-700'}`}
                  >
                    <div
                      className={`absolute top-1 h-3 w-3 rounded-full bg-white transition-all ${showCaptions ? 'left-6' : 'left-1'}`}
                    />
                  </button>
                </div>
              </section>

              <section className="space-y-4 border-t border-white/5 pt-6">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Render Pipeline</label>
                  {renderJob && <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{renderJob.status}</span>}
                </div>

                <div className="space-y-3">
                  {(renderJob?.stages ?? []).map((stage) => (
                    <div key={stage.id} className="rounded-2xl border border-white/5 bg-black/30 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {getStageIcon(stage.status)}
                          <span className="text-sm font-semibold text-white">{stage.label}</span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{Math.round(stage.progress)}%</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{stage.message}</p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div
                          className={`h-full rounded-full transition-all ${
                            stage.status === 'failed' ? 'bg-rose-400' : 'bg-emerald-400'
                          }`}
                          style={{ width: `${stage.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}

                  {!renderJob && (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-xs text-slate-500">
                      Launch a render to see each pipeline stage: slide parsing, Kokoro narration, composition prep, and final Remotion render.
                    </div>
                  )}
                </div>

                {renderJob && (
                  <div className={`rounded-2xl border p-4 text-sm ${renderJob.status === 'failed' ? 'border-rose-500/20 bg-rose-500/10 text-rose-100' : 'border-white/5 bg-white/5 text-slate-200'}`}>
                    <p className="font-semibold">{renderJob.message}</p>
                    {renderJob.videoUrl && (
                      <a className="mt-2 inline-block text-xs font-bold uppercase tracking-[0.2em] text-emerald-300" href={renderJob.videoUrl} target="_blank" rel="noreferrer">
                        Open Rendered Video
                      </a>
                    )}
                  </div>
                )}
              </section>
            </div>
          </aside>
        )}

        <section className="flex-1 bg-black/40 p-6 md:p-12">
          <div className="mx-auto max-w-[1100px] space-y-8">
            <div className={`relative aspect-video overflow-hidden rounded-[28px] ring-1 ring-white/5 ${SLIDE_THEMES[slideTheme]}`}>
              {currentSlide?.image && (
                <img
                  src={currentSlide.image}
                  alt="Slide visual"
                  className="absolute inset-0 h-full w-full object-cover opacity-30"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/70" />
              <div className="relative flex h-full flex-col justify-between p-10 md:p-14">
                <div className="max-w-4xl space-y-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-white/60">
                    Slide {currentSlideIndex + 1} / {slides.length}
                  </p>
                  <h1 className="max-w-3xl text-4xl font-black tracking-tight md:text-6xl">{currentSlide?.title}</h1>
                  <div className="space-y-3">{currentSlide ? renderSlideBody(currentSlide.body) : null}</div>
                </div>

                {showCaptions && currentSlide?.speakerNote && (
                  <div className="flex justify-center px-2">
                    <p className="max-w-4xl rounded-2xl bg-black/70 px-5 py-3 text-center text-sm font-medium text-white shadow-2xl backdrop-blur-md md:text-lg">
                      {currentSlide.speakerNote}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-x-auto rounded-[28px] border border-white/10 bg-[#0f0f12] p-4">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCurrentSlideIndex((value) => Math.max(0, value - 1))}
                    className="rounded-full p-2 text-slate-500 transition hover:text-white"
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    onClick={() => setCurrentSlideIndex((value) => Math.min(slides.length - 1, value + 1))}
                    className="rounded-full p-2 text-slate-500 transition hover:text-white"
                  >
                    <ChevronRight size={22} />
                  </button>
                  <div>
                    <p className="text-sm font-bold text-white">Slide Preview Bar</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Total Estimate</p>
                    <p className="text-sm font-semibold text-white">{formatDuration(totalEstimatedSeconds)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Transition</p>
                    <p className="text-sm font-semibold text-white">{TRANSITIONS.find((item) => item.id === transition)?.name}</p>
                  </div>
                  {isCinemaMode ? (
                    <button
                      onClick={() => setIsCinemaMode(false)}
                      className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/10"
                    >
                      Exit Studio
                    </button>
                  ) : (
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Voice</p>
                      <p className="text-sm font-semibold text-white">{KOKORO_VOICES.find((item) => item.id === voice)?.name}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                {slidesWithEstimates.map((slide, index) => {
                  const isCurrent = index === currentSlideIndex;
                  const isLoadingPreview = loadingSlideIndex === index;
                  const isPlayingPreview = playingSlideIndex === index;

                  return (
                    <div
                      key={`${slide.title}-${index}`}
                      className={`relative flex h-44 w-60 flex-shrink-0 flex-col justify-between overflow-hidden rounded-2xl border p-4 text-left transition ${
                        isCurrent
                          ? 'border-emerald-500/60 bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.14)]'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      {slide.image && (
                        <img
                          src={slide.image}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover opacity-20"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/85" />
                      <div className="relative flex items-start justify-between gap-3">
                        <span className="rounded-full border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">
                          {index + 1}
                        </span>
                        <span className="rounded-full border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">
                          {formatDuration(slide.estimatedSeconds)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setCurrentSlideIndex(index)}
                        className="relative space-y-2 text-left"
                      >
                        <p className="line-clamp-2 text-lg font-bold text-white">{slide.title}</p>
                        <p className="line-clamp-2 text-xs text-slate-300">
                          {slide.speakerNote || slide.body.join(' ') || 'No narration'}
                        </p>
                      </button>

                      <div className="relative flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                          <Waves size={12} />
                          {slide.speakerNote ? 'Narration Ready' : 'Visual Only'}
                        </div>
                        <button
                          type="button"
                          disabled={!slide.speakerNote || isLoadingPreview}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleNarrationPreview(slide, index);
                          }}
                          className="flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isLoadingPreview ? (
                            <LoaderCircle size={14} className="animate-spin" />
                          ) : isPlayingPreview ? (
                            <Pause size={14} />
                          ) : (
                            <Play size={14} />
                          )}
                          {isPlayingPreview ? 'Stop' : 'Play'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {renderJob?.videoUrl && (
              <div className="space-y-3 rounded-[28px] border border-white/10 bg-[#0f0f12] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">Rendered Output</p>
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Final MP4</p>
                  </div>
                  <a href={renderJob.videoUrl} target="_blank" rel="noreferrer" className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
                    Download
                  </a>
                </div>
                <video className="w-full rounded-2xl bg-black" controls src={renderJob.videoUrl} />
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Composition,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

type SlideTheme = 'modern' | 'classic' | 'neon' | 'warm';
type Transition = 'fade' | 'slide' | 'zoom';

type RenderSlide = {
  title: string;
  body: string[];
  image: string | null;
  speakerNote: string;
  audioUrl: string | null;
  durationInFrames: number;
};

type VideoProps = {
  slides: RenderSlide[];
  slideTheme: SlideTheme;
  transition: Transition;
  showCaptions: boolean;
  totalDurationInFrames: number;
};

const FPS = 30;
const WIDTH = 1280;
const HEIGHT = 720;

const defaultProps: VideoProps = {
  slides: [],
  slideTheme: 'modern',
  transition: 'fade',
  showCaptions: true,
  totalDurationInFrames: FPS * 4,
};

const themeStyles: Record<SlideTheme, { background: string; text: string; accent: string }> = {
  modern: { background: '#020617', text: '#f8fafc', accent: '#34d399' },
  classic: { background: '#f8fafc', text: '#0f172a', accent: '#2563eb' },
  neon: { background: '#020617', text: '#22d3ee', accent: '#06b6d4' },
  warm: { background: '#fff7ed', text: '#431407', accent: '#ea580c' },
};

const renderInlineMarkdown = (text: string, color: string) => {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);

  return tokens.map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={`${token}-${index}`} style={{ fontWeight: 900, color }}>
          {token.slice(2, -2)}
        </strong>
      );
    }

    if (token.startsWith('*') && token.endsWith('*')) {
      return (
        <em key={`${token}-${index}`} style={{ fontStyle: 'italic', color }}>
          {token.slice(1, -1)}
        </em>
      );
    }

    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code
          key={`${token}-${index}`}
          style={{
            backgroundColor: 'rgba(0,0,0,0.35)',
            borderRadius: 8,
            color: '#bbf7d0',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            fontSize: '0.9em',
            padding: '2px 8px',
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    }

    return <span key={`${token}-${index}`}>{token}</span>;
  });
};

const renderSlideBody = (lines: string[], color: string, accent: string) => {
  const blocks: React.ReactNode[] = [];

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
        <pre
          key={`code-${index}`}
          style={{
            backgroundColor: 'rgba(0,0,0,0.45)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 22,
            color: '#bbf7d0',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            fontSize: 24,
            margin: 0,
            overflow: 'hidden',
            padding: '24px 28px',
            whiteSpace: 'pre-wrap',
          }}
        >
          <code>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    if (line.startsWith('### ')) {
      blocks.push(
        <div key={`h3-${index}`} style={{ color, fontSize: 30, fontWeight: 900, lineHeight: 1.1 }}>
          {renderInlineMarkdown(line.slice(4), color)}
        </div>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      blocks.push(
        <div key={`ul-${index}`} style={{ alignItems: 'flex-start', color, display: 'flex', gap: 14, fontSize: 32, lineHeight: 1.25 }}>
          <span style={{ color: accent, fontWeight: 900 }}>•</span>
          <span style={{ opacity: 0.88 }}>{renderInlineMarkdown(line.replace(/^[-*]\s+/, ''), color)}</span>
        </div>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const match = line.match(/^(\d+)\.\s+(.*)$/);
      blocks.push(
        <div key={`ol-${index}`} style={{ alignItems: 'flex-start', color, display: 'flex', gap: 14, fontSize: 32, lineHeight: 1.25 }}>
          <span style={{ color: accent, fontWeight: 900, minWidth: 36 }}>{match?.[1]}.</span>
          <span style={{ opacity: 0.88 }}>{renderInlineMarkdown(match?.[2] ?? line, color)}</span>
        </div>,
      );
      continue;
    }

    if (line.startsWith('>')) {
      blocks.push(
        <div
          key={`quote-${index}`}
          style={{
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderLeft: `6px solid ${accent}`,
            borderRadius: 18,
            color,
            fontSize: 30,
            fontStyle: 'italic',
            lineHeight: 1.3,
            padding: '18px 24px',
          }}
        >
          {renderInlineMarkdown(line.replace(/^>\s?/, ''), color)}
        </div>,
      );
      continue;
    }

    blocks.push(
      <div key={`p-${index}`} style={{ color, fontSize: 32, lineHeight: 1.25, opacity: 0.88 }}>
        {renderInlineMarkdown(line, color)}
      </div>,
    );
  }

  return blocks;
};

const SlideScene: React.FC<{
  slide: RenderSlide;
  theme: SlideTheme;
  transition: Transition;
  showCaptions: boolean;
}> = ({ slide, theme, transition, showCaptions }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const visualTheme = themeStyles[theme];
  const entrance = spring({
    fps: FPS,
    frame,
    config: { damping: 14, stiffness: 80 },
  });

  const opacity = transition === 'fade'
    ? interpolate(frame, [0, 12, durationInFrames - 10, durationInFrames], [0, 1, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;

  const translateX = transition === 'slide' ? interpolate(frame, [0, 18], [120, 0], { extrapolateRight: 'clamp' }) : 0;
  const scale = transition === 'zoom' ? interpolate(frame, [0, 18], [1.12, 1], { extrapolateRight: 'clamp' }) : 1;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: visualTheme.background,
        color: visualTheme.text,
        opacity,
        transform: `translateX(${translateX}px) scale(${scale})`,
      }}
    >
      {slide.image ? (
        <Img
          src={slide.image}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.28,
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(180deg, rgba(15,23,42,0.10) 0%, rgba(15,23,42,0.38) 55%, rgba(2,6,23,0.82) 100%)',
          padding: 64,
          justifyContent: 'space-between',
        }}
      >
        <div style={{ maxWidth: 980 }}>
          <div
            style={{
              marginBottom: 20,
              color: visualTheme.accent,
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              fontSize: 18,
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
            }}
          >
            VideoDeck
          </div>
          <div
            style={{
              fontSize: 74,
              lineHeight: 1,
              fontWeight: 900,
              letterSpacing: '-0.04em',
              marginBottom: 28,
              transform: `translateY(${(1 - entrance) * 26}px)`,
              opacity: entrance,
            }}
          >
            {slide.title}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              maxWidth: 980,
              transform: `translateY(${(1 - entrance) * 18}px)`,
            }}
          >
            {renderSlideBody(slide.body, visualTheme.text, visualTheme.accent)}
          </div>
        </div>

        {showCaptions && slide.speakerNote ? (
          <div
            style={{
              alignSelf: 'center',
              maxWidth: 1040,
              padding: '18px 28px',
              borderRadius: 22,
              backgroundColor: 'rgba(0,0,0,0.65)',
              color: '#fff',
              fontSize: 28,
              lineHeight: 1.35,
              textAlign: 'center',
              backdropFilter: 'blur(12px)',
            }}
          >
            {slide.speakerNote}
          </div>
        ) : null}
      </AbsoluteFill>
      {slide.audioUrl ? <Audio src={slide.audioUrl} /> : null}
    </AbsoluteFill>
  );
};

const VideoDeckComposition: React.FC<VideoProps> = ({ slides, slideTheme, transition, showCaptions }) => {
  let startFrom = 0;

  return (
    <AbsoluteFill>
      {slides.map((slide, index) => {
        const from = startFrom;
        startFrom += slide.durationInFrames;

        return (
          <Sequence key={`${slide.title}-${index}`} from={from} durationInFrames={slide.durationInFrames}>
            <SlideScene slide={slide} theme={slideTheme} transition={transition} showCaptions={showCaptions} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="VideoDeckComposition"
      component={VideoDeckComposition}
      defaultProps={defaultProps}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      durationInFrames={defaultProps.totalDurationInFrames}
      calculateMetadata={({ props }) => ({
        durationInFrames: props.totalDurationInFrames,
      })}
    />
  );
};

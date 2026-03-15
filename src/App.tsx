import { useEffect, useRef, useState } from 'react';
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Settings, 
  Maximize, 
  Volume2, 
  Type, 
  Mic2, 
  FileText,
  Clock,
  Sparkles
} from 'lucide-react';

// --- Constants & Config ---
const API_KEY = "";
const MODELS = {
  TTS: "gemini-2.5-flash-preview-tts"
};

const KOKORO_VOICES = [
  { id: "Kore", name: "Kore (Balanced)" },
  { id: "Zephyr", name: "Zephyr (Deep/Warm)" },
  { id: "Puck", name: "Puck (Bright/Fast)" },
  { id: "Charon", name: "Charon (Mellow)" },
  { id: "Fenrir", name: "Fenrir (Authoritative)" },
  { id: "Leda", name: "Leda (Soft/Female)" },
  { id: "Orus", name: "Orus (Clear/Male)" },
  { id: "Aoede", name: "Aoede (Musical/Expressive)" }
];

const SLIDE_THEMES = {
  modern: "bg-slate-950 text-white",
  classic: "bg-white text-slate-900",
  neon: "bg-black text-cyan-400 border-2 border-cyan-500/30",
  warm: "bg-orange-50 text-stone-800"
};

const TRANSITIONS = [
  { id: "fade", name: "Smooth Fade" },
  { id: "slide", name: "Horizontal Slide" },
  { id: "zoom", name: "Dynamic Zoom" }
];

const DEFAULT_MARKDOWN = `
# Welcome to VideoDeck
---
## How it Works
Write markdown, get a video presentation instantly.
![Tech](https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&q=80)
Speaker Note: Welcome everyone to the future of presentation tools. VideoDeck makes creating reels as easy as writing a text file.
---
## Visual Media
You can include high-quality images and even link videos.
Speaker Note: Each slide can handle text, images, and embedded media. Notice how the captions sync with my voice.
---
## Cinema Mode
Try hitting the fullscreen button for a cinematic experience.
Speaker Note: Presentations don't have to be boring. Use the transition settings to customize the flow.
`;

type Slide = {
  content: string;
  speakerNote: string;
  image: string | null;
  title: string;
};

type AudioUrls = Record<number, string>;

export default function VideoDeck() {
  // --- State ---
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voice, setVoice] = useState(KOKORO_VOICES[0].id);
  const [slideTheme, setSlideTheme] = useState<keyof typeof SLIDE_THEMES>('modern');
  const [transition, setTransition] = useState<(typeof TRANSITIONS)[number]['id']>('fade');
  const [showCaptions, setShowCaptions] = useState(true);
  const [isCinemaMode, setIsCinemaMode] = useState(false);
  const [audioUrls, setAudioUrls] = useState<AudioUrls>({});
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- Parser ---
  useEffect(() => {
    const rawSlides = markdown.split('---').map((block): Slide => {
      const speakerNoteMatch = block.match(/Speaker Note:\s*(.*)/i);
      const speakerNote = speakerNoteMatch ? speakerNoteMatch[1] : "";
      const content = block.replace(/Speaker Note:\s*(.*)/i, '').trim();
      
      return {
        content,
        speakerNote,
        image: content.match(/!\[.*\]\((.*)\)/)?.[1] || null,
        title: content.match(/^#+\s*(.*)/m)?.[1] || "Untitled Slide"
      };
    });
    setSlides(rawSlides);
    setCurrentSlideIndex(0);
    setIsPlaying(false);
  }, [markdown]);

  // --- TTS Implementation ---
  const fetchTTS = async (text: string, slideIdx: number) => {
    if (!text) return;
    try {
      const payload = {
        contents: [{ parts: [{ text: `Say naturally: ${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
        },
        model: MODELS.TTS
      };

      const fetchWithRetry = async (retries = 5, delay = 1000) => {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELS.TTS}:generateContent?key=${API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('API Error');
        return await response.json();
      };

      const result = await fetchWithRetry();
      const pcmBase64 = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (pcmBase64) {
        const blob = await pcmToWavBlob(pcmBase64, 24000);
        const url = URL.createObjectURL(blob);
        setAudioUrls(prev => ({ ...prev, [slideIdx]: url }));
      }
    } catch (err) {
      console.error("TTS Generation Failed:", err);
    }
  };

  const pcmToWavBlob = async (base64Data: string, sampleRate: number) => {
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);
    view.setUint32(0, 0x52494646, false); // RIFF
    view.setUint32(4, 36 + len, true);
    view.setUint32(8, 0x57415645, false); // WAVE
    view.setUint32(12, 0x666d7420, false); // fmt 
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(36, 0x64617461, false); // data
    view.setUint32(40, len, true);

    return new Blob([wavHeader, bytes], { type: 'audio/wav' });
  };

  const generateAllAudio = async () => {
    setIsLoadingAudio(true);
    setAudioUrls({});
    for (let i = 0; i < slides.length; i++) {
      if (slides[i].speakerNote) await fetchTTS(slides[i].speakerNote, i);
    }
    setIsLoadingAudio(false);
  };

  const playSlide = (index: number) => {
    const audioUrl = audioUrls[index];
    if (audioUrl && audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.play().catch((e) => console.log("Playback blocked:", e));
    } else {
      const timer = setTimeout(() => { if (isPlaying) nextSlide(); }, 3000);
      return () => clearTimeout(timer);
    }
  };

  const nextSlide = () => {
    if (currentSlideIndex < slides.length - 1) {
      setCurrentSlideIndex(prev => prev + 1);
    } else {
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    if (isPlaying) return playSlide(currentSlideIndex);
    else if (audioRef.current) audioRef.current.pause();
  }, [isPlaying, currentSlideIndex]);

  const getTransitionStyles = (idx: number) => {
    const isCurrent = idx === currentSlideIndex;
    if (!isCurrent) return "opacity-0 absolute pointer-events-none";
    
    switch (transition) {
      case 'slide': return "translate-x-0 opacity-100 transition-all duration-700 ease-out";
      case 'zoom': return "scale-100 opacity-100 transition-all duration-700 ease-out";
      default: return "opacity-100 transition-opacity duration-700";
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-[#0a0a0c] text-slate-200">
      {/* APP HEADER: Modern, Fixed Top */}
      {!isCinemaMode && (
        <header className="h-16 border-b border-white/5 bg-[#0f0f12]/80 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.4)]">
              <Sparkles size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">VideoDeck <span className="text-indigo-400">Studio</span></span>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center bg-white/5 rounded-lg px-3 py-1 text-xs font-medium text-slate-400 border border-white/5">
              <Clock size={12} className="mr-2" /> 
              {slides.length} Slides
            </div>
            <button 
              onClick={generateAllAudio}
              disabled={isLoadingAudio}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-bold transition-all disabled:opacity-50"
            >
              {isLoadingAudio ? <Clock size={14} className="animate-spin" /> : <Mic2 size={14} />}
              Generate All Audio
            </button>
            <button 
              onClick={() => setIsCinemaMode(true)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
            >
              <Maximize size={18} />
            </button>
          </div>
        </header>
      )}

      <main className={`flex-1 flex flex-col md:flex-row overflow-hidden ${isCinemaMode ? 'fixed inset-0 z-[100] bg-black' : ''}`}>
        
        {/* APP SIDEBAR: Intuitive Editor Controls */}
        {!isCinemaMode && (
          <aside className="w-full md:w-[400px] border-r border-white/5 bg-[#0f0f12] flex flex-col">
            <div className="p-5 flex-1 overflow-y-auto space-y-6">
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <FileText size={12} /> Markdown Source
                  </label>
                </div>
                <textarea 
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  className="w-full h-80 bg-black/40 border border-white/5 rounded-xl p-4 font-mono text-xs focus:ring-1 focus:ring-indigo-500 outline-none resize-none transition-all leading-relaxed"
                  placeholder="--- Slide Split ---"
                />
              </section>

              <section className="space-y-4 border-t border-white/5 pt-6">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <Settings size={12} /> Studio Configuration
                </label>
                
                <div className="grid grid-cols-1 gap-5">
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-300">Voice Persona</span>
                    <select 
                      value={voice} 
                      onChange={(e) => setVoice(e.target.value)}
                      className="w-full bg-[#1a1a1e] border border-white/5 rounded-lg p-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                    >
                      {KOKORO_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-300">Presentation Theme</span>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.keys(SLIDE_THEMES).map((t) => (
                        <button 
                          key={t}
                          onClick={() => setSlideTheme(t as keyof typeof SLIDE_THEMES)}
                          className={`py-2 px-3 text-[10px] uppercase font-bold rounded-lg border transition-all ${slideTheme === t ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/50' : 'bg-white/5 border-white/5 text-slate-500 hover:border-white/10'}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-300">Global Transition</span>
                    <select 
                      value={transition} 
                      onChange={(e) => setTransition(e.target.value as (typeof TRANSITIONS)[number]['id'])}
                      className="w-full bg-[#1a1a1e] border border-white/5 rounded-lg p-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                    >
                      {TRANSITIONS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="flex items-center gap-2">
                    <Type size={14} className="text-indigo-400" />
                    <span className="text-xs font-bold text-slate-200">Captions</span>
                  </div>
                  <button 
                    onClick={() => setShowCaptions(!showCaptions)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${showCaptions ? 'bg-indigo-600' : 'bg-slate-700'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${showCaptions ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
              </section>
            </div>
          </aside>
        )}

        {/* PREVIEW CANVAS: The Presentation Area */}
        <section className="flex-1 relative flex flex-col items-center justify-center p-6 md:p-12 bg-black/40">
          
          <div className={`relative aspect-video w-full max-w-[1000px] rounded-2xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] overflow-hidden ${SLIDE_THEMES[slideTheme]} ring-1 ring-white/5`}>
            {slides.map((slide, idx) => (
              <div 
                key={idx} 
                className={`absolute inset-0 flex flex-col items-center justify-center p-12 text-center overflow-hidden ${getTransitionStyles(idx)}`}
              >
                <div className="max-w-4xl space-y-8">
                  {slide.image && (
                    <img 
                      src={slide.image} 
                      alt="Slide visual" 
                      className="mx-auto rounded-xl max-h-56 object-cover shadow-2xl transition-transform duration-1000 group-hover:scale-105"
                    />
                  )}
                  <div className="prose prose-slate max-w-none">
                    <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tight">
                      {slide.title}
                    </h2>
                    {slide.content.split('\n').map((line, lIdx) => {
                      if (line.startsWith('#') || line.startsWith('![')) return null;
                      return <p key={lIdx} className="text-lg md:text-2xl font-medium opacity-80 leading-snug">{line}</p>;
                    })}
                  </div>
                </div>
              </div>
            ))}

            {/* Captions */}
            {showCaptions && isPlaying && slides[currentSlideIndex]?.speakerNote && (
              <div className="absolute bottom-12 left-0 right-0 flex justify-center px-10 pointer-events-none z-50">
                <p className="bg-black/80 backdrop-blur-md text-white px-6 py-2 rounded-xl text-lg font-medium shadow-2xl animate-fade-in-up">
                  {slides[currentSlideIndex].speakerNote}
                </p>
              </div>
            )}

            {/* Timeline Progress */}
            <div className="absolute bottom-0 left-0 h-1 bg-white/10 w-full z-50">
              <div 
                className="h-full bg-indigo-500 transition-all duration-300 ease-linear"
                style={{ width: `${slides.length === 0 ? 0 : ((currentSlideIndex + 1) / slides.length) * 100}%` }}
              />
            </div>
          </div>

          {/* CONTROLS: Floating Dark UI */}
          <div className={`mt-10 flex items-center gap-6 px-8 py-4 bg-[#0f0f12]/95 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl transition-all ${isCinemaMode ? 'fixed bottom-12 z-[110] scale-110' : ''}`}>
            <button 
              onClick={() => setCurrentSlideIndex(Math.max(0, currentSlideIndex - 1))}
              className="p-2 text-slate-500 hover:text-white transition-colors"
            >
              <SkipBack size={24} fill="currentColor" />
            </button>
            
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-14 h-14 flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-500 active:scale-95 transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)]"
            >
              {isPlaying ? <Pause size={28} fill="white" /> : <Play size={28} fill="white" className="ml-1" />}
            </button>

            <button 
              onClick={() => setCurrentSlideIndex(Math.min(slides.length - 1, currentSlideIndex + 1))}
              className="p-2 text-slate-500 hover:text-white transition-colors"
            >
              <SkipForward size={24} fill="currentColor" />
            </button>

            <div className="h-8 w-px bg-white/10 mx-2" />

            <div className="flex flex-col items-center">
              <span className="text-xl font-bold tabular-nums text-white leading-none">{currentSlideIndex + 1}</span>
              <span className="text-[10px] uppercase font-black text-slate-500">of {slides.length}</span>
            </div>

            {isCinemaMode && (
              <button 
                onClick={() => setIsCinemaMode(false)}
                className="ml-4 px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-lg border border-white/5 transition-all"
              >
                Exit Studio
              </button>
            )}
          </div>
        </section>

        <audio ref={audioRef} onEnded={() => { if (isPlaying) nextSlide(); }} onError={() => { if (isPlaying) setTimeout(nextSlide, 2000); }} />
      </main>

      {/* FOOTER: Reel Navigation */}
      {!isCinemaMode && (
        <footer className="h-44 bg-[#0a0a0c] border-t border-white/5 p-6 overflow-x-auto">
          <div className="flex gap-6 h-full items-center">
            {slides.map((slide, idx) => (
              <button
                key={idx}
                onClick={() => { setCurrentSlideIndex(idx); setIsPlaying(false); }}
                className={`flex-shrink-0 w-52 h-full rounded-xl overflow-hidden relative group border-2 transition-all duration-300 ${
                  idx === currentSlideIndex ? 'border-indigo-600 scale-105 shadow-[0_0_30px_rgba(99,102,241,0.2)]' : 'border-white/5 opacity-40 hover:opacity-100'
                }`}
              >
                <div className={`absolute inset-0 ${SLIDE_THEMES[slideTheme]} flex flex-col items-center justify-center p-4 text-center`}>
                   <span className="text-[10px] line-clamp-2 uppercase font-black tracking-tight opacity-60 leading-tight">{slide.title}</span>
                </div>
                {slide.image && <img src={slide.image} className="absolute inset-0 w-full h-full object-cover opacity-20" />}
                <div className="absolute top-2 left-3 text-[10px] font-black text-slate-500">{idx + 1}</div>
                {audioUrls[idx] && <div className="absolute top-2 right-3"><Volume2 size={10} className="text-indigo-400" /></div>}
              </button>
            ))}
          </div>
        </footer>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fade-in-up 0.4s ease-out forwards; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}} />
    </div>
  );
}

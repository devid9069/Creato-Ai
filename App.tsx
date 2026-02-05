
import React, { useState, useEffect } from 'react';
import { generateContent, generateStudioImage } from './services/geminiService';
import { StudioResult, StudioConfig, Language, Gender, Tone, Speed, ContentType, HistoryItem, ScriptCategory, AspectRatio } from './types';
import { VOICES, TONES, SPEEDS, SCRIPT_CATEGORIES } from './constants';
import { VoiceInput } from './components/VoiceInput';
import { StudioOutput } from './components/StudioOutput';
import { saveHistoryToDB, loadHistoryFromDB, clearHistoryDB } from './services/dbService';

type View = 'studio' | 'history' | 'settings';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('studio');
  const [prompt, setPrompt] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<StudioResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  const [config, setConfig] = useState<StudioConfig>(() => {
    const saved = localStorage.getItem('creato_settings');
    const defaultVal = {
      language: Language.ENGLISH,
      primaryGender: Gender.MALE,
      voiceId: VOICES[0].id,
      tone: Tone.ENERGETIC,
      speed: Speed.NORMAL,
      volume: 1.0,
      contentType: ContentType.REEL,
      scriptCategory: ScriptCategory.TECH,
      durationMinutes: 0,
      durationSeconds: 30,
      aspectRatio: AspectRatio.VERTICAL
    };
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...defaultVal, ...parsed };
    }
    return defaultVal;
  });

  useEffect(() => {
    loadHistoryFromDB().then(setHistory).catch(console.error);
  }, []);

  useEffect(() => {
    localStorage.setItem('creato_settings', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    const isReel = config.contentType === ContentType.REEL;
    let mins = config.durationMinutes;
    let secs = config.durationSeconds;

    if (isReel) {
      if (mins > 0) {
        setConfig(prev => ({ ...prev, durationMinutes: 0, durationSeconds: 60 }));
      } else if (secs > 60) {
        setConfig(prev => ({ ...prev, durationSeconds: 60 }));
      }
    } else {
      const totalSecs = (mins * 60) + secs;
      if (totalSecs > 300) {
        setConfig(prev => ({ ...prev, durationMinutes: 5, durationSeconds: 0 }));
      }
    }
  }, [config.contentType, config.durationMinutes, config.durationSeconds]);

  const handleContentTypeChange = (type: ContentType) => {
    setConfig(prev => ({ 
      ...prev, 
      contentType: type,
      aspectRatio: type === ContentType.REEL ? AspectRatio.VERTICAL : AspectRatio.HORIZONTAL
    }));
  };

  const handleMinutesChange = (val: string) => {
    const mins = Math.max(0, Math.min(5, parseInt(val) || 0));
    setConfig(prev => ({ 
      ...prev, 
      durationMinutes: mins,
      durationSeconds: mins === 5 ? 0 : prev.durationSeconds 
    }));
  };

  const handleSecondsChange = (val: string) => {
    const isReel = config.contentType === ContentType.REEL;
    const maxSecs = isReel ? 60 : (config.durationMinutes === 5 ? 0 : 59);
    const secs = Math.max(0, Math.min(maxSecs, parseInt(val) || 0));
    setConfig(prev => ({ ...prev, durationSeconds: secs }));
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    const totalSecs = (config.durationMinutes * 60) + config.durationSeconds;
    if (totalSecs < 5) {
      alert("Minimum production duration is 5 seconds.");
      return;
    }

    setLoading(true);
    setProgress(0);
    setResult(null);
    try {
      const studioResult = await generateContent(prompt, config, (p) => setProgress(p));
      setResult(studioResult);
      
      const newItem: HistoryItem = {
        ...studioResult,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        prompt: prompt
      };
      
      const updatedHistory = [newItem, ...history].slice(0, 30);
      setHistory(updatedHistory);
      await saveHistoryToDB(updatedHistory);
    } catch (error: any) {
      console.error("Generation failed", error);
      const msg = error.message || "Production failed due to API limits or connection issues.";
      alert(`STUDIO ERROR: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateClip = async (index: number) => {
    if (!result) return;
    const item = history.find(h => h.id === (result as HistoryItem).id);
    const basePrompt = item?.prompt || prompt;
    const orientation = result.aspectRatio === AspectRatio.VERTICAL ? "Vertical 9:16 layout" : "Horizontal 16:9 layout";
    const regenPrompt = `Cinematic clip related to "${basePrompt}". Scene: "${result.title}". Category: ${config.scriptCategory}. ${orientation}.`;
    try {
      const newImage = await generateStudioImage(regenPrompt, result.aspectRatio);
      const newImages = [...result.images];
      newImages[index] = newImage;
      const updatedResult = { ...result, images: newImages };
      setResult(updatedResult);
      const updatedHistory = history.map(h => h.id === (result as HistoryItem).id ? { ...h, images: newImages } : h);
      setHistory(updatedHistory);
      await saveHistoryToDB(updatedHistory);
    } catch (error) {
      console.error("Clip regeneration failed", error);
    }
  };

  const handleRegenerateThumbnail = async () => {
    if (!result) return;
    const item = history.find(h => h.id === (result as HistoryItem).id);
    const basePrompt = item?.prompt || prompt;
    const orientation = result.aspectRatio === AspectRatio.VERTICAL ? "Vertical 9:16" : "Horizontal 16:9";
    const regenPrompt = `Eye-catching thumbnail for "${basePrompt}". Title: "${result.title}". ${orientation}.`;
    try {
      const newThumbnail = await generateStudioImage(regenPrompt, result.aspectRatio);
      const updatedResult = { ...result, thumbnail: newThumbnail };
      setResult(updatedResult);
      const updatedHistory = history.map(h => h.id === (result as HistoryItem).id ? { ...h, thumbnail: newThumbnail } : h);
      setHistory(updatedHistory);
      await saveHistoryToDB(updatedHistory);
    } catch (error) {
      console.error("Thumbnail regeneration failed", error);
    }
  };

  const clearHistory = async () => {
    if (confirm("Delete all projects?")) {
      await clearHistoryDB();
      setHistory([]);
    }
  };

  const CONTENT_TYPES = [
    { type: ContentType.REEL, icon: '📱', desc: '9:16 Shorts' },
    { type: ContentType.LONG, icon: '🎬', desc: '16:9 Video' },
    { type: ContentType.PODCAST, icon: '🎙️', desc: 'Podcast' },
    { type: ContentType.NEWS, icon: '📰', desc: 'News' }
  ];

  const getProgressLabel = (p: number) => {
    if (p < 25) return "Initializing AI Studio...";
    if (p < 30) return "Writing Professional Script...";
    if (p < 85) return `Generating Visual Assets (${p}%)...`;
    if (p < 95) return "Mastering Audio Voiceover...";
    return "Exporting Final Media Pack...";
  };

  const isReel = config.contentType === ContentType.REEL;

  return (
    <div className="min-h-screen bg-[#030712] text-gray-100 flex flex-col selection:bg-blue-500/30">
      <nav className="border-b border-gray-800/50 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex justify-between items-center bg-gray-900/30">
        <div 
          className="flex items-center gap-3 cursor-pointer group" 
          onClick={() => { setCurrentView('studio'); setResult(null); }}
        >
          <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20 group-hover:scale-105 transition-transform">
            <span className="font-outfit font-black text-xl italic text-white">C</span>
          </div>
          <span className="font-outfit font-bold text-2xl tracking-tighter">Creato AI</span>
        </div>
        <div className="hidden md:flex gap-4 text-sm font-medium">
          <button onClick={() => { setCurrentView('studio'); setResult(null); }} className={`px-4 py-1.5 rounded-full transition-all ${currentView === 'studio' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}>Studio</button>
          <button onClick={() => setCurrentView('history')} className={`px-4 py-1.5 rounded-full transition-all ${currentView === 'history' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}>History</button>
          <button onClick={() => setCurrentView('settings')} className={`px-4 py-1.5 rounded-full transition-all ${currentView === 'settings' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}>Settings</button>
        </div>
      </nav>

      <main className="flex-grow">
        {currentView === 'studio' && (
          <>
            {!result && !loading && (
              <div className="max-w-5xl mx-auto pt-12 px-4 space-y-10 pb-20">
                <div className="text-center space-y-3">
                  <h1 className="text-5xl md:text-6xl font-outfit font-black tracking-tight leading-[1.1]">
                    Professional <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-400">AI Content Studio</span>
                  </h1>
                  <p className="text-gray-500 text-lg font-medium">Full production with precise timing and SEO.</p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 text-center">Step 1: Choose Format</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {CONTENT_TYPES.map((item) => (
                      <button
                        key={item.type}
                        onClick={() => handleContentTypeChange(item.type)}
                        className={`relative p-5 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 group overflow-hidden ${
                          config.contentType === item.type 
                          ? 'border-blue-500 bg-blue-600/10 shadow-[0_0_20px_rgba(59,130,246,0.2)]' 
                          : 'border-gray-800 bg-gray-900/40 hover:border-gray-700'
                        }`}
                      >
                        <span className="text-3xl grayscale group-hover:grayscale-0 transition-all">{item.icon}</span>
                        <div className="text-center">
                          <p className={`font-bold text-sm ${config.contentType === item.type ? 'text-white' : 'text-gray-400'}`}>{item.type}</p>
                          <p className="text-[10px] text-gray-500 mt-1">{item.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 text-center">Step 2: Script Category</h3>
                  <div className="flex overflow-x-auto pb-4 gap-3 no-scrollbar snap-x">
                    {SCRIPT_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setConfig({ ...config, scriptCategory: cat })}
                        className={`whitespace-nowrap px-6 py-3 rounded-full border-2 transition-all font-bold text-sm snap-start ${
                          config.scriptCategory === cat
                          ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-900/30'
                          : 'bg-gray-900/40 border-gray-800 text-gray-400 hover:border-gray-700'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 text-center">
                    Step 3: Target Duration
                  </h3>
                  <div className="flex justify-center items-center gap-6">
                    <div className={`flex flex-col items-center gap-2 transition-opacity duration-300 ${isReel ? 'opacity-20 cursor-not-allowed' : 'opacity-100'}`}>
                      <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Minutes</label>
                      <input 
                        type="number" 
                        min="0" max={isReel ? "0" : "5"} 
                        value={config.durationMinutes}
                        disabled={isReel}
                        onChange={(e) => handleMinutesChange(e.target.value)}
                        className="bg-gray-900 border border-gray-700 text-blue-400 font-outfit font-black text-3xl w-24 text-center py-2 rounded-2xl focus:ring-2 ring-blue-500/50 outline-none shadow-inner disabled:bg-gray-950 transition-all"
                      />
                    </div>
                    <div className="text-4xl text-gray-700 font-black mt-6">:</div>
                    <div className="flex flex-col items-center gap-2">
                      <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Seconds</label>
                      <input 
                        type="number" 
                        min="0" max={isReel ? "60" : "59"} 
                        value={config.durationSeconds}
                        onChange={(e) => handleSecondsChange(e.target.value)}
                        className="bg-gray-900 border border-gray-700 text-blue-400 font-outfit font-black text-3xl w-24 text-center py-2 rounded-2xl focus:ring-2 ring-blue-500/50 outline-none shadow-inner transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900/40 border border-gray-800 rounded-3xl p-6 md:p-8 backdrop-blur-sm shadow-2xl space-y-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:grid-cols-5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-gray-500 ml-1">Voice</label>
                      <select value={config.voiceId} onChange={(e) => setConfig({ ...config, voiceId: e.target.value })} className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none">{VOICES.map(v => <option key={v.id} value={v.id}>{v.name} ({v.gender})</option>)}</select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-widest font-bold text-gray-500 ml-1">Tone</label>
                      <select value={config.tone} onChange={(e) => setConfig({ ...config, tone: e.target.value as Tone })} className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none">{TONES.map(t => <option key={t} value={t}>{t}</option>)}</select>
                    </div>
                  </div>

                  <div className="relative group">
                    <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={`Describe your content idea in detail...`} className="w-full h-40 bg-gray-950/50 border border-gray-700 rounded-2xl p-6 text-lg outline-none placeholder:text-gray-600 resize-none" />
                    <div className="absolute bottom-4 right-4 flex items-center gap-3">
                      <VoiceInput onTranscript={(text) => setPrompt(prev => prev ? prev + ' ' + text : text)} isListening={isListening} setIsListening={setIsListening} />
                      <button 
                        onClick={handleGenerate} 
                        disabled={!prompt.trim() || loading} 
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-8 py-4 rounded-full transition-all flex items-center gap-2 group/btn shadow-xl shadow-blue-900/20"
                      >
                        Start Production
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 px-6 text-center">
                <div className="relative">
                  <div className="w-32 h-32 border-4 border-blue-500/10 border-t-blue-500 rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center font-outfit font-black text-xl text-blue-500">{progress}%</div>
                </div>
                <div className="space-y-4 max-w-md w-full">
                  <h3 className="text-2xl font-outfit font-bold uppercase tracking-wider">Production in Progress...</h3>
                  <p className="text-gray-500 text-sm font-medium h-5">{getProgressLabel(progress)}</p>
                  <div className="w-full bg-gray-800 h-3 rounded-full overflow-hidden border border-gray-700 p-0.5 shadow-lg">
                    <div className="bg-gradient-to-r from-blue-600 to-purple-600 h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>
              </div>
            )}

            {result && !loading && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="sticky top-[73px] z-40 bg-gray-950/80 backdrop-blur-lg border-b border-gray-800 p-4 mb-4 shadow-xl">
                  <div className="max-w-6xl mx-auto flex justify-between items-center px-4">
                    <button onClick={() => setResult(null)} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm font-semibold transition-colors">New Production</button>
                    <button className="bg-blue-600 hover:bg-blue-700 text-xs px-4 py-2 rounded-lg font-bold transition-colors">Studio Ready</button>
                  </div>
                </div>
                <StudioOutput result={result} onRegenerateClip={handleRegenerateClip} onRegenerateThumbnail={handleRegenerateThumbnail} />
              </div>
            )}
          </>
        )}

        {currentView === 'history' && (
          <div className="max-w-6xl mx-auto pt-12 px-6 space-y-8 pb-20">
            <div className="flex justify-between items-end">
              <h2 className="text-4xl font-outfit font-black">Creation <span className="text-blue-500">History</span></h2>
              <button onClick={clearHistory} className="text-red-400 hover:text-red-300 text-sm font-bold border border-red-500/30 px-4 py-2 rounded-xl transition-all">Clear All</button>
            </div>
            {history.length === 0 ? (
              <div className="bg-gray-900/20 border border-gray-800 rounded-3xl p-20 text-center space-y-4">
                <p className="text-gray-600 text-xl font-medium">History empty.</p>
                <button onClick={() => setCurrentView('studio')} className="bg-blue-600 px-6 py-2 rounded-full text-sm font-bold shadow-lg shadow-blue-900/30">Start Project</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {history.map((item) => (
                  <div key={item.id} onClick={() => { setResult(item); setCurrentView('studio'); }} className="bg-gray-900/40 border border-gray-800 rounded-2xl p-5 hover:border-blue-500/50 transition-all cursor-pointer group space-y-4 shadow-md hover:shadow-blue-900/10">
                    <div className="aspect-video rounded-xl overflow-hidden relative"><img src={item.thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /></div>
                    <h3 className="font-bold text-lg line-clamp-1 group-hover:text-blue-400 transition-colors">{item.title}</h3>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {currentView === 'settings' && (
          <div className="max-w-3xl mx-auto pt-20 px-6 space-y-12">
            <div className="text-center space-y-2">
              <h2 className="text-4xl font-outfit font-black">Studio <span className="text-blue-500">Settings</span></h2>
            </div>
            <div className="bg-gray-900/40 border border-gray-800 rounded-3xl p-8 space-y-8 shadow-2xl">
              <div className="space-y-6 text-center">
                 <p className="text-gray-400">Settings are auto-saved to local storage.</p>
                 <button onClick={() => setCurrentView('studio')} className="bg-white text-black font-bold px-10 py-3 rounded-xl transition-all shadow-xl hover:bg-gray-200">Return to Studio</button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-800/50 py-12 bg-gray-950 mt-20">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col items-center md:items-start gap-2">
             <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-md flex items-center justify-center">
                   <span className="font-outfit font-black text-[10px] italic text-white">C</span>
                </div>
                <span className="font-outfit font-bold text-lg tracking-tight">Creato AI</span>
             </div>
             <p className="text-gray-500 text-sm">Universal AI Production System</p>
          </div>
          <div className="text-center md:text-right">
            <p className="text-gray-400 font-medium font-outfit">Built by <span className="text-white font-bold">Abhishek Sen</span></p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;

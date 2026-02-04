
import React, { useState } from 'react';
import { StudioResult, ContentType, AspectRatio } from '../types';

interface StudioOutputProps {
  result: StudioResult;
  onRegenerateClip: (index: number) => Promise<void>;
  onRegenerateThumbnail: () => Promise<void>;
}

export const StudioOutput: React.FC<StudioOutputProps> = ({ result, onRegenerateClip, onRegenerateThumbnail }) => {
  const [regeneratingClipIndex, setRegeneratingClipIndex] = useState<number | null>(null);
  const [isRegeneratingThumbnail, setIsRegeneratingThumbnail] = useState(false);

  const isVertical = result.aspectRatio === AspectRatio.VERTICAL;

  const downloadAudio = () => {
    if (!result.audioUrl) return;
    const link = document.createElement('a');
    link.href = result.audioUrl;
    
    const copyrightNotice = "Copyright by Creator AI. made by Abhishek Sen";
    const safeTitle = result.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const safeCopyright = copyrightNotice.replace(/[^a-z0-9]/gi, '_');
    
    link.download = `${safeTitle}_VO_${safeCopyright}.mp3`;
    link.click();
  };

  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  };

  const handleClipRegen = async (idx: number) => {
    setRegeneratingClipIndex(idx);
    await onRegenerateClip(idx);
    setRegeneratingClipIndex(null);
  };

  const handleThumbnailRegen = async () => {
    setIsRegeneratingThumbnail(true);
    await onRegenerateThumbnail();
    setIsRegeneratingThumbnail(false);
  };

  return (
    <div className="space-y-12 pb-20 max-w-6xl mx-auto px-4">
      {/* Header Info */}
      <div className="text-center space-y-4 pt-10">
        <span className="bg-blue-600/20 text-blue-400 px-4 py-1.5 rounded-full text-sm font-semibold border border-blue-500/30 uppercase tracking-widest">
          {result.contentType} • {result.aspectRatio}
        </span>
        <h1 className="text-4xl md:text-5xl font-outfit font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 leading-tight">
          {result.title}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Visuals */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-gray-900/40 border border-gray-800 rounded-2xl overflow-hidden p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                Automatic Realistic Thumbnail
              </h2>
              <button 
                onClick={handleThumbnailRegen}
                disabled={isRegeneratingThumbnail}
                className="text-xs font-bold text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                {isRegeneratingThumbnail ? 'Regenerating...' : 'Regenerate'}
                <svg className={`w-3 h-3 ${isRegeneratingThumbnail ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
              </button>
            </div>
            
            {/* Thumbnail Container matching selection */}
            <div className={`relative group overflow-hidden rounded-xl border border-gray-700 bg-black/50 ${isVertical ? 'max-w-[400px] mx-auto shadow-[0_0_50px_rgba(59,130,246,0.1)]' : 'w-full shadow-2xl'}`}>
              <div className={`${isVertical ? 'aspect-[9/16]' : 'aspect-video'} relative w-full overflow-hidden`}>
                <img 
                  src={result.thumbnail} 
                  className={`w-full h-full object-cover transition-all duration-500 ${isRegeneratingThumbnail ? 'opacity-30 scale-95 blur-sm' : 'opacity-100 scale-100'}`}
                  alt="Thumbnail" 
                />
                
                {isRegeneratingThumbnail && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                     <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                     <span className="mt-4 text-xs font-bold text-blue-400 uppercase tracking-widest">Generating HD...</span>
                  </div>
                )}

                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                  <button 
                    onClick={() => downloadImage(result.thumbnail, `thumbnail_${result.title.replace(/\s+/g, '_')}.png`)}
                    className="bg-white text-black px-6 py-2 rounded-full font-bold text-sm shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all duration-300"
                  >
                    Download HD
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-gray-900/40 border border-gray-800 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
               <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
               AI Scene Clips
            </h2>
            <div className={`grid ${isVertical ? 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'} gap-4`}>
              {result.images.map((img, idx) => (
                <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-800 shadow-md bg-black/20">
                  <div className={`${isVertical ? 'aspect-[9/16]' : 'aspect-video'} w-full overflow-hidden`}>
                    <img src={img} className={`object-cover w-full h-full transition-all duration-500 ${regeneratingClipIndex === idx ? 'opacity-30 scale-95 blur-sm' : 'opacity-100 scale-100'}`} alt={`Clip ${idx+1}`} />
                  </div>
                  
                  {/* Regeneration & Download Overlay */}
                  <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity ${regeneratingClipIndex === idx ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} bg-black/60`}>
                    {regeneratingClipIndex === idx ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-6 h-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                        <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Updating...</span>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <button 
                          onClick={() => handleClipRegen(idx)}
                          className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-full shadow-lg transition-all hover:scale-110 active:scale-95"
                          title="Regenerate this specific clip"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        </button>
                        <button 
                          onClick={() => downloadImage(img, `scene_${idx+1}_${result.title.replace(/\s+/g, '_')}.png`)}
                          className="bg-white hover:bg-gray-200 text-black p-2.5 rounded-full shadow-lg transition-all hover:scale-110 active:scale-95"
                          title="Download Scene Clip"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-white backdrop-blur-sm font-bold">Scene {idx+1}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-gray-900/40 border border-gray-800 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              Human-Realistic Script
            </h2>
            <div className="prose prose-invert max-w-none text-gray-300 whitespace-pre-line leading-relaxed italic">
              "{result.script}"
            </div>
          </section>
        </div>

        {/* Right Column: SEO & Audio */}
        <div className="space-y-8">
          <section className="bg-gradient-to-br from-blue-600/10 to-purple-600/10 border border-blue-500/20 rounded-2xl p-6 sticky top-24 shadow-inner">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
              Studio Audio Output
            </h2>
            {result.audioUrl ? (
              <div className="space-y-4">
                <audio controls src={result.audioUrl} className="w-full" />
                <div className="grid grid-cols-1 gap-3">
                  <button onClick={downloadAudio} className="bg-white text-black hover:bg-gray-200 text-sm py-3 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    Download Master Voiceover (.MP3)
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500 text-sm">Processing Audio Master...</div>
            )}
          </section>

          <section className="bg-gray-900/40 border border-gray-800 rounded-2xl p-6 space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span className="w-2 h-2 bg-pink-500 rounded-full"></span>
              SEO & Growth Pack
            </h2>
            
            <div>
              <label className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-2 block">Optimal Caption</label>
              <p className="text-gray-300 bg-black/30 p-3 rounded-lg border border-gray-800 text-sm">{result.caption}</p>
            </div>

            <div>
              <label className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-2 block">Description</label>
              <p className="text-gray-300 bg-black/30 p-3 rounded-lg border border-gray-800 text-sm">{result.description}</p>
            </div>

            <div>
              <label className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-2 block">Viral Hashtags</label>
              <div className="flex flex-wrap gap-2">
                {result.hashtags.map((tag, i) => (
                  <span key={i} className="text-xs text-blue-400 font-medium">#{tag.replace('#','')}</span>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-2 block">Best Posting Time</label>
              <p className="text-green-400 font-bold flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                {result.bestTime}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

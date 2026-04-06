"use client";

import React, { useState } from 'react';
import { 
  Sparkles, 
  Loader2, 
  Zap, 
  Layers 
} from 'lucide-react';

interface AgentHUDProps {
  onGenerate: (prompt: string) => Promise<void>;
  isGenerating?: boolean;
  windowMode?: boolean;
}

export const AgentHUD = ({ onGenerate, isGenerating = false, windowMode = false }: AgentHUDProps) => {
  const [prompt, setPrompt] = useState('');

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    await onGenerate(prompt);
    setPrompt('');
  };

  return (
    <div
      className="flex flex-col gap-4 w-[240px] pointer-events-none"
      style={windowMode
        ? { position: 'fixed', top: 8, left: 8, zIndex: 10002 }
        : { position: 'absolute', top: 24, left: 24, zIndex: 100 }}
    >
      {/* Branding Block - Minimalist version (no background) */}
      <div className="flex items-center gap-3 p-2.5 pointer-events-auto">
        <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/20 shrink-0">
          <Layers size={18} className="text-white relative z-10" />
        </div>
        <div className="flex flex-col">
          <span className="text-[12px] font-black uppercase tracking-[2px] text-white leading-none drop-shadow-sm">Media</span>
          <span className="text-[10px] font-bold uppercase tracking-[1px] text-white/70 leading-tight drop-shadow-sm">Composer</span>
        </div>
      </div>

      {/* Assistant Block - Synced with Legend Glass Style */}
      <div className="bg-white/5 backdrop-blur-2xl border border-white/5 p-4 rounded-3xl shadow-2xl shadow-black/10 pointer-events-auto flex flex-col gap-3">
        <div className="flex items-center gap-2 px-1">
          <Sparkles size={12} className="text-white animate-pulse opacity-60" />
          <h3 className="text-[9px] font-black text-white/60 uppercase tracking-[2px]">Agent Assistant</h3>
        </div>
        
        <textarea 
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleGenerate();
            }
          }}
          placeholder="Describe workflow modifications..."
          className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-[10px] text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-500/40 transition-all min-h-[100px] resize-none shadow-inner"
        />
        
        {isGenerating && (
          <div className="flex items-center justify-center gap-2 text-[9px] font-black text-cyan-400 uppercase tracking-widest animate-pulse py-1">
            <Loader2 size={12} className="animate-spin" />
            <span>Processing changes...</span>
          </div>
        )}
      </div>
    </div>
  );
};

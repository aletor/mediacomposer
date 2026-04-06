"use client";

import React, { useState } from 'react';
import { 
  Video, 
  Type, 
  Workflow, 
  Compass, 
  PlusSquare, 
  Zap, 
  ImageIcon,
  Sparkles,
  Loader2,
  Scissors,
  FilePlus,
  Eye,
  Paintbrush,
  Layers,
  Download,
  ChevronRight,
  ChevronLeft,
  Globe,
  Crop
} from 'lucide-react';
import { NODE_REGISTRY } from './nodeRegistry';

// ── Key map: nodeType → shortcut key shown in the badge ──────────────────────
const NODE_KEYS: Record<string, string> = {
  mediaInput:        'm',
  promptInput:       'p',
  background:        'b',
  urlImage:          'u',
  backgroundRemover: 'r',
  mediaDescriber:    'd',
  enhancer:          'h',
  grokProcessor:     'g',
  nanoBanana:        'n',
  geminiVideo:       'v',
  concatenator:      'q',
  space:             's',
  spaceInput:        'i',
  spaceOutput:       'o',
  imageComposer:     'c',
  imageExport:       'e',
  painter:           'w',
  textOverlay:       't',
  crop:              'x',
  bezierMask:        'z',
};


const Sidebar = ({ windowMode = false }: { windowMode?: boolean }) => {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const TypeIndicators = ({ nodeType }: { nodeType: string }) => {
    const meta = NODE_REGISTRY[nodeType];
    if (!meta) return <div className="type-indicator-container"><div className="type-dot" /><div className="type-dot" /></div>;

    return (
      <div className="type-indicator-container">
        <div className="type-group items-start">
          {meta.inputs.length > 0 ? (
            meta.inputs.map((input, idx) => (
              <div key={idx} className={`type-dot ${input.type} active`} title={`Input: ${input.label} (${input.type})`} />
            ))
          ) : (
            <div className="type-dot" />
          )}
        </div>
        <div className="type-group items-end">
          {meta.outputs.length > 0 ? (
            meta.outputs.map((output, idx) => (
              <div key={idx} className={`type-dot ${output.type} active`} title={`Output: ${output.label} (${output.type})`} />
            ))
          ) : (
            <div className="type-dot" />
          )}
        </div>
      </div>
    );
  };

  // Small key badge shown top-left of each node button
  const KeyBadge = ({ nodeType }: { nodeType: string }) => {
    const key = NODE_KEYS[nodeType];
    if (!key) return null;
    return (
      <span
        style={{
          position: 'absolute',
          top: '5px',
          left: '6px',
          fontSize: '7px',
          fontWeight: 900,
          color: '#94a3b8',
          lineHeight: 1,
          letterSpacing: '0.05em',
          fontFamily: 'monospace',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        {key}
      </span>
    );
  };

  // ── WINDOW MODE: compact horizontal icon bar ───────────────────────────
  if (windowMode) {
    const allNodes = [
      // Ingesta
      { type: 'mediaInput',        icon: <FilePlus size={14} />,    color: 'text-emerald-500', label: 'Asset' },
      { type: 'promptInput',       icon: <Type size={14} />,        color: 'text-emerald-500', label: 'Prompt' },
      { type: 'background',        icon: <Paintbrush size={14} />,  color: 'text-emerald-500', label: 'Canvas' },
      { type: 'urlImage',          icon: <Globe size={14} />,       color: 'text-emerald-500', label: 'Web' },
      // Divider
      null,
      // Inteligencia
      { type: 'backgroundRemover', icon: <Scissors size={14} />,    color: 'text-cyan-400',    label: 'Matting' },
      { type: 'mediaDescriber',    icon: <Eye size={14} />,         color: 'text-cyan-400',    label: 'Eye' },
      { type: 'enhancer',          icon: <Sparkles size={14} />,    color: 'text-cyan-400',    label: 'Enhance' },
      { type: 'grokProcessor',     icon: <Compass size={14} />,     color: 'text-cyan-400',    label: 'Grok' },
      { type: 'nanoBanana',        icon: <Sparkles size={14} />,    color: 'text-cyan-400',    label: 'Nano' },
      { type: 'geminiVideo',       icon: <Video size={14} />,       color: 'text-cyan-400',    label: 'Veo' },
      // Divider
      null,
      // Lógica
      { type: 'concatenator',      icon: <PlusSquare size={14} />,  color: 'text-blue-400',    label: 'Concat' },
      { type: 'space',             icon: <Layers size={14} />,      color: 'text-blue-400',    label: 'Space' },
      // Divider
      null,
      // Composición
      { type: 'imageComposer',     icon: <Layers size={14} />,      color: 'text-amber-400',   label: 'Layout' },
      { type: 'imageExport',       icon: <Download size={14} />,    color: 'text-amber-400',   label: 'Export' },
      { type: 'painter',           icon: <Paintbrush size={14} />,  color: 'text-amber-400',   label: 'Painter' },
      { type: 'textOverlay',       icon: <Type size={14} />,        color: 'text-amber-400',   label: 'Text' },
      { type: 'crop',              icon: <Crop size={14} />,        color: 'text-amber-400',   label: 'Crop' },
    ];

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          overflowX: 'auto',
          padding: '0 8px',
          height: '100%',
          scrollbarWidth: 'none',
        }}
        className="[&::-webkit-scrollbar]:hidden"
      >
        {allNodes.map((item, idx) =>
          item === null ? (
            <div key={`sep-${idx}`} style={{ width: 1, height: 24, flexShrink: 0, background: 'rgba(255,255,255,0.12)', marginInline: 4 }} />
          ) : (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => onDragStart(e, item.type)}
              title={`${item.label} · ${NODE_KEYS[item.type] || ''}`}
              style={{
                flexShrink: 0,
                width: 40,
                height: 36,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.04)',
                cursor: 'grab',
                transition: 'all 0.15s',
              }}
              className="hover:bg-white/10 hover:border-white/20 active:scale-95"
            >
              <span className={item.color}>{item.icon}</span>
              <span style={{ fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em', lineHeight: 1 }}>
                {item.label}
              </span>
            </div>
          )
        )}
      </div>
    );
  }

  // ── NORMAL MODE: vertical sidebar panel ──────────────────────────────────
  return (
    <div className="group/sidebar absolute left-0 top-0 h-screen z-[1000]">
      {/* Transparent hover trigger zone - wider than the pill */}
      <div className="absolute inset-0 w-12 h-full pointer-events-auto" />

      {/* Collapsed pill — the visible strip when not hovering */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-20 bg-white/10 backdrop-blur-2xl border border-white/10 rounded-full flex items-center justify-center text-slate-400 group-hover/sidebar:opacity-0 transition-opacity duration-300 shadow-lg pointer-events-none">
        <ChevronRight size={14} />
      </div>

      {/* Expanded panel — uses exact same glass as AgentHUD */}
      <aside
        className="absolute left-0 top-0 h-full w-0 overflow-hidden group-hover/sidebar:w-[200px] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ willChange: 'width' }}
      >
        <div className="h-full w-[200px] bg-white/5 backdrop-blur-2xl border-r border-white/8 flex flex-col shadow-[4px_0_40px_rgba(0,0,0,0.4)]">
          <div className="px-3 mb-4 pt-5 flex-1 overflow-y-auto custom-scrollbar">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-[3px] mb-5 flex items-center gap-2 px-1">
              <Layers size={13} className="shrink-0 text-slate-400" /> <span>Node Library</span>
            </div>

            {/* 📥 INGESTA */}
            <div className="mb-6">
              <h3 className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1 flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                <Download size={10} className="shrink-0" /> <span>Ingesta</span>
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'mediaInput',  icon: <FilePlus size={13} />,     label: 'Asset',  color: 'text-emerald-400' },
                  { type: 'promptInput', icon: <Type size={13} />,          label: 'Prompt', color: 'text-emerald-400' },
                  { type: 'background',  icon: <Paintbrush size={13} />,    label: 'Canvas', color: 'text-emerald-400' },
                  { type: 'urlImage',    icon: <Globe size={13} />,          label: 'Web',    color: 'text-emerald-400' },
                ].map(item => (
                  <div key={item.type}
                    className="dndnode relative flex flex-col items-center justify-center gap-1 py-3 px-2 !bg-white/20 hover:!bg-white/30 border border-white/25 hover:border-emerald-400/50 rounded-2xl cursor-grab active:scale-95 transition-all text-center aspect-square"
                    onDragStart={(e) => onDragStart(e, item.type)} draggable
                    title={`${item.label} · ${NODE_KEYS[item.type]}`}
                  >
                    <KeyBadge nodeType={item.type} />
                    <span className={item.color}>{item.icon}</span>
                    <span className="text-[7px] font-black text-slate-700">{item.label}</span>
                    <TypeIndicators nodeType={item.type} />
                  </div>
                ))}
              </div>
            </div>

            {/* 🧠 INTELIGENCIA */}
            <div className="mb-6">
              <h3 className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1 flex items-center gap-1.5">
                <Zap size={10} className="shrink-0" /> <span>Inteligencia</span>
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'backgroundRemover', icon: <Scissors size={13} />, label: 'Matting', color: 'text-cyan-400' },
                  { type: 'mediaDescriber',    icon: <Eye size={13} />,       label: 'Eye',     color: 'text-cyan-400' },
                  { type: 'enhancer',          icon: <Sparkles size={13} />,  label: 'Enhance', color: 'text-cyan-400' },
                  { type: 'grokProcessor',     icon: <Compass size={13} />,   label: 'Grok',    color: 'text-cyan-400' },
                  { type: 'nanoBanana',        icon: <Sparkles size={13} />,  label: 'Nano',    color: 'text-cyan-400' },
                  { type: 'geminiVideo',       icon: <Video size={13} />,     label: 'Veo 3.1', color: 'text-cyan-400' },
                ].map(item => (
                  <div key={item.type}
                    className="dndnode relative flex flex-col items-center justify-center gap-1 py-3 px-2 !bg-white/20 hover:!bg-white/30 border border-white/25 hover:border-cyan-400/50 rounded-2xl cursor-grab active:scale-95 transition-all text-center aspect-square"
                    onDragStart={(e) => onDragStart(e, item.type)} draggable
                    title={`${item.label} · ${NODE_KEYS[item.type]}`}
                  >
                    <KeyBadge nodeType={item.type} />
                    <span className={item.color}>{item.icon}</span>
                    <span className="text-[7px] font-black text-slate-700">{item.label}</span>
                    <TypeIndicators nodeType={item.type} />
                  </div>
                ))}
              </div>
            </div>

            {/* 🧩 LÓGICA */}
            <div className="mb-6">
              <h3 className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1 flex items-center gap-1.5">
                <PlusSquare size={10} className="shrink-0" /> <span>Lógica</span>
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'concatenator', icon: <PlusSquare size={13} />, label: 'Concat', color: 'text-blue-400' },
                  { type: 'space',        icon: <Layers size={13} />,     label: 'Space',  color: 'text-blue-400' },
                  { type: 'spaceInput',   icon: <ChevronRight size={13} />, label: 'Entry', color: 'text-blue-400' },
                  { type: 'spaceOutput',  icon: <ChevronLeft size={13} />,  label: 'Exit',  color: 'text-blue-400' },
                ].map(item => (
                  <div key={item.type}
                    className="dndnode relative flex flex-col items-center justify-center gap-1 py-3 px-2 !bg-white/20 hover:!bg-white/30 border border-white/25 hover:border-blue-400/50 rounded-2xl cursor-grab active:scale-95 transition-all text-center aspect-square"
                    onDragStart={(e) => onDragStart(e, item.type)} draggable
                    title={`${item.label} · ${NODE_KEYS[item.type]}`}
                  >
                    <KeyBadge nodeType={item.type} />
                    <span className={item.color}>{item.icon}</span>
                    <span className="text-[7px] font-black text-slate-700">{item.label}</span>
                    <TypeIndicators nodeType={item.type} />
                  </div>
                ))}
              </div>
            </div>

            {/* 🎨 COMPOSICIÓN */}
            <div className="mb-3">
              <h3 className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1 flex items-center gap-1.5">
                <Layers size={10} className="shrink-0" /> <span>Composición</span>
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'imageComposer', icon: <Layers size={13} />,      label: 'Layout',  color: 'text-amber-400' },
                  { type: 'imageExport',   icon: <Download size={13} />,    label: 'Export',  color: 'text-amber-400' },
                  { type: 'painter',       icon: <Paintbrush size={13} />,  label: 'Painter', color: 'text-amber-400' },
                  { type: 'textOverlay',   icon: <Type size={13} />,         label: 'Text',    color: 'text-amber-400' },
                  { type: 'crop',          icon: <Crop size={13} />,         label: 'Crop',    color: 'text-amber-400' },
                  { type: 'bezierMask',    icon: <Scissors size={13} />,    label: 'Bezier',  color: 'text-amber-400' },
                ].map(item => (
                  <div key={item.type}
                    className="dndnode relative flex flex-col items-center justify-center gap-1 py-3 px-2 !bg-white/20 hover:!bg-white/30 border border-white/25 hover:border-amber-400/50 rounded-2xl cursor-grab active:scale-95 transition-all text-center aspect-square"
                    onDragStart={(e) => onDragStart(e, item.type)} draggable
                    title={`${item.label} · ${NODE_KEYS[item.type]}`}
                  >
                    <KeyBadge nodeType={item.type} />
                    <span className={item.color}>{item.icon}</span>
                    <span className="text-[7px] font-black text-slate-700">{item.label}</span>
                    <TypeIndicators nodeType={item.type} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default Sidebar;

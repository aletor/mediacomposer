"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Brain,
  Droplets,
  FileText,
  ImageIcon,
  Link2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  MAX_KNOWLEDGE_DOC_BYTES,
  MAX_LOGO_BYTES,
  normalizeProjectAssets,
  type ProjectAssetsMetadata,
} from "./project-assets-metadata";

type Props = {
  open: boolean;
  onClose: () => void;
  assetsMetadata: unknown;
  onAssetsMetadataChange: (next: ProjectAssetsMetadata) => void;
};

function readFileDataUrl(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error("FILE_TOO_LARGE"));
      return;
    }
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("READ_ERROR"));
    r.readAsDataURL(file);
  });
}

function isKnowledgeFile(file: File): boolean {
  const m = file.type.toLowerCase();
  if (m === "application/pdf") return true;
  if (m.startsWith("text/")) return true;
  if (
    m === "application/msword" ||
    m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    m === "application/rtf"
  )
    return true;
  if (m.endsWith("markdown") || /\.(md|txt|pdf|doc|docx)$/i.test(file.name)) return true;
  return false;
}

function tryNormalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

type LogoSlotId = "positive" | "negative";

function LogoDropSlot({
  label,
  description,
  dataUrl,
  slotId,
  onPick,
  onClear,
  disabled,
  compact,
}: {
  label: string;
  description: string;
  dataUrl: string | null;
  slotId: LogoSlotId;
  onPick: (slot: LogoSlotId, file: File) => void;
  onClear: (slot: LogoSlotId) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) onPick(slotId, f);
  };

  return (
    <div className={`min-w-0 ${compact ? "" : "flex-1"}`}>
      <p
        className={`mb-1 font-black uppercase tracking-[0.14em] text-zinc-600 ${compact ? "text-[8px]" : "text-[10px]"}`}
        title={compact ? description : undefined}
      >
        {label}
      </p>
      {!compact && <p className="mb-2 text-[11px] leading-snug text-zinc-600">{description}</p>}
      <div
        role="button"
        tabIndex={0}
        title={compact ? description : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative flex cursor-pointer flex-col items-center justify-center overflow-hidden border-2 border-dashed transition ${
          compact ? "min-h-[76px] rounded-lg" : "min-h-[140px] rounded-2xl"
        } ${
          dragOver
            ? "border-amber-400 bg-amber-50"
            : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-zinc-100"
        }`}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(slotId, f);
            e.target.value = "";
          }}
        />
        {dataUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dataUrl}
              alt=""
              className={`max-w-full object-contain ${compact ? "max-h-14 p-1.5" : "max-h-[120px] p-3"}`}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear(slotId);
              }}
              className={`absolute rounded-md border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:bg-zinc-100 hover:text-zinc-900 ${
                compact ? "right-1 top-1 p-1" : "right-2 top-2 p-1.5"
              }`}
              aria-label="Quitar logo"
            >
              <Trash2 className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={2} />
            </button>
          </>
        ) : (
          <div
            className={`flex flex-col items-center text-center ${compact ? "gap-1 px-2 py-2" : "gap-2 px-4 py-6"}`}
          >
            <ImageIcon
              className={`text-zinc-400 ${compact ? "h-5 w-5" : "h-8 w-8"}`}
              strokeWidth={1.25}
              aria-hidden
            />
            <span className={`font-semibold text-zinc-600 ${compact ? "text-[9px] leading-tight" : "text-[11px]"}`}>
              {compact ? "Soltar / elegir" : "Suelta o elige imagen"}
            </span>
            {!compact && (
              <span className="text-[10px] text-zinc-500">
                PNG, JPG, WebP o SVG · máx. {Math.round(MAX_LOGO_BYTES / 1024 / 1024)} MB
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  compact,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  compact?: boolean;
}) {
  const id = React.useId();
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  const pickerValue = /^#[0-9A-Fa-f]{6}$/i.test(value) ? value : "#000000";

  return (
    <div className={`flex min-w-0 flex-col ${compact ? "gap-1" : "flex-1 gap-1.5"}`}>
      <label
        htmlFor={id}
        className={`font-bold uppercase tracking-wide text-zinc-600 ${compact ? "text-[8px]" : "text-[10px]"}`}
      >
        {label}
      </label>
      <div
        className={`flex items-center gap-1.5 border border-zinc-200 bg-white ${compact ? "rounded-lg px-1.5 py-1" : "gap-2 rounded-xl px-2 py-1.5"}`}
      >
        <input
          id={id}
          type="color"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value)}
          className={`cursor-pointer shrink-0 overflow-hidden rounded border border-zinc-200 bg-transparent p-0 ${
            compact ? "h-7 w-8" : "h-9 w-11"
          }`}
          aria-label={label}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const raw = text.trim();
            const v = raw.startsWith("#") ? raw : `#${raw}`;
            if (/^#[0-9A-Fa-f]{6}$/i.test(v)) {
              onChange(`#${v.slice(1).toLowerCase()}`);
            } else {
              setText(value);
            }
          }}
          className={`min-w-0 flex-1 bg-transparent font-mono text-zinc-900 outline-none placeholder:text-zinc-400 ${
            compact ? "text-[10px]" : "text-[12px]"
          }`}
          placeholder="#000000"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

export function ProjectBrainFullscreen({
  open,
  onClose,
  assetsMetadata,
  onAssetsMetadataChange,
}: Props) {
  const assets = useMemo(() => normalizeProjectAssets(assetsMetadata), [assetsMetadata]);

  const [urlDraft, setUrlDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [knowDrag, setKnowDrag] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const patch = useCallback(
    (fn: (a: ProjectAssetsMetadata) => ProjectAssetsMetadata) => {
      const base = normalizeProjectAssets(assetsMetadata);
      onAssetsMetadataChange(fn(base));
    },
    [assetsMetadata, onAssetsMetadataChange]
  );

  const setBrand = useCallback(
    (partial: Partial<ProjectAssetsMetadata["brand"]>) => {
      patch((a) => ({
        ...a,
        brand: { ...a.brand, ...partial },
      }));
    },
    [patch]
  );

  const onLogoPick = useCallback(
    async (slot: LogoSlotId, file: File) => {
      if (!file.type.startsWith("image/")) {
        showToast("Usa una imagen (PNG, JPG, WebP o SVG).");
        return;
      }
      try {
        const dataUrl = await readFileDataUrl(file, MAX_LOGO_BYTES);
        setBrand(slot === "positive" ? { logoPositive: dataUrl } : { logoNegative: dataUrl });
      } catch (e) {
        if ((e as Error).message === "FILE_TOO_LARGE") {
          showToast(`El logo supera ${Math.round(MAX_LOGO_BYTES / 1024 / 1024)} MB. Comprime la imagen.`);
        } else {
          showToast("No se pudo leer el archivo.");
        }
      }
    },
    [setBrand, showToast]
  );

  const onLogoClear = useCallback(
    (slot: LogoSlotId) => {
      setBrand(slot === "positive" ? { logoPositive: null } : { logoNegative: null });
    },
    [setBrand]
  );

  const addUrl = useCallback(() => {
    const u = tryNormalizeUrl(urlDraft);
    if (!u) {
      showToast("Introduce una URL válida (https://…)");
      return;
    }
    const a = normalizeProjectAssets(assetsMetadata);
    if (a.knowledge.urls.includes(u)) {
      showToast("Esa URL ya está en la lista.");
      return;
    }
    patch(() => ({
      ...a,
      knowledge: { ...a.knowledge, urls: [...a.knowledge.urls, u] },
    }));
    setUrlDraft("");
  }, [patch, urlDraft, showToast, assetsMetadata]);

  const removeUrl = useCallback(
    (idx: number) => {
      patch((a) => ({
        ...a,
        knowledge: {
          ...a.knowledge,
          urls: a.knowledge.urls.filter((_, i) => i !== idx),
        },
      }));
    },
    [patch]
  );

  const ingestKnowledgeFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      for (const file of list) {
        if (!isKnowledgeFile(file)) {
          showToast(`«${file.name}»: usa PDF, texto o Word.`);
          continue;
        }
        try {
          const dataUrl = await readFileDataUrl(file, MAX_KNOWLEDGE_DOC_BYTES);
          const id = crypto.randomUUID();
          patch((a) => ({
            ...a,
            knowledge: {
              ...a.knowledge,
              documents: [
                ...a.knowledge.documents,
                {
                  id,
                  name: file.name,
                  size: file.size,
                  mime: file.type || "application/octet-stream",
                  dataUrl,
                },
              ],
            },
          }));
        } catch {
          showToast(`«${file.name}» supera ${Math.round(MAX_KNOWLEDGE_DOC_BYTES / 1024 / 1024)} MB.`);
        }
      }
    },
    [patch, showToast]
  );

  const removeDoc = useCallback(
    (id: string) => {
      patch((a) => ({
        ...a,
        knowledge: {
          ...a.knowledge,
          documents: a.knowledge.documents.filter((d) => d.id !== id),
        },
      }));
    },
    [patch]
  );

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("nb-studio-open");
    return () => document.body.classList.remove("nb-studio-open");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const shell = (
    <div
      className="fixed inset-0 z-[100080] flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-brain-title"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-50">
            <Brain className="h-5 w-5 text-violet-700" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 id="project-brain-title" className="text-base font-black uppercase tracking-wide text-zinc-900">
              Brain
            </h1>
            <p className="text-[11px] text-zinc-500">Identidad de marca y fuente de conocimiento del proyecto</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-zinc-800 transition hover:bg-zinc-100"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          Cerrar
        </button>
      </header>

      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed left-1/2 top-[4.5rem] z-[100090] max-w-[min(420px,92vw)] -translate-x-1/2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-[12px] font-medium text-amber-900 shadow-lg"
        >
          {toast}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-8">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-10 xl:items-stretch xl:gap-6">
            <section className="flex min-h-0 flex-col rounded-2xl border border-zinc-200 bg-zinc-50 p-3 shadow-sm sm:p-4 xl:col-span-3">
              <div className="mb-3 flex items-center gap-2 border-b border-zinc-200 pb-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white">
                  <ImageIcon className="h-4 w-4 text-zinc-600" strokeWidth={1.5} aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-900">Identidad</h2>
                  <p className="text-[9px] leading-snug text-zinc-500">Logo ± · 3 colores</p>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <LogoDropSlot
                  compact
                  label="Logo +"
                  description="Fondos claros o neutros."
                  dataUrl={assets.brand.logoPositive}
                  slotId="positive"
                  onPick={onLogoPick}
                  onClear={onLogoClear}
                />
                <LogoDropSlot
                  compact
                  label="Logo −"
                  description="Fondos oscuros o imagen."
                  dataUrl={assets.brand.logoNegative}
                  slotId="negative"
                  onPick={onLogoPick}
                  onClear={onLogoClear}
                />

                <div className="border-t border-zinc-200 pt-3">
                  <span className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-zinc-600">
                    <Droplets className="h-3 w-3 text-amber-600" aria-hidden />
                    Colores
                  </span>
                  <div className="flex flex-col gap-2">
                    <ColorField
                      compact
                      label="Primario"
                      value={assets.brand.colorPrimary}
                      onChange={(h) => setBrand({ colorPrimary: h })}
                    />
                    <ColorField
                      compact
                      label="Secundario"
                      value={assets.brand.colorSecondary}
                      onChange={(h) => setBrand({ colorSecondary: h })}
                    />
                    <ColorField
                      compact
                      label="Acento"
                      value={assets.brand.colorAccent}
                      onChange={(h) => setBrand({ colorAccent: h })}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm sm:p-5 xl:col-span-7">
              <div className="mb-4 flex flex-wrap items-start gap-3 border-b border-zinc-200 pb-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white">
                  <BookOpen className="h-5 w-5 text-sky-600" strokeWidth={1.5} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-900">Fuente de conocimiento</h2>
                  <p className="mt-1 text-[12px] leading-relaxed text-zinc-600">
                    Enlaces y documentos de referencia sobre el cliente o el proyecto. Más adelante usaremos este material
                    para contextualizar respuestas y flujos automáticos.
                  </p>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
                <div>
                  <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-zinc-600">
                    <Link2 className="h-3.5 w-3.5" aria-hidden />
                    Enlaces
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={urlDraft}
                      onChange={(e) => setUrlDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addUrl();
                        }
                      }}
                      placeholder="https://…"
                      className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[13px] text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={addUrl}
                      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-sky-500/50 bg-sky-50 px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-sky-800 transition hover:bg-sky-100"
                    >
                      <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                      Añadir
                    </button>
                  </div>
                  {assets.knowledge.urls.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {assets.knowledge.urls.map((u, idx) => (
                        <li
                          key={`${u}-${idx}`}
                          className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2 py-1.5"
                        >
                          <a
                            href={u}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-w-0 flex-1 truncate text-[12px] text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
                          >
                            {u}
                          </a>
                          <button
                            type="button"
                            onClick={() => removeUrl(idx)}
                            className="shrink-0 rounded-md p-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-rose-600"
                            aria-label="Quitar enlace"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-[12px] text-zinc-500">Ningún enlace todavía.</p>
                  )}
                </div>

                <div>
                  <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-zinc-600">
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    Documentos
                  </p>
                  <div
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setKnowDrag(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                    }}
                    onDragLeave={() => setKnowDrag(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setKnowDrag(false);
                      if (e.dataTransfer.files?.length) void ingestKnowledgeFiles(e.dataTransfer.files);
                    }}
                    className={`flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
                      knowDrag
                        ? "border-sky-400 bg-sky-50"
                        : "border-zinc-200 bg-white hover:border-zinc-300"
                    }`}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.multiple = true;
                      input.accept = ".pdf,.txt,.md,.doc,.docx,.rtf,text/*,application/pdf";
                      input.onchange = () => {
                        if (input.files?.length) void ingestKnowledgeFiles(input.files);
                      };
                      input.click();
                    }}
                  >
                    <FileText className="mb-2 h-8 w-8 text-zinc-400" strokeWidth={1.25} />
                    <span className="text-[12px] font-semibold text-zinc-700">Arrastra PDFs o documentos</span>
                    <span className="mt-1 text-[11px] text-zinc-500">
                      PDF, Word o texto · máx. {Math.round(MAX_KNOWLEDGE_DOC_BYTES / 1024 / 1024)} MB c/u
                    </span>
                  </div>
                  {assets.knowledge.documents.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {assets.knowledge.documents.map((d) => (
                        <li
                          key={d.id}
                          className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2 py-1.5"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-medium text-zinc-800">{d.name}</p>
                            <p className="text-[10px] text-zinc-500">
                              {d.size >= 1024 * 1024
                                ? `${(d.size / (1024 * 1024)).toFixed(2)} MB`
                                : `${(d.size / 1024).toFixed(1)} KB`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDoc(d.id)}
                            className="shrink-0 rounded-md p-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-rose-600"
                            aria-label="Quitar documento"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-[12px] text-zinc-500">Ningún documento adjunto.</p>
                  )}
                </div>
              </div>
            </section>
          </div>

          <p className="pb-4 text-center text-[11px] leading-relaxed text-zinc-500">
            Los datos de Brain se guardan con el proyecto al pulsar <span className="font-semibold text-zinc-700">Guardar</span>{" "}
            en la barra superior.
          </p>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(shell, document.body);
}

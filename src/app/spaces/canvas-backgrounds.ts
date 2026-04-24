/** Fondos del lienzo: local + URLs directas (CDN). Persistencia: `localStorage` bajo esta clave. */
export const CANVAS_BG_STORAGE_KEY = "foldder-canvas-bg-id";

export type CanvasBackgroundOption = { id: string; label: string; url: string };

/** Solo orígenes que suelen permitir CORS para texturas WebGL (evita hotlinks rotos o sin ACAO). */
export const CANVAS_BACKGROUNDS: CanvasBackgroundOption[] = [
  { id: "studio", label: "Estudio (actual)", url: "/wallpapers/studio_back.jpg" },
  { id: "local-pastel-gradient", label: "Pastel suave", url: "/wallpapers/pastel-gradient.webp" },
  { id: "local-dark-gradient", label: "Gradiente oscuro", url: "/wallpapers/dark-gradient.jpg" },
  { id: "local-mountain-range", label: "Cordillera", url: "/wallpapers/mountain-range.webp" },
  { id: "local-google-desktop", label: "Cielo púrpura", url: "/wallpapers/google-desktop.jpg" },
  { id: "local-purple-gradient", label: "Gradiente violeta", url: "/wallpapers/purple-gradient.jpg" },
  { id: "local-night-hills", label: "Colinas nocturnas", url: "/wallpapers/night-hills.jpg" },
  {
    id: "unsplash-city-night",
    label: "Ciudad nocturna",
    url: "/wallpapers/unsplash-city-night.jpg",
  },
  {
    id: "unsplash-earth-space",
    label: "Tierra · espacio",
    url: "/wallpapers/unsplash-earth-space.jpg",
  },
  {
    id: "unsplash-forest",
    label: "Bosque",
    url: "/wallpapers/unsplash-forest.jpg",
  },
  {
    id: "unsplash-abstract-gradient",
    label: "Gradiente suave",
    url: "/wallpapers/unsplash-abstract-gradient.jpg",
  },
  {
    id: "pixabay-mountain-5242534",
    label: "Montañas",
    url: "/wallpapers/pixabay-mountain-5242534.jpg",
  },
  {
    id: "pixabay-sea-3652697",
    label: "Mar",
    url: "/wallpapers/pixabay-sea-3652697.jpg",
  },
];

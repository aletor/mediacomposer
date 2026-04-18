/** Fondos del lienzo: local + URLs directas (CDN). Persistencia: `localStorage` bajo esta clave. */
export const CANVAS_BG_STORAGE_KEY = "foldder-canvas-bg-id";

export type CanvasBackgroundOption = { id: string; label: string; url: string };

/** Solo orígenes que suelen permitir CORS para texturas WebGL (evita hotlinks rotos o sin ACAO). */
export const CANVAS_BACKGROUNDS: CanvasBackgroundOption[] = [
  { id: "studio", label: "Estudio (actual)", url: "/studio_back.jpg" },
  {
    id: "unsplash-city-night",
    label: "Ciudad nocturna",
    url: "https://images.unsplash.com/photo-1485470733090-0aae1788d5af?fm=jpg&q=70&w=2400&auto=format&fit=crop",
  },
  {
    id: "unsplash-earth-space",
    label: "Tierra · espacio",
    url: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?fm=jpg&q=70&w=2400&auto=format&fit=crop",
  },
  {
    id: "unsplash-forest",
    label: "Bosque",
    url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?fm=jpg&q=70&w=2400&auto=format&fit=crop",
  },
  {
    id: "unsplash-abstract-gradient",
    label: "Gradiente suave",
    url: "https://images.unsplash.com/photo-1557683316-973673baf926?fm=jpg&q=70&w=2400&auto=format&fit=crop",
  },
  {
    id: "pixabay-mountain-5242534",
    label: "Montañas",
    url: "https://cdn.pixabay.com/photo/2020/05/31/12/41/mountain-5242534_1280.jpg",
  },
  {
    id: "pixabay-sea-3652697",
    label: "Mar",
    url: "https://cdn.pixabay.com/photo/2018/09/03/23/56/sea-3652697_1280.jpg",
  },
];

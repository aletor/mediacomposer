import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  /**
   * En `next dev --webpack`, evita que escrituras en `data/` (p. ej. `spaces-db.json` al guardar)
   * disparen recompilaciones en cadena. Con Turbopack (`next dev` por defecto) esta opción no aplica
   * al bundler principal; usa `npm run dev` (webpack) para beneficiarte de esto.
   */
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/data/**", "**/.git/**"],
      };
    }
    return config;
  },
};

export default nextConfig;

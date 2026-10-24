import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SUPERPONTOS",
    short_name: "SUPERPONTOS",
    description: "Engajamento, evolução e gestão em uma única plataforma.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#f97316",
    lang: "pt-BR",
    icons: [
      { src: "/icons/superpontos-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/superpontos-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/superpontos-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/superpontos-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

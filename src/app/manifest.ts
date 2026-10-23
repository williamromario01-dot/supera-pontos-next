import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SUPERPONTOS",
    short_name: "SUPERPONTOS",
    description: "Agenda, pontos e conquistas SUPERPONTOS",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#f97316",
    lang: "pt-BR",
  };
}

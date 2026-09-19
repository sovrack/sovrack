import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sovrack",
    short_name: "Sovrack",
    description:
      "Déployez et exploitez vos applications sur vos propres serveurs.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0a16",
    theme_color: "#0b0a16",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}

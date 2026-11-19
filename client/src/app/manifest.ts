import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Virtual Ramlila Ground",
    short_name: "Virtual Ground",
    description: "A pixel-art virtual hangout at Ramlila Ground",
    start_url: "/",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#000000",
    theme_color: "#b45309",
    icons: [
      {
        src: "/icon-192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

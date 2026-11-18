import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Showroom inmobiliario",
    short_name: "Showroom",
    start_url: "/?kiosk=1",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#0b1220",
    theme_color: "#0b1220",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}

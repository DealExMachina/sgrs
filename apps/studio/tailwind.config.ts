import type { Config } from "tailwindcss";
import preset from "@sgrs/ui/tailwind-preset";

const config: Config = {
  presets: [preset as Partial<Config>],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../../packages/graph/src/**/*.{ts,tsx}",
  ],
};

export default config;

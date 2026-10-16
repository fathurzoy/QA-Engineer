import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0b0f14",
        panel: "#11161d",
        line: "#1f2937",
        accent: "#22c55e",
        warn: "#f59e0b",
        danger: "#ef4444",
      },
    },
  },
  plugins: [],
};
export default config;

import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"] ,
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#60a5fa", // blue-400
          secondary: "#34d399", // emerald-400
          violet: "#a78bfa", // violet-400
          pink: "#f472b6", // pink-400
        },
      },
      fontSize: {
        h1: ["28px", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        h2: ["24px", { lineHeight: "1.25" }],
        h3: ["20px", { lineHeight: "1.3" }],
        body: ["16px", { lineHeight: "1.6" }],
        small: ["14px", { lineHeight: "1.5" }],
        label: ["12px", { lineHeight: "1.4", letterSpacing: "0.02em" }],
      },
    },
  },
  plugins: [],
} satisfies Config;

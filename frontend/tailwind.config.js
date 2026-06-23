/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--ink) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        panel2: "rgb(var(--panel2) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        mist: "rgb(var(--mist) / <alpha-value>)",
        paper: "rgb(var(--paper) / <alpha-value>)",
        amber: "#F2B33D",
        orange: "#F2762E",
        stop: "#E4322B",
        unseen: "#38BDF8",
        good: "#34D399",
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "-apple-system", "sans-serif"],
        display: ['"Inter"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"Inter"', "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};

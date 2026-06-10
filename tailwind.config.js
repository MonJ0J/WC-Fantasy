/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7ff",
          100: "#d9ecff",
          200: "#bcdfff",
          300: "#8ecbff",
          400: "#59afff",
          500: "#2f8eff",
          600: "#1971f5",
          700: "#155ce0",
          800: "#174ab5",
          900: "#19408f",
        },
        pitch: {
          50: "#f1faf4",
          100: "#dff3e6",
          500: "#3aaa5e",
          600: "#2b8a4a",
          700: "#236f3c",
        },
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};

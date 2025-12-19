import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["cjs", "esm"],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  target: "es2020",
  external: [
    "react",
    "react-dom",
    "next",
    "next/navigation",
    "@studio/api",
    "@studio/auth",
    "@studio/core",
    "@studio/notifications",
    "@studio/storage",
    "pg",
  ],
  minify: false,
});

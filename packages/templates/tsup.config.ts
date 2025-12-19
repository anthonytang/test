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
    "@studio/core",
    "@studio/auth",
    "@studio/api",
    "@studio/storage",
    "@studio/results",
    "@studio/ui",
    "@studio/notifications",
    "@studio/projects",
  ],
  minify: false,
});

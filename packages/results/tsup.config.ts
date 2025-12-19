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
    "@studio/core",
    "@studio/api",
    "@studio/ui",
    "@studio/auth",
    "@studio/notifications",
    "@studio/templates",
    "@studio/notifications",
  ],
  minify: false,
});

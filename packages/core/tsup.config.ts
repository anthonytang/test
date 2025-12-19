import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["cjs", "esm"],
  dts: { resolve: true },
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  target: "es2020",
  external: ["zod"],
  minify: false,
});

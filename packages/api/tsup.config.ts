import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    server: "src/lib/server.ts",
  },
  format: ["cjs", "esm"],
  dts: false, // Skip dts for server-side only code with type issues
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  target: "es2020",
  external: [
    "@studio/core",
    "@azure/msal-node",
    "@azure/storage-blob",
    "pg",
    "pg-native",
    "pg-pool",
    "zod",
  ],
  minify: false,
});

import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: false,
    target: "esnext",
    // `import.meta.url` is empty in CommonJS; the shim keeps anything that
    // relies on it working in the `require` build.
    shims: true,
});

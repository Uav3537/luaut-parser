import { defineConfig } from "tsup";
import { copyFileSync } from "node:fs";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: false,
    target: "esnext",
    // `src/lib/*.ts` locate their `.d.luaut` next to the bundle with
    // `import.meta.url`, which is empty in CommonJS — without this shim
    // `require("luaut-parser")` throws before it can load the definitions.
    shims: true,
    // The definitions ship as real `.d.luaut` files that `src/lib/*.ts` read at
    // runtime relative to the bundle.
    onSuccess: async () => {
        copyFileSync("src/lib/luau.d.luaut", "dist/luau.d.luaut");
        copyFileSync("src/lib/roblox.d.luaut", "dist/roblox.d.luaut");
    },
});
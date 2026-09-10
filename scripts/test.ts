/**
 * Parses every `*.luaut` file under `smoketest/`, runs scope + type analysis,
 * and writes the AST as JSON to `generated/`.
 *
 *   npm test        # = tsx scripts/test.ts
 *
 * Throws (non-zero exit) if any file fails to parse / analyze.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";

import { parse, analyzeScopes, analyzeTypes, moduleExports, isUnassignedGlobal, formatType, defaultLibs } from "../src/index.js";
import type { Type, ModuleExports } from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const smokeDir = join(root, "smoketest");
const outDir = join(root, "generated");

// Globals a Luau/Roblox script may reference without declaring.
const BUILTIN_GLOBALS = [
    "print", "warn", "error", "assert", "type", "typeof", "tostring", "tonumber",
    "pairs", "ipairs", "next", "select", "unpack", "rawget", "rawset", "rawequal",
    "setmetatable", "getmetatable", "pcall", "xpcall", "require", "newproxy",
    "table", "string", "math", "task", "os", "coroutine", "bit32", "utf8", "debug",
    "game", "workspace", "script", "shared", "Instance", "Vector3", "Vector2",
    "CFrame", "Color3", "UDim2", "UDim", "Enum", "tick", "time", "wait", "delay",
];

function collectLuaut(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...collectLuaut(full));
        else if (entry.name.endsWith(".luaut")) out.push(full);
    }
    return out;
}

const files = collectLuaut(smokeDir).sort();
if (files.length === 0) {
    throw new Error(`no *.luaut files under ${relative(root, smokeDir)}/`);
}

mkdirSync(outDir, { recursive: true });

const failures: string[] = [];

// Imports resolve against the other smoketest files, relative to the importer,
// so a module test checks real exported types rather than `any`.
const exportsCache = new Map<string, ModuleExports>();
const inProgress = new Set<string>();

function resolverFor(file: string) {
    return (specifier: string): ModuleExports | undefined => {
        const target = join(dirname(file), specifier.endsWith(".luaut") ? specifier : `${specifier}.luaut`);
        if (inProgress.has(target)) return { values: new Map(), types: new Map(), partial: true };
        const cached = exportsCache.get(target);
        if (cached) return cached;
        let text: string;
        try {
            text = readFileSync(target, "utf8");
        } catch {
            return undefined;
        }
        inProgress.add(target);
        try {
            const program = parse(text);
            const scopes = analyzeScopes(program, { builtinGlobals: BUILTIN_GLOBALS });
            const types = analyzeTypes(program, scopes, { libs: defaultLibs, resolveModule: resolverFor(target) });
            const exports = moduleExports(program, scopes, types, resolverFor(target));
            exportsCache.set(target, exports);
            return exports;
        } finally {
            inProgress.delete(target);
        }
    };
}

for (const file of files) {
    const name = relative(smokeDir, file).replace(/[\\/]/g, "__");
    const source = readFileSync(file, "utf8");

    try {
        const program = parse(source);
        const scopes = analyzeScopes(program, { builtinGlobals: BUILTIN_GLOBALS });
        const types = analyzeTypes(program, scopes, { libs: defaultLibs, resolveModule: resolverFor(file) });

        writeFileSync(
            join(outDir, name.replace(/\.luaut$/, ".json")),
            JSON.stringify(program, null, 2) + "\n",
        );

        const undeclared = [...scopes.bindings.values()]
            .filter(isUnassignedGlobal)
            .map((b) => b.name);

        const bindings: string[] = [];
        for (const [id, t] of types.bindingType) {
            const b = scopes.bindings.get(id);
            if (b && b.kind !== "global") bindings.push(`${b.name}: ${formatType(t as Type)}`);
        }
        writeFileSync(
            join(outDir, name.replace(/\.luaut$/, ".types.txt")),
            bindings.sort().join("\n") + "\n",
        );

        const notes = [
            undeclared.length ? `undeclared: ${undeclared.join(", ")}` : "",
            scopes.diagnostics.length ? `scope errors: ${scopes.diagnostics.map((d) => d.message).join("; ")}` : "",
            types.diagnostics.length ? `type errors: ${types.diagnostics.length}` : "",
        ].filter(Boolean).join("  ");
        console.log(`ok   ${name}${notes ? "  — " + notes : ""}`);
    } catch (err) {
        failures.push(`${name}: ${(err as Error).message}`);
        console.log(`FAIL ${name}\n     ${(err as Error).message}`);
    }
}

console.log(`\n${files.length - failures.length}/${files.length} passed — output in generated/`);
if (failures.length) throw new Error(`${failures.length} file(s) failed`);

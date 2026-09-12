/**
 * `types` in a config: which `.d.luaut` files to load, in order.
 *
 * Nothing is loaded by default. An entry names a type library:
 *
 *   "roblox"          the package `@luaut/roblox` — any name, looked up there
 *   "@luaut/roblox"   the same
 *   "./types"         a folder of the project (its `package.json`, or `index.d.luaut`)
 *   "./defs.d.luaut"  a file of the project
 *
 * A package is looked for in `node_modules` from the config's folder upward.
 * Its definitions file is `luaut.types` in its `package.json`, or
 * `index.d.luaut`. Any of its dependencies that are type libraries load first,
 * so `["roblox"]` brings `@luaut/lua` along, first.
 * A later file adds to the names an earlier one declared rather than
 * replacing them, which is what makes those layers layers.
 */
import { dirname, join, resolve } from "node:path"
import type { ConfigProblem, LuautConfig } from "./config"
import { keyPosition } from "./config"
import { nodeHost, type ProjectHost } from "./host"

export interface TypeLibraries {
    /** Definitions files, dependencies before what depends on them. */
    readonly files: readonly string[]
    /** Methods the libraries give arrays and strings, in the same order. */
    readonly methods: readonly MethodRuntime[]
    readonly problems: readonly ConfigProblem[]
}

/** A library's answer to `names:filter(f)`: which methods it gives values of
 *  one kind, and the Luau that implements them.
 *
 *  The library declares the *types* in its definitions file, as members of
 *  `ArrayMethods<T>` or `StringMethods`; this is the other half, and only for
 *  the methods that need code emitted. A method the runtime does not list is
 *  left as a plain Luau method call — which is what `text:upper()` wants,
 *  since a string already answers to it.
 *
 *  The file is Luau source defining one table, with `__NAME__` standing for
 *  the local the compiler gives it:
 *
 *      local __NAME__ = {}
 *      function __NAME__.filter(t, test) ... end
 *
 *  and each method is called with the receiver as its first argument. */
export interface MethodRuntime {
    /** What the methods are called on. */
    readonly receiver: "array" | "string"
    /** The Luau file implementing them. */
    readonly file: string
    /** The method names it implements. */
    readonly names: readonly string[]
    /** The package it came from, for reporting. */
    readonly from: string
}

export function resolveTypeLibraries(config: LuautConfig, host: ProjectHost = nodeHost): TypeLibraries {
    const files: string[] = []
    const methods: MethodRuntime[] = []
    const problems: ConfigProblem[] = []
    const loaded = new Set<string>()

    const addFile = (file: string): void => {
        const key = pathKey(file)
        if (loaded.has(key)) return
        loaded.add(key)
        files.push(file)
    }

    /** A package folder: its dependencies' definitions, then its own. */
    const addPackage = (directory: string, entryFile: string, visiting: Set<string>): void => {
        const key = pathKey(directory)
        if (visiting.has(key)) return
        visiting.add(key)
        for (const dependency of dependencyNames(directory, host)) {
            const found = findPackage(dependency, directory, host)
            if (found) addPackage(found.directory, found.file, visiting)
        }
        addFile(entryFile)
        methods.push(...methodRuntimes(directory, host, problems, config))
    }

    for (const entry of config.types) {
        const relative = entry.startsWith("./") || entry.startsWith("../") || entry.startsWith("/") || /^[A-Za-z]:[\\/]/.test(entry)
        if (relative) {
            const target = resolve(config.directory, entry)
            if (entry.endsWith(".luaut")) {
                if (host.readFile(target) !== undefined) addFile(target)
                else problems.push({ file: config.path, message: `Cannot find type library file '${entry}'`, ...entryPosition(config, entry) })
                continue
            }
            const file = packageEntry(target, host)
            if (file) addPackage(target, file, new Set())
            else problems.push({ file: config.path, message: `'${entry}' has no ${ENTRY_FILE} (or 'luaut.types' in its package.json)`, ...entryPosition(config, entry) })
            continue
        }

        const name = entry.startsWith("@luaut/") ? entry : `@luaut/${entry}`
        const found = findPackage(name, config.directory, host)
        if (found) addPackage(found.directory, found.file, new Set())
        else {
            problems.push({
                file: config.path,
                message: `Cannot find type library '${name}'. Install it with: npm i -D ${name}`,
                ...entryPosition(config, entry),
            })
        }
    }

    return { files, methods, problems }
}

/** The `luaut.methods` of a package: what it gives arrays and strings. */
function methodRuntimes(
    directory: string,
    host: ProjectHost,
    problems: ConfigProblem[],
    config: LuautConfig,
): MethodRuntime[] {
    const manifest = readJson(join(directory, "package.json"), host)
    const declared = (manifest?.luaut as { methods?: unknown } | undefined)?.methods
    if (!Array.isArray(declared)) return []
    const from = typeof manifest?.name === "string" ? manifest.name : directory
    const out: MethodRuntime[] = []
    for (const entry of declared) {
        const { receiver, runtime, names } = (entry ?? {}) as Record<string, unknown>
        const bad = (why: string): void => {
            problems.push({ file: config.path, message: `'${from}' declares a method runtime that ${why}` })
        }
        if (receiver !== "array" && receiver !== "string") { bad("names no 'receiver' of \"array\" or \"string\""); continue }
        if (typeof runtime !== "string") { bad("names no 'runtime' file"); continue }
        if (!Array.isArray(names) || names.some(n => typeof n !== "string")) { bad("names no method 'names'"); continue }
        const file = resolve(directory, runtime)
        if (host.readFile(file) === undefined) { bad(`points at '${runtime}', which is not there`); continue }
        out.push({ receiver, file, names: names as string[], from })
    }
    return out
}

const ENTRY_FILE = "index.d.luaut"

/** The definitions file of the package in `directory`, if it is a type library. */
function packageEntry(directory: string, host: ProjectHost): string | undefined {
    const manifest = readJson(join(directory, "package.json"), host)
    const declared = (manifest?.luaut as { types?: unknown } | undefined)?.types
    const file = resolve(directory, typeof declared === "string" ? declared : ENTRY_FILE)
    return host.readFile(file) !== undefined ? file : undefined
}

/** `name` in `node_modules`, searching from `from` upward. */
function findPackage(name: string, from: string, host: ProjectHost): { directory: string; file: string } | undefined {
    let directory = resolve(from)
    for (;;) {
        const candidate = join(directory, "node_modules", ...name.split("/"))
        const file = packageEntry(candidate, host)
        if (file) return { directory: candidate, file }
        const parent = dirname(directory)
        if (parent === directory) return undefined
        directory = parent
    }
}

function dependencyNames(directory: string, host: ProjectHost): string[] {
    const manifest = readJson(join(directory, "package.json"), host)
    const names = new Set<string>()
    for (const field of ["dependencies", "peerDependencies"]) {
        const deps = manifest?.[field]
        if (deps && typeof deps === "object") for (const name of Object.keys(deps)) names.add(name)
    }
    return [...names]
}

function readJson(path: string, host: ProjectHost): Record<string, unknown> | undefined {
    const text = host.readFile(path)
    if (text === undefined) return undefined
    try {
        const value = JSON.parse(text)
        return value && typeof value === "object" ? value : undefined
    } catch {
        return undefined
    }
}

/** Where `entry` is written in the config, for pointing a problem at it. */
function entryPosition(config: LuautConfig, entry: string): { line?: number; column?: number } {
    return keyPosition(config.source, entry)
}

function pathKey(path: string): string {
    const normalized = resolve(path)
    return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

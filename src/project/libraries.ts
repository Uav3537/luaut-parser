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
    readonly problems: readonly ConfigProblem[]
}

export function resolveTypeLibraries(config: LuautConfig, host: ProjectHost = nodeHost): TypeLibraries {
    const files: string[] = []
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

    return { files, problems }
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

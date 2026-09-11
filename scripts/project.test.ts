/**
 * Project tests: configs, type libraries, import paths and sourcemaps.
 *
 * Each case runs against an in-memory file system, so it states exactly the
 * files it needs. The sourcemap cases type-check against the real Luau and
 * Roblox definitions.
 */
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
    parse, analyzeScopes, analyzeTypes,
    findConfig, loadConfig, resolveTypeLibraries, resolveModulePath, sourceMapTypes,
    type ProjectHost, type Program,
} from "../src/index.js"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve("/luaut-project")

let passed = 0
const failures: string[] = []

function check(name: string, actual: unknown, expected: unknown): void {
    const a = JSON.stringify(actual)
    const b = JSON.stringify(expected)
    if (a === b) { passed++; return }
    failures.push(`${name}\n    expected ${b}\n    actual   ${a}`)
}

/** A file system of `files`, paths relative to ROOT. */
function host(files: Record<string, string>): ProjectHost {
    const key = (path: string): string => resolve(ROOT, path).toLowerCase()
    const map = new Map(Object.entries(files).map(([path, text]) => [key(path), text]))
    return { readFile: path => map.get(key(path)) }
}

/** A path under ROOT, as the tests write them. */
const rel = (path: string | undefined): string | undefined =>
    path === undefined ? undefined : path.slice(ROOT.length + 1).replace(/\\/g, "/")

// --- the nearest config applies -----------------------------------------
{
    const h = host({
        "luaut.config.json": `{ "types": ["luau"] }`,
        "a.luaut": "",
        "b/luaut.config.json": `{ "types": ["roblox"] }`,
        "b/c.luaut": "",
        "b/deep/d.luaut": "",
    })
    check("config: a file takes the config in its folder",
        rel(findConfig(join(ROOT, "a.luaut"), h).config?.path), "luaut.config.json")
    check("config: a nested folder's config wins",
        rel(findConfig(join(ROOT, "b/c.luaut"), h).config?.path), "b/luaut.config.json")
    check("config: and applies to folders below it",
        findConfig(join(ROOT, "b/deep/d.luaut"), h).config?.types, ["roblox"])
    check("config: a file with no config above it has none",
        findConfig(resolve("/somewhere-else/x.luaut"), h).config, undefined)
}

// --- two configs in one folder -------------------------------------------
{
    const h = host({ "dup/luaut.config.json": "{}", "dup/luaut.config.jsonc": "{}", "dup/x.luaut": "" })
    const lookup = findConfig(join(ROOT, "dup/x.luaut"), h)
    check("config: two in one folder is an error, reported on both",
        [lookup.config, lookup.problems.map(p => rel(p.file))],
        [undefined, ["dup/luaut.config.json", "dup/luaut.config.jsonc"]])
}

// --- reading a config ----------------------------------------------------
{
    const h = host({
        "ok/luaut.config.jsonc": `{\n  // types to load\n  "types": ["luau",],\n  /* the tree */ "sourceMap": "sourcemap.json",\n}\n`,
        "typo/luaut.config.json": `{\n  "types": ["luau"],\n  "typo": true\n}\n`,
        "broken/luaut.config.json": `{\n  "types": [\n}\n`,
        "none/luaut.config.json": `{ "types": [], "paths": {}, "sourceMap": null }`,
        "wrong/luaut.config.json": `{ "types": "luau" }`,
    })
    const ok = loadConfig(join(ROOT, "ok/luaut.config.jsonc"), h)
    check("config: comments and trailing commas are allowed", ok.problems, [])
    check("config: sourceMap resolves from the config's folder", rel(ok.config?.sourceMap ?? undefined), "ok/sourcemap.json")

    const typo = loadConfig(join(ROOT, "typo/luaut.config.json"), h)
    check("config: an unknown option is reported on its line",
        typo.problems.map(p => [p.line, p.message.split(".")[0]]), [[3, "Unknown option 'typo'"]])
    check("config: and the rest of the config still applies", typo.config?.types, ["luau"])

    const broken = loadConfig(join(ROOT, "broken/luaut.config.json"), h)
    check("config: invalid JSON is reported with a position",
        [broken.config, broken.problems.length, typeof broken.problems[0]?.line], [undefined, 1, "number"])
    check("config: a null sourceMap means none", loadConfig(join(ROOT, "none/luaut.config.json"), h).config?.sourceMap, null)
    check("config: an option of the wrong type is reported",
        loadConfig(join(ROOT, "wrong/luaut.config.json"), h).problems.map(p => p.message.split(",")[0]),
        ["'types' must be an array of strings"])
}

// --- type libraries -------------------------------------------------------
{
    const files: Record<string, string> = {
        "node_modules/@luaut/luau/package.json": JSON.stringify({ name: "@luaut/luau", luaut: { types: "index.d.luaut" } }),
        "node_modules/@luaut/luau/index.d.luaut": "declare function print(...: unknown): ()",
        "node_modules/@luaut/roblox/package.json": JSON.stringify({ name: "@luaut/roblox", dependencies: { "@luaut/luau": "^1.0.0" } }),
        "node_modules/@luaut/roblox/index.d.luaut": "declare game: unknown",
        "node_modules/plain/index.d.luaut": "declare plain: number",
        "local/types/index.d.luaut": "declare fromFolder: number",
        "local/defs.d.luaut": "declare fromFile: number",
    }
    const libraries = (types: string[], folder = ""): { files: (string | undefined)[]; problems: string[] } => {
        const h = host({ ...files, [`${folder}luaut.config.json`]: JSON.stringify({ types }) })
        const config = loadConfig(join(ROOT, `${folder}luaut.config.json`), h).config!
        const result = resolveTypeLibraries(config, h)
        return { files: result.files.map(rel), problems: result.problems.map(p => p.message) }
    }
    const LUAU = "node_modules/@luaut/luau/index.d.luaut"
    const ROBLOX = "node_modules/@luaut/roblox/index.d.luaut"

    check("types: nothing is loaded by default", libraries([]).files, [])
    check("types: a library brings its dependencies first", libraries(["roblox"]).files, [LUAU, ROBLOX])
    check("types: a library listed twice loads once", libraries(["luau", "roblox"]).files, [LUAU, ROBLOX])
    check("types: a full package name", libraries(["@luaut/roblox"]).files, [LUAU, ROBLOX])
    check("types: a plain package when there is no @luaut one", libraries(["plain"]).files, ["node_modules/plain/index.d.luaut"])
    check("types: a folder and a file by relative path",
        libraries(["./local/types", "./local/defs.d.luaut"]).files, ["local/types/index.d.luaut", "local/defs.d.luaut"])
    check("types: node_modules is searched upward from a nested config", libraries(["luau"], "nested/").files, [LUAU])
    check("types: a missing library says how to install it", libraries(["nope"]),
        { files: [], problems: ["Cannot find type library 'nope'. Install it with: npm i -D @luaut/nope"] })
}

// --- import paths -----------------------------------------------------------
{
    const h = host({
        "luaut.config.json": JSON.stringify({
            baseUrl: "src",
            paths: {
                "@shared/*": ["shared/*"],
                "@shared/special/*": ["special/*"],
                "@config": ["config/index.luaut"],
            },
        }),
        "src/main.luaut": "",
        "src/sibling.luaut": "",
        "src/shared/util.luaut": "",
        "src/special/thing.luaut": "",
        "src/config/index.luaut": "",
    })
    const config = loadConfig(join(ROOT, "luaut.config.json"), h).config!
    const from = join(ROOT, "src/main.luaut")
    const resolved = (specifier: string): string | undefined => rel(resolveModulePath(from, specifier, config, h))

    check("paths: a relative import", resolved("./sibling"), "src/sibling.luaut")
    check("paths: a `*` alias, from baseUrl", resolved("@shared/util"), "src/shared/util.luaut")
    check("paths: an exact alias", resolved("@config"), "src/config/index.luaut")
    check("paths: the longest matching prefix wins", resolved("@shared/special/thing"), "src/special/thing.luaut")
    check("paths: neither relative nor aliased resolves to nothing", resolved("somewhere"), undefined)
}

// --- sourcemap ------------------------------------------------------------
{
    const definitions = (name: string): Program =>
        parse(readFileSync(join(here, `../node_modules/@luaut/${name}/index.d.luaut`), "utf8"))
    const libs = [definitions("luau"), definitions("roblox")]
    const classes = new Set<string>()
    for (const lib of libs) {
        for (const s of lib.body.statements) {
            if (s.type === "TypeAliasStatement") classes.add(s.name.name)
            if (s.type === "ExportTypeAliasStatement") classes.add(s.alias.name.name)
        }
    }

    const tree = {
        name: "Game", className: "DataModel", children: [
            { name: "ReplicatedStorage", className: "ReplicatedStorage", children: [
                { name: "Shared", className: "Folder", children: [
                    { name: "Util", className: "ModuleScript", filePaths: ["src/shared/Util.luau"] },
                    { name: "Remotes", className: "Folder" },
                    { name: "Name", className: "Folder" },
                ] },
            ] },
            { name: "Workspace", className: "Workspace", children: [
                { name: "Spawn", className: "Part" },
            ] },
        ],
    }
    const { types, problem } = sourceMapTypes(JSON.stringify(tree), join(ROOT, "sourcemap.json"), { classes })
    check("sourcemap: turns into types", problem, undefined)

    const diagnose = (code: string, file: string): string[] => {
        const script = types!.scriptFor(join(ROOT, file))
        const all = [...libs, types!.program, ...(script ? [script] : [])]
        const globals = all.flatMap(l => l.body.statements.flatMap(s => (s.type === "DeclareStatement" ? [s.name] : [])))
        const program = parse(code)
        const scopes = analyzeScopes(program, { builtinGlobals: globals })
        return analyzeTypes(program, scopes, { libs: all }).diagnostics.map(d => d.message)
    }

    check("sourcemap: `game` and `workspace` follow the tree", diagnose([
        "const shared: Folder = game.ReplicatedStorage.Shared",
        "const remotes: Folder = game.ReplicatedStorage.Shared.Remotes",
        "const spawn: Part = workspace.Spawn",
    ].join("\n"), "src/other.luaut"), [])
    check("sourcemap: a mapped file's `script` is its own instance", diagnose([
        "const me: ModuleScript = script",
        "const remotes: Folder = script.Parent.Remotes",
        "const storage: ReplicatedStorage = script.Parent.Parent",
    ].join("\n"), "src/shared/Util.luaut"), [])
    check("sourcemap: a child is really typed, not any",
        diagnose("const wrong: number = game.ReplicatedStorage.Shared.Remotes", "src/other.luaut").length, 1)
    check("sourcemap: a child named like a member leaves the member alone",
        diagnose("const name: string = game.ReplicatedStorage.Shared.Name", "src/other.luaut"), [])
    check("sourcemap: an unmapped file has no `script` of its own",
        types!.scriptFor(join(ROOT, "src/other.luaut")), undefined)
    check("sourcemap: invalid JSON is reported",
        sourceMapTypes("{ nope", join(ROOT, "sourcemap.json"), { classes }).problem?.startsWith("Invalid sourcemap"), true)
}

for (const failure of failures) console.log(`FAIL ${failure}`)
console.log(`\nproject: ${passed} passed, ${failures.length} failed`)
process.exit(failures.length ? 1 : 0)

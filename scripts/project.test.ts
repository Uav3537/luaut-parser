/**
 * Project tests: configs, type libraries, import paths and sourcemaps.
 *
 * Each case runs against an in-memory file system, so it states exactly the
 * files it needs. No real type library is involved.
 */
import { join, resolve } from "node:path"
import {
    findConfig, loadConfig, resolveTypeLibraries, resolveModulePath, sourceMapTypes,
    parse, analyzeScopes, analyzeTypes, moduleExports, formatType,
    type ProjectHost, type ModuleExports,
} from "../src/index.js"

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
    check("types: a name is only looked for under @luaut", libraries(["plain"]),
        { files: [], problems: ["Cannot find type library '@luaut/plain'. Install it with: npm i -D @luaut/plain"] })
    check("types: a folder and a file by relative path",
        libraries(["./local/types", "./local/defs.d.luaut"]).files, ["local/types/index.d.luaut", "local/defs.d.luaut"])
    check("types: node_modules is searched upward from a nested config", libraries(["luau"], "nested/").files, [LUAU])
    check("types: a missing library says how to install it", libraries(["nope"]),
        { files: [], problems: ["Cannot find type library '@luaut/nope'. Install it with: npm i -D @luaut/nope"] })
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
// Only the conversion itself. What the resulting types mean depends on the
// class definitions a project loads, which the parser does not ship.
{
    const classes = new Set(["Instance", "DataModel", "ReplicatedStorage", "Folder", "ModuleScript", "Workspace", "Part"])
    const tree = {
        name: "Game", className: "DataModel", children: [
            { name: "ReplicatedStorage", className: "ReplicatedStorage", children: [
                { name: "Shared", className: "Folder", children: [
                    { name: "Util", className: "ModuleScript", filePaths: ["src/shared/Util.luau"] },
                    { name: "Remotes", className: "Folder" },
                ] },
            ] },
            { name: "Workspace", className: "Workspace", children: [
                { name: "Spawn", className: "Part" },
            ] },
        ],
    }
    const { types, problem } = sourceMapTypes(JSON.stringify(tree), join(ROOT, "sourcemap.json"), { classes })
    check("sourcemap: turns into types", problem, undefined)
    check("sourcemap: a mapped file gets its own `script`",
        types!.scriptFor(join(ROOT, "src/shared/Util.luaut")) !== undefined, true)
    check("sourcemap: an unmapped file has no `script` of its own",
        types!.scriptFor(join(ROOT, "src/other.luaut")), undefined)
    check("sourcemap: invalid JSON is reported",
        sourceMapTypes("{ nope", join(ROOT, "sourcemap.json"), { classes }).problem?.startsWith("Invalid sourcemap"), true)
}

// --- the language -----------------------------------------------------------
{
    /** Scope and type errors of `code`, importing from the modules in `modules`. */
    const analyze = (code: string, modules: Record<string, string> = {}) => {
        const program = parse(code)
        const scopes = analyzeScopes(program)
        const resolveModule = (specifier: string): ModuleExports | undefined => {
            const source = modules[specifier]
            if (source === undefined) return undefined
            const p = parse(source)
            const s = analyzeScopes(p)
            return moduleExports(p, s, analyzeTypes(p, s))
        }
        const types = analyzeTypes(program, scopes, { resolveModule })
        const bindings: Record<string, string> = {}
        for (const [id, type] of types.bindingType) bindings[scopes.bindings.get(id)!.name] = formatType(type)
        return {
            errors: [...scopes.diagnostics, ...types.diagnostics].map(d => d.message),
            bindings,
        }
    }
    const parseError = (code: string): string | undefined => {
        try {
            parse(code)
            return undefined
        } catch (error) {
            return (error as Error).message.replace(/ \(\d+:\d+\).*$/, "").replace(/, got .*$/, "")
        }
    }

    // Functions have no `const` / `let`: `function f()` declares `f`.
    check("functions: `function name()` declares a function", analyze("function twice(n: number): number return n * 2 end\nconst four = twice(2)").bindings.four, "number")
    check("functions: its name cannot be reassigned", analyze("function f() end\nf = nil").errors, ["Cannot assign to 'f' — it is a function"])
    check("functions: `const function` is not luaut", parseError("const function f() end"),
        "A function is declared as 'function name()'; 'const' does not apply to functions")
    check("functions: exported with `export function`", analyze(`import { twice } from "./m"\nconst n = twice(1)`,
        { "./m": "export function twice(n: number): number return n * 2 end" }).bindings.n, "number")

    // `import * as`
    const namespace = analyze(
        `import * as Shapes from "./shapes"\nconst area = Shapes.area(2)\nconst c: Shapes.Circle = { r: 1 }\nconst d = Shapes.default`,
        { "./shapes": "export type Circle = { r: number }\nexport function area(r: number): number return r * r end\nexport default 3" })
    check("imports: `import * as` holds the module's exports", [namespace.bindings.area, namespace.bindings.c, namespace.bindings.d], ["number", "{ r: number }", "3"])
    check("imports: and its types, by qualified name", namespace.errors, [])

    // Imports are read-only.
    check("imports: an imported name cannot be assigned",
        analyze(`import { value } from "./m"\nvalue = 2`, { "./m": "export const value = 1" }).errors, ["Cannot assign to 'value' — it is an import"])
    check("imports: nor can a module's exports through its namespace",
        analyze(`import * as M from "./m"\nM.value = 2\nfunction M.extra() end`, { "./m": "export const value = 1" }).errors,
        ["Cannot assign to a member of 'M' — a module's exports are read-only", "Cannot assign to a member of 'M' — a module's exports are read-only"])

    // `import type`: types only.
    const shapes = { "./shapes": "export type Circle = { r: number }\nexport function area(r: number): number return r * r end\nexport default 3" }
    check("import type: its names work as types, typeof included", analyze([
        `import type { Circle, area } from "./shapes"`,
        `import type * as S from "./shapes"`,
        `import type D from "./shapes"`,
        `const c: Circle = { r: 1 }`,
        `const d: S.Circle = c`,
        `const f: typeof area = function(r: number): number return r end`,
        `const n: typeof D = 3`,
    ].join("\n"), shapes).errors, [])
    check("import type: a name used as a value is an error", analyze([
        `import type { area } from "./shapes"`,
        `import type * as S from "./shapes"`,
        `area(2)`,
        `area = nil`,
        `print(S.area)`,
    ].join("\n"), shapes).errors, [
        "'area' is imported with 'import type' and can only be used as a type",
        "'area' is imported with 'import type' and can only be used as a type",
        "'S' is imported with 'import type' and can only be used as a type",
    ])
    check("import type: `import type from` is a default import named type",
        analyze(`import type from "./shapes"\nprint(type)`, shapes).errors, [])

    // An indexer is a promise about every key it covers.
    check("indexers: every property must hold the indexer's type", analyze([
        "declare find: () -> string | nil",
        "const bad: { [string]: number } = { a: find(), b: 1 }",
        "const good: { [string]: number } = { a: 1, b: 2 }",
    ].join("\n")).errors, ["Type '{ a: string | nil, b: number }' is not assignable to '{ [string]: number }'"])

    // `pairs` over a record: literal keys, correlated with their values.
    const record = analyze([
        "type Event = { kind: \"event\" }",
        "type Func = { kind: \"function\" }",
        "declare remotes: { Char: Event, Settings: Func, Maybe: Event | nil }",
        "function scan()",
        "    for name, remote in pairs(remotes) do",
        "        const anyName = name",
        "        if remote == nil then return end",
        "        if name == \"Settings\" then",
        "            const settings = remote",
        "        elseif name == \"Char\" then",
        "            const char = remote",
        "        else",
        "            const rest = remote",
        "            const restName = name",
        "        end",
        "        if remote.kind == \"function\" then",
        "            const fromValue = name",
        "        end",
        "    end",
        "end",
    ].join("\n"))
    check("pairs: a record's keys are its property names",
        record.bindings.anyName, `"Char" | "Settings" | "Maybe"`)
    check("pairs: testing the key narrows the value, and the other way round",
        [record.bindings.settings, record.bindings.char, record.bindings.rest, record.bindings.restName, record.bindings.fromValue],
        ["Func", "Event", "Event", `"Maybe"`, `"Settings"`])

    const destructured = analyze([
        "type Shape = { kind: \"circle\", radius: number } | { kind: \"rect\", w: number }",
        "function f(shape: Shape)",
        "    const { kind, radius } = shape",
        "    if kind == \"circle\" then const r = radius end",
        "end",
        "function g({ kind, w }: Shape)",
        "    if kind == \"rect\" then const width = w end",
        "end",
    ].join("\n"))
    check("destructuring: names taken from one union member narrow together",
        [destructured.bindings.r, destructured.bindings.width], ["number", "number"])

    // An empty array takes its type from where it is written.
    check("arrays: an empty array fits an annotation", analyze([
        "let waiting: thread[] = []",
        "const config: { list: number[], nested: { names: string[] } } = { list: [], nested: { names: [] } }",
        "function take(xs: string[]) end",
        "take([])",
        "let later: number[] = [1]",
        "later = []",
        "const grid: number[][] = [[], [1]]",
    ].join("\n")).errors, [])
    check("arrays: and still checks what it holds", analyze(`const wrong: number[] = ["a"]`).errors, ["Type 'string[]' is not assignable to 'number[]'"])
}

for (const failure of failures) console.log(`FAIL ${failure}`)
console.log(`\nproject: ${passed} passed, ${failures.length} failed`)
process.exit(failures.length ? 1 : 0)

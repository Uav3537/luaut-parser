/**
 * Project tests: configs, type libraries, import paths and sourcemaps.
 *
 * Each case runs against an in-memory file system, so it states exactly the
 * files it needs. No real type library is involved.
 */
import { join, resolve } from "node:path"
import {
    findConfig, loadConfig, resolveTypeLibraries, resolveModulePath, sourceMapTypes,
    parse, parseWithRecovery, analyzeScopes, analyzeTypes, moduleExports, formatType, applyDirectives,
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

    // Recovery: a syntax error costs as little of the tree as it can.
    const recovered = (code: string) => {
        const { program, errors } = parseWithRecovery(code)
        const scopes = analyzeScopes(program)
        const types = analyzeTypes(program, scopes)
        const bindings: Record<string, string> = {}
        for (const [id, type] of types.bindingType) bindings[scopes.bindings.get(id)!.name] = formatType(type)
        return {
            errors: errors.map(e => e.message.replace(/, got .*$/, "").replace(/ \(\d+:\d+\)$/, "")),
            statements: program.body.statements.map(st => st.type),
            bindings,
        }
    }
    {
        const r = recovered([
            "const Config = {",
            "    a: 1,",
            "    b: ,",
            "    c: \"x\"",
            "    d: 4,",
            "    run: function() return 1 end,",
            "}",
            "const after = Config.d",
        ].join("\n"))
        check("recovery: a broken field value and a missing comma keep the rest of the object",
            [r.errors, r.bindings.Config, r.bindings.after],
            [["Unexpected token in expression", "Expected ','"], "{ a: number, b: any, c: string, d: number, run: () -> 1 }", "number"])
    }
    {
        const r = recovered([
            "const Obj = {",
            "    a: foo bar,",
            "    f: function(x: number)",
            "        if x then return 1 end",
            "        return 2",
            "    end,",
            "    g: 5,",
            "}",
            "const after = Obj.g",
        ].join("\n"))
        check("recovery: skipping stops at the next field, not at an `end` inside the object",
            [r.statements, r.bindings.after], [["VariableDeclaration", "VariableDeclaration"], "number"])
    }
    {
        const r = recovered([
            "function f(x: number)",
            "    if x == then",
            "        print(x)",
            "    end",
            "    return x",
            "end",
            "const after = f(1)",
        ].join("\n"))
        check("recovery: a broken condition keeps its `if`, so its `end` closes the right block",
            [r.errors, r.statements, r.bindings.after], [["Unexpected token in expression"], ["FunctionDeclaration", "VariableDeclaration"], "number"])
    }
    {
        const r = recovered([
            "function a()",
            "    if true then",
            "        print(1)",
            "end",
            "function b(): number",
            "    return 2",
            "end",
            "const after = b()",
        ].join("\n"))
        check("recovery: a missing `end` is placed by indentation",
            [r.errors, r.statements, r.bindings.after],
            [["Expected 'end' to close 'if' on line 2"], ["FunctionDeclaration", "FunctionDeclaration", "VariableDeclaration"], "number"])
    }
    {
        const r = recovered([
            "const a = \"unclosed",
            "local b = 2",
            "const part = { Name: \"x\" }",
            "const n = part.",
            "end",
            "const c: { x: number, y: } = { x: 1, y: 2 }",
            "const s = `${1 +}`",
            "print(1, +, 3",
            "const d =",
        ].join("\n"))
        check("recovery: strings, `local`, `obj.`, a stray `end`, types, interpolation, calls and initializers", [r.errors, Object.keys(r.bindings)], [[
            "Unterminated string",
            "luaut has no 'local'; declare with 'const' or 'let'",
            // `part.` is followed by the stray `end`: one problem, reported once.
            "Expected identifier",
            "Unexpected token in type annotation",
            "In '${1 +}': Unexpected token in expression",
            "Unexpected token in expression",
            "Expected ')'",
            "Unexpected token in expression",
        ], ["print", "a", "b", "part", "n", "c", "s", "d"]])
    }

    // `satisfies`: checked against the contract, typed as the value.
    const satisfied = analyze([
        "type Shape = { kind: \"circle\" | \"rect\", size: number }",
        "const circle = { kind: \"circle\", size: 2 } satisfies Shape",
        "const config = { debug: false, level: 3, tags: [\"a\"] } satisfies { debug: boolean, level: 1 | 2 | 3, tags: string[] }",
        "const handlers = { Click: function(x) return x + 1 end } satisfies { [string]: (x: number) -> number }",
        "const empty = [] satisfies number[]",
        "const five = 5 satisfies number",
        "let widened = 5 satisfies number",
        "const tri = { kind: \"tri\", size: 1 } satisfies Shape",
        "const extra = { kind: \"rect\", size: 1, colour: \"red\" } satisfies Shape",
        "const nested = { inner: { a: 1, b: 2 } } satisfies { inner: { a: number } }",
        "const annotated: Shape = { kind: \"rect\", size: 1, typo: 1 }",
        "const loose: { [string]: number } = { anything: 1 }",
    ].join("\n"))
    check("satisfies: the value keeps its own type, with the contract's literals",
        [satisfied.bindings.circle, satisfied.bindings.config, satisfied.bindings.handlers, satisfied.bindings.empty, satisfied.bindings.five, satisfied.bindings.widened],
        [`{ kind: "circle", size: number }`, "{ debug: boolean, level: 3, tags: string[] }", "{ Click: (x: number) -> number }", "number[]", "5", "number"])
    check("satisfies: a value that does not fit, and properties the contract does not know", satisfied.errors, [
        `Type '{ kind: "tri", size: number }' does not satisfy the expected type 'Shape'`,
        "Object literal may only specify known properties, and 'colour' does not exist in type 'Shape'",
        "Object literal may only specify known properties, and 'b' does not exist in type '{ a: number }'",
        "Object literal may only specify known properties, and 'typo' does not exist in type 'Shape'",
    ])

    const constSatisfied = analyze([
        "const Names = [\"Sans\", \"Asgore\"] as const",
        "const Map = {",
        "    Sans: { Thumbnail: \"id://1\" },",
        "    Asgore: { Thumbnail: \"id://2\" },",
        "} as const satisfies { [K in typeof Names[number]]: { Thumbnail: string } }",
        "const Short = { Sans: { Thumbnail: 1 } } as const satisfies { [K in typeof Names[number]]: { Thumbnail: string } }",
        "const Extra = { a: 1, b: 2 } as const satisfies { a: number }",
    ].join("\n"))
    check("satisfies: `as const satisfies` keeps the value readonly and literal",
        [constSatisfied.bindings.Map, constSatisfied.errors], [
            `{ readonly Asgore: { readonly Thumbnail: "id://2" }, readonly Sans: { readonly Thumbnail: "id://1" } }`,
            [
                `Type '{ readonly Sans: { readonly Thumbnail: 1 } }' does not satisfy the expected type '{ Asgore: { Thumbnail: string }, Sans: { Thumbnail: string } }'`,
                "Object literal may only specify known properties, and 'b' does not exist in type '{ a: number }'",
            ],
        ])

    // Names nothing declares, when asked for.
    {
        const program = parse("counter = 1\nprint(counter, typo)\ndeclare later: number\nprint(later, Missing.x)\nconst local = 1\nprint(local)")
        const scopes = analyzeScopes(program, { builtinGlobals: ["print"], reportUndeclared: true })
        check("undeclared: reads of names nothing declares, assigns or `declare`s",
            scopes.diagnostics.map(d => `${d.node.line.start}: ${d.message}`), ["2: Cannot find name 'typo'", "4: Cannot find name 'Missing'"])
        check("undeclared: off unless asked for", analyzeScopes(program).diagnostics, [])
    }

    // `map[name]` with a generic index waits for the call to say which key.
    const generics = analyze([
        "type RemoteMap = { Char: number, Telek: string }",
        "declare map: RemoteMap",
        "function get<K extends keyof RemoteMap>(name: K)",
        "    return map[name]",
        "end",
        `const char = get("Char")`,
        `const telek = get("Telek")`,
        "const signature = get",
    ].join("\n"))
    check("generics: an index the call decides is read when it does",
        [generics.errors, generics.bindings.char, generics.bindings.telek, generics.bindings.signature],
        [[], "number", "string", `<K extends "Char" | "Telek">(name: K) -> RemoteMap[K]`])

    // `...` is what the function declared it takes.
    const varargs = analyze([
        "function f(...: number)",
        "    const first = ...",
        "    return ...",
        "end",
        "function g(...: string)",
        "    const s = ...",
        "    function inner()",
        "        return 1",
        "    end",
        "    return s",
        "end",
        "function plain(...)",
        "    const anything = ...",
        "end",
    ].join("\n"))
    check("varargs: `...` has the declared type, per function",
        [varargs.bindings.first, varargs.bindings.f, varargs.bindings.s, varargs.bindings.anything],
        ["number", "(...number) -> number", "string", "any"])

    // A closure written inside a value can read the name that value is bound
    // to — it runs later, as in JavaScript.
    {
        const program = parse([
            "function Setup()",
            "    let EventManager = {",
            "        Connections: [],",
            "        Disconnect: function()",
            "            return EventManager.Connections",
            "        end",
            "    }",
            "    return EventManager",
            "end",
            "function Sibling()",
            "    const read = function() return later end",
            "    const later = 7",
            "    return read()",
            "end",
            "const shadow = 1",
            "do",
            "    const shadow = shadow + 1",
            "    print(shadow)",
            "end",
        ].join("\n"))
        const scopes = analyzeScopes(program, { builtinGlobals: ["print"], reportUndeclared: true })
        const types = analyzeTypes(program, scopes)
        const bindings: Record<string, string> = {}
        for (const [id, type] of types.bindingType) bindings[scopes.bindings.get(id)!.name] = formatType(type)
        check("forward references: a closure reads the name being declared, and a later sibling",
            [scopes.diagnostics.map(d => d.message), bindings.read], [[], "() -> 7"])
        // The initializer itself still reads what was there before it.
        const shadows = [...scopes.bindings.values()].filter(b => b.name === "shadow")
        check("forward references: but an initializer still shadows rather than reads itself",
            shadows.length, 2)
    }

    // An inferred return type reads each `return` where it stands.
    const inferredReturns = analyze([
        "declare class NumberValue { Value: number }",
        "declare function plain(): NumberValue | nil",
        "function narrowed()",
        "    const v = plain()",
        "    if v then return v.Value end",
        "    return 0",
        "end",
        "function branches()",
        "    const n = 5",
        "    if n then return n end",
        "    return 0",
        "end",
        "function nested()",
        "    const inner = function()",
        `        return "inner"`,
        "    end",
        "    return inner",
        "end",
        "const a = narrowed()",
    ].join("\n"))
    check("returns: inferred from inside the branch that narrowed the value",
        [inferredReturns.errors, inferredReturns.bindings.narrowed, inferredReturns.bindings.branches, inferredReturns.bindings.nested],
        [[], "() -> number", "() -> 5 | 0", `() -> () -> "inner"`])

    // What a function returns is checked against what it declared.
    const returns = analyze([
        "declare function print(v: unknown): ()",
        "declare function error(message: string): never",
        "function wrong(): boolean",
        `    return ""`,
        "end",
        "function bare(): boolean",
        "    return",
        "end",
        "function never(): boolean",
        "    print(1)",
        "end",
        "function pack(): (boolean, string)",
        "    return true, 2",
        "end",
        "function fine(): boolean",
        "    if true then return true else return false end",
        "end",
        "function optional(): boolean | nil",
        "end",
        "function guard(v: unknown): v is string",
        `    return type(v) == "string"`,
        "end",
        "function asserted(v: boolean): asserts v",
        `    if not v then error("no") end`,
        "end",
        "function inferred()",
        `    return "anything"`,
        "end",
    ].join("\n"))
    check("returns: a value that does not fit, and a body that never returns one", returns.errors, [
        `Type '""' is not assignable to 'boolean'`,
        "Type 'nil' is not assignable to 'boolean'",
        "A function that returns 'boolean' must return a value",
        "Type '(true, 2)' is not assignable to '(boolean, string)'",
    ])

    // A type name nothing declares, when asked for.
    {
        const program = parse([
            "type Mine = { a: number }",
            "declare class Part {}",
            "const ok: Mine | Part | number = 1",
            "function generic<T>(v: T): T",
            "    return v",
            "end",
            "const bad: Nope = 1",
            "const alsoBad: Partial<Missing> = {}",
            "function f(a: NoParam): NoReturn",
            "    return a",
            "end",
        ].join("\n"))
        const scopes = analyzeScopes(program)
        const types = analyzeTypes(program, scopes, { reportUnknownTypes: true })
        check("types: a name nothing declares is reported, once, and nothing else is",
            types.diagnostics.map(d => `${d.node.line.start}: ${d.message}`), [
                "7: Cannot find name 'Nope'",
                "8: Cannot find name 'Missing'",
                "9: Cannot find name 'NoParam'",
                "9: Cannot find name 'NoReturn'",
            ])
        check("types: and it is off unless asked for",
            analyzeTypes(program, analyzeScopes(program)).diagnostics.length, 0)
    }

    // Reading a table with a key that is one of several.
    const indexed = analyze([
        "const Paths = {",
        `    Blocking: ["Blocking"],`,
        `    BlockingTick: ["Blocking", "Tick"],`,
        `    Health: ["Health"],`,
        `} as const satisfies { [string]: string[] }`,
        `declare known: "Blocking" | "Health"`,
        `declare partly: "Blocking" | "Missing"`,
        "const both = Paths[known]",
        "const some = Paths[partly]",
        `const one = Paths["Health"]`,
        `const none = Paths["Nope"]`,
        "declare xs: number[]",
        "declare i: 1 | 2",
        "const element = xs[i]",
    ].join("\n"))
    check("indexing: a key that is one of several reads each, and a missing key is nil", [
        indexed.bindings.both, indexed.bindings.some, indexed.bindings.one, indexed.bindings.none, indexed.bindings.element,
    ], [
        `["Blocking"] | ["Health"]`,
        `["Blocking"] | nil`,
        `["Health"]`,
        "nil",
        "number",
    ])

    // `f?.()` — call it only when it is there.
    const optionalCall = analyze([
        "declare f: ((n: number) -> string) | nil",
        `declare t: { m: (() -> number) | nil }`,
        "const said = f?.(1)",
        "const got = t.m?.()",
        "f?.(2)",
    ].join("\n"))
    check("optional call: the result takes nil, and the call is a statement of its own",
        [optionalCall.bindings.said, optionalCall.bindings.got, optionalCall.errors],
        ["string | nil", "number | nil", []])

    // The methods an array and a string answer to. The analyzer knows only
    // where to look — `ArrayMethods<T>` and `StringMethods` — and a library
    // says what is in them.
    {
        const library = parse([
            "type ArrayMethods<T> = {",
            "    filter: (self: T[], test: (value: T, index: number) -> boolean) -> T[],",
            "    map: <U>(self: T[], transform: (value: T) -> U) -> U[],",
            "    pop: (self: T[]) -> T | nil,",
            "}",
            "type StringMethods = { upper: (self: string) -> string, trim: (self: string) -> string }",
        ].join("\n"))
        const program = parse([
            `const names = ["a", "bb"]`,
            "const long = names:filter(function(v) return #v > 1 end)",
            "const sizes = names:map(function(v) return #v end)",
            "const last = ([1, 2]):pop()",
            "declare text: string",
            "const up = text:upper()",
            "const trimmed = text:trim()",
            `const literal = ("x"):trim()`,
            "const missing = names:nope()",
        ].join("\n"))
        const scopes = analyzeScopes(program)
        const types = analyzeTypes(program, scopes, { libs: [library] })
        const bindings: Record<string, string> = {}
        for (const [id, type] of types.bindingType) bindings[scopes.bindings.get(id)!.name] = formatType(type)
        check("array and string methods: read from the types a library declares", [
            bindings.long, bindings.sizes, bindings.last,
            bindings.up, bindings.trimmed, bindings.literal, bindings.missing,
        ], ["string[]", "number[]", "number | nil", "string", "string", "string", "unknown"])

        // Without a library that declares them, an array has no methods.
        const bare = analyze("const names = [1]\nconst gone = names:filter(function(v) return true end)")
        check("array methods: nothing is built in", bare.bindings.gone, "unknown")
    }

    // Libraries layer over one another; the file itself replaces.
    {
        const first = parse("type Set = { one: (self: string) -> string }")
        const second = parse("type Set = { two: (self: string) -> string }")
        const layered = parse("declare value: Set\nconst a = value.one\nconst b = value.two")
        const layeredScopes = analyzeScopes(layered)
        const layeredTypes = analyzeTypes(layered, layeredScopes, { libs: [first, second] })
        const names: Record<string, string> = {}
        for (const [id, type] of layeredTypes.bindingType) names[layeredScopes.bindings.get(id)!.name] = formatType(type)
        check("layered aliases: a library adds to what an earlier one declared",
            [names.a, names.b], ["(self: string) -> string", "(self: string) -> string"])

        const own = parse("type Set = { three: (self: string) -> string }\ndeclare value: Set\nconst c = value.one")
        const ownScopes = analyzeScopes(own)
        const ownTypes = analyzeTypes(own, ownScopes, { libs: [first, second] })
        const mine: Record<string, string> = {}
        for (const [id, type] of ownTypes.bindingType) mine[ownScopes.bindings.get(id)!.name] = formatType(type)
        check("layered aliases: the file's own replaces them", mine.c, "unknown")
    }

    // A literal written in an argument keeps its literal type when the
    // parameter asks for one — TypeScript's contextual typing.
    const request = [
        `type Request = { Url: string, Method?: "GET" | "POST", Modes?: ("a" | "b")[] }`,
        "declare function send(r: Request): number",
        "declare function keep<T>(v: T): T",
    ].join("\n")
    check("contextual literals: an argument's object literal keeps what the parameter asks for", [
        analyze(`${request}\nconst ok = send({ Url: "u", Method: "GET", Modes: ["a"] })`).errors,
        analyze(`${request}\nsend({ Url: "u", Method: "FETCH" })`).errors,
        analyze(`${request}\nconst free = keep({ Method: "GET" })`).bindings.free,
        analyze([
            `type Outer = { inner: { mode: "a" | "b" } }`,
            "declare function f(o: Outer): ()",
            `f({ inner: { mode: "a" } })`,
        ].join("\n")).errors,
    ], [
        [],
        [`Argument of type '{ Method: "FETCH", Url: string }' is not assignable to parameter of type 'Request'`],
        "{ Method: string }",
        [],
    ])

    // A shorthand field is the same field.
    check("contextual literals: a shorthand field too",
        analyze([
            `type Request = { Method: "GET" | "POST" }`,
            "declare function send(r: Request): ()",
            `const Method = "GET"`,
            "send({ Method })",
        ].join("\n")).errors, [])

    // Definitions files are layers: `@luaut/roblox` adds to `@luaut/lua`
    // rather than replacing it.
    {
        const lua = parse([
            "declare table: { insert: (t: unknown[], v: unknown) -> () }",
            `declare function type(value: number): "number"`,
            "declare function type<T>(value: T): string",
        ].join("\n"))
        const luau = parse([
            "declare table: { create: (n: number) -> unknown[] }",
            `declare function type(value: buffer): "buffer"`,
        ].join("\n"))
        const program = parse([
            "declare value: number | buffer",
            "const theTable = table",
            `if type(value) == "buffer" then`,
            "    const narrowed = value",
            "end",
        ].join("\n"))
        const scopes = analyzeScopes(program)
        const types = analyzeTypes(program, scopes, { libs: [lua, luau] })
        const bindings: Record<string, string> = {}
        for (const [id, type] of types.bindingType) bindings[scopes.bindings.get(id)!.name] = formatType(type)
        check("layered definitions: a table declared twice keeps both files' members",
            bindings.theTable,
            "{ create: (n: number) -> unknown[], insert: (t: unknown[], v: unknown) -> () }")
        check("layered definitions: and the later file's overload narrows",
            [bindings.narrowed, types.diagnostics.map(d => d.message)], ["buffer", []])
    }

    // An index signature over a finite set of keys names exactly those keys.
    const names = `type Names = "GTFrisk" | "XTFrisk"\n`
    check("finite indexer: a key outside the set is excess",
        analyze(`${names}const PerClass = {
    GTFrisk: function() end,
    XTFriskk: function() end,
} as const satisfies { [Names]: () -> () }`).errors,
        ["Object literal may only specify known properties, and 'XTFriskk' does not exist in type '{ [\"GTFrisk\" | \"XTFrisk\"]: () -> () }'"])
    check("finite indexer: the keys in the set are fine, and `[string]` takes anything", [
        analyze(`${names}const PerClass = {
    GTFrisk: function() end,
    XTFrisk: function() end,
} as const satisfies { [Names]: () -> () }`).errors,
        analyze(`const m = { whatever: 1 } satisfies { [string]: number }`).errors,
    ], [[], []])

    // `const c = player.Character`: the two names hold one value.
    const player = `type Char = { Name: string }\ndeclare player: { Character: Char | nil }\n`
    const alias = analyze(`${player}function f()
    const character = player.Character
    if not player.Character then return nil end
    const kept = character
end
function g()
    const character = player.Character
    if character then
        const reverse = player.Character
    else
        const gone = character
    end
end`)
    check("alias: a guard on the path narrows the name that copied it, and back",
        [alias.bindings.kept, alias.bindings.reverse, alias.bindings.gone],
        ["Char", "Char", "nil"])

    const discriminant = analyze([
        `type Shape = { kind: "circle", r: number } | { kind: "square", s: number }`,
        "declare shape: Shape",
        "function f()",
        "    const kind = shape.kind",
        `    if kind == "circle" then`,
        "        const picked = shape",
        "    end",
        "end",
    ].join("\n"))
    check("alias: a copied discriminant still picks the union member",
        discriminant.bindings.picked, `{ kind: "circle", r: number }`)

    const reassigned = analyze(`${player}function f()
    const character = player.Character
    player.Character = nil
    if player.Character then
        const stale = character
    end
end`)
    check("alias: an assignment through the path ends the alias",
        reassigned.bindings.stale, "Char | nil")

    // `const path = paths[stat]`: testing one narrows the other.
    const correlated = analyze([
        "const Paths = {",
        `    Blocking: ["Blocking"],`,
        `    Health: ["Health"],`,
        "} as const satisfies { [string]: string[] }",
        `declare stat: "Blocking" | "Health" | "KB" | "Knocked"`,
        "function read()",
        "    const path = Paths[stat]",
        "    if path then",
        "        const inMap = stat",
        "        const thePath = path",
        "    else",
        "        const missing = stat",
        "    end",
        "end",
    ].join("\n"))
    check("correlation: a value read by key says which key it was",
        [correlated.bindings.inMap, correlated.bindings.thePath, correlated.bindings.missing],
        [`"Blocking" | "Health"`, `["Blocking"] | ["Health"]`, `"KB" | "Knocked"`])

    // Each line of an overload set is a node of its own.
    {
        const program = parse([
            `export function f(x: "a"): number`,
            `export function f(x: "b"): string`,
            "export function f(x)",
            "    return nil",
            "end",
        ].join("\n"))
        const declaration = (program.body.statements[0] as { declaration: {
            signatures?: { name?: { name: string } }[]
            implementationName?: { line: { start: number } }
        } }).declaration
        check("overloads: every line keeps its name",
            [declaration.signatures?.map(sig => sig.name?.name), declaration.implementationName?.line.start],
            [["f", "f"], 3])
        const scopes = analyzeScopes(program)
        const binding = [...scopes.bindings.values()].find(b => b.name === "f")
        check("overloads: and each name is a use of the one binding",
            binding?.references.length, 2)
    }

    // Type arguments written at the call, and `<T = ...>` when they are not.
    const typeArguments = analyze([
        "declare class Instance {}",
        "declare class Folder extends Instance {}",
        "declare function find<T = Instance>(name: string): T | nil",
        "declare inst: {",
        "    Find: <T = Instance>(self: unknown, name: string) -> T | nil,",
        "    Wait: (<T = Instance>(self: unknown, name: string) -> T) & (<T = Instance>(self: unknown, name: string, timeout: number) -> T | nil),",
        "}",
        `const typed = find<Folder>("x")`,
        `const bare = find("x")`,
        `const method = inst:Find<Folder>("x")`,
        `const waited = inst:Wait<Folder>("x")`,
        `const timed = inst:Wait<Folder>("x", 5)`,
        `const tooMany = find<Folder, Folder>("x")`,
        "declare a: number",
        "declare b: number",
        "const compared = a < b",
    ].join("\n"))
    check("type arguments: written at the call, defaulted when not, and counted", [
        typeArguments.bindings.typed, typeArguments.bindings.bare, typeArguments.bindings.method,
        typeArguments.bindings.waited, typeArguments.bindings.timed, typeArguments.bindings.compared,
        typeArguments.errors,
    ], [
        "Folder | nil", "Instance | nil", "Folder | nil",
        "Folder", "Folder | nil", "boolean",
        ["Expected 1 type argument, got 2"],
    ])
    check("type arguments: `a < b > (c)` is still three operators",
        parseError("declare a: number\ndeclare b: number\ndeclare c: number\nconst x = (a < b) == (b < c)"), undefined)

    // The implementation of an overload set sees what its signatures allow.
    const implementation = analyze([
        "declare class Player {}",
        "declare player: Player",
        `export function get(stat: "hp", who?: Player): number`,
        `export function get(stat: "name", who?: Player): string`,
        "export function get(stat, who, extra)",
        "    const s = stat",
        "    const w = who",
        "    const e = extra",
        "    return nil",
        "end",
        `function annotated(stat: "hp"): number`,
        `function annotated(stat: "name"): string`,
        "function annotated(stat: string)",
        "    const inner = stat",
        "    return nil",
        "end",
    ].join("\n"))
    check("overloads: an implementation's bare parameter is what the signatures allow",
        [implementation.bindings.s, implementation.bindings.w, implementation.bindings.e, implementation.bindings.inner],
        [`"hp" | "name"`, "Player | nil", "any", "string"])

    // `export function` overloads: one declaration, exported once.
    const overloadModule = [
        "export function Tags(a: number, b: number): boolean",
        "export function Tags(a?: number, b?: number): string",
        "export function Tags(a: number = 1, b?: number): string",
        `    return "x"`,
        "end",
    ].join("\n")
    const exportedOverloads = analyze([
        `import { Tags } from "./tags"`,
        "const two = Tags(1, 2)",
        "const none = Tags()",
    ].join("\n"), { "./tags": overloadModule })
    check("overloads: `export function` signatures make one exported overload set",
        [exportedOverloads.errors, exportedOverloads.bindings.two, exportedOverloads.bindings.none],
        [[], "boolean", "string"])
    check("overloads: mixing `export` and plain signatures is an error",
        parseError("function f(a: number): boolean\nexport function f(a?: number): string\n    return \"x\"\nend"),
        "Overload signatures must all be exported or non-exported")

    // A constraint is a type like any other: `typeof` in one reads a value.
    const constraints = analyze([
        "const Skills = {",
        `    Sans: [{ Page: "Bones", Skills: ["Bonespam", "Bonewall"] }, { Page: "Blasters", Skills: ["Blast1"] }],`,
        "} as const",
        "type Rows = (typeof Skills)[\"Sans\"][number]",
        "type Extract<T, U> = T extends U ? T : never",
        "function pick<P extends (typeof Skills)[\"Sans\"][number][\"Page\"]>(",
        "    page: P,",
        "    skill: Extract<Rows, { Page: P }>[\"Skills\"][number],",
        ")",
        "    return skill",
        "end",
        `const good = pick("Bones", "Bonespam")`,
        `const wrongSkill = pick("Bones", "Blast1")`,
        `const wrongPage = pick("Nope", "Bonespam")`,
    ].join("\n"))
    check("generics: a constraint written inline, and arguments checked once the call fixes them", [
        constraints.bindings.good,
        constraints.errors,
    ], [
        `"Bonespam" | "Bonewall"`,
        [
            `Argument of type '"Blast1"' is not assignable to parameter of type '"Bonespam" | "Bonewall"'`,
            `Argument of type '"Nope"' is not assignable to parameter of type '"Bones" | "Blasters"'`,
        ],
    ])

    // Trailing commas, as in TypeScript.
    check("trailing commas: parameters, arguments, generics and type arguments", [
        parseError("function f(\n    a: number,\n    b: string,\n)\nend"),
        parseError("print(\n    1,\n    2,\n)"),
        parseError("function f<\n    A,\n    B,\n>(a: A) end"),
        parseError("type F = (\n    a: number,\n) -> ()"),
        parseError("type P = Partial<number,>"),
    ], [undefined, undefined, undefined, undefined, undefined])

    // `...rest` holds what the pattern did not take.
    const rest = analyze([
        "declare t: { a: number, b: number, c: string }",
        "const { a, ...others } = t",
        "const { a: first, ...tail } = t",
    ].join("\n"))
    check("destructuring: rest drops the properties already named",
        [rest.bindings.others, rest.bindings.tail], ["{ b: number, c: string }", "{ b: number, c: string }"])

    // Hoisting: functions, and a module's names seen from code that runs later.
    {
        const program = parse([
            "let Resource: ResourceType | nil",
            "let Direct: ReturnType<typeof Load> | nil",
            "const early = parity(4)",
            "function Load()",
            "    return { level: Config.level }",
            "end",
            "export type ResourceType = ReturnType<typeof Load>",
            "function parity(n: number): string",
            "    const direct = later()",
            "    function isEven(k: number): boolean",
            "        if k == 0 then return true end",
            "        return isOdd(k - 1)",
            "    end",
            "    function isOdd(k: number): boolean",
            "        if k == 0 then return false end",
            "        return isEven(k - 1)",
            "    end",
            "    function later() return 1 end",
            "    return if isEven(n) then \"even\" else \"odd\"",
            "end",
            "function bump() counter = counter + 1 end",
            "const Config = { level: 3 }",
            "let counter = 0",
        ].join("\n"))
        const scopes = analyzeScopes(program, { reportUndeclared: true })
        const types = analyzeTypes(program, scopes)
        const bindings: Record<string, string> = {}
        for (const [id, type] of types.bindingType) bindings[scopes.bindings.get(id)!.name] = formatType(type)
        check("hoisting: types written above a function see it",
            [bindings.Resource, bindings.Direct, bindings.early],
            ["ResourceType | nil", "{ level: number } | nil", "string"])
        check("hoisting: only a direct call above a nested function is an error",
            [...scopes.diagnostics, ...types.diagnostics].map(d => `${d.node.line.start}: ${d.message.split(":")[0]}`),
            ["9: 'later' is used before its definition"])
    }

    // An alias that names a `typeof` alias waits for it, as that one waits for the value.
    {
        const dependent = analyze([
            "export type ResourceType = ReturnType<typeof Load>",
            "export type RemoteMapType = ResourceType[\"RemoteMap\"]",
            "export type ClassMapType = ResourceType[\"ClassMap\"]",
            "let Resource: ResourceType | nil",
            "declare peek: ClassMapType",
            "function Load()",
            "    const RemoteMap = { Char: 1 } as const",
            "    const ClassMap = { Sans: { Thumbnail: \"id\" } } as const",
            "    return { RemoteMap, ClassMap }",
            "end",
            "const seen = peek",
        ].join("\n"))
        check("type queries: aliases built on a `typeof` alias, a declare, and a binding above the function",
            [dependent.errors, dependent.bindings.seen, dependent.bindings.Resource],
            [[], "ClassMapType", "ResourceType | nil"])
    }

    // `export type X = typeof value` reads the value, as a plain alias does.
    const classes = [
        "export const DefaultClass = [\"Sans\", \"Asgore\"] as const",
        "export type DefaultClassType = typeof DefaultClass",
        "export type DefaultClassName = (typeof DefaultClass)[number]",
    ].join("\n")
    const exportedQuery = analyze([
        "import type { DefaultClassType, DefaultClassName } from \"./classes\"",
        "declare tuple: DefaultClassType",
        "declare name: DefaultClassName",
        "const t = tuple",
        "const n = name",
        "const bad: DefaultClassName = \"Nope\"",
    ].join("\n"), { "./classes": classes })
    check("type queries: an exported alias of `typeof` a value, imported elsewhere",
        [exportedQuery.bindings.t, exportedQuery.bindings.n, exportedQuery.errors],
        [`["Sans", "Asgore"]`, `"Sans" | "Asgore"`, [`Type '"Nope"' is not assignable to '"Sans" | "Asgore"'`]])

    // `--@luaut-...` comments switch checking off.
    const directed = (code: string) => {
        const { program, directives } = parseWithRecovery(code)
        const scopes = analyzeScopes(program)
        const types = analyzeTypes(program, scopes)
        const all = [...scopes.diagnostics, ...types.diagnostics]
        const { kept, unusedExpectErrors } = applyDirectives(directives, all, d => d.node.line.start)
        return [...kept.map(d => `${d.node.line.start}: ${d.message}`), ...unusedExpectErrors.map(d => `${d.line}: unused`)]
    }
    check("directives: ignore and expect-error cover the next line of code", directed([
        "const a: number = \"x\"",
        "--@luaut-ignore",
        "const b: number = \"x\"",
        "-- @luaut-expect-error: the reason",
        "",
        "-- another comment",
        "const c: number = \"x\"",
        "--@luaut-expect-error",
        "const d: number = 1",
        "const e: number = \"x\" --@luaut-ignore",
        "const f: number = \"x\"",
    ].join("\n")), [
        "1: Type '\"x\"' is not assignable to 'number'",
        "10: Type '\"x\"' is not assignable to 'number'",
        "8: unused",
    ])
    check("directives: nocheck before the code turns the file off", [
        directed("-- header\n--@luaut-nocheck\nconst a: number = \"x\"\nnope = 1"),
        directed("const a: number = \"x\"\n--@luaut-nocheck"),
    ], [[], ["1: Type '\"x\"' is not assignable to 'number'"]])

    // An overload set with a union argument picks per member.
    const perMember = analyze([
        "declare class Instance {}",
        "declare function kind(value: nil): \"nil\"",
        "declare function kind(value: number): \"number\"",
        "declare function kind(value: Instance): \"Instance\"",
        "declare function kind<T>(value: T): string",
        "declare function whole(value: number | nil): \"both\"",
        "declare function whole(value: number): \"number\"",
        "function f(v: Instance | nil, n: number | nil, x: unknown, b: boolean | Instance)",
        "    const k1 = kind(v)",
        "    const k2 = kind(n)",
        "    const k3 = kind(x)",
        "    const k4 = kind(b)",
        "    const w = whole(n)",
        "end",
    ].join("\n"))
    check("overloads: a union argument returns what each member's signature returns",
        [perMember.bindings.k1, perMember.bindings.k2, perMember.bindings.k3, perMember.bindings.k4, perMember.bindings.w],
        [`"Instance" | "nil"`, `"number" | "nil"`, "string", "string", `"both"`])

    // The language's utility types need no type library.
    const utilities = analyze([
        "type User = { id: number, name: string, email: string | nil }",
        "declare function load(): User",
        "declare user: Partial<User>",
        "declare picked: Pick<User, \"id\" | \"name\">",
        "declare omitted: Omit<User, \"email\">",
        "declare byName: Record<\"a\" | \"b\", number>",
        "declare returned: ReturnType<typeof load>",
        "declare present: NonNullable<string | nil>",
        "declare kept: Truthy<number | false | nil>",
        "const u = user",
        "const p = picked",
        "const o = omitted",
        "const r = byName",
        "const ret = returned",
        "const n = present",
        "const t = kept",
    ].join("\n"))
    check("prelude: utility types are built in", [utilities.errors, utilities.bindings.p, utilities.bindings.o, utilities.bindings.r, utilities.bindings.n, utilities.bindings.t], [
        [], "{ id: number, name: string }", "{ id: number, name: string }", "{ a: number, b: number }", "string", "number",
    ])
    check("prelude: a file may declare one of them again", analyze([
        "type Partial<T> = string",
        "const s: Partial<number> = \"x\"",
    ].join("\n")).errors, [])

    // Reading through a value that may be nil is an error, as in TypeScript.
    const nilAccess = analyze([
        "type Node = { Name: string, find: (self: Node, name: string) -> Node | nil, Parent: Node | nil, box?: { n: number } }",
        "declare root: Node",
        "declare call: (() -> number) | nil",
        "declare function error(message: string): never",
        "const bad = root:find(\"a\"):find(\"b\")",
        "const parentName = root.Parent.Name",
        "const n = root.box.n",
        "const called = call()",
        "const safe = root:find(\"a\")?:find(\"b\")",
        "function checked(x: Node | nil, y: Node | nil, z: Node | nil)",
        "    if x then const a = x.Name end",
        "    const b = x and x.Name",
        "    if not y then return end",
        "    const c = y.Name",
        "    if z == nil then error(\"no\") end",
        "    const d = z.Name",
        "end",
        "function looped(list: (Node | nil)[])",
        "    for i = 1, #list do",
        "        const item = list[i]",
        "        const e = item.Name",
        "    end",
        "end",
    ].join("\n"))
    check("nil access: reading through a possibly-nil value is an error", nilAccess.errors, [
        `'root:find("a")' is possibly nil. Check it first, or use '?.' / '?:'`,
        "'root.Parent' is possibly nil. Check it first, or use '?.' / '?:'",
        "'root.box' is possibly nil. Check it first, or use '?.' / '?:'",
        "'call' is possibly nil. Check it first, or use '?.' / '?:'",
        "'item' is possibly nil. Check it first, or use '?.' / '?:'",
    ])
    check("nil access: the read still has the member's type", [nilAccess.bindings.bad, nilAccess.bindings.parentName, nilAccess.bindings.n, nilAccess.bindings.called],
        ["Node | nil", "string", "number", "number"])

    // Optional chaining: `a?.b` and `a?:m()` are nil when `a` is.
    const chains = parse("const x = a?.b.c\nconst y = a?:m(1)?.n\nconst z = c ?a:b")
    const [cx, cy, cz] = chains.body.statements.map(s => (s as { init: any[] }).init[0])
    check("optional chains: `?.` and `?:` mark their link",
        [cx.object.optional, cx.optional, cy.optional, cy.object.optional, cz.type],
        [true, undefined, true, true, "IfElseExpression"])
    check("optional chains: cannot be assigned to", [
        parseError("a?.b = 1"),
        parseError("a?.b.c += 1"),
        parseError("a.b?.c, d = 1, 2"),
    ], [
        "An optional chain cannot be assigned to",
        "An optional chain cannot be assigned to",
        "An optional chain cannot be assigned to",
    ])
    const optional = analyze([
        "type Node = { Parent: Node | nil, Name: string, find: (self: Node, name: string) -> Node | nil }",
        "declare node: Node | nil",
        "declare run: { go: () -> number } | nil",
        "const name = node?.Name",
        "const deep = node?.Parent?.Name",
        "const found = node?:find(\"a\")",
        "const called = run?.go()",
        "const paren = (node?.Parent)",
        "function f(n: Node | nil)",
        "    if n?.Parent then const truthy = n else const falsy = n end",
        "    if n?.Name ~= nil then const present = n end",
        "    if n?:find(\"a\")?.Name == \"a\" then const matched = n end",
        "end",
    ].join("\n"))
    check("optional chains: a chain is nil when a tested link is", [
        optional.bindings.name, optional.bindings.deep, optional.bindings.found, optional.bindings.called, optional.bindings.paren,
    ], ["string | nil", "string | nil", "Node | nil", "number | nil", "Node | nil"])
    const guarded = analyze([
        "declare class Instance { IsA: <K extends keyof ClassMap>(self: Instance, className: K) -> self is ClassMap[K] }",
        "declare class Folder extends Instance {}",
        "type ClassMap = { Folder: Folder, Instance: Instance }",
        "declare function error(message: string): never",
        "declare function find(): Instance | nil",
        "function f()",
        "    const a = find()",
        "    if not a?:IsA(\"Folder\") then error(\"no\") end",
        "    const afterGuard = a",
        "    const b = find()",
        "    if b?:IsA(\"Folder\") then const inside = b else const outside = b end",
        "end",
    ].join("\n"))
    check("optional chains: a type guard called through `?:` still narrows",
        [guarded.errors, guarded.bindings.afterGuard, guarded.bindings.inside, guarded.bindings.outside],
        [[], "Folder", "Folder", "Instance | nil"])
    check("optional chains: a chain that got through narrows what it tested", [
        optional.bindings.truthy, optional.bindings.falsy, optional.bindings.present, optional.bindings.matched,
    ], ["Node", "Node | nil", "Node", "Node"])
}

for (const failure of failures) console.log(`FAIL ${failure}`)
console.log(`\nproject: ${passed} passed, ${failures.length} failed`)
process.exit(failures.length ? 1 : 0)

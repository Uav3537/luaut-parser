/**
 * Project tests: configs, type libraries, import paths and sourcemaps.
 *
 * Each case runs against an in-memory file system, so it states exactly the
 * files it needs. No real type library is involved.
 */
import { join, resolve } from "node:path"
import {
    findConfig, loadConfig, resolveTypeLibraries, resolveModulePath, sourceMapTypes,
    parse, parseWithRecovery, analyzeScopes, analyzeTypes, moduleExports, formatType,
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
    check("optional chains: a chain that got through narrows what it tested", [
        optional.bindings.truthy, optional.bindings.falsy, optional.bindings.present, optional.bindings.matched,
    ], ["Node", "Node | nil", "Node", "Node"])
}

for (const failure of failures) console.log(`FAIL ${failure}`)
console.log(`\nproject: ${passed} passed, ${failures.length} failed`)
process.exit(failures.length ? 1 : 0)

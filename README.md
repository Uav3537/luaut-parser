# luaut-parser

Front end for **luaut** — a TypeScript-flavoured language that compiles to Luau.
Source → tokens → AST → scope analysis → flow-sensitive type analysis.

This package is the front end only. Lowering the luaut AST to Luau is the
compiler's job and lives elsewhere; there is deliberately no printer here.

```bash
npm install luaut-parser
```

```ts
import { readFileSync } from "node:fs"
import {
  parse, analyzeScopes, analyzeTypes,
  findConfig, resolveTypeLibraries, resolveModulePath,
} from "luaut-parser"

// The project the file belongs to, and the type libraries it names.
const { config } = findConfig(file)
const libs = config ? resolveTypeLibraries(config).files.map(f => parse(readFileSync(f, "utf8"))) : []
const globals = libs.flatMap(lib => lib.body.statements.flatMap(s => s.type === "DeclareStatement" ? [s.name] : []))

const program = parse(readFileSync(file, "utf8"))
const scopes  = analyzeScopes(program, { builtinGlobals: globals })
const types   = analyzeTypes(program, scopes, { libs })

for (const d of [...scopes.diagnostics, ...types.diagnostics]) console.log(d.message)
```

## The three passes

| | produces | use it for |
|---|---|---|
| `parse(source)` | `Program` — every node carries `line`/`column` spans | everything |
| `analyzeScopes(program, opts)` | `bindingOf`, `bindings`, `references`, `diagnostics` | go-to-definition, find-references, rename |
| `analyzeTypes(program, scopes, opts)` | `typeOf`, `narrowedTypeOf`, `bindingType`, `typeOfTypeNode`, `expectedTypeOf`, `aliases`, `diagnostics` | hover, completion, type errors |

Every name in the AST has a node with its own span — including the ones that
used to be bare strings: `DeclareStatement.id`, `TableTypeProperty.key`,
`FunctionTypeParameter.id`, `GenericTypeParameter.id`, `InferTypeNode.id`,
`MappedTypeNode.parameterId`. `typeOfTypeNode` gives what each type
annotation resolves to, and `expectedTypeOf` what each call argument should
be, so a tool never has to re-derive a type from text.

`parseWithRecovery(source)` returns `{ program, errors }` instead of throwing —
use it for editors, where the text is usually mid-edit. An error costs as
little of the tree as it can: a broken value becomes an `ErrorExpression`
(typed `any`) in its place, a broken field or argument is skipped to the next
`,`, a missing comma between fields on separate lines, or a missing `)`, `}`,
`then`, `do` or `end`, is recorded and read past — a missing `end` is placed
by indentation — and an unclosed string ends at its line. Skipping never lets
an `end` or `}` inside a skipped function or object close the block around
it. Valid code parses to exactly the same tree as `parse`.

Neither analysis mutates the AST; both return side tables.

## Projects

**No globals are built in** — not `print`, not `string`, not `game`. Only the
language's own utility types are (`Partial`, `Pick`, `Omit`, `Record`,
`ReturnType`, `Truthy`, ...; see `PRELUDE_SOURCE`). A project lists the type
libraries it uses in `luaut.config.json`, the way TypeScript uses `@types/*`:

```bash
npm i -D @luaut/roblox        # or just @luaut/luau
```

```jsonc
// luaut.config.json
{
  "types": ["roblox"],                          // @luaut/roblox, which brings @luaut/luau
  "paths": { "@shared/*": ["src/shared/*"] },   // import aliases, as in tsconfig
  "sourceMap": "sourcemap.json"                 // a Rojo sourcemap, or null
}
```

- **Which config applies** — the nearest one in the file's folder or above.
  `luaut.config.json` and `luaut.config.jsonc` in the same folder is an error.
  Both forms accept comments and trailing commas.
- **`types`** — any name, looked up as the package `@luaut/<name>` in
  `node_modules` from the config upward; one that is not installed is an
  error. A relative path (`"./types"`, `"./defs.d.luaut"`) loads the project's
  own definitions. A type library's own type-library dependencies load first.
- **`paths`** — tsconfig rules: an exact pattern wins, then the `*` pattern
  with the longest prefix; targets resolve from `baseUrl` (default: the
  config's folder).
- **`sourceMap`** — the instance tree becomes types: `game` and `workspace`
  follow it, and a file the tree maps gets its own `script`, so
  `script.Parent.Remotes` is typed. A `.luaut` file matches the Luau file of
  the same path.

| function | does |
|---|---|
| `findConfig(file, host?)` | the config that applies, problems with it, and every path searched |
| `loadConfig(path, host?)` | read and check one config |
| `resolveTypeLibraries(config, host?)` | the `.d.luaut` files to load, in order |
| `moduleCandidates(from, specifier, config?)` / `resolveModulePath(...)` | what an `import` means |
| `sourceMapTypes(text, path, { classes })` | the tree's types, and `scriptFor(file)` |

Every problem comes back as `{ file, message, line, column }`, pointing into
the config (or sourcemap) it is about. `host` reads files — pass your own to
read unsaved editor buffers or to record what was read.

`type` / `typeof` are **not** special-cased in the analyzer either: they are
overload sets in `@luaut/luau`, and narrowing is derived from them. Without a
library that declares them, they narrow nothing.

## The language, in brief

TypeScript syntax and semantics wherever they fit, Lua semantics where they
must.

**Declarations** — `const` and `let` only; Lua's `local` is gone.

**Functions** — `function name() ... end` declares `name` in the enclosing
scope; like a TypeScript function declaration it cannot be reassigned.
`const` and `let` do not apply to functions. `function T.name()` and
`function T:name()` define a member.

**Modules** — `import { a, b as c } from "./m"`, `import D from "./m"` and
`import * as M from "./m"`; `export const`, `export function`, `export default`,
`export { a as b }`, `export { a } from "./m"` and `export * from "./m"`.
Imports are read-only: assigning to an imported name, or to a member of a
namespace (`M.x = 1`), is an error.

`import type { A } from "./m"` (also `import type D` and `import type * as M`)
brings in names that are types and nothing else: unlike TypeScript, using one
as a value is an error, and only type positions — `typeof A` included — may
name it. Compiled code keeps no trace of it.

**Optionality** — there is no `T?` shorthand. `?` in type position always
belongs to a conditional type, and in expression position to a ternary or an
optional chain.

```luau
name?: T        -- may be absent; its type is `T | nil`
name: T | nil   -- must be written, but may be nil
```

Omitting an argument requires `?` (or a default), as in TypeScript — a
parameter typed `T | nil` still has to be passed something.

**Optional chaining** — `a?.b` and `a?:m(x)` are nil when `a` is, and then
nothing further along the chain runs, arguments included: `folder?:FindFirstChild("A")?.Name`
is a `string | nil`. The `?` must touch the `.` or `:`; `c ? a : b` stays a
ternary. Parentheses end a chain. A chain cannot be assigned to (`a?.b = 1` is
an error). A chain that got through narrows what it tested: inside
`if part?.Parent then`, and `if part?.Name == "Door" then`, `part` is not nil.

**Classes** — types are structural, except for classes. A definitions file
declares one with `declare class`, and it is nominal, as Roblox's classes are:

```luau
declare class BasePart extends PVInstance { Size: Vector3 }
declare class Part extends BasePart { Shape: EnumItem }
```

A `Part` is a `BasePart` and an `Instance` because it extends them. A
`ReplicatedStorage` is not a `Part`, and no table literal is an `Instance`,
however alike their members. A class still fits a shape that names members it
has (`{ Name: string }`). It is not a table, though, so `typeof(part)` picks
the `"Instance"` overload, not `"table"`. Members are inherited, and a subclass
may narrow one (`Parent: SomeFolder`).

**Callbacks** — a function written where a function type is expected takes
its parameter types from it: in `signal:Connect(function(player) ... end)`,
`player` is typed from `Connect`. The same applies to an annotated `const`
and to an assignment such as `remote.OnServerInvoke = function(player) ...`.

**Type packs** — `type Signal<T... = ...any> = { Connect: (self, cb: (T...) -> ()) -> () }`.
A pack parameter takes every type argument from its position on:
`Signal<Player, string>`, `Signal<()>` for none.

**Operators** — on a type that declares metamethods (`__add`, `__mul`,
`__unm`, ...), an operator has the metamethod's result, tried on the left
operand and then the right one, as Luau does. So `Vector3 + Vector3` and
`2 * vector` are both `Vector3`.

**Qualified type names** — a definitions file may declare `Enum.Material`
(`declare class Enum.Material extends EnumItem {}`), and code writes it the
same way.

**Contextual typing** — an expression takes its type from where it is
written, as in TypeScript: `let queue: thread[] = []` is a `thread[]`, and so
is `[]` passed where one is expected, including inside an object literal.

**Calls** — every argument is checked against its parameter, and a generic
parameter against its constraint (`GetService<K extends keyof Services>`
rejects `""`).

**Narrowing** follows TypeScript's model: references (`x`, `x.a.b`, `x["k"]`)
rather than just variables, discriminated unions at any depth, `and`/`or`,
early return, `break`/`continue`, `error()` (declared `-> never`), user type
guards (`v is T`), and assertion signatures (`asserts v`).

Reading a member of, indexing or calling a value that may be nil is an error
until a check narrows the nil away, as with TypeScript's `strictNullChecks`:
`FindFirstChild("A"):FindFirstChild("B")` reports that the first call is
possibly nil. Use `?.` / `?:`, or check first. The read is still typed from the
non-nil part.

Only `nil` and `false` are falsy — `0` and `""` are truthy, unlike JavaScript.

**Types** — unions, intersections, tuples `[A, B]`, type packs `(A, B)` (the
several values a function returns), `keyof`, `T[K]`, conditional types with
`infer`, mapped types with `as` remapping, template literal types
(`` `on${Event}` ``), and set difference `A - B`. The utility types
(`Partial`, `Pick`, `Omit`, `ReturnType`, `Parameters`, `Exclude`, …) are
built in, and written in luaut on top of those rather than special-cased in
the analyzer. A type library or a file may declare one again; the later
declaration wins.

`<const T>` infers an argument at its narrowest, as in TypeScript 5.

`typeof x` in a type is TypeScript's type query — the type of a value
(`typeof config`, `typeof config.volume`, `ReturnType<typeof f>`). Luau's
`typeof(expr)` spelling works too. It is compile-time only, unrelated to the
`typeof(v)` function that returns a string at runtime.

**Modules** — `import` / `export`, export lists, re-exports and `export *`.

**`satisfies`** — checks a value against a type without giving it that type,
as in TypeScript 4.9:

```luau
type Shape = { kind: "circle" | "rect", size: number }
const circle = { kind: "circle", size: 2 } satisfies Shape  -- { kind: "circle", size: number }
const handlers = {
    Click: function(x) return x + 1 end,                     -- x: number, from the contract
} satisfies { [string]: (x: number) -> number }
```

The contract types callbacks and empty arrays, and a literal stays a literal
where the contract asks for literals (`kind: "circle"`, not `string`). A value
that does not fit is an error. So is a property the contract does not know —
TypeScript's excess property check, which applies to an object literal written
straight into an annotation (`const s: Shape = { ..., typo: 1 }`) too. A value
that already has a type of its own keeps it exactly: `{ ... } as const
satisfies T` stays readonly and literal. `as` reinterprets instead of
checking, and compiled code keeps neither.

**Undeclared names** — `analyzeScopes(program, { builtinGlobals, reportUndeclared: true })`
reports each read of a name nothing declares: "Cannot find name 'x'". A global
assigned in the file (`x = 1`) and a `declare` count as declarations. It is
off by default, since it is only right when `builtinGlobals` lists what the
type libraries declare.

**Directives** — comments that switch checking off, as TypeScript's
`// @ts-...` do. They silence scope and type errors, never syntax errors:

```luau
--@luaut-nocheck          -- before the first line of code: the whole file
--@luaut-ignore           -- the next line of code
--@luaut-expect-error     -- the next line of code, which must have an error
```

`parseWithRecovery` returns them as `directives`; `directivesOf(source)` reads
them for a caller that parsed some other way, and
`applyDirectives(directives, diagnostics, lineOf)` filters a list and names
each `expect-error` that had nothing to suppress.

## Options

```ts
analyzeScopes(program, {
  builtinGlobals: ["print", "game"],   // names that may be used undeclared
})

analyzeTypes(program, scopes, {
  libs,                       // parsed `.d.luaut` definitions
  globalTypes: { … },         // types for specific globals; wins over `libs`
  libTypes: { … },            // extra named types for annotations
  diagnostics: true,          // emit type errors (default)
  resolveModule: specifier => exportsOfThatFile,
                              // what an `import` sees; without it imports are `any`
})
```

## Known limitations

- `export * as ns from` and namespace imports (`import * as ns`) are not
  supported.
- `setmetatable` and metatables are not modelled.
- Accessing a property a type does not have yields `unknown` rather than an
  error; assigning to a `readonly` property is not reported.
- A sourcemap child whose name is not an identifier (`"My Part"`) is not typed.

## Development

```bash
npm install
npm test        # smoketests (types via smoketest/luaut.config.json), then project tests
npm run build
npm run typecheck
```

`smoketest/` is the test suite. Each file annotates its bindings with the type
they should infer to, so a wrong result surfaces as a diagnostic rather than
something to eyeball. `scripts/project.test.ts` covers configs, type
libraries, import paths and sourcemaps against an in-memory file system.

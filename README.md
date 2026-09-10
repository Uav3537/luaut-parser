# luaut-parser

Front end for **luaut** — a TypeScript-flavoured language that compiles to Luau.
Source → tokens → AST → scope analysis → flow-sensitive type analysis.

This package is the front end only. Lowering the luaut AST to Luau is the
compiler's job and lives elsewhere; there is deliberately no printer here.

```bash
npm install luaut-parser
```

```ts
import {
  parse, analyzeScopes, analyzeTypes, formatType, defaultLibs,
} from "luaut-parser"

const program = parse(source)
const scopes  = analyzeScopes(program, {})
const types   = analyzeTypes(program, scopes, { libs: defaultLibs })

for (const d of [...scopes.diagnostics, ...types.diagnostics]) console.log(d.message)
```

## The three passes

| | produces | use it for |
|---|---|---|
| `parse(source)` | `Program` — every node carries `line`/`column` spans | everything |
| `analyzeScopes(program, opts)` | `bindingOf`, `bindings`, `references`, `diagnostics` | go-to-definition, find-references, rename |
| `analyzeTypes(program, scopes, opts)` | `typeOf`, `narrowedTypeOf`, `bindingType`, `typeOfTypeNode`, `aliases`, `diagnostics` | hover, assignability errors |

Every name in the AST has a node with its own span — including the ones that
used to be bare strings: `DeclareStatement.id`, `TableTypeProperty.key`,
`FunctionTypeParameter.id`, `GenericTypeParameter.id`, `InferTypeNode.id`,
`MappedTypeNode.parameterId`. `typeOfTypeNode` gives what each type
annotation resolves to, so a tool never has to re-derive a type from text.

`parseWithRecovery(source)` returns `{ program, errors }` instead of throwing —
use it for editors, where the text is usually mid-edit.

Neither analysis mutates the AST; both return side tables.

## Definitions

`type` / `typeof` are **not** special-cased in the analyzer. They are ordinary
overload sets declared in `luau.d.luaut`, and narrowing is derived from them.
Pass the definitions or those built-ins narrow nothing:

```ts
analyzeTypes(program, scopes, { libs: defaultLibs })   // core Luau + Roblox
analyzeTypes(program, scopes, { libs: [luauLib] })     // core Luau only
```

The same trick drives the Roblox layer: `IsA`, `GetService` and `Instance.new`
are each one generic signature indexing a map of names to types, so adding a
class is adding a line to `roblox.d.luaut`. Ship your own definitions by
parsing them the same way:

```ts
analyzeTypes(program, scopes, { libs: [luauLib, parse(myDefs)] })
```

`luauDefs` / `robloxDefs` expose the raw text (the loaders read from disk, so a
browser consumer should parse the text itself).

## The language, in brief

TypeScript syntax and semantics wherever they fit, Lua semantics where they
must.

**Declarations** — `const` and `let` only; Lua's `local` is gone.

**Optionality** — there is no `T?` shorthand. `?` in type position always
belongs to a conditional type, and in expression position to a ternary.

```luau
name?: T        -- may be absent; its type is `T | nil`
name: T | nil   -- must be written, but may be nil
```

Omitting an argument requires `?` (or a default), as in TypeScript — a
parameter typed `T | nil` still has to be passed something.

**Narrowing** follows TypeScript's model: references (`x`, `x.a.b`, `x["k"]`)
rather than just variables, discriminated unions at any depth, `and`/`or`,
early return, `break`/`continue`, `error()` (declared `-> never`), user type
guards (`v is T`), and assertion signatures (`asserts v`).

Only `nil` and `false` are falsy — `0` and `""` are truthy, unlike JavaScript.

**Types** — unions, intersections, tuples `[A, B]`, type packs `(A, B)` (the
several values a function returns), `keyof`, `T[K]`, conditional types with
`infer`, mapped types with `as` remapping, template literal types
(`` `on${Event}` ``), and set difference `A - B`. The utility types
(`Partial`, `Pick`, `Omit`, `ReturnType`, `Parameters`, `Exclude`, …) are
written in luaut on top of those, not built in.

`<const T>` infers an argument at its narrowest, as in TypeScript 5.

`typeof x` in a type is TypeScript's type query — the type of a value
(`typeof config`, `typeof config.volume`, `ReturnType<typeof f>`). Luau's
`typeof(expr)` spelling works too. It is compile-time only, unrelated to the
`typeof(v)` function that returns a string at runtime.

## Options

```ts
analyzeScopes(program, {
  builtinGlobals: ["print", "game"],   // names that may be used undeclared
})

analyzeTypes(program, scopes, {
  libs: defaultLibs,          // parsed `.d.luaut` definitions
  globalTypes: { … },         // types for specific globals; wins over `libs`
  libTypes: { … },            // extra named types for annotations
  diagnostics: true,          // emit assignability errors (default)
})
```

## Known limitations

- Cross-module `import` resolves to `any`.
- `setmetatable` and metatables are not modelled.
- Accessing a property a type does not have yields `unknown` rather than an
  error; assigning to a `readonly` property is not reported; generic
  constraints are not checked at call sites.

## Development

```bash
npm install
npm test        # parses smoketest/*.luaut, writes AST + inferred types to generated/
npm run build
npm run typecheck
```

`smoketest/` is the test suite. Each file annotates its bindings with the type
they should infer to, so a wrong result surfaces as a diagnostic rather than
something to eyeball.

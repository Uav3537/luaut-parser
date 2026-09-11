// ============================================================
// Flow-sensitive type analysis
// ------------------------------------------------------------
// A second analysis pass (after `analyzeScopes`) over the luaut
// AST. Like `analyzeScopes` it never mutates the tree — it
// produces a side table (`TypeAnalysis`) mapping expression
// nodes and bindings to `Type`s, with control-flow narrowing
// applied.
//
// Narrowing follows TypeScript's model:
//
//   * References, not just variables. `x`, `x.a.b`, `x["k"]` and
//     `t[1]` each get their own flow slot (`RefKey`), so a guard
//     on a nested path narrows that path — and, walking back up,
//     the union it hangs off. Assignment invalidates a path and
//     everything under it.
//   * Truthiness is the primitive. In Luau only `nil` and
//     `false` are falsy (`0` and `""` are not), and that rule
//     lives in `isPossiblyTruthy` / `narrowTruthy` in the type
//     model rather than being restated per call site.
//   * Guards are *declared*, not hard-coded. `type` / `typeof`
//     are overload sets returning string-literal types, so
//     `typeof(x) == "number"` narrows by keeping the parameter
//     types of the overloads that can return `"number"`. User
//     functions get the same treatment, plus TypeScript's
//     `v is T` / `asserts v` return annotations.
//
// Uncovered corners (metatables/`setmetatable`, precise
// multi-return, cross-module imports) still fall back to `any`
// rather than erroring. Search for `TODO(types)`.
// ============================================================

import type {
    Program, Block, Statement, Expression, TypeNode, TypePackNode,
    Identifier, FunctionBody, FunctionSignature, BindingTarget, GenericTypeParameter,
    ObjectPattern, ArrayPattern,
    TableExpression, ArrayExpression, IfStatement, TypePredicateNode,
} from "./nodes"
import type { ScopeAnalysis, BindingId } from "./analyzeScopes"
import {
    type Type, type ObjectProperty, type FunctionType, type TypePredicate,
    anyType, unknownType, neverType, nilType, booleanType, numberType, stringType,
    primitive, literal, arrayOf, tuple, objectType, fn, union, intersection, optional,
    typeParam, substitute, unify, containsTypeParam, matchInfer, setAliasExpander, difference,
    widen, isAssignable, overlaps, narrowTo, narrowExclude, narrowTruthy, narrowFalsy,
    isPossiblyFalsy,
    formatType,
} from "./typeModel"

// ============================================================
// Public API
// ============================================================

export interface TypeDiagnostic {
    node: Expression | Statement
    message: string
}

export interface TypeAnalysis {
    /** Inferred type of every expression node. */
    readonly typeOf: Map<Expression, Type>
    /** Declared (or first-inferred) type of every value binding. */
    readonly bindingType: Map<BindingId, Type>
    /** Type of a specific variable *reference*, after flow narrowing at that
     *  point. For an un-narrowed reference this equals `bindingType`. */
    readonly narrowedTypeOf: Map<Identifier, Type>
    /** What every type annotation node resolves to — `number`, `Shape`,
     *  `typeof x`, a property's type inside `{ ... }`. Inside a generic alias or
     *  function its parameters stay unresolved (`T`). */
    readonly typeOfTypeNode: Map<TypeNode | TypePackNode, Type>
    /** What each call argument is expected to be: the parameter it lands on,
     *  with the signature's type parameters replaced by their constraints — a
     *  union when an overload set disagrees. Recorded even for a call that does
     *  not type-check, since that is exactly when an editor wants to offer the
     *  values that would. */
    readonly expectedTypeOf: Map<Expression, Type>
    /** Top-level type aliases, resolved — and the type names this module
     *  imports, so tooling treats both alike. */
    readonly aliases: Map<string, Type>
    readonly diagnostics: TypeDiagnostic[]
}

/** A type a module exports: the resolved type, plus the parameter names of a
 *  generic alias so an importer can instantiate it (`Box<number>`). */
export interface ExportedType {
    readonly type: Type
    readonly params: readonly string[]
}

/** What a module makes available to `import`. See `moduleExports`. */
export interface ModuleExports {
    /** `export const` / `export let` / `export const function` names. */
    readonly values: ReadonlyMap<string, Type>
    /** `export type` names. */
    readonly types: ReadonlyMap<string, ExportedType>
    /** `export default <expr>`. */
    readonly default?: Type
    /** The module is still being analyzed further up an import cycle. Its
     *  names read as `any`, and nothing about them is reported. */
    readonly partial?: boolean
}

export interface AnalyzeTypesOptions {
    /** Types for pre-registered globals (`analyzeScopes`'s `builtinGlobals`).
     *  Anything not listed is treated as `any`. Overrides `libs`. */
    globalTypes?: Record<string, Type>
    /** Extra named types available to annotations (e.g. Roblox classes). */
    libTypes?: Record<string, Type>
    /** Parsed definitions files (`.d.luaut`): their `type` aliases become
     *  available to annotations and their `declare` statements seed global
     *  types. A project lists them under `types` in `luaut.config.json`; see
     *  `resolveTypeLibraries`. */
    libs?: readonly Program[]
    /** Resolve an `import`'s module path to what that module exports. Called
     *  once per distinct path. Return `undefined` when there is no such module:
     *  the import is reported and its names are `any`. Without this option
     *  every import is `any` — a single file cannot know better. */
    resolveModule?: (specifier: string) => ModuleExports | undefined
    /** Emit assignability diagnostics (default: true). */
    diagnostics?: boolean
}

export function analyzeTypes(
    program: Program,
    scopes: ScopeAnalysis,
    options: AnalyzeTypesOptions = {},
): TypeAnalysis {
    return new TypeAnalyzer(program, scopes, options).run()
}

/** The exports of an analyzed module, in the shape another module's
 *  `resolveModule` returns. */
export function moduleExports(
    program: Program,
    scopes: ScopeAnalysis,
    types: TypeAnalysis,
    /** For `export ... from`: the same resolver the module was analyzed with. */
    resolveModule?: (specifier: string) => ModuleExports | undefined,
): ModuleExports {
    const byDeclaration = new Map<object, BindingId>()
    for (const binding of scopes.bindings.values()) {
        if (binding.declarationNode) byDeclaration.set(binding.declarationNode, binding.id)
    }
    const values = new Map<string, Type>()
    const exportedTypes = new Map<string, ExportedType>()
    let defaultType: Type | undefined
    const stars: string[] = []

    // `export { x as default }` makes `x` the default export.
    const setValue = (name: string, type: Type): void => {
        if (name === "default") defaultType = type
        else values.set(name, type)
    }
    const reexport = (from: ModuleExports | undefined, name: string, as: string): void => {
        // A module up an import cycle, or missing: nothing reliable to copy.
        if (!from || from.partial) {
            setValue(as, anyType)
            return
        }
        if (name === "default") {
            if (from.default) setValue(as, from.default)
            return
        }
        const value = from.values.get(name)
        if (value) setValue(as, value)
        const type = from.types.get(name)
        if (type) exportedTypes.set(as, type)
    }
    const aliasParams = (name: string): string[] => {
        for (const s of program.body.statements) {
            const alias = s.type === "TypeAliasStatement" ? s : s.type === "ExportTypeAliasStatement" ? s.alias : undefined
            if (alias?.name.name === name) return alias.generics.map(g => g.name)
        }
        return []
    }

    const exportName = (declaration: object, name: string): void => {
        const id = byDeclaration.get(declaration)
        values.set(name, (id !== undefined ? types.bindingType.get(id) : undefined) ?? anyType)
    }
    const exportPattern = (target: BindingTarget): void => {
        switch (target.type) {
            case "IdentifierPattern":
                exportName(target, target.name)
                return
            case "ObjectPattern":
                for (const p of target.properties) exportPattern(p.value)
                if (target.rest) exportPattern(target.rest)
                return
            case "ArrayPattern":
                for (const el of target.elements) if (el) exportPattern(el.value)
                if (target.rest) exportPattern(target.rest)
                return
        }
    }

    for (const stmt of program.body.statements) {
        if (stmt.type === "ExportStatement") {
            const declaration = stmt.declaration
            if (declaration.type === "FunctionDeclaration") exportName(declaration.name, declaration.name.name)
            else for (const target of declaration.names) exportPattern(target)
        } else if (stmt.type === "ExportTypeAliasStatement") {
            const name = stmt.alias.name.name
            const type = types.aliases.get(name)
            if (type) exportedTypes.set(name, { type, params: stmt.alias.generics.map(g => g.name) })
        } else if (stmt.type === "ExportDefaultStatement") {
            defaultType = types.typeOf.get(stmt.declaration) ?? anyType
        } else if (stmt.type === "ExportNamedStatement") {
            if (stmt.source) {
                const from = resolveModule?.(stmt.source.value)
                for (const s of stmt.specifiers) reexport(from, s.local.name, s.exported.name)
            } else {
                for (const s of stmt.specifiers) {
                    const id = scopes.bindingOf.get(s.local)
                    if (id !== undefined) setValue(s.exported.name, types.bindingType.get(id) ?? anyType)
                    const alias = types.aliases.get(s.local.name)
                    if (alias) exportedTypes.set(s.exported.name, { type: alias, params: aliasParams(s.local.name) })
                }
            }
        } else if (stmt.type === "ExportAllStatement") {
            stars.push(stmt.source.value)
        }
    }

    // `export *` last: a name this module exports itself wins, and the
    // default is never part of it.
    for (const specifier of stars) {
        const from = resolveModule?.(specifier)
        if (!from || from.partial) continue
        for (const [name, type] of from.values) if (!values.has(name)) values.set(name, type)
        for (const [name, type] of from.types) if (!exportedTypes.has(name)) exportedTypes.set(name, type)
    }
    return { values, types: exportedTypes, default: defaultType }
}

// ============================================================
// Flow environment
// ============================================================

/** A narrowable *reference* — what TypeScript calls a "reference" in its flow
 *  analysis. Not just a variable: `x`, `x.a.b`, `x["k"]` and `t[2]` are each
 *  their own key, so a guard on a nested path narrows that path alone.
 *
 *  Shape: `$<bindingId>` for the root, then `.name` per property and `#n` per
 *  numeric index. `x.k` and `x["k"]` deliberately produce the *same* key —
 *  they denote the same reference, exactly as in TypeScript. */
type RefKey = string

/** The flow state at a program point: every reference currently known to be
 *  narrower than its declared type. Absent = "no narrowing here". */
type FlowEnv = Map<RefKey, Type>

/** Flow key for a whole binding — the root of every reference path. */
function bindKey(id: BindingId): RefKey {
    return `$${id}`
}

/** How a binding's inferred type is derived from its initializer:
 *  `widen` (`let`), `const` (keep a top-level literal, TS-style),
 *  `asconst` (keep everything narrow + freeze). */
type BindMode = "widen" | "const" | "asconst" | "keep"

function forkEnv(env: FlowEnv): FlowEnv {
    return new Map(env)
}

/** Join two branch environments. A binding narrowed in only one branch must
 *  be unioned with what it was *outside* the branch (`base`) — taking the one
 *  present entry would wrongly propagate that branch's narrowing to the path
 *  that never ran it. */
function mergeEnv(a: FlowEnv, b: FlowEnv, base: (key: RefKey) => Type): FlowEnv {
    const out: FlowEnv = new Map()
    const keys = new Set([...a.keys(), ...b.keys()])
    for (const k of keys) {
        out.set(k, union([a.get(k) ?? base(k), b.get(k) ?? base(k)]))
    }
    return out
}

type Indexer = { key: Type; value: Type }

/** Combine two `{ [K]: V }` catch-alls (several computed keys, or a spread of a
 *  table that had one) — both key and value widen to the union. */
function mergeIndexer(a: Indexer | undefined, b: Indexer): Indexer {
    return a ? { key: union([a.key, b.key]), value: union([a.value, b.value]) } : b
}

/** Is this initialiser a *fresh* literal — one whose literal type should widen
 *  when it lands in a mutable binding? TypeScript widens `let n = 1` to
 *  `number` because `1` is a fresh literal expression, but leaves
 *  `let x = other` alone however narrow `other` is. Anything that is not a
 *  literal expression (or a container of them) keeps its type verbatim. */
/** Can this expression yield more than one value? Only a call or `...` can,
 *  and only in the last position of an expression list — parenthesising it
 *  truncates to one value, exactly as in Lua. */
function producesMultipleValues(e: Expression): boolean {
    return e.type === "CallExpression" || e.type === "MethodCallExpression" ||
        e.type === "VarargExpression"
}

function isFreshLiteralExpr(e: Expression | undefined): boolean {
    if (!e) return false
    switch (e.type) {
        case "NumberLiteral":
        case "StringLiteral":
        case "BooleanLiteral":
        case "InterpolatedStringExpression":
        case "TableExpression":
        case "ArrayExpression":
            return true
        case "ParenthesizedExpression":
            return isFreshLiteralExpr(e.expression)
        case "UnaryExpression":
            return isFreshLiteralExpr(e.argument)
        default:
            return false
    }
}

/** Every `infer U` name written inside a conditional's `extends` clause.
 *  They behave like type parameters scoped to that conditional. */
function collectInferNames(node: TypeNode): string[] {
    const out: string[] = []
    const walk = (n: TypeNode | undefined): void => {
        if (!n) return
        switch (n.type) {
            case "InferTypeNode": out.push(n.name); return
            case "ArrayTypeNode": walk(n.element); return
            case "ParenthesizedTypeNode":
            case "VariadicTypeNode": walk(n.typeAnnotation); return
            case "TupleTypeNode": n.elements.forEach(walk); return
            case "UnionTypeNode":
            case "IntersectionTypeNode": n.types.forEach(walk); return
            case "TypeReference": n.typeArguments.forEach(walk); return
            case "KeyofTypeNode": walk(n.target); return
            case "IndexedAccessTypeNode": walk(n.objectType); walk(n.indexType); return
            case "FunctionTypeNode":
                n.params.forEach(pp => walk(pp.typeAnnotation))
                walk(n.varargType)
                walk(n.returnType)
                return
            case "TableTypeNode":
                for (const prop of n.properties) {
                    if (prop.type === "TableTypeIndexer") { walk(prop.keyType); walk(prop.valueType) }
                    else walk(prop.valueType)
                }
                return
            default: return
        }
    }
    walk(node)
    return out
}

/** Should an argument matched against this parameter keep its literal type?
 *  True for a bare type parameter whose constraint admits literals, mirroring
 *  TypeScript's rule for literal-type inference. */
function keepsLiterals(paramType: Type): boolean {
    if (paramType.kind !== "typeParam") return false
    // `<const T>` says so outright.
    if (paramType.isConst) return true
    if (!paramType.constraint) return false
    const members = paramType.constraint.kind === "union"
        ? paramType.constraint.types
        : [paramType.constraint]
    return members.some(m => m.kind === "literal")
}

function posKey(name: string, line: number, column: number): string {
    return `${name}@${line}:${column}`
}

// ============================================================
// Analyzer
// ============================================================

class TypeAnalyzer {
    private readonly typeOf = new Map<Expression, Type>()
    private readonly bindingType = new Map<BindingId, Type>()
    private readonly narrowedTypeOf = new Map<Identifier, Type>()
    private readonly typeOfTypeNode = new Map<TypeNode | TypePackNode, Type>()
    private readonly expectedTypeOf = new Map<Expression, Type>()
    /** Public: each alias resolved once (generic aliases keep their params as
     *  `typeParam` nodes in the body). */
    private readonly aliases = new Map<string, Type>()
    /** Uninstantiated alias definitions, for `Name<Args>` instantiation. */
    private readonly aliasDefs = new Map<string, { params: GenericTypeParameter[]; node: TypeNode }>()
    /** Generic parameters currently in lexical scope (alias body / generic fn),
     *  with their `extends` constraints resolved. */
    private readonly typeParamScope: { name: string; constraint?: Type; isConst?: boolean }[] = []
    /** Global types contributed by `declare` statements (libs, then this program). */
    private readonly libGlobalTypes = new Map<string, Type>()
    /** Declaration node -> binding, built once so `bindingIdByName` is O(1)
     *  instead of a scan of every binding per declaration site. */
    private readonly bindingByDecl = new Map<object, BindingId>()
    /** Fallback index for the same lookup, keyed by `name@line:column` — used
     *  when the caller holds a different node object at the same source span. */
    private readonly bindingByPos = new Map<string, BindingId>()
    /** Bindings whose type came from an explicit annotation (vs. inferred from
     *  the initializer) — reassignment narrows within these, but replaces the
     *  inferred type of an un-annotated binding. */
    private readonly annotated = new Set<BindingId>()
    /** Guard against runaway recursive alias instantiation. */
    private instantiationDepth = 0
    /** Guard against a self-referential type-level operator. */
    private reduceDepth = 0
    /** One entry per enclosing loop: the flow states its `break`s jump from. */
    private readonly breakStates: FlowEnv[][] = []
    /** Memoised `reduceType`, keyed by type identity. */
    private readonly reduceCache = new WeakMap<object, Type>()
    /** Resolved alias bodies, keyed by reference. See `expand`. */
    private readonly expandCache = new Map<string, Type>()
    /** Alias names currently being resolved — a re-entry means a recursive type
     *  (`type Tree = { children: Tree[] }`); it resolves to a nominal ref. */
    private readonly resolvingAliases = new Set<string>()
    private readonly diagnostics: TypeDiagnostic[] = []
    /** `import`ed type names, from `resolveModule`. */
    private readonly importedTypes = new Map<string, ExportedType>()
    /** `resolveModule` results, one lookup per module path. */
    private readonly resolvedModules = new Map<string, ModuleExports | undefined>()
    private emitDiagnostics: boolean
    /** Recursion guard for `preVisitBody`. */
    private preVisitDepth = 0

    constructor(
        private readonly program: Program,
        private readonly scopes: ScopeAnalysis,
        private readonly options: AnalyzeTypesOptions,
    ) {
        this.emitDiagnostics = options.diagnostics ?? true
    }

    run(): TypeAnalysis {
        // Definitions files first, then this program — so aliases resolve
        // against the full set and lib aliases can be overridden locally.
        for (const lib of this.options.libs ?? []) this.registerAliasDefs(lib.body)
        this.registerAliasDefs(this.program.body)
        for (const lib of this.options.libs ?? []) this.harvestDeclares(lib.body)
        // A `declare` in the program itself seeds a global type too, and wins
        // over a lib's declaration of the same name.
        this.harvestDeclares(this.program.body)
        // Imported type names must be known before any annotation resolves.
        this.registerImportedTypes()
        this.resolveAllAliases()
        this.indexDeclarations()

        // Seed global binding types.
        for (const [name, id] of this.scopes.globalsByName) {
            const t = this.options.globalTypes?.[name] ?? this.libGlobalTypes.get(name) ?? anyType
            this.bindingType.set(id, t)
        }
        // Let structural comparison see through nominal alias references —
        // unavoidable for recursive types such as a class hierarchy.
        setAliasExpander(t => this.expand(t))
        try {
            const env: FlowEnv = new Map()
            this.visitBlock(this.program.body, env)
        } finally {
            setAliasExpander(undefined)
        }
        return {
            typeOf: this.typeOf,
            bindingType: this.bindingType,
            narrowedTypeOf: this.narrowedTypeOf,
            typeOfTypeNode: this.typeOfTypeNode,
            expectedTypeOf: this.expectedTypeOf,
            aliases: this.resolveDeferredAliases(),
            diagnostics: this.diagnostics,
        }
    }

    // --------------------------------------------------------
    // Aliases
    // --------------------------------------------------------

    private moduleFor(specifier: string): ModuleExports | undefined {
        if (!this.resolvedModules.has(specifier)) {
            this.resolvedModules.set(specifier, this.options.resolveModule?.(specifier))
        }
        return this.resolvedModules.get(specifier)
    }

    /** `export ... from "./x"`: the module must exist, and so must each name. */
    private checkReexport(source: Expression & { value: string }, names: readonly Identifier[]): void {
        if (!this.options.resolveModule || !this.emitDiagnostics) return
        const exports = this.moduleFor(source.value)
        if (!exports) {
            this.diagnostics.push({ node: source, message: `Cannot find module '${source.value}'` })
            return
        }
        if (exports.partial) return
        for (const name of names) {
            const found = name.name === "default"
                ? exports.default !== undefined
                : exports.values.has(name.name) || exports.types.has(name.name)
            if (!found) {
                this.diagnostics.push({ node: name, message: `Module '${source.value}' has no exported member '${name.name}'` })
            }
        }
    }

    private registerImportedTypes(): void {
        if (!this.options.resolveModule) return
        for (const stmt of this.program.body.statements) {
            if (stmt.type !== "ImportStatement") continue
            const exports = this.moduleFor(stmt.source.value)
            if (!exports) continue
            for (const s of stmt.specifiers) {
                const exported = exports.types.get(s.imported.name)
                if (exported) {
                    this.importedTypes.set(s.local.name, exported)
                    // Listed with the aliases: to hover, completion and
                    // highlighting an imported type is a type like any other.
                    // A local alias of the same name replaces it when the
                    // aliases resolve.
                    this.aliases.set(s.local.name, exported.type)
                }
            }
        }
    }

    private registerAliasDefs(block: Block): void {
        for (const stmt of block.statements) {
            const alias = stmt.type === "TypeAliasStatement" ? stmt
                : stmt.type === "ExportTypeAliasStatement" ? stmt.alias
                : undefined
            if (alias) this.aliasDefs.set(alias.name.name, { params: alias.generics, node: alias.definition })
        }
    }

    /** Seed global types from `declare` statements. Repeating a name builds an
     *  *overload set* (an intersection, in declaration order) rather than
     *  replacing — which is how `typeof` gets one signature per result string. */
    private harvestDeclares(block: Block): void {
        for (const stmt of block.statements) {
            if (stmt.type !== "DeclareStatement") continue
            const t = this.resolveType(stmt.valueType)
            const prev = this.libGlobalTypes.get(stmt.name)
            this.libGlobalTypes.set(stmt.name, prev ? intersection([prev, t]) : t)
        }
    }

    private resolveAllAliases(): void {
        // Public `aliases` map — each resolved once, generic params kept as
        // `typeParam` nodes in the body.
        for (const [name, def] of this.aliasDefs) {
            // `type Config = typeof defaults` needs `defaults` to have a type,
            // which only happens once the statements are walked. Such an alias
            // resolves on first use (through `expand`) or at the end instead.
            if (containsTypeQuery(def.node)) continue
            this.withTypeParams(def.params, () => {
                this.aliases.set(name, this.resolveType(def.node))
            })
        }
    }

    /** The aliases `resolveAllAliases` left for later, now that every binding
     *  has its type. */
    private resolveDeferredAliases(): Map<string, Type> {
        for (const [name, def] of this.aliasDefs) {
            if (this.aliases.has(name)) continue
            this.withTypeParams(def.params, () => {
                this.aliases.set(name, this.resolveType(def.node))
            })
        }
        return this.aliases
    }

    private withTypeParams<T>(params: GenericTypeParameter[], fn: () => T): T {
        const start = this.typeParamScope.length
        for (const p of params) this.typeParamScope.push({ name: p.name, isConst: p.isConst })
        // Constraints may reference sibling params, so resolve after all names
        // are in scope.
        for (let i = 0; i < params.length; i++) {
            if (params[i].constraint) {
                this.typeParamScope[start + i].constraint = this.resolveType(params[i].constraint!)
            }
        }
        try {
            return fn()
        } finally {
            this.typeParamScope.length = start
        }
    }

    private lookupTypeParam(name: string): { name: string; constraint?: Type; isConst?: boolean } | undefined {
        for (let i = this.typeParamScope.length - 1; i >= 0; i--) {
            if (this.typeParamScope[i].name === name) return this.typeParamScope[i]
        }
        return undefined
    }

    /** Instantiate a generic alias: `Box<number>` -> `{ value: number }`. */
    private instantiateAlias(def: { params: GenericTypeParameter[]; node: TypeNode }, args: Type[]): Type {
        if (this.instantiationDepth > 20) return unknownType
        const subst = new Map<string, Type>()
        def.params.forEach((p, i) => {
            subst.set(p.name, args[i] ?? (p.default ? this.resolveType(p.default) : unknownType))
        })
        this.instantiationDepth++
        try {
            const body = this.withTypeParams(def.params, () => this.resolveType(def.node))
            // Substituting the arguments in is what makes a deferred
            // `conditional` / `mapped` ready to evaluate.
            return this.reduceType(substitute(body, subst))
        } finally {
            this.instantiationDepth--
        }
    }

    // --------------------------------------------------------
    // TypeNode -> Type
    // --------------------------------------------------------

    private resolveType(node: TypeNode | TypePackNode): Type {
        const type = this.resolveTypeNode(node)
        // Record what each annotation means, for tooling — but not while
        // instantiating a generic alias: those nodes resolve again per use
        // site, and the last instantiation would overwrite the definition.
        if (this.instantiationDepth === 0) this.typeOfTypeNode.set(node, type)
        return type
    }

    private resolveTypeNode(node: TypeNode | TypePackNode): Type {
        switch (node.type) {
            case "TypeReference": {
                const name = node.namespace ? `${node.namespace}.${node.base}` : node.base
                switch (node.base) {
                    case "any": return anyType
                    case "unknown": return unknownType
                    case "never": return neverType
                    case "nil": return nilType
                    case "boolean": return booleanType
                    case "number": return numberType
                    case "string": return stringType
                    case "thread": return primitive("thread")
                    case "buffer": return primitive("buffer")
                }
                if (!node.namespace) {
                    const tp = this.lookupTypeParam(node.base)
                    if (tp) return typeParam(tp.name, tp.constraint, tp.isConst)
                    if (node.typeArguments.length === 1 && !this.aliasDefs.has(node.base)) {
                        const intrinsic = this.applyStringIntrinsic(
                            node.base, this.resolveType(node.typeArguments[0]))
                        if (intrinsic) return intrinsic
                    }
                    if (this.aliasDefs.has(node.base)) {
                        // Route every alias reference through `expand`, which
                        // both memoises the result and returns a nominal ref
                        // for an alias that is still being resolved (a
                        // recursive type). Resolving the body inline here
                        // instead re-resolves it at every mention, which for a
                        // set of mutually referring classes blows up.
                        return this.expand({
                            kind: "genericRef",
                            name: node.base,
                            typeArguments: node.typeArguments.map(a => this.resolveType(a)),
                        })
                    }
                    const imported = this.importedTypes.get(node.base)
                    if (imported) {
                        if (!imported.params.length) return imported.type
                        const subst = new Map<string, Type>()
                        imported.params.forEach((name, i) => {
                            const arg = node.typeArguments[i]
                            subst.set(name, arg ? this.resolveType(arg) : unknownType)
                        })
                        return this.reduceType(substitute(imported.type, subst))
                    }
                    const lib = this.options.libTypes?.[node.base]
                    if (lib) return lib
                }
                return {
                    kind: "genericRef",
                    name,
                    typeArguments: node.typeArguments.map(a => this.resolveType(a)),
                }
            }
            case "TypeLiteralString": return literal(node.value)
            case "TypeLiteralBoolean": return literal(node.value)
            case "TypeLiteralNumber": return literal(node.value)
            case "ArrayTypeNode": return arrayOf(this.resolveType(node.element))
            case "TupleTypeNode": return tuple(node.elements.map(e => this.resolveType(e)))
            case "UnionTypeNode": return union(node.types.map(t => this.resolveType(t)))
            case "IntersectionTypeNode": return intersection(node.types.map(t => this.resolveType(t)))
            case "ParenthesizedTypeNode": return this.resolveType(node.typeAnnotation)
            case "TableTypeNode": {
                const entries: [string, ObjectProperty][] = []
                const seen = new Map<string, number>()
                let indexer: { key: Type; value: Type } | undefined = undefined
                for (const p of node.properties) {
                    if (p.type === "TableTypeIndexer") {
                        indexer = { key: this.resolveType(p.keyType), value: this.resolveType(p.valueType) }
                        continue
                    }
                    const vt = this.resolveType(p.valueType)
                    const at = seen.get(p.name)
                    if (at !== undefined) {
                        // Writing a member name more than once declares an
                        // overload set, the way repeating a method in a
                        // TypeScript interface does. Declaration order is the
                        // resolution order.
                        const prev = entries[at][1]
                        entries[at] = [p.name, { ...prev, type: intersection([prev.type, vt]) }]
                        continue
                    }
                    seen.set(p.name, entries.length)
                    entries.push([p.name, { type: vt, optional: p.optional, readonly: p.readonly }])
                }
                return objectType(entries, indexer)
            }
            case "FunctionTypeNode": {
                const names = node.generics.map(g => g.name)
                return this.withTypeParams(node.generics, () => {
                    const params = node.params.map(p => ({
                        name: p.name,
                        type: p.optional
                            ? optional(this.resolveType(p.typeAnnotation))
                            : this.resolveType(p.typeAnnotation),
                        optional: p.optional,
                    }))
                    return fn(
                        params,
                        this.resolveType(node.returnType),
                        node.hasVarargs ? (node.varargType ? this.resolveType(node.varargType) : anyType) : undefined,
                        names,
                        this.resolvePredicate(node.predicate, params),
                    )
                })
            }
            case "TypeofTypeNode": {
                return this.infer(node.expression, new Map())
            }
            case "TemplateLiteralTypeNode":
                return this.reduceType({
                    kind: "templateLiteral",
                    quasis: node.quasis,
                    types: node.types.map(x => this.resolveType(x)),
                })

            case "DifferenceTypeNode":
                return this.reduceType({
                    kind: "difference",
                    base: this.resolveType(node.base),
                    excluded: this.resolveType(node.excluded),
                })

            case "KeyofTypeNode":
                return this.reduceType({ kind: "keyof", target: this.resolveType(node.target) })

            case "IndexedAccessTypeNode":
                return this.reduceType({
                    kind: "indexedAccess",
                    objectType: this.resolveType(node.objectType),
                    indexType: this.resolveType(node.indexType),
                })

            case "InferTypeNode":
                return { kind: "infer", name: node.name }

            case "ConditionalTypeNode": {
                // `infer` names are scoped to the conditional, so collect them
                // from the `extends` clause and bind them while resolving the
                // true branch — otherwise `R` there resolves to nothing.
                const inferVars = collectInferNames(node.extendsType)
                const checkType = this.resolveType(node.checkType)
                const extendsType = this.resolveType(node.extendsType)
                const build = (): Type => this.reduceType({
                    kind: "conditional",
                    checkType, extendsType,
                    trueType: this.resolveType(node.trueType),
                    falseType: this.resolveType(node.falseType),
                    inferVars,
                    // Distribution applies only to a *naked* type parameter.
                    distributeParam: node.checkType.type === "TypeReference" &&
                        !node.checkType.namespace &&
                        this.lookupTypeParam(node.checkType.base) !== undefined
                        ? node.checkType.base
                        : undefined,
                })
                return inferVars.length
                    ? this.withTypeParams(
                        inferVars.map(name => ({ type: "GenericTypeParameter", name } as GenericTypeParameter)),
                        build)
                    : build()
            }

            case "MappedTypeNode": {
                const constraint = this.resolveType(node.constraint)
                // `[K in keyof T]` is *homomorphic*: remember `T` so each
                // property can inherit its own `?` / `readonly`.
                const source = node.constraint.type === "KeyofTypeNode"
                    ? this.resolveType(node.constraint.target)
                    : undefined
                return this.withTypeParams(
                    [{ type: "GenericTypeParameter", name: node.parameter } as GenericTypeParameter],
                    () => this.reduceType({
                        kind: "mapped",
                        parameter: node.parameter,
                        constraint,
                        nameType: node.nameType && this.resolveType(node.nameType),
                        template: this.resolveType(node.template),
                        optional: node.optional,
                        readonly: node.readonly,
                        source,
                    }),
                )
            }

            case "VariadicTypeNode": return this.resolveType(node.typeAnnotation)
            case "TypePackNode": {
                if (node.types.length === 1 && !node.hasVarargs) return this.resolveType(node.types[0])
                return tuple(node.types.map(t => this.resolveType(t)), true)
            }
        }
    }

    // --------------------------------------------------------
    // Type-level operators
    // --------------------------------------------------------
    //
    // `keyof`, `T[K]`, `C extends E ? A : B` and `{ [K in C]: V }` are built by
    // `resolveType` as deferred nodes and collapsed here as soon as their
    // inputs stop mentioning an unresolved type parameter. Every utility type
    // (`Partial`, `ReturnType`, `Exclude`, ...) is written in `luau.d.luaut` on
    // top of these — none of them is known to the analyzer by name.

    /** Evaluate every type-level operator in `t` that is ready to be evaluated.
     *  Anything still waiting on a type parameter is returned untouched, to be
     *  reduced again after the next substitution. */
    private reduceType(t: Type): Type {
        if (this.reduceDepth > 24) return unknownType
        // Reduction is a pure function of the type, and types are immutable,
        // so the answer is cacheable by identity. This is load-bearing: a
        // mapped type reduces its template once per key, and each reduction
        // otherwise walks the whole source type again.
        const cached = this.reduceCache.get(t)
        if (cached !== undefined) return cached
        this.reduceDepth++
        try {
            const result = this.reduceTypeInner(t)
            this.reduceCache.set(t, result)
            return result
        } finally {
            this.reduceDepth--
        }
    }

    private reduceTypeInner(t: Type): Type {
        {
            switch (t.kind) {
                case "keyof": {
                    const target = this.reduceType(t.target)
                    if (containsTypeParam(target)) return { kind: "keyof", target }
                    return this.keysOf(target)
                }
                case "indexedAccess": {
                    const objectType = this.reduceType(t.objectType)
                    const indexType = this.reduceType(t.indexType)
                    if (containsTypeParam(objectType) || containsTypeParam(indexType)) {
                        return { kind: "indexedAccess", objectType, indexType }
                    }
                    return this.accessType(objectType, indexType)
                }
                case "templateLiteral": return this.reduceTemplateLiteral(t)
                case "difference":
                    return difference(this.reduceType(t.base), this.reduceType(t.excluded))
                case "genericRef": {
                    // `Capitalize<K>` resolves to a ref while `K` is generic;
                    // once `K` is a real string it becomes computable.
                    if (t.typeArguments.length !== 1 || this.aliasDefs.has(t.name)) return t
                    return this.applyStringIntrinsic(t.name, t.typeArguments[0]) ?? t
                }
                case "conditional": return this.reduceConditional(t)
                case "mapped": return this.reduceMapped(t)
                case "union": return union(t.types.map(m => this.reduceType(m)))
                case "intersection": {
                    // Rebuilding must not drop the alias name — an unnamed
                    // class intersection prints as its whole expansion.
                    const r = intersection(t.types.map(m => this.reduceType(m)))
                    return t.name && r.kind === "intersection" && !r.name
                        ? { ...r, name: t.name }
                        : r
                }
                case "array": return arrayOf(this.reduceType(t.element))
                case "tuple": return tuple(t.elements.map(e => this.reduceType(e)), t.isPack)
                case "function":
                    return fn(
                        t.params.map(p => ({ ...p, type: this.reduceType(p.type) })),
                        this.reduceType(t.returns),
                        t.varargs && this.reduceType(t.varargs),
                        t.typeParams,
                        t.predicate,
                    )
                case "object": {
                    const entries: [string, ObjectProperty][] = []
                    for (const [k, v] of t.properties) entries.push([k, { ...v, type: this.reduceType(v.type) }])
                    const reduced = objectType(entries, t.indexer && {
                        key: this.reduceType(t.indexer.key),
                        value: this.reduceType(t.indexer.value),
                    }, t.frozen)
                    if (t.name) reduced.name = t.name
                    return reduced
                }
                default: return t
            }
        }
    }

    /** `keyof T`. A union's keys are the ones every member has (an
     *  intersection), which is what TypeScript does and what keeps
     *  `keyof (A | B)` safe to index with. */
    private keysOf(raw: Type): Type {
        const t = this.expand(raw)
        switch (t.kind) {
            case "object": {
                const keys: Type[] = [...t.properties.keys()].map(k => literal(k))
                if (t.indexer) keys.push(t.indexer.key)
                return union(keys)
            }
            case "array":
            case "tuple":
                return numberType
            case "union":
                return intersection(t.types.map(m => this.keysOf(m)))
            case "intersection":
                return union(t.types.map(m => this.keysOf(m)))
            case "any":
                return union([stringType, numberType])
            case "difference":
                return this.keysOf(t.base)
            default:
                return neverType
        }
    }

    /** `T[K]`, distributing over a union index (`T["a" | "b"]`). */
    private accessType(obj: Type, index: Type): Type {
        if (index.kind === "union") return union(index.types.map(m => this.accessType(obj, m)))
        if (index.kind === "literal" && typeof index.value === "string") {
            return this.propertyType(obj, index.value)
        }
        return this.indexedType(obj, index)
    }

    /** A template literal whose every interpolation is a union of string
     *  literals expands to the union of all concatenations (the cross
     *  product). Anything wider — `string`, `number` — leaves it a pattern
     *  that `isAssignable` matches literal strings against. */
    private reduceTemplateLiteral(t: Extract<Type, { kind: "templateLiteral" }>): Type {
        const types = t.types.map(x => this.reduceType(x))
        if (types.some(x => containsTypeParam(x))) return { ...t, types }

        const literalsOf = (x: Type): string[] | undefined => {
            const members = x.kind === "union" ? x.types : [x]
            const out: string[] = []
            for (const m of members) {
                if (m.kind !== "literal") return undefined
                out.push(String(m.value))
            }
            return out
        }

        let combos = [t.quasis[0]]
        for (let i = 0; i < types.length; i++) {
            const parts = literalsOf(types[i])
            if (!parts) return { ...t, types }
            const next: string[] = []
            for (const head of combos) for (const part of parts) next.push(head + part + t.quasis[i + 1])
            // Guard against a combinatorial blow-up from wide unions.
            if (next.length > 512) return { ...t, types }
            combos = next
        }
        return union(combos.map(c => literal(c)))
    }

    /** TypeScript's four string intrinsics. They cannot be written in luaut —
     *  there is no character-level type arithmetic — so the analyzer supplies
     *  them, and only them, as named type functions. */
    private applyStringIntrinsic(name: string, arg: Type): Type | undefined {
        const apply = (v: string): string => {
            switch (name) {
                case "Uppercase": return v.toUpperCase()
                case "Lowercase": return v.toLowerCase()
                case "Capitalize": return v.charAt(0).toUpperCase() + v.slice(1)
                default: return v.charAt(0).toLowerCase() + v.slice(1)
            }
        }
        if (!["Uppercase", "Lowercase", "Capitalize", "Uncapitalize"].includes(name)) return undefined
        const t = this.reduceType(arg)
        if (t.kind === "union") return union(t.types.map(m => this.applyStringIntrinsic(name, m) ?? m))
        if (t.kind === "literal" && t.base === "string") return literal(apply(String(t.value)))
        // Not a known literal: the result is still some string.
        return containsTypeParam(t) ? undefined : stringType
    }

    private reduceConditional(t: Extract<Type, { kind: "conditional" }>): Type {
        const checkType = this.reduceType(t.checkType)
        // Still generic — keep the whole conditional for a later instantiation.
        if (containsTypeParam(checkType)) return { ...t, checkType }

        // A conditional over a bare type parameter distributes across a union,
        // so `Exclude<"a" | "b", "a">` filters member by member instead of
        // asking whether the whole union extends `"a"`.
        if (t.distributeParam && checkType.kind === "union") {
            return union(checkType.types.map(m => this.branchOf(t, m)))
        }
        return this.branchOf(t, checkType)
    }

    /** Pick one branch of a conditional for a single (non-distributed) check
     *  type, binding any `infer` names from the `extends` clause first. */
    private branchOf(t: Extract<Type, { kind: "conditional" }>, check: Type): Type {
        const bindings = new Map<string, Type>()
        // Inside the branches the distributed parameter means *this* member.
        if (t.distributeParam) bindings.set(t.distributeParam, check)
        const extendsType = this.reduceType(t.extendsType)
        const matched = matchInfer(check, extendsType, bindings) &&
            isAssignable(check, this.stripInfer(extendsType, bindings))
        // Both branches need the bindings: the distributed parameter is bound
        // in either case, so `T extends U ? never : T` must resolve `T` in the
        // false branch too.
        if (!matched) return this.reduceType(substitute(t.falseType, bindings))
        for (const name of t.inferVars) if (!bindings.has(name)) bindings.set(name, unknownType)
        return this.reduceType(substitute(t.trueType, bindings))
    }

    /** Replace the `infer` placeholders in an `extends` clause with what they
     *  bound to, so the clause can be used as an ordinary assignability target.
     *  An unbound one becomes `unknown` — it constrains nothing. */
    private stripInfer(t: Type, bindings: Map<string, Type>): Type {
        switch (t.kind) {
            case "infer": return bindings.get(t.name) ?? unknownType
            case "array": return arrayOf(this.stripInfer(t.element, bindings))
            case "tuple": return tuple(t.elements.map(e => this.stripInfer(e, bindings)))
            case "union": return union(t.types.map(m => this.stripInfer(m, bindings)))
            case "intersection": return intersection(t.types.map(m => this.stripInfer(m, bindings)))
            case "function":
                return fn(
                    t.params.map(p => ({ ...p, type: this.stripInfer(p.type, bindings) })),
                    this.stripInfer(t.returns, bindings),
                    t.varargs && this.stripInfer(t.varargs, bindings),
                    t.typeParams,
                )
            case "object": {
                const entries: [string, ObjectProperty][] = []
                for (const [k, v] of t.properties) entries.push([k, { ...v, type: this.stripInfer(v.type, bindings) }])
                return objectType(entries, t.indexer && {
                    key: this.stripInfer(t.indexer.key, bindings),
                    value: this.stripInfer(t.indexer.value, bindings),
                })
            }
            default: return t
        }
    }

    /** `{ [K in C]: V }` — build one property per key in `C`. A key that is a
     *  bare `string` / `number` becomes an indexer instead (`Record<string, V>`
     *  is `{ [string]: V }`, not a property literally named "string"). */
    private reduceMapped(t: Extract<Type, { kind: "mapped" }>): Type {
        const constraint = this.reduceType(t.constraint)
        if (containsTypeParam(constraint)) return { ...t, constraint }

        const source = t.source ? this.expand(this.reduceType(t.source)) : undefined
        const members = constraint.kind === "union" ? constraint.types : [constraint]
        const entries: [string, ObjectProperty][] = []
        let indexer: Indexer | undefined

        for (const key of members) {
            const bound = new Map<string, Type>([[t.parameter, key]])
            const value = this.reduceType(substitute(t.template, bound))

            if (key.kind === "primitive" && (key.name === "string" || key.name === "number")) {
                indexer = mergeIndexer(indexer, { key, value })
                continue
            }
            if (key.kind !== "literal") continue

            // `[K in C as R]` renames; a remap to something that is not a
            // string literal drops the key, which is how TypeScript filters.
            let name = String(key.value)
            if (t.nameType) {
                const remapped = this.reduceType(substitute(t.nameType, bound))
                if (remapped.kind !== "literal") continue
                name = String(remapped.value)
            }

            // Homomorphic mapping inherits the source property's modifiers
            // unless this mapped type states one explicitly.
            const from = source?.kind === "object" ? source.properties.get(String(key.value)) : undefined
            entries.push([name, {
                type: value,
                optional: t.optional ?? from?.optional ?? false,
                readonly: t.readonly ?? from?.readonly,
            }])
        }
        return objectType(entries, indexer)
    }

    // --------------------------------------------------------
    // Statements
    // --------------------------------------------------------

    private visitBlock(block: Block, env: FlowEnv): void {
        for (const stmt of block.statements) this.visitStatement(stmt, env)
    }

    private visitStatement(stmt: Statement, env: FlowEnv): void {
        switch (stmt.type) {
            case "VariableDeclaration": {
                const { types: valueTypes, sources } = this.valueList(stmt.init, env)
                stmt.names.forEach((target, i) => {
                    const inferred = valueTypes[i] ?? (stmt.init.length ? unknownType : nilType)
                    const source = sources[i]
                    if (this.emitDiagnostics && target.type === "IdentifierPattern" &&
                        target.typeAnnotation && source) {
                        const declared = this.resolveType(target.typeAnnotation)
                        if (declared.kind !== "any" && !this.fitsAnnotation(source, declared, inferred, env)) {
                            this.diagnostics.push({
                                node: stmt,
                                message: `Type '${formatType(inferred)}' is not assignable to '${formatType(declared)}'`,
                            })
                        }
                    }
                    // `let`   -> widen (`let n = 1` : number)
                    // `const` -> keep top-level literal (`const n = 1` : 1), TS-style
                    // `... as const` init -> keep everything narrow + freeze
                    // Widening applies to *fresh* literal types only, as in
                    // TypeScript: `let n = 1` is `number`, but `let s = shape`
                    // keeps whatever `shape` was narrowed to rather than
                    // widening its literal members back out.
                    const mode: BindMode = this.initIsAsConst(source) ? "asconst"
                        : !isFreshLiteralExpr(source) ? "keep"
                        : stmt.kind === "const" ? "const" : "widen"
                    this.bindPattern(target, inferred, env, mode)
                })
                return
            }

            case "FunctionDeclaration": {
                this.checkParamOrder(stmt.func.params, stmt)
                for (const sig of stmt.signatures ?? []) this.checkParamOrder(sig.params, stmt)
                const id = this.bindingIdByName(stmt.name.name, stmt.name)
                const fnType = stmt.signatures?.length
                    ? intersection(stmt.signatures.map(s => this.signatureToFnType(s)))
                    : this.inferFunctionBody(stmt.func, env)
                if (id !== undefined) {
                    this.bindingType.set(id, fnType)
                    this.setBinding(env, id, fnType)
                }
                this.visitFunctionBody(stmt.func, env)
                return
            }

            case "FunctionDeclarationStatement": {
                this.checkParamOrder(stmt.func.params, stmt)
                for (const sig of stmt.signatures ?? []) this.checkParamOrder(sig.params, stmt)
                const targetId = this.bindingIdOf(stmt.target.base)
                const memberName = stmt.target.method?.name ??
                    (stmt.target.path.length === 1 ? stmt.target.path[0].name : undefined)

                if (memberName === undefined && stmt.target.path.length === 0) {
                    // Plain `function f(...)` — rebinds the name itself.
                    if (targetId !== undefined) {
                        const fnType = stmt.signatures?.length
                            ? intersection(stmt.signatures.map(s => this.signatureToFnType(s)))
                            : this.inferFunctionBody(stmt.func, env)
                        this.bindingType.set(targetId, fnType)
                        this.setBinding(env, targetId, fnType)
                    }
                    this.visitFunctionBody(stmt.func, env)
                    return
                }

                // `function recv:m(...)` / `function recv.m(...)` — attaches a
                // member to the receiver. For the `:` form the parser already
                // injected `self` as the first parameter; typing it as the
                // receiver is what makes `self.x` work inside the body.
                const recv = targetId === undefined ? anyType : this.currentType(targetId, env)
                this.withSelfType(stmt.isMethod ? recv : undefined, () => {
                    const fnType = stmt.signatures?.length
                        ? intersection(stmt.signatures.map(s => this.signatureToFnType(s)))
                        : this.inferFunctionBody(stmt.func, env)
                    if (memberName !== undefined && targetId !== undefined) {
                        // Types are immutable, so the member is recorded by
                        // intersecting rather than by mutating the receiver.
                        const grown = intersection([
                            recv,
                            objectType([[memberName, { type: fnType, optional: false }]]),
                        ])
                        this.bindingType.set(targetId, grown)
                        this.setBinding(env, targetId, grown)
                    }
                    this.visitFunctionBody(stmt.func, env)
                })
                return
            }

            case "AssignmentStatement": {
                const { types: valueTypes, sources } = this.valueList(stmt.values, env)
                stmt.targets.forEach((target, i) => {
                    const vt = valueTypes[i] ?? unknownType
                    const source = sources[i]
                    if (target.type === "Identifier") {
                        const id = this.bindingIdOf(target)
                        if (id !== undefined) {
                            const next = isFreshLiteralExpr(source) ? widen(vt) : vt
                            if (this.annotated.has(id)) {
                                const declared = this.bindingType.get(id)!
                                if (this.emitDiagnostics && !isAssignable(next, declared) && declared.kind !== "any") {
                                    this.diagnostics.push({
                                        node: stmt,
                                        message: `Type '${formatType(next)}' is not assignable to '${formatType(declared)}'`,
                                    })
                                }
                                this.setBinding(env, id, narrowTo(declared, next))
                            } else {
                                this.setBinding(env, id, next)
                                this.bindingType.set(id, union([this.bindingType.get(id) ?? next, next]))
                            }
                        }
                    } else if (target.type === "MemberExpression" || target.type === "IndexExpression") {
                        this.infer(target, env)
                        // The old narrowing of this path (and anything under it)
                        // described the previous value.
                        this.assignToRef(target, isFreshLiteralExpr(source) ? widen(vt) : vt, env)
                    } else if (target.type === "ObjectPattern" || target.type === "ArrayPattern") {
                        // Destructuring assignment: narrow the existing bindings
                        // to the destructured slices of the assigned value.
                        this.reassignPattern(target, vt, env)
                    }
                })
                return
            }

            case "CompoundAssignmentStatement":
                this.infer(stmt.target, env)
                this.infer(stmt.value, env)
                return

            case "CallStatement":
                this.infer(stmt.expression, env)
                // `assert(x)` and friends narrow the rest of this block.
                this.applyAssertion(stmt.expression, env)
                return

            case "DoStatement":
                this.visitBlock(stmt.body, forkEnv(env))
                return

            case "WhileStatement": {
                const condType = this.infer(stmt.condition, env)
                const { whenTrue, whenFalse } = this.narrowFromCondition(stmt.condition, env)
                const breaks = this.withBreakScope(() => this.visitBlock(stmt.body, whenTrue))
                // The loop is left either because the condition failed or by a
                // `break`; `while true` has only the second way out.
                const exits = isPossiblyFalsy(condType) ? [whenFalse, ...breaks] : breaks
                this.applyLoopExits(exits, env)
                return
            }

            case "RepeatStatement": {
                // `repeat` runs its body at least once and its condition sees
                // the body's bindings, so the state after the loop is the
                // body's end state with the `until` condition holding.
                const bodyEnv = forkEnv(env)
                const breaks = this.withBreakScope(() => {
                    this.visitBlock(stmt.body, bodyEnv)
                    this.infer(stmt.condition, bodyEnv)
                })
                const { whenTrue } = this.narrowFromCondition(stmt.condition, bodyEnv)
                this.applyLoopExits([whenTrue, ...breaks], env)
                return
            }

            case "IfStatement":
                this.visitIfStatement(stmt, env)
                return

            case "NumericForStatement": {
                this.infer(stmt.start, env)
                this.infer(stmt.end, env)
                if (stmt.step) this.infer(stmt.step, env)
                const bodyEnv = forkEnv(env)
                const id = this.bindingIdByName(stmt.variable.name, stmt.variable)
                if (id !== undefined) {
                    const t = stmt.variable.typeAnnotation ? this.resolveType(stmt.variable.typeAnnotation) : numberType
                    this.bindingType.set(id, t)
                    this.setBinding(bodyEnv, id, t)
                }
                this.visitBlock(stmt.body, bodyEnv)
                return
            }

            case "GenericForStatement": {
                const iterTypes = stmt.iterators.map(it => this.infer(it, env))
                const bodyEnv = forkEnv(env)
                const [keyT, valT] = this.iterationTypes(stmt.iterators[0], iterTypes[0], stmt.variables.length)
                stmt.variables.forEach((v, i) => {
                    this.bindPattern(v, i === 0 ? keyT : i === 1 ? valT : unknownType, bodyEnv, "widen")
                })
                this.visitBlock(stmt.body, bodyEnv)
                return
            }

            case "ReturnStatement":
                for (const arg of stmt.arguments) this.infer(arg, env)
                return

            case "ExportStatement":
                this.visitStatement(stmt.declaration, env)
                return

            case "ExportDefaultStatement":
                this.infer(stmt.declaration, env)
                return

            case "ExportNamedStatement": {
                if (stmt.source) {
                    this.checkReexport(stmt.source, stmt.specifiers.map(s => s.local))
                    return
                }
                for (const s of stmt.specifiers) {
                    if (this.bindingIdOf(s.local) !== undefined) {
                        // Records the reference's type, for tooling.
                        this.infer(s.local, env)
                    } else if (!this.aliasDefs.has(s.local.name) && !this.importedTypes.has(s.local.name)) {
                        if (this.emitDiagnostics) {
                            this.diagnostics.push({ node: s.local, message: `Cannot find name '${s.local.name}' to export` })
                        }
                    }
                }
                return
            }

            case "ExportAllStatement":
                this.checkReexport(stmt.source, [])
                return

            case "ImportStatement": {
                // Without a resolver a file cannot see other modules: `any`.
                const resolving = this.options.resolveModule !== undefined
                const exports = resolving ? this.moduleFor(stmt.source.value) : undefined
                const specifier = stmt.source.value
                const report = (node: Expression, message: string): void => {
                    if (this.emitDiagnostics) this.diagnostics.push({ node, message })
                }
                if (resolving && !exports) report(stmt.source, `Cannot find module '${specifier}'`)
                // A module still being analyzed up an import cycle has nothing
                // reliable to offer yet; read it as `any` and report nothing.
                const usable = exports && !exports.partial ? exports : undefined

                if (stmt.defaultImport) {
                    if (usable && usable.default === undefined) {
                        report(stmt.defaultImport, `Module '${specifier}' has no default export`)
                    }
                    const id = this.bindingIdByName(stmt.defaultImport.name, stmt.defaultImport)
                    if (id !== undefined) this.bindingType.set(id, usable?.default ?? anyType)
                }
                for (const s of stmt.specifiers) {
                    const value = usable?.values.get(s.imported.name)
                    // A name exported only as a type imports fine: it is used in
                    // annotations, not as a value.
                    if (usable && !value && !usable.types.has(s.imported.name)) {
                        report(s.imported, `Module '${specifier}' has no exported member '${s.imported.name}'`)
                    }
                    const id = this.bindingIdByName(s.local.name, s.local)
                    if (id !== undefined) this.bindingType.set(id, value ?? anyType)
                }
                return
            }

            case "BreakStatement":
                // Record the state at the jump: it is one of the ways the
                // enclosing loop can be left, and it merges with the others.
                this.breakStates[this.breakStates.length - 1]?.push(forkEnv(env))
                return

            case "ContinueStatement":
            case "TypeAliasStatement":
            case "ExportTypeAliasStatement":
            case "ErrorStatement":
            case "DeclareStatement":
                return
        }
    }

    /** Flatten an expression list into the values it actually produces.
     *
     *  Lua's adjustment rule: every expression but the last contributes one
     *  value, and the last contributes all of its values if it is a call or
     *  `...`. That is what makes `local ok, err = pcall(f)` work, and it is
     *  why `local x = f()` takes only the first value.
     *
     *  `sources` maps each produced value back to the expression it came from
     *  (undefined for the 2nd and later values of a multi-value call), so the
     *  caller can still do contextual typing against the written expression. */
    private valueList(
        exprs: readonly Expression[],
        env: FlowEnv,
    ): { types: Type[]; sources: (Expression | undefined)[] } {
        const types: Type[] = []
        const sources: (Expression | undefined)[] = []
        exprs.forEach((e, i) => {
            const t = this.infer(e, env)
            const last = i === exprs.length - 1
            if (last && t.kind === "tuple" && t.isPack && producesMultipleValues(e)) {
                t.elements.forEach((el, j) => {
                    types.push(el)
                    sources.push(j === 0 ? e : undefined)
                })
                return
            }
            // A single-value context takes the first of a multi-value result.
            types.push(t.kind === "tuple" && t.isPack && producesMultipleValues(e)
                ? t.elements[0] ?? nilType
                : t)
            sources.push(e)
        })
        return { types, sources }
    }

    /** Run `visit` with a fresh place to collect `break` states, and return
     *  what it collected. */
    private withBreakScope(visit: () => void): FlowEnv[] {
        this.breakStates.push([])
        try {
            visit()
            return this.breakStates[this.breakStates.length - 1]
        } finally {
            this.breakStates.pop()
        }
    }

    /** Join the states a loop can be left in and write them back to `env`.
     *  No exits at all means the loop never terminates normally, so nothing
     *  after it is reachable and `env` is left alone. */
    private applyLoopExits(exits: FlowEnv[], env: FlowEnv): void {
        if (!exits.length) return
        const base = (key: RefKey): Type => env.get(key) ?? this.declaredAtRef(key)
        const merged = exits.reduce((a, b) => mergeEnv(a, b, base))
        for (const [k, v] of merged) env.set(k, v)
    }

    /** True when control can never fall off the end of `block` — it returns,
     *  breaks, continues, calls something that never returns (`error`), or is
     *  an if/else where every branch does. Used for early-return narrowing, so
     *  it has to run *after* the block was visited: whether a call exits
     *  depends on its inferred return type. */
    private blockAlwaysExits(block: Block): boolean {
        const last = block.statements[block.statements.length - 1]
        if (!last) return false
        switch (last.type) {
            case "ReturnStatement":
            case "BreakStatement":
            case "ContinueStatement":
                return true
            case "DoStatement":
                return this.blockAlwaysExits(last.body)
            case "CallStatement":
                // `error(...)` is declared `-> never`, so the statement after
                // it is unreachable.
                return this.typeOf.get(last.expression)?.kind === "never"
            case "IfStatement":
                return !!last.alternate &&
                    last.clauses.every(c => this.blockAlwaysExits(c.body)) &&
                    this.blockAlwaysExits(last.alternate)
            default:
                return false
        }
    }

    private visitIfStatement(stmt: IfStatement, env: FlowEnv): void {
        let elseEnv = forkEnv(env)
        // Only branches that can fall through contribute to the post-if state.
        // A branch ending in `return` / `break` / `continue` narrows the code
        // that follows the `if` (early-return pattern).
        const fallThrough: FlowEnv[] = []

        for (const clause of stmt.clauses) {
            this.infer(clause.condition, elseEnv)
            const { whenTrue, whenFalse } = this.narrowFromCondition(clause.condition, elseEnv)
            const branchEnv = forkEnv(whenTrue)
            this.visitBlock(clause.body, branchEnv)
            if (!this.blockAlwaysExits(clause.body)) fallThrough.push(branchEnv)
            elseEnv = whenFalse
        }

        if (stmt.alternate) {
            const altEnv = forkEnv(elseEnv)
            this.visitBlock(stmt.alternate, altEnv)
            if (!this.blockAlwaysExits(stmt.alternate)) fallThrough.push(altEnv)
        } else {
            fallThrough.push(elseEnv)
        }

        if (fallThrough.length) {
            const base = (key: RefKey): Type => env.get(key) ?? this.declaredAtRef(key)
            const merged = fallThrough.reduce((a, b) => mergeEnv(a, b, base))
            for (const [k, v] of merged) env.set(k, v)
        }
    }

    // --------------------------------------------------------
    // Functions
    // --------------------------------------------------------

    private visitFunctionBody(func: FunctionBody, outerEnv: FlowEnv): void {
        this.withTypeParams(func.generics, () => this.visitFunctionBodyInner(func, outerEnv))
    }

    /** A parameter's type: annotation, else a shape synthesized from a
     *  destructuring pattern, else inferred from its default, else `any`. */
    private paramType(
        p: {
            name?: string
            typeAnnotation?: TypeNode
            default?: Expression
            optional?: boolean
            pattern?: ObjectPattern | ArrayPattern
        },
        env: FlowEnv,
    ): Type {
        // The `self` the parser injects for `function T:m()` carries no
        // annotation; its type is the receiver.
        if (!p.typeAnnotation && !p.pattern && !p.default && p.name === "self" && this.selfType) {
            return this.selfType
        }
        // `name?: T` means the argument may be missing, and a missing argument
        // is `nil` in Luau — so the parameter's type is `T | nil`.
        if (p.typeAnnotation) {
            const t = this.resolveType(p.typeAnnotation)
            return p.optional ? optional(t) : t
        }
        if (p.pattern) return this.patternToType(p.pattern, env)
        if (p.default) return widen(this.infer(p.default, env))
        return anyType
    }

    /** Synthesize a type from a destructuring pattern used without an
     *  annotation (`function f({ a, b = 1 })`). */
    private patternToType(target: ObjectPattern | ArrayPattern, env: FlowEnv): Type {
        const leaf = (v: BindingTarget, def: Expression | undefined): Type =>
            v.type !== "IdentifierPattern" ? this.patternToType(v, env)
                : v.typeAnnotation ? this.resolveType(v.typeAnnotation)
                : def ? widen(this.infer(def, env))
                : anyType
        if (target.type === "ObjectPattern") {
            const entries: [string, ObjectProperty][] = []
            for (const p of target.properties) {
                const key = !p.computed && p.key.type === "Identifier" ? p.key.name
                    : !p.computed && p.key.type === "StringLiteral" ? p.key.value : undefined
                if (key === undefined) continue
                entries.push([key, { type: leaf(p.value, p.default), optional: p.default !== undefined }])
            }
            return objectType(entries)
        }
        return tuple(target.elements.map(el => el ? leaf(el.value, el.default) : anyType))
    }

    private visitFunctionBodyInner(func: FunctionBody, outerEnv: FlowEnv): void {
        const env = forkEnv(outerEnv)
        for (const p of func.params) {
            if (p.pattern) {
                this.bindPattern(p.pattern, this.paramType(p, env), env, "widen")
                continue
            }
            const id = this.bindingIdByName(p.name, p)
            const t = this.paramType(p, env)
            if (id !== undefined) {
                this.bindingType.set(id, t)
                this.setBinding(env, id, t)
                if (p.typeAnnotation) this.annotated.add(id)
            }
        }
        this.visitBlock(func.body, env)
    }

    /** Return type of calling `f` with `argTypes`. For a generic function,
     *  infers the type parameters from the arguments and substitutes. */
    private callReturn(f: Extract<Type, { kind: "function" }>, argTypes: Type[]): Type {
        if (!f.typeParams?.length) return f.returns
        // Reduce after substituting: a return type such as `Services[K]` is a
        // deferred indexed access until `K` is known, which is exactly now.
        return this.reduceType(substitute(f.returns, this.inferTypeArgs(f, argTypes)))
    }

    /** Infer a generic call's type arguments from the argument types.
     *
     *  An argument is widened before matching — `id(1)` gives `number`, not
     *  `1` — *except* against a parameter whose constraint is made of literal
     *  types, where the literal is the whole point. That is what lets
     *  `<K extends keyof T>(name: K) -> T[K]` pick out one property. */
    private inferTypeArgs(f: FunctionType, argTypes: Type[]): Map<string, Type> {
        const vars = new Set(f.typeParams ?? [])
        const subst = new Map<string, Type>()
        f.params.forEach((p, i) => {
            const arg = argTypes[i]
            if (arg === undefined) return
            unify(p.type, keepsLiterals(p.type) ? arg : widen(arg), vars, subst)
        })
        for (const name of f.typeParams ?? []) if (!subst.has(name)) subst.set(name, unknownType)
        return subst
    }

    /** Re-infer the arguments that land on a `<const T>` parameter, keeping
     *  them as narrow as they were written: literals stay literal and an array
     *  literal becomes a tuple. Only the const positions are redone, and only
     *  once the overload is known — which parameter is `const` depends on it. */
    private constArgs(
        f: FunctionType,
        written: readonly Expression[],
        argTypes: Type[],
        env: FlowEnv,
        selfOffset = 0,
    ): Type[] {
        if (!f.typeParams?.length) return argTypes
        const out = [...argTypes]
        f.params.forEach((p, i) => {
            if (p.type.kind !== "typeParam" || !p.type.isConst) return
            const arg = written[i - selfOffset]
            if (arg) out[i - selfOffset] = this.inferAsConst(arg, env)
        })
        return out
    }

    /** Choose the signature a call resolves to, TypeScript-style: the first
     *  one that accepts the arguments, with generic catch-alls considered only
     *  after every concrete signature has been tried. That ordering is what
     *  lets `typeof` declare `(v: number) -> "number"` alongside a trailing
     *  `<T>(v: T) -> string` and still pick the precise one. */
    private pickOverload(
        fns: FunctionType[],
        argTypes: Type[],
        argsFor?: (f: FunctionType) => Type[],
    ): FunctionType | undefined {
        for (const generic of [false, true]) {
            for (const f of fns) {
                if (((f.typeParams?.length ?? 0) > 0) !== generic) continue
                if (this.overloadAccepts(f, argsFor ? argsFor(f) : argTypes)) return f
            }
        }
        return undefined
    }

    /** Can this signature be called with these argument types? The signature's
     *  own type parameters stand for what the call would infer, so each is
     *  checked only against its constraint — `<K extends keyof Services>`
     *  accepts `"Players"` but not `""`. */
    private overloadAccepts(f: FunctionType, argTypes: Type[]): boolean {
        if (!f.varargs && argTypes.length > f.params.length) return false
        const params = this.boundParams(f)
        return f.params.every((p, i) => {
            // Only `?` (or a default) makes an argument omissible. A parameter
            // typed `T | nil` still has to be passed something — `nil`, if
            // that is what you mean — exactly as in TypeScript.
            if (argTypes[i] === undefined) return p.optional === true
            return isAssignable(argTypes[i], params[i])
        })
    }

    /** A signature's parameter types as a call site sees them before inference:
     *  each type parameter replaced by its constraint, or by `any` when it has
     *  none — or when the constraint mentions another type parameter, which a
     *  lone argument cannot be checked against without false errors. */
    private boundParams(f: FunctionType): Type[] {
        if (!f.typeParams?.length) return f.params.map(p => p.type)
        const bounds = new Map<string, Type>(f.typeParams.map(name => [name, anyType]))
        const seen = new WeakSet<object>()
        const walk = (value: unknown): void => {
            if (!value || typeof value !== "object" || seen.has(value)) return
            seen.add(value)
            if (value instanceof Map) {
                value.forEach(walk)
                return
            }
            const t = value as { kind?: unknown; name?: unknown; constraint?: Type }
            if (t.kind === "typeParam" && typeof t.name === "string" && bounds.has(t.name)
                && t.constraint && !containsTypeParam(t.constraint)) {
                bounds.set(t.name, this.reduceType(t.constraint))
            }
            for (const child of Object.values(value)) walk(child)
        }
        for (const p of f.params) walk(p.type)
        return f.params.map(p => substitute(p.type, bounds))
    }

    /** Record what each written argument is expected to be — see
     *  `TypeAnalysis.expectedTypeOf`. */
    private recordExpected(
        written: readonly Expression[],
        fns: FunctionType[],
        selfOf: (f: FunctionType) => number,
    ): void {
        written.forEach((arg, j) => {
            const candidates: Type[] = []
            for (const f of fns) {
                const i = j + selfOf(f)
                const param = i < f.params.length ? this.boundParams(f)[i] : f.varargs
                if (param) candidates.push(param)
            }
            if (candidates.length) this.expectedTypeOf.set(arg, union(candidates))
        })
    }

    /** No signature accepts the call, and the argument count is not the
     *  problem: say which argument is wrong, the way TypeScript does. */
    private reportArguments(
        call: Expression,
        written: readonly Expression[],
        fns: FunctionType[],
        argsFor: (f: FunctionType) => Type[],
        selfOf: (f: FunctionType) => number,
    ): void {
        if (!this.emitDiagnostics) return
        if (fns.length > 1) {
            this.diagnostics.push({ node: call, message: "No overload matches this call" })
            return
        }
        const f = fns[0]
        const args = argsFor(f)
        const params = this.boundParams(f)
        const self = selfOf(f)
        for (let i = 0; i < f.params.length; i++) {
            const arg = args[i]
            if (arg === undefined || isAssignable(arg, params[i])) continue
            this.diagnostics.push({
                node: written[i - self] ?? call,
                message: `Argument of type '${formatType(arg)}' is not assignable to parameter of type '${briefType(params[i])}'`,
            })
            return
        }
    }

    /** A required parameter may not follow an optional one — otherwise the
     *  optional one could never actually be omitted. Same rule as TypeScript,
     *  and it applies to a default (`a = 1`) as much as to a `?`. */
    private checkParamOrder(
        params: readonly { name?: string; optional?: boolean; default?: unknown }[],
        node: Expression | Statement,
    ): void {
        if (!this.emitDiagnostics) return
        let seenOptional: string | undefined
        for (const p of params) {
            const isOptional = p.optional === true || p.default !== undefined
            if (isOptional) {
                if (seenOptional === undefined) seenOptional = p.name ?? "parameter"
                continue
            }
            if (seenOptional !== undefined) {
                this.diagnostics.push({
                    node,
                    message: `Required parameter '${p.name ?? "?"}' cannot follow optional parameter '${seenOptional}'`,
                })
                return
            }
        }
    }

    /** How many arguments a signature requires, and the most it accepts
     *  (`undefined` when it is variadic). */
    private arityOf(f: FunctionType): { min: number; max: number | undefined } {
        let min = 0
        for (let i = 0; i < f.params.length; i++) if (!f.params[i].optional) min = i + 1
        return { min, max: f.varargs ? undefined : f.params.length }
    }

    /** Report a call that passes too few or too many arguments. Only fires
     *  when *no* overload accepts the count, so an overload set still reports
     *  once, against its first signature. Returns whether the count fits, so
     *  an argument's type is only complained about when its count is right. */
    private checkArity(node: Expression, fns: FunctionType[], argCount: number, selfArgs: number): boolean {
        if (!fns.length) return true
        const fits = fns.some(f => {
            const { min, max } = this.arityOf(f)
            const n = argCount + selfArgs
            return n >= min && (max === undefined || n <= max)
        })
        if (fits) return true
        if (!this.emitDiagnostics) return false
        const { min, max } = this.arityOf(fns[0])
        const need = max === undefined ? `at least ${min - selfArgs}`
            : min === max ? `${min - selfArgs}`
            : `${min - selfArgs}-${max - selfArgs}`
        this.diagnostics.push({
            node,
            message: `Expected ${need} argument${need === "1" ? "" : "s"}, got ${argCount}`,
        })
        return false
    }

    private signatureToFnType(sig: FunctionSignature): Type {
        const names = sig.generics.map(g => g.name)
        return this.withTypeParams(sig.generics, () => {
            const params = sig.params.map(p => ({
                name: p.pattern ? undefined : p.name,
                type: this.paramType(p, new Map()),
                optional: p.optional || p.default !== undefined,
            }))
            return fn(
                params,
                sig.returnType ? this.resolveType(sig.returnType) : sig.predicate ? booleanType : anyType,
                sig.hasVarargs ? (sig.varargTypeAnnotation ? this.resolveType(sig.varargTypeAnnotation) : anyType) : undefined,
                names,
                this.resolvePredicate(sig.predicate, params),
            )
        })
    }

    /** Turn a parsed `v is T` / `asserts v` annotation into a `TypePredicate`,
     *  resolving the named parameter to its index. A guard naming a parameter
     *  the function does not have is dropped rather than mis-narrowing an
     *  unrelated argument. */
    private resolvePredicate(
        node: TypePredicateNode | undefined,
        params: { name?: string }[],
    ): TypePredicate | undefined {
        if (!node) return undefined
        const param = params.findIndex(p => p.name === node.parameterName)
        if (param < 0) return undefined
        return {
            param,
            type: node.typeAnnotation ? this.resolveType(node.typeAnnotation) : undefined,
            asserts: node.asserts,
        }
    }

    private inferFunctionBody(func: FunctionBody, env: FlowEnv): Type {
        const names = func.generics.map(g => g.name)
        return this.withTypeParams(func.generics, () => {
            const params = func.params.map(p => {
                const type = this.paramType(p, env)
                // Record each parameter's type before the next one's annotation
                // is read, so `(limit: number, value: typeof limit)` sees
                // `limit`. The body pass records the same type again later.
                if (!p.pattern) {
                    const id = this.bindingIdByName(p.name, p)
                    if (id !== undefined && !this.bindingType.has(id)) this.bindingType.set(id, type)
                }
                return {
                    name: p.pattern ? undefined : p.name,
                    type,
                    optional: p.optional || p.default !== undefined,
                }
            })
            // Infer the return type with the parameters bound, so `return { x: p }`
            // sees `p`'s type rather than `any`.
            const bodyEnv = forkEnv(env)
            for (const p of func.params) {
                if (p.pattern) this.bindPattern(p.pattern, this.paramType(p, bodyEnv), bodyEnv, "widen")
                else {
                    const id = this.bindingIdByName(p.name, p)
                    if (id !== undefined) this.setBinding(bodyEnv, id, this.paramType(p, bodyEnv))
                }
            }
            let returns: Type
            if (func.returnType) {
                returns = this.resolveType(func.returnType)
            } else if (func.predicate) {
                returns = booleanType
            } else {
                // Walk the body once, silently, so locals have types before the
                // `return` expressions are read — otherwise `local r = f()
                // return r` infers `any`. The real visit runs afterwards and
                // overwrites everything this pass recorded.
                this.preVisitBody(func.body, bodyEnv)
                returns = this.inferReturnType(func.body, bodyEnv)
            }
            return fn(
                params, returns,
                func.hasVarargs ? (func.varargTypeAnnotation ? this.resolveType(func.varargTypeAnnotation) : anyType) : undefined,
                names,
                this.resolvePredicate(func.predicate, params),
            )
        })
    }

    /** Populate binding types for a function body without reporting anything,
     *  purely so an un-annotated return type can see its own locals. Bounded:
     *  nested functions stop pre-visiting after a couple of levels, since the
     *  cost compounds and the payoff drops off fast. */
    private preVisitBody(body: Block, env: FlowEnv): void {
        if (this.preVisitDepth >= 2) return
        this.preVisitDepth++
        const wasEmitting = this.emitDiagnostics
        this.emitDiagnostics = false
        try {
            this.visitBlock(body, env)
        } finally {
            this.emitDiagnostics = wasEmitting
            this.preVisitDepth--
        }
    }

    /** `(keyType, valueType)` yielded by a generic-for iterator. Handles
     *  `ipairs`/`pairs`/`next(t)` and Luau generalized iteration (`for … in t`).
     *  `varCount` is how many loop variables were written. */
    private iterationTypes(iterNode: Expression | undefined, iterType: Type, varCount: number): [Type, Type] {
        // ipairs(t) / pairs(t) / next(t)
        if (iterNode?.type === "CallExpression" && iterNode.callee.type === "Identifier" && iterNode.arguments[0]) {
            const name = iterNode.callee.name
            const src = this.expand(this.typeOf.get(iterNode.arguments[0]) ?? unknownType)
            if (name === "ipairs") return [numberType, this.elementType(src, 0)]
            if (name === "pairs" || name === "next") {
                if (src.kind === "object") {
                    return [src.indexer?.key ?? stringType,
                        src.indexer?.value ?? union([...src.properties.values()].map(p => p.type))]
                }
                if (src.kind === "array") return [numberType, src.element]
            }
        }
        // generalized iteration `for x in t` / `for i, x in t`
        const t = this.expand(iterType)
        if (t.kind === "array") return varCount >= 2 ? [numberType, t.element] : [t.element, unknownType]
        if (t.kind === "object") {
            const k = t.indexer?.key ?? stringType
            const v = t.indexer?.value ?? union([...t.properties.values()].map(p => p.type))
            return varCount >= 2 ? [k, v] : [v, unknownType]
        }
        return [unknownType, unknownType]
    }

    private inferReturnType(body: Block, env: FlowEnv): Type {
        const returns: Type[] = []
        const walk = (block: Block): void => {
            for (const s of block.statements) {
                if (s.type === "ReturnStatement") {
                    if (s.arguments.length === 0) returns.push(nilType)
                    else if (s.arguments.length === 1) returns.push(this.infer(s.arguments[0], env))
                    else returns.push(tuple(s.arguments.map(a => this.infer(a, env)), true))
                } else if (s.type === "IfStatement") {
                    for (const c of s.clauses) walk(c.body)
                    if (s.alternate) walk(s.alternate)
                } else if (s.type === "DoStatement" || s.type === "WhileStatement" ||
                    s.type === "NumericForStatement" || s.type === "GenericForStatement") {
                    walk(s.body)
                } else if (s.type === "RepeatStatement") {
                    walk(s.body)
                }
            }
        }
        walk(body)
        return returns.length ? union(returns) : nilType
    }

    // --------------------------------------------------------
    // Patterns
    // --------------------------------------------------------

    /** Assignability check with a bit of contextual typing: an array literal
     *  checked against a tuple annotation is matched element-wise (a plain
     *  `infer` would have widened it to an array type). */
    private fitsAnnotation(init: Expression, declared: Type, inferred: Type, env: FlowEnv): boolean {
        if (declared.kind === "tuple" && init.type === "ArrayExpression" &&
            !init.elements.some(e => e.type === "SpreadElement")) {
            if (init.elements.length !== declared.elements.length) return false
            return init.elements.every((el, i) =>
                isAssignable(widen(this.infer(el as Expression, env)), declared.elements[i]))
        }
        // Check the type as inferred *first*: widening can only ever make a
        // value less assignable, so a narrowed `"yes"` must still satisfy a
        // `"yes"` annotation. The widened retry covers a fresh literal handed
        // to a primitive annotation.
        if (isAssignable(inferred, declared) || isAssignable(widen(inferred), declared)) return true
        // Contextual retry: an object/array literal against an annotation keeps
        // its literal property types (needed for discriminated-union targets
        // like `{ ok: true }`).
        if (init.type === "TableExpression") return isAssignable(this.inferObject(init, env, true), declared)
        if (init.type === "ArrayExpression") return isAssignable(this.inferArray(init, env, true), declared)
        return false
    }

    /** Fold a destructuring default (`{ a = 1 }`) into the property's type:
     *  the default applies when the source value is missing/`nil`. */
    private withDefault(base: Type, def: Expression | undefined, env: FlowEnv): Type {
        if (!def) return base
        const d = widen(this.infer(def, env))
        if (base.kind === "any" || base.kind === "unknown") return d
        return union([narrowExclude(base, nilType), d])
    }

    /** Like `bindPattern`, but the leaves are *existing* bindings (a `{a} = t`
     *  assignment). Updates their flow type; keeps a declared annotation. */
    private reassignPattern(target: BindingTarget, valueType: Type, env: FlowEnv): void {
        switch (target.type) {
            case "IdentifierPattern": {
                const id = this.scopes.bindingOf.get(target)
                if (id === undefined) return
                const next = widen(valueType)
                if (this.annotated.has(id)) {
                    const declared = this.bindingType.get(id)!
                    this.setBinding(env, id, narrowTo(declared, next))
                } else {
                    this.setBinding(env, id, next)
                    this.bindingType.set(id, union([this.bindingType.get(id) ?? next, next]))
                }
                return
            }
            case "ObjectPattern": {
                for (const p of target.properties) {
                    const key = !p.computed && p.key.type === "Identifier" ? p.key.name
                        : !p.computed && p.key.type === "StringLiteral" ? p.key.value : undefined
                    const pt = key !== undefined ? this.propertyType(valueType, key) : unknownType
                    this.reassignPattern(p.value, this.withDefault(pt, p.default, env), env)
                }
                if (target.rest) this.reassignPattern(target.rest, valueType, env)
                return
            }
            case "ArrayPattern": {
                target.elements.forEach((el, i) => {
                    if (el) this.reassignPattern(el.value, this.withDefault(this.elementType(valueType, i), el.default, env), env)
                })
                if (target.rest) this.reassignPattern(target.rest, arrayOf(this.elementType(valueType, 0)), env)
                return
            }
        }
    }

    private bindPattern(target: BindingTarget, valueType: Type, env: FlowEnv, mode: BindMode): void {
        switch (target.type) {
            case "IdentifierPattern": {
                const id = this.bindingIdByName(target.name, target)
                let t: Type
                if (target.typeAnnotation) {
                    t = this.resolveType(target.typeAnnotation)
                    if (id !== undefined) this.annotated.add(id)
                } else {
                    t = mode === "asconst" || mode === "keep" ? valueType
                        : mode === "const" ? (valueType.kind === "literal" ? valueType : widen(valueType))
                        : widen(valueType)
                }
                if (id !== undefined) {
                    this.bindingType.set(id, t)
                    this.setBinding(env, id, t)
                }
                return
            }
            case "ObjectPattern": {
                for (const p of target.properties) {
                    const key = !p.computed && p.key.type === "Identifier" ? p.key.name
                        : !p.computed && p.key.type === "StringLiteral" ? p.key.value
                        : undefined
                    const propType = key !== undefined ? this.propertyType(valueType, key) : unknownType
                    this.bindPattern(p.value, this.withDefault(propType, p.default, env), env, mode)
                }
                if (target.rest) this.bindPattern(target.rest, valueType, env, mode)
                return
            }
            case "ArrayPattern": {
                target.elements.forEach((el, i) => {
                    if (!el) return
                    this.bindPattern(el.value, this.withDefault(this.elementType(valueType, i), el.default, env), env, mode)
                })
                if (target.rest) this.bindPattern(target.rest, arrayOf(this.elementType(valueType, 0)), env, mode)
                return
            }
        }
    }

    /** Expand a nominal `genericRef` back to its alias's structure.
     *  Recursive aliases were left as refs during their own resolution; this
     *  resolves them on demand for member access and for structural
     *  comparison.
     *
     *  Memoised, and that is load-bearing rather than an optimisation: a class
     *  hierarchy expands to a very large type, `isAssignable` asks for the
     *  same expansions constantly, and the recursion guard in `isAssignable`
     *  works by object identity — so the same ref must yield the *same*
     *  object every time. The cache entry is seeded with the ref itself before
     *  resolving, which is what breaks re-entry on a recursive alias. */
    private expand(t: Type): Type {
        if (t.kind !== "genericRef") return t
        const def = this.aliasDefs.get(t.name)
        if (!def || this.resolvingAliases.has(t.name)) return t

        const key = t.typeArguments.length ? formatType(t) : t.name
        const cached = this.expandCache.get(key)
        if (cached) return cached
        this.expandCache.set(key, t)

        this.resolvingAliases.add(t.name)
        try {
            const r = def.params.length
                ? this.instantiateAlias(def, t.typeArguments)
                : this.resolveType(def.node)
            // Display the alias name only for a plain alias. A *generic*
            // instantiation must keep its structure: `Pair` alone would not
            // say which `Pair`, and the point of `Partial<User>` is the
            // object it reduces to.
            const named = def.params.length === 0 &&
                (r.kind === "object" || r.kind === "intersection") && !r.name
                ? { ...r, name: t.name }
                : r
            this.expandCache.set(key, named)
            return named
        } finally {
            this.resolvingAliases.delete(t.name)
        }
    }

    private propertyType(raw: Type, name: string): Type {
        const t = this.expand(raw)
        if (t.kind === "object") {
            const p = t.properties.get(name)
            if (p) return p.optional ? optional(p.type) : p.type
            if (t.indexer) return t.indexer.value
        }
        if (t.kind === "union") return union(t.types.map(m => this.propertyType(m, name)))
        if (t.kind === "intersection") {
            const parts = t.types.map(m => this.propertyType(m, name)).filter(p => p.kind !== "unknown")
            if (parts.length) return intersection(parts)
        }
        if (t.kind === "typeParam" && t.constraint) return this.propertyType(t.constraint, name)
        // A subtraction only removes values; the members are the base's.
        if (t.kind === "difference") return this.propertyType(t.base, name)
        if (t.kind === "any") return anyType
        return unknownType
    }

    /** `t[k]`. A statically known string key resolves against the declared
     *  properties first — the indexer is only the fallback, so
     *  `{ [string]: number, tag: string }["tag"]` is `string`, not `number`. */
    private indexedType(raw: Type, idx: Type): Type {
        const t = this.expand(raw)
        if (t.kind === "any") return anyType
        if (t.kind === "union") return union(t.types.map(m => this.indexedType(m, idx)))
        if (t.kind === "difference") return this.indexedType(t.base, idx)
        if (t.kind === "typeParam" && t.constraint) return this.indexedType(t.constraint, idx)
        if (t.kind === "array") return t.element
        if (t.kind === "tuple") {
            if (idx.kind === "literal" && typeof idx.value === "number") {
                return t.elements[idx.value - 1] ?? unknownType
            }
            return union(t.elements)
        }
        if (t.kind === "object") {
            if (idx.kind === "literal" && typeof idx.value === "string") return this.propertyType(t, idx.value)
            if (t.indexer) return t.indexer.value
        }
        return unknownType
    }

    private elementType(raw: Type, index: number): Type {
        const t = this.expand(raw)
        if (t.kind === "array") return t.element
        if (t.kind === "tuple") return t.elements[index] ?? unknownType
        if (t.kind === "union") return union(t.types.map(m => this.elementType(m, index)))
        if (t.kind === "difference") return this.elementType(t.base, index)
        if (t.kind === "typeParam" && t.constraint) return this.elementType(t.constraint, index)
        if (t.kind === "any") return anyType
        return unknownType
    }

    // --------------------------------------------------------
    // Expression inference
    // --------------------------------------------------------

    private infer(expr: Expression, env: FlowEnv): Type {
        const t = this.inferInner(expr, env)
        this.typeOf.set(expr, t)
        return t
    }

    private inferInner(expr: Expression, env: FlowEnv): Type {
        switch (expr.type) {
            case "NilLiteral": return nilType
            case "BooleanLiteral": return literal(expr.value)
            case "NumberLiteral": return literal(expr.value)
            case "StringLiteral": return literal(expr.value)
            case "InterpolatedStringExpression": {
                for (const part of expr.parts) if (part.kind === "expression") this.infer(part.expression, env)
                return stringType
            }
            case "VarargExpression": return anyType

            case "Identifier": {
                const id = this.bindingIdOf(expr)
                if (id === undefined) return anyType
                const t = this.currentType(id, env)
                this.narrowedTypeOf.set(expr, t)
                return t
            }

            case "ArrayExpression": return this.inferArray(expr, env, false)
            case "TableExpression": return this.inferObject(expr, env, false)

            case "FunctionExpression":
                this.checkParamOrder(expr.func.params, expr)
                this.visitFunctionBody(expr.func, env)
                return this.inferFunctionBody(expr.func, env)

            case "ParenthesizedExpression": {
                // Parentheses truncate a multi-value call to its first value,
                // as in Lua: `(f())` is one value even when `f` returns two.
                const inner = this.infer(expr.expression, env)
                return inner.kind === "tuple" && inner.isPack && producesMultipleValues(expr.expression)
                    ? inner.elements[0] ?? nilType
                    : inner
            }

            case "TypeAssertionExpression": {
                this.infer(expr.expression, env)
                return this.resolveType(expr.typeAnnotation)
            }

            case "SatisfiesExpression": {
                // Validate against the contract but keep the inferred type —
                // that is the whole point of `satisfies` over `as`.
                const actual = this.infer(expr.expression, env)
                const declared = this.resolveType(expr.typeAnnotation)
                if (this.emitDiagnostics && declared.kind !== "any" &&
                    !this.fitsAnnotation(expr.expression, declared, actual, env)) {
                    this.diagnostics.push({
                        node: expr,
                        message: `Type '${formatType(actual)}' does not satisfy '${formatType(declared)}'`,
                    })
                }
                return actual
            }

            case "AsConstExpression":
                return this.inferAsConst(expr.expression, env)

            case "UnaryExpression": {
                const arg = this.infer(expr.argument, env)
                switch (expr.operator) {
                    case "not": return booleanType
                    case "-": return numberType
                    case "#": return numberType
                }
                return arg
            }

            case "BinaryExpression": {
                const op = expr.operator
                if (op === "and") {
                    this.infer(expr.left, env)
                    const { whenTrue } = this.narrowFromCondition(expr.left, env)
                    const right = this.infer(expr.right, whenTrue)
                    return union([narrowFalsy(this.typeOf.get(expr.left) ?? anyType), right])
                }
                if (op === "or") {
                    const left = this.infer(expr.left, env)
                    const { whenFalse } = this.narrowFromCondition(expr.left, env)
                    const right = this.infer(expr.right, whenFalse)
                    return union([narrowTruthy(left), right])
                }
                const l = this.infer(expr.left, env)
                const r = this.infer(expr.right, env)
                switch (op) {
                    case "..": return stringType
                    case "==": case "~=": case "<": case ">": case "<=": case ">=":
                        return booleanType
                    case "+": case "-": case "*": case "/": case "//": case "%": case "^":
                        return numberType
                }
                return union([l, r])
            }

            case "MemberExpression": {
                const obj = this.infer(expr.object, env)
                const key = this.refKeyOf(expr)
                const narrowed = key === undefined ? undefined : env.get(key)
                return narrowed ?? this.propertyType(obj, expr.property.name)
            }

            case "IndexExpression": {
                const obj = this.infer(expr.object, env)
                const idx = this.infer(expr.index, env)
                const key = this.refKeyOf(expr)
                const narrowed = key === undefined ? undefined : env.get(key)
                return narrowed ?? this.indexedType(obj, idx)
            }

            case "CallExpression": {
                const callee = this.infer(expr.callee, env)
                const argTypes = expr.arguments.map(a => this.infer(a, env))
                const fns = this.overloadsOf(callee)
                if (fns.length) {
                    this.recordExpected(expr.arguments, fns, () => 0)
                    const arityFits = this.checkArity(expr, fns, argTypes.length, 0)
                    const picked = this.pickOverload(fns, argTypes)
                    if (picked) {
                        return this.callReturn(picked, this.constArgs(picked, expr.arguments, argTypes, env))
                    }
                    if (arityFits) this.reportArguments(expr, expr.arguments, fns, () => argTypes, () => 0)
                    // Nothing accepts these arguments — the union of what any
                    // signature could return is the most we can honestly say.
                    return union(fns.map(f => this.callReturn(f, argTypes)))
                }
                return callee.kind === "any" ? anyType : unknownType
            }

            case "MethodCallExpression": {
                const objType = this.infer(expr.object, env)
                const argTypes = expr.arguments.map(a => this.infer(a, env))
                const fns = this.overloadsOf(this.propertyType(objType, expr.method.name))
                if (fns.length) {
                    // `obj:m(a)` passes `obj` as the implicit first argument, but
                    // only to a signature that actually declares a `self` slot —
                    // a plain `{ f: (n: number) -> ... }` stored in a table and
                    // called with `:` must not have its arguments shifted.
                    const withSelf = (f: FunctionType): Type[] =>
                        this.takesSelf(f) ? [objType, ...argTypes] : argTypes
                    const selfOf = (f: FunctionType): number => (this.takesSelf(f) ? 1 : 0)
                    this.recordExpected(expr.arguments, fns, selfOf)
                    // The receiver fills the `self` slot, so it does not count
                    // against what the caller wrote.
                    const arityFits = this.checkArity(expr, fns, argTypes.length, this.takesSelf(fns[0]) ? 1 : 0)
                    const picked = this.pickOverload(fns, argTypes, withSelf)
                    if (picked) {
                        const self = this.takesSelf(picked) ? 1 : 0
                        const written = this.constArgs(picked, expr.arguments, argTypes, env, self)
                        return this.callReturn(picked, this.takesSelf(picked) ? [objType, ...written] : written)
                    }
                    if (arityFits) this.reportArguments(expr, expr.arguments, fns, withSelf, selfOf)
                    return union(fns.map(f => this.callReturn(f, withSelf(f))))
                }
                return objType.kind === "any" ? anyType : unknownType
            }

            case "IfElseExpression": {
                const branches: Type[] = []
                let elseEnv = env
                for (const c of expr.clauses) {
                    this.infer(c.condition, elseEnv)
                    const { whenTrue, whenFalse } = this.narrowFromCondition(c.condition, elseEnv)
                    branches.push(this.infer(c.body, whenTrue))
                    elseEnv = whenFalse
                }
                branches.push(this.infer(expr.alternate, elseEnv))
                return union(branches)
            }
        }
    }

    private inferArray(expr: ArrayExpression, env: FlowEnv, asConst: boolean): Type {
        const elems: Type[] = []
        let hadSpread = false
        for (const el of expr.elements) {
            if (el.type === "SpreadElement") {
                hadSpread = true
                const s = this.infer(el.argument, env)
                if (s.kind === "array") elems.push(s.element)
                else if (s.kind === "tuple") elems.push(...s.elements)
                else elems.push(unknownType)
            } else {
                elems.push(asConst ? this.inferAsConst(el, env) : this.infer(el, env))
            }
        }
        if (asConst && !hadSpread) return tuple(elems)
        return arrayOf(elems.length ? union(elems.map(t => asConst ? t : widen(t))) : unknownType)
    }

    private inferObject(expr: TableExpression, env: FlowEnv, asConst: boolean): Type {
        const entries: [string, ObjectProperty][] = []
        let indexer: { key: Type; value: Type } | undefined
        for (const field of expr.fields) {
            if (field.type === "TableFieldNamed") {
                const key = field.key.type === "Identifier" ? field.key.name : field.key.value
                const v = asConst ? this.inferAsConst(field.value, env) : widen(this.infer(field.value, env))
                entries.push([key, { type: v, optional: false, readonly: asConst }])
            } else if (field.type === "TableFieldShorthand") {
                const v = this.infer(field.name, env)
                entries.push([field.name.name, { type: asConst ? v : widen(v), optional: false, readonly: asConst }])
            } else if (field.type === "TableFieldComputed") {
                const k = this.infer(field.key, env)
                const v = this.infer(field.value, env)
                if (k.kind === "literal" && typeof k.value === "string") {
                    entries.push([k.value, { type: asConst ? v : widen(v), optional: false, readonly: asConst }])
                } else {
                    indexer = mergeIndexer(indexer, { key: widen(k), value: asConst ? v : widen(v) })
                }
            } else {
                // spread
                const s = this.infer(field.argument, env)
                if (s.kind === "object") {
                    for (const [k, p] of s.properties) entries.push([k, p])
                    if (s.indexer) indexer = mergeIndexer(indexer, s.indexer)
                }
            }
        }
        return objectType(entries, indexer, asConst || undefined)
    }

    private inferAsConst(expr: Expression, env: FlowEnv): Type {
        switch (expr.type) {
            case "ArrayExpression": return this.inferArray(expr, env, true)
            case "TableExpression": return this.inferObject(expr, env, true)
            case "ParenthesizedExpression": return this.inferAsConst(expr.expression, env)
            case "AsConstExpression": return this.inferAsConst(expr.expression, env)
            default: {
                const t = this.inferInner(expr, env)
                this.typeOf.set(expr, t)
                return t // literals stay narrow; nothing to freeze
            }
        }
    }

    // --------------------------------------------------------
    // Narrowing
    // --------------------------------------------------------

    private narrowFromCondition(cond: Expression, env: FlowEnv): { whenTrue: FlowEnv; whenFalse: FlowEnv } {
        const whenTrue = forkEnv(env)
        const whenFalse = forkEnv(env)
        this.applyNarrowing(cond, env, whenTrue, whenFalse)
        return { whenTrue, whenFalse }
    }

    /** Record what `cond` being true (`t`) or false (`f`) tells us. `env` is the
     *  state the condition is evaluated in; `t` and `f` are the two successor
     *  states to write into. */
    private applyNarrowing(cond: Expression, env: FlowEnv, t: FlowEnv, f: FlowEnv): void {
        if (cond.type === "ParenthesizedExpression") {
            this.applyNarrowing(cond.expression, env, t, f)
            return
        }

        // `not X` — the branches simply swap.
        if (cond.type === "UnaryExpression" && cond.operator === "not") {
            this.applyNarrowing(cond.argument, env, f, t)
            return
        }

        if (cond.type === "BinaryExpression") {
            const { operator: op, left, right } = cond
            if (op === "and") {
                // true branch: both operands held, so `right` is narrowed on top
                // of `left`'s result. false branch: either could have failed —
                // not refinable, so its narrowings go to a scratch env.
                this.applyNarrowing(left, env, t, forkEnv(env))
                this.applyNarrowing(right, t, t, forkEnv(t))
                return
            }
            if (op === "or") {
                // Mirror image: only the false branch (both operands falsy) refines.
                this.applyNarrowing(left, env, forkEnv(env), f)
                this.applyNarrowing(right, f, forkEnv(f), f)
                return
            }
            if (op === "==" || op === "~=") {
                this.narrowByComparison(left, right, op === "==", env, t, f)
            }
            return
        }

        // A call used directly as a condition: `if isString(v) then`, and the
        // Luau built-ins declared the same way.
        if (cond.type === "CallExpression" || cond.type === "MethodCallExpression") {
            this.narrowByPredicateCall(cond, env, t, f)
            return
        }

        // Bare truthiness — `if x then`, `if x.y then`, `if cfg["debug"] then`.
        this.narrowRef(cond, env, t, f, cur => ({
            yes: narrowTruthy(cur),
            no: narrowFalsy(cur),
        }))
    }

    /** `a == b` / `a ~= b`. Handles, in order: a declaration-driven
     *  `typeof(x) == "..."` test, a literal/`nil` comparison against a
     *  reference, and a reference-to-reference comparison. */
    private narrowByComparison(
        left: Expression, right: Expression, eq: boolean,
        env: FlowEnv, t: FlowEnv, f: FlowEnv,
    ): void {
        const yes = eq ? t : f
        const no = eq ? f : t

        // `typeof(x) == "number"` and friends.
        if (this.narrowByCallResult(left, right, yes, no, env)) return
        if (this.narrowByCallResult(right, left, yes, no, env)) return

        const litOf = (e: Expression): Type | undefined => {
            const v = this.asLiteral(e)
            if (v !== undefined) return literal(v)
            return e.type === "NilLiteral" ? nilType : undefined
        }

        // `x == <literal>` / `x == nil`, including a discriminant `x.tag == "..."`.
        for (const [ref, other] of [[left, right], [right, left]] as const) {
            const value = litOf(other)
            if (value === undefined || this.refKeyOf(ref) === undefined) continue
            this.narrowRef(ref, env, yes, no, cur => ({
                yes: narrowTo(cur, value),
                no: narrowExclude(cur, value),
            }))
            return
        }

        // `x == y` between two references: in the equal branch each side is
        // narrowed by the other, which is how TypeScript handles it.
        if (this.refKeyOf(left) !== undefined && this.refKeyOf(right) !== undefined) {
            const lt = this.typeAtRef(left, env)
            const rt = this.typeAtRef(right, env)
            this.narrowRef(left, env, yes, no, cur => ({ yes: narrowTo(cur, rt), no: cur }))
            this.narrowRef(right, env, yes, no, cur => ({ yes: narrowTo(cur, lt), no: cur }))
        }
    }

    /** Declaration-driven `typeof(x) == "number"`.
     *
     *  `typeof` is not special-cased: it is declared in the definitions as an
     *  overload set whose members return *string-literal* types
     *  (`(value: number) -> "number"`, ...). So for `f(x) == "lit"` we keep the
     *  parameter types of the overloads that can return `"lit"`, and that union
     *  is what `x` narrows to. Any user function declared the same way gets the
     *  same treatment for free.
     *
     *  The analyzer knows nothing about the names `type` and `typeof`: with no
     *  definitions loaded there are no literal-returning overloads and this
     *  narrows nothing. Returns true if it handled the comparison. */
    private narrowByCallResult(
        callSide: Expression, litSide: Expression,
        yes: FlowEnv, no: FlowEnv, env: FlowEnv,
    ): boolean {
        if (callSide.type !== "CallExpression" || callSide.arguments.length !== 1) return false
        const name = this.asLiteral(litSide)
        if (typeof name !== "string") return false
        const arg = callSide.arguments[0]
        if (this.refKeyOf(arg) === undefined) return false

        const result = literal(name)
        const callee = this.typeOf.get(callSide.callee) ?? this.typeAtRef(callSide.callee, env)

        // Only literal-returning overloads discriminate; a catch-all returning
        // plain `string` matches everything and would narrow to nothing useful.
        const discriminating = this.overloadsOf(callee)
            .filter(o => o.params.length >= 1 && o.returns.kind === "literal")
        if (!discriminating.length) return false

        const matching = discriminating.filter(o => isAssignable(result, o.returns))
        if (!matching.length) return false
        const filter = union(matching.map(o => o.params[0].type))
        this.narrowRef(arg, env, yes, no, cur => ({
            yes: narrowTo(cur, filter),
            no: narrowExclude(cur, filter),
        }))
        return true
    }

    /** A call used as a condition, where the callee was declared with a type
     *  guard (`v is string`). Narrows the corresponding argument. */
    private narrowByPredicateCall(cond: Expression, env: FlowEnv, t: FlowEnv, f: FlowEnv): void {
        const found = this.predicateCallTarget(cond, env)
        if (!found) return
        const filter = found.predicate.type
        this.narrowRef(found.arg, env, t, f, cur => filter
            ? { yes: narrowTo(cur, filter), no: narrowExclude(cur, filter) }
            : { yes: narrowTruthy(cur), no: narrowFalsy(cur) })
    }

    /** Resolve a call expression to (guarded argument, predicate), if the
     *  callee was declared with one and that argument is a narrowable
     *  reference. Shared by branch guards and `asserts` statements. */
    private predicateCallTarget(
        cond: Expression, env: FlowEnv,
    ): { arg: Expression; predicate: TypePredicate } | undefined {
        let callee: Type
        let args: Expression[]
        if (cond.type === "CallExpression") {
            callee = this.typeOf.get(cond.callee) ?? this.typeAtRef(cond.callee, env)
            args = cond.arguments
        } else if (cond.type === "MethodCallExpression") {
            const objType = this.typeOf.get(cond.object) ?? this.typeAtRef(cond.object, env)
            callee = this.propertyType(objType, cond.method.name)
            // `obj:m(a)` — `obj` occupies the `self` slot only for a signature
            // that declares one, so the written arguments shift accordingly.
            const first = this.overloadsOf(callee)[0]
            args = first && this.takesSelf(first) ? [cond.object, ...cond.arguments] : cond.arguments
        } else {
            return undefined
        }

        // Which overload runs decides which guard applies. `IsA` declares one
        // signature per class name, so `part:IsA("Model")` must resolve to the
        // `"Model"` signature — taking the first signature that merely *has* a
        // predicate would narrow to whatever class happened to be declared
        // first.
        const overloads = this.overloadsOf(callee)
        const argTypes = args.map(a => this.typeOf.get(a) ?? this.typeAtRef(a, env))
        const picked = this.pickOverload(overloads, argTypes)
        const candidates = picked ? [picked, ...overloads.filter(f => f !== picked)] : overloads

        for (const f of candidates) {
            if (!f.predicate) continue
            const arg = args[f.predicate.param]
            if (!arg || this.refKeyOf(arg) === undefined) continue
            // A generic guard (`<K>(v, name: K) -> v is Map[K]`) says nothing
            // until its type arguments are known, so resolve them from this
            // call and substitute them into the narrowed type.
            if (f.typeParams?.length && f.predicate.type) {
                const subst = this.inferTypeArgs(f, argTypes)
                return {
                    arg,
                    predicate: {
                        ...f.predicate,
                        type: this.reduceType(substitute(f.predicate.type, subst)),
                    },
                }
            }
            return { arg, predicate: f.predicate }
        }
        return undefined
    }

    /** `assert(x)` / any `asserts`-declared call in statement position: narrows
     *  the *rest of the enclosing block* rather than a branch. */
    private applyAssertion(call: Expression, env: FlowEnv): void {
        const found = this.predicateCallTarget(call, env)
        if (!found || !found.predicate.asserts) return
        const filter = found.predicate.type
        this.narrowRef(found.arg, env, env, forkEnv(env), cur => filter
            ? { yes: narrowTo(cur, filter), no: narrowExclude(cur, filter) }
            : { yes: narrowTruthy(cur), no: narrowFalsy(cur) })
    }

    // --------------------------------------------------------
    // Reference paths
    // --------------------------------------------------------

    /** The flow key for a narrowable reference, or undefined if `expr` is not
     *  one (a call, an arithmetic result, a computed index, ...). */
    private refKeyOf(expr: Expression): RefKey | undefined {
        switch (expr.type) {
            case "Identifier": {
                const id = this.bindingIdOf(expr)
                return id === undefined ? undefined : bindKey(id)
            }
            case "ParenthesizedExpression":
                return this.refKeyOf(expr.expression)
            case "MemberExpression": {
                const base = this.refKeyOf(expr.object)
                return base === undefined ? undefined : `${base}.${expr.property.name}`
            }
            case "IndexExpression": {
                const base = this.refKeyOf(expr.object)
                if (base === undefined) return undefined
                // Only a statically known key names a stable reference.
                if (expr.index.type === "StringLiteral") return `${base}.${expr.index.value}`
                if (expr.index.type === "NumberLiteral") return `${base}#${expr.index.value}`
                return undefined
            }
            default:
                return undefined
        }
    }

    /** The type of a reference right now: its flow narrowing if it has one,
     *  else its declared type reached through the (possibly narrowed) parent.
     *  Never records anything in `typeOf` — narrowing must not perturb
     *  inference results. */
    private typeAtRef(expr: Expression, env: FlowEnv): Type {
        const key = this.refKeyOf(expr)
        if (key !== undefined) {
            const narrowed = env.get(key)
            if (narrowed) return narrowed
        }
        switch (expr.type) {
            case "Identifier": {
                const id = this.bindingIdOf(expr)
                return id === undefined ? anyType : this.currentType(id, env)
            }
            case "ParenthesizedExpression":
                return this.typeAtRef(expr.expression, env)
            case "MemberExpression":
                return this.propertyType(this.typeAtRef(expr.object, env), expr.property.name)
            case "IndexExpression":
                return this.indexedType(
                    this.typeAtRef(expr.object, env),
                    this.typeOf.get(expr.index) ?? unknownType,
                )
            default:
                return this.typeOf.get(expr) ?? anyType
        }
    }

    /** The declared (un-narrowed) type behind a flow key — what a reference
     *  falls back to when one branch narrowed it and another did not. */
    private declaredAtRef(key: RefKey): Type {
        const root = /^\$(\d+)/.exec(key)
        if (!root) return anyType
        let t = this.bindingType.get(Number(root[1])) ?? anyType
        for (const step of key.slice(root[0].length).matchAll(/\.([^.#]+)|#(\d+)/g)) {
            t = step[1] !== undefined
                ? this.propertyType(t, step[1])
                : this.indexedType(t, literal(Number(step[2])))
        }
        return t
    }

    /** Narrow a reference in both successor states, then propagate the
     *  consequences *up* the path: if `s.kind` is now `"circle"`, the union
     *  members of `s` whose `kind` cannot be `"circle"` are gone too. That
     *  upward step is what makes discriminated unions work at any depth. */
    private narrowRef(
        expr: Expression, env: FlowEnv, t: FlowEnv, f: FlowEnv,
        refine: (cur: Type) => { yes: Type; no: Type },
    ): void {
        const key = this.refKeyOf(expr)
        if (key === undefined) return
        const cur = this.typeAtRef(expr, env)
        const { yes, no } = refine(cur)
        this.setRef(t, key, yes)
        this.setRef(f, key, no)

        const inner = expr.type === "ParenthesizedExpression" ? expr.expression : expr
        if (inner.type !== "MemberExpression" && inner.type !== "IndexExpression") return
        const parentKey = this.refKeyOf(inner.object)
        if (parentKey === undefined) return
        const step = key.slice(parentKey.length)
        if (!step.startsWith(".")) return // only property steps discriminate
        const prop = step.slice(1)
        this.narrowRef(inner.object, env, t, f, parentType => ({
            yes: this.filterByProperty(parentType, prop, yes),
            no: this.filterByProperty(parentType, prop, no),
        }))
    }

    /** Keep the union members of `parent` whose `prop` can still hold `want`.
     *  Leaves a non-union (or a union nothing matches) alone: over-narrowing a
     *  plain object to `never` because of a property test would be worse than
     *  learning nothing. */
    private filterByProperty(parent: Type, prop: string, want: Type): Type {
        if (parent.kind !== "union" || want.kind === "never") return parent
        const kept = parent.types.filter(m => overlaps(this.propertyType(m, prop), want))
        return kept.length ? union(kept) : parent
    }

    /** Record a narrowing. Deliberately does *not* discard what is known about
     *  paths beneath `key`: narrowing only ever shrinks a type, and the child
     *  facts were derived from the same test — `narrowRef` sets the leaf first
     *  and then walks up, so wiping descendants here would erase the very
     *  narrowing that triggered the walk. Assignment is the operation that
     *  invalidates (`assignToRef`). */
    private setRef(env: FlowEnv, key: RefKey, t: Type): void {
        env.set(key, t)
    }

    /** Drop every narrowing recorded for a path strictly under `key`. */
    private invalidateBelow(env: FlowEnv, key: RefKey): void {
        for (const k of [...env.keys()]) {
            if (k.startsWith(`${key}.`) || k.startsWith(`${key}#`)) env.delete(k)
        }
    }

    /** An assignment through a reference invalidates it and everything under
     *  it, then records the assigned type. */
    private assignToRef(expr: Expression, value: Type, env: FlowEnv): void {
        const key = this.refKeyOf(expr)
        if (key === undefined) return
        this.invalidateBelow(env, key)
        env.set(key, value)
    }

    // --------------------------------------------------------
    // Small helpers
    // --------------------------------------------------------

    /** Type of the `self` parameter for the method currently being analysed. */
    private selfType: Type | undefined

    private withSelfType(t: Type | undefined, fn: () => void): void {
        const saved = this.selfType
        this.selfType = t
        try {
            fn()
        } finally {
            this.selfType = saved
        }
    }

    /** Does this signature take the receiver as its first parameter?
     *
     *  Luau's `:` is sugar both ways: `function T:m(a)` declares
     *  `(self: T, a)`, and `o:m(x)` calls it as `m(o, x)`. The convention that
     *  marks it is the first parameter being named `self` — which is what the
     *  parser injects for `function T:m` and what the definitions files spell
     *  out. Every place that has to line arguments up with parameters goes
     *  through here so the two sides cannot drift apart. */
    private takesSelf(f: FunctionType): boolean {
        return f.params[0]?.name === "self"
    }

    /** A function type as a list of call signatures: a lone function is a
     *  one-element list, an intersection is the overload set in source order. */
    private overloadsOf(t: Type): FunctionType[] {
        if (t.kind === "function") return [t]
        if (t.kind === "intersection") {
            return t.types.filter((m): m is FunctionType => m.kind === "function")
        }
        return []
    }


    private asLiteral(e: Expression): string | number | boolean | undefined {
        if (e.type === "StringLiteral") return e.value
        if (e.type === "NumberLiteral") return e.value
        if (e.type === "BooleanLiteral") return e.value
        return undefined
    }

    private asNarrowable(e: Expression): boolean {
        return e.type === "Identifier" ||
            (e.type === "MemberExpression" && e.object.type === "Identifier")
    }

    private initIsAsConst(e: Expression | undefined): boolean {
        return e?.type === "AsConstExpression"
    }

    /** The type a binding has *here*: its flow-narrowed type if the current
     *  environment has one, else its declared/inferred type. */
    private currentType(id: BindingId, env: FlowEnv): Type {
        return env.get(bindKey(id)) ?? this.bindingType.get(id) ?? anyType
    }

    /** Bind or rebind a whole variable: any narrowing recorded for a path
     *  *under* it (`x.a`, `x[1]`) described the old value and must go. */
    private setBinding(env: FlowEnv, id: BindingId, t: Type): void {
        this.invalidateBelow(env, bindKey(id))
        env.set(bindKey(id), t)
    }

    private bindingIdOf(id: Identifier): BindingId | undefined {
        return this.scopes.bindingOf.get(id)
    }

    /** Declaration nodes aren't in `bindingOf` (that map is usages only), so
     *  index every binding's declaration site up front. */
    private indexDeclarations(): void {
        for (const b of this.scopes.bindings.values()) {
            const d = b.declarationNode as
                { line?: { start: number }; column?: { start: number }; name?: string } | undefined
            if (!d) continue
            this.bindingByDecl.set(d, b.id)
            if (d.line && d.column) {
                this.bindingByPos.set(posKey(d.name ?? b.name, d.line.start, d.column.start), b.id)
            }
        }
    }

    private bindingIdByName(name: string, node: { line: { start: number }; column: { start: number } }): BindingId | undefined {
        return this.bindingByDecl.get(node as object) ??
            this.bindingByPos.get(posKey(name, node.line.start, node.column.start))
    }
}

/** Does a type contain a `typeof x`? Such a type depends on a value's type,
 *  so it cannot be resolved before the statements are walked. */
function containsTypeQuery(node: unknown): boolean {
    if (!node || typeof node !== "object") return false
    if (Array.isArray(node)) return node.some(containsTypeQuery)
    if ((node as { type?: unknown }).type === "TypeofTypeNode") return true
    return Object.values(node).some(containsTypeQuery)
}

/** A type for a message. A long union of literals — every service name — is
 *  cut short the way TypeScript does, so the message stays readable. */
function briefType(t: Type): string {
    if (t.kind === "union" && t.types.length > 8) {
        const shown = t.types.slice(0, 6).map(formatType).join(" | ")
        return `${shown} | ... ${t.types.length - 6} more`
    }
    return formatType(t)
}

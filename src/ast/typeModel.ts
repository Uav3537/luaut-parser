// ============================================================
// luaut type model
// ------------------------------------------------------------
// The internal representation `analyzeTypes` produces and both
// downstream consumers (the LSP, the compiler's `as const` /
// narrowing-aware lowering) read. Kept structural and immutable:
// every constructor returns a fresh value, nothing is mutated
// in place, so a `Type` can be shared freely across the maps in
// `TypeAnalysis`.
// ============================================================

export type Type =
    | AnyType
    | UnknownType
    | NeverType
    | PrimitiveType
    | LiteralType
    | ArrayType
    | TupleType
    | ObjectType
    | FunctionType
    | UnionType
    | IntersectionType
    | TypeParamType
    | GenericRefType
    | KeyofType
    | IndexedAccessType
    | ConditionalType
    | InferType
    | MappedType
    | TemplateLiteralType
    | DifferenceType

/** `any` — opts out of checking. Assignable to and from everything. */
export interface AnyType { kind: "any" }
/** `unknown` — top type. Everything is assignable to it; it is assignable to nothing but itself. */
export interface UnknownType { kind: "unknown" }
/** `never` — bottom type. Assignable to everything; nothing (but never) is assignable to it. */
export interface NeverType { kind: "never" }

export type PrimitiveName = "nil" | "boolean" | "number" | "string" | "thread" | "buffer"
export interface PrimitiveType { kind: "primitive"; name: PrimitiveName }

/** `"foo"`, `42`, `true` — a single-valued type. `base` is the primitive it widens to. */
export interface LiteralType {
    kind: "literal"
    base: "boolean" | "number" | "string"
    value: string | number | boolean
}

/** `T[]` */
export interface ArrayType { kind: "array"; element: Type }

/** `[A, B, C]` — fixed length.
 *
 *  `isPack` marks the other thing this shape is used for: a *type pack*, the
 *  several values a Lua function returns (`(number, string)`). The two are
 *  structurally identical but behave differently in an expression list — a
 *  pack spreads across several names, a tuple is one value — so they have to
 *  be told apart. */
export interface TupleType { kind: "tuple"; elements: Type[]; isPack?: boolean }

export interface ObjectProperty { type: Type; optional: boolean; readonly?: boolean }
export interface ObjectType {
    kind: "object"
    properties: Map<string, ObjectProperty>
    /** `{ [K]: V }` catch-all, if present. */
    indexer?: { key: Type; value: Type }
    /** `object` was produced by `as const` — literal members are kept narrow
     *  and every property is `readonly`. */
    frozen?: boolean
    /** The alias this object was resolved from — display only, ignored by
     *  `isAssignable` (the type is structural). Dropped on `widen`/`substitute`. */
    name?: string
}

export interface FunctionParam { name?: string; type: Type; optional?: boolean }

/** A TS-style type guard: `function f(v: unknown): v is string` narrows `v` at
 *  every call site used as a condition. `asserts` variants narrow the *rest of
 *  the enclosing block* instead of a branch (`assert(x)`), and a missing `type`
 *  means a bare truthiness assertion (`asserts v`). */
export interface TypePredicate {
    /** Index into `params` of the parameter this guard talks about. */
    param: number
    /** The type the parameter is narrowed to; absent = narrow to truthy. */
    type?: Type
    asserts: boolean
}

export interface FunctionType {
    kind: "function"
    params: FunctionParam[]
    varargs?: Type
    /** A tuple when the function returns multiple values. */
    returns: Type
    /** Names of the function's own generic parameters (`function f<T>(...)`).
     *  `params` / `returns` may contain `typeParam` nodes for these. */
    typeParams?: string[]
    /** Set when the function was declared with an `x is T` / `asserts x` return. */
    predicate?: TypePredicate
}

/** A bound generic parameter (`T` inside `function f<T>(...)` or
 *  `type Box<T> = ...`). Resolved away by `substitute` at instantiation.
 *  `constraint` is the `<T extends C>` upper bound, used for member access on a
 *  bare `T` and as the fallback when `T` can't be inferred. */
export interface TypeParamType {
    kind: "typeParam"
    name: string
    constraint?: Type
    /** Declared `<const T>`: the call site infers the argument at its
     *  narrowest rather than widening it. */
    isConst?: boolean
}
export function typeParam(name: string, constraint?: Type, isConst?: boolean): TypeParamType {
    return { kind: "typeParam", name, constraint, isConst }
}

export interface UnionType { kind: "union"; types: Type[] }
export interface IntersectionType {
    kind: "intersection"
    types: Type[]
    /** The alias this was resolved from — display only, exactly like
     *  `ObjectType.name`. A class hierarchy written as `type Part = BasePart &
     *  { ... }` is unreadable without it. */
    name?: string
}

/** An unresolved reference: an in-scope generic parameter, or a named type
 *  that couldn't be resolved to an alias in this pass. */
export interface GenericRefType { kind: "genericRef"; name: string; typeArguments: Type[] }

// ------------------------------------------------------------
// Type-level operators
// ------------------------------------------------------------
// These five stay in the tree only while something they depend on is still an
// unresolved `typeParam`. `analyzeTypes.reduceType` collapses each one as soon
// as its inputs are concrete, so a fully applied `Partial<{ a: number }>` is an
// ordinary object type by the time anyone reads it.

/** `keyof T`. */
export interface KeyofType { kind: "keyof"; target: Type }

/** `T[K]`. */
export interface IndexedAccessType { kind: "indexedAccess"; objectType: Type; indexType: Type }

/** `C extends E ? A : B`. */
export interface ConditionalType {
    kind: "conditional"
    checkType: Type
    extendsType: Type
    trueType: Type
    falseType: Type
    /** Names bound by `infer` inside `extendsType`. */
    inferVars: string[]
    /** Set when `checkType` is a *naked* type parameter, to that parameter's
     *  name. Such a conditional distributes over a union, and inside each
     *  branch the parameter denotes the single member being tested — the
     *  property `Exclude<T, U>` relies on. */
    distributeParam?: string
}

/** `infer U`, valid only inside a conditional's `extends` clause. */
export interface InferType { kind: "infer"; name: string }

/** `A - B` — every value of `A` that is not a `B`.
 *
 *  Only kept when `A` is *opaque*: `unknown`, or a type parameter or nominal
 *  reference not yet resolved. For a union the subtraction is performed by
 *  dropping members, and for a concrete type such as `string` it is discarded
 *  (`string - "a"` supports exactly the same operations as `string`, and
 *  TypeScript likewise does not track it). For `unknown`, though, the
 *  subtraction is the *only* thing known about the value, so throwing it away
 *  loses the whole result of the test:
 *
 *      let a: unknown
 *      if a == 1 then  -- a: 1
 *      else            -- a: unknown - 1
 *      end
 */
export interface DifferenceType { kind: "difference"; base: Type; excluded: Type }

/** `` `on${string}` `` — literal chunks interleaved with interpolated types
 *  (`quasis.length === types.length + 1`). Reduced to a union of string
 *  literals when every interpolation is one; otherwise it stays a *pattern*
 *  and `isAssignable` matches literal strings against it. */
export interface TemplateLiteralType {
    kind: "templateLiteral"
    quasis: string[]
    types: Type[]
}

/** `{ [K in C]: V }`. `optional` / `readonly`: `true` adds the modifier,
 *  `false` strips it, `undefined` inherits it from the source property. */
export interface MappedType {
    kind: "mapped"
    parameter: string
    constraint: Type
    nameType?: Type
    template: Type
    optional?: boolean
    readonly?: boolean
    /** The `T` of `[K in keyof T]`, kept so a homomorphic mapped type can carry
     *  each source property's own `?` / `readonly` across. */
    source?: Type
}

// ============================================================
// Constructors / well-known singletons
// ============================================================

export const anyType: AnyType = { kind: "any" }
export const unknownType: UnknownType = { kind: "unknown" }
export const neverType: NeverType = { kind: "never" }
export const nilType: PrimitiveType = { kind: "primitive", name: "nil" }
export const booleanType: PrimitiveType = { kind: "primitive", name: "boolean" }
export const numberType: PrimitiveType = { kind: "primitive", name: "number" }
export const stringType: PrimitiveType = { kind: "primitive", name: "string" }
export const threadType: PrimitiveType = { kind: "primitive", name: "thread" }
export const bufferType: PrimitiveType = { kind: "primitive", name: "buffer" }

export function primitive(name: PrimitiveName): PrimitiveType {
    return { kind: "primitive", name }
}

export function literal(value: string | number | boolean): LiteralType {
    const base = typeof value === "string" ? "string" : typeof value === "number" ? "number" : "boolean"
    return { kind: "literal", base, value }
}

export function arrayOf(element: Type): ArrayType {
    return { kind: "array", element }
}

export function tuple(elements: Type[], isPack?: boolean): TupleType {
    return { kind: "tuple", elements, isPack }
}

export function objectType(
    entries: Iterable<[string, ObjectProperty]>,
    indexer?: ObjectType["indexer"],
    frozen?: boolean,
): ObjectType {
    return { kind: "object", properties: new Map(entries), indexer, frozen }
}

export function fn(
    params: FunctionParam[],
    returns: Type,
    varargs?: Type,
    typeParams?: string[],
    predicate?: TypePredicate,
): FunctionType {
    return {
        kind: "function", params, varargs, returns,
        typeParams: typeParams?.length ? typeParams : undefined,
        predicate,
    }
}

// ============================================================
// substitution — resolve typeParam nodes against a bindings map
// ============================================================

export function substitute(t: Type, subst: Map<string, Type>): Type {
    if (subst.size === 0) return t
    // Nothing to replace: return the type as it stands rather than deep-copying
    // it. Without this, instantiating a generic over a large type (a class map,
    // say) rebuilds that whole type at every mention.
    if (!containsTypeParam(t)) return t
    switch (t.kind) {
        case "typeParam":
            return subst.get(t.name) ?? t
        case "array":
            return arrayOf(substitute(t.element, subst))
        case "tuple":
            return tuple(t.elements.map(e => substitute(e, subst)), t.isPack)
        case "object": {
            const entries: [string, ObjectProperty][] = []
            for (const [k, v] of t.properties) entries.push([k, { ...v, type: substitute(v.type, subst) }])
            return objectType(
                entries,
                t.indexer && { key: substitute(t.indexer.key, subst), value: substitute(t.indexer.value, subst) },
                t.frozen,
            )
        }
        case "function": {
            // Don't substitute a function's own generic params (they shadow).
            const inner = t.typeParams
                ? new Map([...subst].filter(([k]) => !t.typeParams!.includes(k)))
                : subst
            return {
                kind: "function",
                params: t.params.map(p => ({ ...p, type: substitute(p.type, inner) })),
                varargs: t.varargs && substitute(t.varargs, inner),
                returns: substitute(t.returns, inner),
                typeParams: t.typeParams,
                predicate: t.predicate && {
                    ...t.predicate,
                    type: t.predicate.type && substitute(t.predicate.type, inner),
                },
            }
        }
        case "union":
            return union(t.types.map(x => substitute(x, subst)))
        case "intersection": {
            const r = intersection(t.types.map(x => substitute(x, subst)))
            return t.name && r.kind === "intersection" && !r.name ? { ...r, name: t.name } : r
        }
        case "genericRef":
            return { kind: "genericRef", name: t.name, typeArguments: t.typeArguments.map(a => substitute(a, subst)) }
        case "keyof":
            return { kind: "keyof", target: substitute(t.target, subst) }
        case "templateLiteral":
            return { kind: "templateLiteral", quasis: t.quasis, types: t.types.map(x => substitute(x, subst)) }
        case "difference":
            return difference(substitute(t.base, subst), substitute(t.excluded, subst))
        case "indexedAccess":
            return {
                kind: "indexedAccess",
                objectType: substitute(t.objectType, subst),
                indexType: substitute(t.indexType, subst),
            }
        case "conditional": {
            // In a distributive conditional the check parameter is rebound per
            // union member at reduction time, so it must survive substitution
            // inside the branches — otherwise `T extends U ? never : T` would
            // yield the whole union instead of the member under test.
            const branch = t.distributeParam
                ? new Map([...subst].filter(([k]) => k !== t.distributeParam))
                : subst
            return {
                ...t,
                checkType: substitute(t.checkType, subst),
                extendsType: substitute(t.extendsType, subst),
                trueType: substitute(t.trueType, branch),
                falseType: substitute(t.falseType, branch),
            }
        }
        case "mapped": {
            // The mapped parameter shadows an outer binding of the same name.
            const inner = new Map([...subst].filter(([k]) => k !== t.parameter))
            return {
                ...t,
                constraint: substitute(t.constraint, subst),
                nameType: t.nameType && substitute(t.nameType, inner),
                template: substitute(t.template, inner),
                source: t.source && substitute(t.source, subst),
            }
        }
        default:
            return t
    }
}

/** Infer generic bindings by structurally matching a (possibly generic)
 *  `param` type against a concrete `arg` type. Accumulates into `out`. */
export function unify(param: Type, arg: Type, vars: Set<string>, out: Map<string, Type>): void {
    if (param.kind === "typeParam" && param.constraint && !vars.has(param.name)) {
        unify(param.constraint, arg, vars, out)
        return
    }
    if (param.kind === "typeParam" && vars.has(param.name)) {
        const prev = out.get(param.name)
        out.set(param.name, prev ? union([prev, arg]) : arg)
        return
    }
    if (arg.kind === "any" || arg.kind === "never") return
    switch (param.kind) {
        case "array":
            if (arg.kind === "array") unify(param.element, arg.element, vars, out)
            else if (arg.kind === "tuple") for (const e of arg.elements) unify(param.element, e, vars, out)
            return
        case "tuple":
            if (arg.kind === "tuple") param.elements.forEach((p, i) => arg.elements[i] && unify(p, arg.elements[i], vars, out))
            else if (arg.kind === "array") for (const p of param.elements) unify(p, arg.element, vars, out)
            return
        case "function":
            if (arg.kind === "function") {
                param.params.forEach((p, i) => arg.params[i] && unify(p.type, arg.params[i].type, vars, out))
                unify(param.returns, arg.returns, vars, out)
            }
            return
        case "object":
            if (arg.kind === "object") {
                for (const [k, pv] of param.properties) {
                    const av = arg.properties.get(k)
                    if (av) unify(pv.type, av.type, vars, out)
                }
                if (param.indexer && arg.indexer) unify(param.indexer.value, arg.indexer.value, vars, out)
            }
            return
        case "union":
            // Best effort: match against the first member that carries a var.
            for (const m of param.types) unify(m, arg, vars, out)
            return
    }
}

// ============================================================
// union / intersection (flattening + light simplification)
// ============================================================

export function union(types: Type[]): Type {
    const flat: Type[] = []
    for (const t of types) {
        if (t.kind === "union") flat.push(...t.types)
        else flat.push(t)
    }
    // `any` and `unknown` are both absorbing: everything is assignable to
    // them, so a union with either is just that type. `any` wins over
    // `unknown`, matching TypeScript.
    if (flat.some(t => t.kind === "any")) return anyType
    if (flat.some(t => t.kind === "unknown")) return unknownType
    // drop `never`, dedupe by structural key
    const seen = new Map<string, Type>()
    for (const t of flat) {
        if (t.kind === "never") continue
        const key = formatType(t)
        if (!seen.has(key)) seen.set(key, t)
    }
    let members = reduceSubtypes([...seen.values()])
    if (members.length === 0) return neverType
    if (members.length === 1) return members[0]
    return { kind: "union", types: members }
}

/** Subtype reduction, as TypeScript performs when forming a union: a literal
 *  member is redundant next to its own primitive (`"a" | string` is `string`),
 *  and `true | false` is exactly `boolean`. Without this, narrowing a value and
 *  merging the branches back together leaves noise like `true | false` where
 *  the original `boolean` is meant. */
function reduceSubtypes(members: Type[]): Type[] {
    const primitives = new Set(
        members.filter((t): t is PrimitiveType => t.kind === "primitive").map(t => t.name),
    )
    // `true` and `false` together re-form `boolean`.
    const bools = members.filter(t => t.kind === "literal" && t.base === "boolean")
    if (!primitives.has("boolean") && bools.length === 2) {
        members = [booleanType, ...members.filter(t => !bools.includes(t))]
        primitives.add("boolean")
    }
    if (!primitives.size) return members
    return members.filter(t => !(t.kind === "literal" && primitives.has(t.base)))
}

export function intersection(types: Type[]): Type {
    const flat: Type[] = []
    for (const t of types) {
        // A *named* intersection stays one member: it is an alias the reader
        // knows by name (`type Part = BasePart & { ... }`), and flattening it
        // would discard that name and print the whole expansion instead.
        // Nesting costs nothing — `isAssignable` and `propertyType` both
        // recurse through intersection members.
        if (t.kind === "intersection" && !t.name) flat.push(...t.types)
        else flat.push(t)
    }
    const seen = new Map<string, Type>()
    for (const t of flat) {
        if (t.kind === "unknown") continue
        seen.set(formatType(t), t)
    }
    const members = [...seen.values()]
    if (members.length === 0) return unknownType
    if (members.length === 1) return members[0]
    return { kind: "intersection", types: members }
}

/** `base - excluded`, simplified as far as the base allows. */
export function difference(base: Type, excluded: Type): Type {
    if (excluded.kind === "never" || base.kind === "never" || base.kind === "any") return base
    // A union subtracts exactly, member by member.
    if (base.kind === "union") return union(base.types.filter(m => !isAssignable(m, excluded)))
    if (base.kind === "difference") {
        return difference(base.base, union([base.excluded, excluded]))
    }
    if (isAssignable(base, excluded)) return neverType
    // Only an opaque base carries the subtraction; anything concrete would
    // gain nothing from remembering it. "Opaque" includes a type-level
    // operator that has not been evaluated yet — `keyof T` becomes a union
    // once `T` is known, and the subtraction has to survive until then, which
    // is what `Omit<T, K>` depends on.
    const deferred = base.kind === "keyof" || base.kind === "indexedAccess" ||
        base.kind === "conditional" || base.kind === "mapped" || base.kind === "templateLiteral"
    const opaque = base.kind === "unknown" || base.kind === "typeParam" ||
        base.kind === "genericRef" || deferred || containsTypeParam(base)
    return opaque ? { kind: "difference", base, excluded } : base
}

/** `T | nil` — the type of an optional property or parameter. */
export function optional(t: Type): Type {
    return union([t, nilType])
}

// ============================================================
// widening — `as const` inverse: literal -> primitive
// ============================================================

/** Widens literal types to their primitive base (the default for a plain
 *  `local x = "foo"` binding, unless `as const` says otherwise). Recurses
 *  into arrays/tuples/objects/unions. */
export function widen(t: Type): Type {
    switch (t.kind) {
        case "literal":
            return primitive(t.base)
        case "array":
            return arrayOf(widen(t.element))
        case "tuple":
            return tuple(t.elements.map(widen), t.isPack)
        case "object": {
            if (t.frozen) return t
            const entries: [string, ObjectProperty][] = []
            for (const [k, v] of t.properties) entries.push([k, { ...v, type: widen(v.type) }])
            const w = objectType(entries, t.indexer && { key: t.indexer.key, value: widen(t.indexer.value) })
            if (t.name) w.name = t.name
            return w
        }
        case "union":
            return union(t.types.map(widen))
        case "difference":
            return difference(widen(t.base), t.excluded)
        default:
            return t
    }
}

// ============================================================
// subtype check — `a` assignable to `b`?
// ------------------------------------------------------------
// Deliberately conservative: unknowns that can't be decided return `true`
// only where soundness clearly allows (any), `false` otherwise.
// ============================================================

/** Resolves a `genericRef` to the alias it names.
 *
 *  Structural comparison has to see through a nominal reference, and a
 *  recursive alias (`type Instance = { Parent: Instance | nil }` — or any
 *  class hierarchy) is *always* left as one somewhere. `analyzeTypes` installs
 *  its own resolver for the duration of a run; without one, refs compare
 *  nominally as before. */
let expandAlias: ((t: GenericRefType) => Type) | undefined

export function setAliasExpander(fn: ((t: GenericRefType) => Type) | undefined): void {
    expandAlias = fn
}

/** Pairs currently being compared. Recursive types make `isAssignable` re-enter
 *  with the same pair; assuming success on re-entry is the standard
 *  coinductive reading ("assignable unless we can show otherwise") and is what
 *  lets two recursive class types compare at all. */
const comparing: Type[] = []

export function isAssignable(rawA: Type, rawB: Type): boolean {
    // `()` (the empty type pack, "returns nothing") and `nil` describe the
    // same observable value in Lua: reading the result of a call that returns
    // nothing yields nil. A function inferred `-> nil` therefore satisfies a
    // `-> ()` annotation, and the reverse.
    let a: Type = isNoValue(rawA) ? nilType : rawA
    let b: Type = isNoValue(rawB) ? nilType : rawB
    if (a === b) return true

    // See through nominal references before comparing structurally, but only
    // when the other side is not itself a ref of the same name (handled below).
    if (expandAlias) {
        if (a.kind === "genericRef" && b.kind !== "genericRef") a = expandAlias(a)
        else if (b.kind === "genericRef" && a.kind !== "genericRef") b = expandAlias(b)
        if (a === b) return true
    }

    for (let i = 0; i < comparing.length; i += 2) {
        if (comparing[i] === a && comparing[i + 1] === b) return true
    }
    comparing.push(a, b)
    try {
        return isAssignableInner(a, b)
    } finally {
        comparing.length -= 2
    }
}

function isAssignableInner(a: Type, b: Type): boolean {
    if (a.kind === "any" || b.kind === "any") return true
    if (a.kind === "never") return true
    if (b.kind === "unknown") return true
    if (b.kind === "never") return false
    if (a.kind === "unknown") return false

    // `x` fits `B - E` when it fits `B` and cannot be an `E` at all.
    if (b.kind === "difference") {
        return isAssignable(a, b.base) && !overlaps(a, b.excluded)
    }
    // `B - E` fits anything `B` fits; the subtraction only removes values.
    if (a.kind === "difference") return isAssignable(a.base, b)

    if (a.kind === "union") return a.types.every(t => isAssignable(t, b))
    if (b.kind === "union") return b.types.some(t => isAssignable(a, t))
    if (b.kind === "intersection") return b.types.every(t => isAssignable(a, t))
    if (a.kind === "intersection") {
        if (a.types.some(t => isAssignable(t, b))) return true
        // No member is enough on its own, but together they may be: `{ x } &
        // { y }` has both properties. Compare the members merged into one
        // object — which is what lets `Omit<Folder, "Parent"> & { Parent: P }`
        // count as a `Folder`.
        const merged = mergeObjectMembers(a.types)
        return merged !== undefined && isAssignable(merged, b)
    }

    if (a.kind === "literal") {
        if (b.kind === "literal") return a.value === b.value
        if (b.kind === "primitive") return b.name === a.base
        if (b.kind === "templateLiteral") {
            return a.base === "string" && templateMatches(String(a.value), b)
        }
        return false
    }
    if (a.kind === "templateLiteral") {
        // An unreduced pattern is a set of strings, so it is a `string`.
        return b.kind === "primitive" && b.name === "string"
    }
    if (a.kind === "primitive") return b.kind === "primitive" && b.name === a.name

    if (a.kind === "array") {
        if (b.kind === "array") return isAssignable(a.element, b.element)
        return false
    }
    if (a.kind === "tuple") {
        if (b.kind === "tuple") {
            return a.elements.length === b.elements.length &&
                a.elements.every((t, i) => isAssignable(t, b.elements[i]))
        }
        if (b.kind === "array") return a.elements.every(t => isAssignable(t, b.element))
        return false
    }
    if (a.kind === "object") {
        if (b.kind !== "object") return false
        for (const [name, bp] of b.properties) {
            const ap = a.properties.get(name)
            if (!ap) {
                if (bp.optional) continue
                if (a.indexer && isAssignable(a.indexer.value, bp.type)) continue
                return false
            }
            if (!isAssignable(ap.type, bp.type)) return false
        }
        return true
    }
    if (a.kind === "function") {
        if (b.kind !== "function") return false
        // bivariant params (pragmatic, matches Luau's default posture)
        const n = Math.min(a.params.length, b.params.length)
        for (let i = 0; i < n; i++) {
            if (!isAssignable(a.params[i].type, b.params[i].type) &&
                !isAssignable(b.params[i].type, a.params[i].type)) return false
        }
        return isAssignable(a.returns, b.returns)
    }
    if (a.kind === "typeParam") {
        if (b.kind === "typeParam" && a.name === b.name) return true
        return a.constraint ? isAssignable(a.constraint, b) : false
    }
    if (b.kind === "typeParam") return false
    if (a.kind === "genericRef" || b.kind === "genericRef") {
        return a.kind === "genericRef" && b.kind === "genericRef" && a.name === b.name &&
            a.typeArguments.length === b.typeArguments.length &&
            a.typeArguments.every((x, i) => equalTypes(x, b.typeArguments[i]))
    }
    return false
}

/** `()` — an empty type pack, produced by `-> ()` and by falling off the end
 *  of a function. */
function isNoValue(t: Type): boolean {
    return t.kind === "tuple" && t.elements.length === 0
}

export function equalTypes(a: Type, b: Type): boolean {
    return formatType(a) === formatType(b)
}

// ============================================================
// narrowing helpers
// ============================================================

/** Keep the parts of `t` compatible with `filter` — TypeScript's
 *  `getNarrowedType`. Per union member: a member already assignable to the
 *  filter survives as-is; a member the filter is assignable to is *replaced*
 *  by the filter (so `string` narrowed by `"a"` becomes `"a"`, not `string`);
 *  anything else is dropped. `any` / `unknown` narrow straight to the filter. */
export function narrowTo(t: Type, filter: Type): Type {
    if (filter.kind === "any") return t
    // Narrowing a subtraction narrows its base, then re-applies what was
    // already ruled out: `(unknown - 1)` narrowed by `number` is `number - 1`.
    if (t.kind === "difference") return difference(narrowTo(t.base, filter), t.excluded)
    if (t.kind === "any" || t.kind === "unknown") return filter
    const members = t.kind === "union" ? t.types : [t]
    const kept: Type[] = []
    for (const m of members) {
        if (m.kind === "any") { kept.push(filter); continue }
        if (isAssignable(m, filter)) kept.push(m)
        else if (isAssignable(filter, m)) kept.push(filter)
    }
    return union(kept)
}

/** Remove the parts of `t` assignable to `exclude` (the `else` branch).
 *  `boolean` minus a `true`/`false` literal leaves the other literal — the
 *  only primitive here with a finite, enumerable domain. */
export function narrowExclude(t: Type, exclude: Type): Type {
    if (exclude.kind === "never" || t.kind === "any") return t
    // An opaque type keeps what was ruled out, since that is all the test told
    // us. `difference` decides whether the subtraction is worth keeping.
    if (t.kind === "unknown" || t.kind === "typeParam" || t.kind === "genericRef" ||
        t.kind === "difference") {
        return difference(t, exclude)
    }
    const members = t.kind === "union" ? t.types : [t]
    const kept: Type[] = []
    for (const m of members) {
        if (isAssignable(m, exclude)) continue
        if (m.kind === "primitive" && m.name === "boolean" &&
            exclude.kind === "literal" && exclude.base === "boolean") {
            kept.push(literal(!(exclude.value as boolean)))
            continue
        }
        kept.push(m)
    }
    return union(kept)
}

// The whole falsy story in Luau: **only `nil` and `false`**. Unlike JS/TS,
// `0`, `0/0` and `""` are truthy, so `if n then` tells you nothing about a
// `number` and `if s then` nothing about a `string`. Every truthiness-driven
// narrowing in the analyzer goes through these two functions, so that rule
// lives in exactly one place.

/** `nil | false` — every falsy value in Luau. Built literally rather than via
 *  `union()`, which would format its members for deduping and so touch caches
 *  declared further down this module. */
export const falsyType: Type = { kind: "union", types: [nilType, { kind: "literal", base: "boolean", value: false }] }

/** Can a value of this type ever be truthy? */
export function isPossiblyTruthy(t: Type): boolean {
    if (t.kind === "never") return false
    if (t.kind === "difference") return isPossiblyTruthy(t.base) && !isAssignable(t.base, t.excluded)
    if (t.kind === "union") return t.types.some(isPossiblyTruthy)
    if (t.kind === "primitive" && t.name === "nil") return false
    if (t.kind === "literal" && t.value === false) return false
    return true
}

/** Can a value of this type ever be falsy? */
export function isPossiblyFalsy(t: Type): boolean {
    if (t.kind === "never") return false
    if (t.kind === "difference") return isPossiblyFalsy(t.base) && !isAssignable(falsyType, t.excluded)
    if (t.kind === "union") return t.types.some(isPossiblyFalsy)
    if (t.kind === "any" || t.kind === "unknown") return true
    if (t.kind === "primitive") return t.name === "nil" || t.name === "boolean"
    if (t.kind === "literal") return t.value === false
    // typeParam / genericRef: unresolved, so assume it could be either.
    return t.kind === "typeParam" || t.kind === "genericRef"
}

/** Keep only what can be truthy — drops `nil` and the `false` literal, and
 *  narrows a bare `boolean` to `true`. */
export function narrowTruthy(t: Type): Type {
    if (t.kind === "any") return t
    // `unknown` minus the falsy values — the truthy branch's whole content.
    if (t.kind === "unknown" || t.kind === "typeParam" || t.kind === "genericRef") {
        return difference(t, falsyType)
    }
    if (t.kind === "difference") return difference(narrowTruthy(t.base), t.excluded)
    const members = t.kind === "union" ? t.types : [t]
    const out: Type[] = []
    for (const m of members) {
        if (!isPossiblyTruthy(m)) continue
        if (m.kind === "primitive" && m.name === "boolean") out.push(literal(true))
        else out.push(m)
    }
    return union(out)
}

/** Keep only what can be falsy — `nil` and `false`. */
export function narrowFalsy(t: Type): Type {
    const members = t.kind === "union" ? t.types : [t]
    const out: Type[] = []
    for (const m of members) {
        if (m.kind === "primitive" && m.name === "nil") out.push(nilType)
        else if (m.kind === "primitive" && m.name === "boolean") out.push(literal(false))
        else if (m.kind === "literal" && m.value === false) out.push(literal(false))
        else if (m.kind === "any" || m.kind === "unknown" ||
            m.kind === "typeParam" || m.kind === "genericRef") {
            out.push(nilType)
            out.push(literal(false))
        }
    }
    return union(out)
}

/** Does `t` still mention a *free* type parameter — one that is not bound by
 *  something inside `t` itself? A type-level operator can only be evaluated
 *  once this is false.
 *
 *  The distinction matters: an object whose members include a generic method
 *  (`IsA: <K>(...) -> ...`) is perfectly concrete, because `K` is bound by
 *  that signature. Counting such a `K` as free would leave every `keyof` of
 *  that object deferred forever. */
const freeParamCache = new WeakMap<object, boolean>()

export function containsTypeParam(
    t: Type,
    seen = new Set<Type>(),
    bound = new Set<string>(),
): boolean {
    // Outermost call on a closed question: cacheable, and worth caching —
    // the reducer asks this of the same large types over and over.
    const cacheable = seen.size === 0 && bound.size === 0
    if (cacheable) {
        const hit = freeParamCache.get(t)
        if (hit !== undefined) return hit
    }
    const result = containsFreeTypeParam(t, seen, bound)
    if (cacheable) freeParamCache.set(t, result)
    return result
}

function containsFreeTypeParam(t: Type, seen: Set<Type>, bound: Set<string>): boolean {
    if (seen.has(t)) return false
    seen.add(t)
    switch (t.kind) {
        case "typeParam": return !bound.has(t.name)
        case "infer": return !bound.has(t.name)
        case "array": return containsTypeParam(t.element, seen, bound)
        case "tuple": return t.elements.some(e => containsTypeParam(e, seen, bound))
        case "union":
        case "intersection": return t.types.some(m => containsTypeParam(m, seen, bound))
        case "object":
            return [...t.properties.values()].some(v => containsTypeParam(v.type, seen, bound)) ||
                (!!t.indexer && (containsTypeParam(t.indexer.key, seen, bound) ||
                    containsTypeParam(t.indexer.value, seen, bound)))
        case "function": {
            // A signature's own generic parameters are bound within it.
            const inner = t.typeParams?.length
                ? new Set([...bound, ...t.typeParams])
                : bound
            return t.params.some(p => containsTypeParam(p.type, seen, inner)) ||
                (!!t.varargs && containsTypeParam(t.varargs, seen, inner)) ||
                containsTypeParam(t.returns, seen, inner)
        }
        case "genericRef": return t.typeArguments.some(a => containsTypeParam(a, seen, bound))
        case "keyof": return containsTypeParam(t.target, seen, bound)
        case "templateLiteral": return t.types.some(x => containsTypeParam(x, seen, bound))
        case "difference":
            return containsTypeParam(t.base, seen, bound) || containsTypeParam(t.excluded, seen, bound)
        case "indexedAccess":
            return containsTypeParam(t.objectType, seen, bound) ||
                containsTypeParam(t.indexType, seen, bound)
        case "conditional":
            // Still unreduced, so what it hinges on is what matters; `infer`
            // names are bound by the clause that introduces them.
            return containsTypeParam(t.checkType, seen, bound)
        case "mapped":
            // Likewise: the key set decides whether it can be built yet.
            return containsTypeParam(t.constraint, seen, bound)
        default: return false
    }
}

/** Structurally match `arg` against `pattern`, binding every `infer` name it
 *  contains into `out`. This is what turns `T extends (...unknown) -> infer R`
 *  into `R = <the return type>`. Returns false when the shapes cannot match at
 *  all; a `true` result still needs the usual assignability check. */
export function matchInfer(arg: Type, pattern: Type, out: Map<string, Type>): boolean {
    if (pattern.kind === "infer") {
        const prev = out.get(pattern.name)
        out.set(pattern.name, prev ? union([prev, arg]) : arg)
        return true
    }
    if (!containsTypeParam(pattern)) return true // nothing to bind; assignability decides
    switch (pattern.kind) {
        case "array":
            if (arg.kind === "array") return matchInfer(arg.element, pattern.element, out)
            if (arg.kind === "tuple") return matchInfer(union(arg.elements), pattern.element, out)
            return false
        case "tuple":
            if (arg.kind !== "tuple" || arg.elements.length !== pattern.elements.length) return false
            return pattern.elements.every((pt, i) => matchInfer(arg.elements[i], pt, out))
        case "function": {
            if (arg.kind !== "function") return false
            // `(...infer P) -> R` collects the whole parameter list as a tuple —
            // this is how `Parameters<T>` is expressed.
            if (pattern.varargs?.kind === "infer" && !pattern.params.length) {
                out.set(pattern.varargs.name, tuple(arg.params.map(p => p.type)))
            } else {
                for (let i = 0; i < pattern.params.length; i++) {
                    if (!arg.params[i]) return false
                    if (!matchInfer(arg.params[i].type, pattern.params[i].type, out)) return false
                }
            }
            return matchInfer(arg.returns, pattern.returns, out)
        }
        case "object": {
            if (arg.kind !== "object") return false
            for (const [k, pv] of pattern.properties) {
                const av = arg.properties.get(k)
                if (!av || !matchInfer(av.type, pv.type, out)) return false
            }
            return true
        }
        case "union":
            return pattern.types.some(m => matchInfer(arg, m, out))
        case "genericRef":
            if (arg.kind !== "genericRef" || arg.name !== pattern.name) return false
            return pattern.typeArguments.every((a, i) =>
                arg.typeArguments[i] !== undefined && matchInfer(arg.typeArguments[i], a, out))
        default:
            return true
    }
}

/** Does a concrete string match a template literal *pattern*? Each
 *  interpolation is matched against the widest thing it could stand for:
 *  `string` swallows any run, `number` a numeric run, and a literal union only
 *  its own members. Anchored at both ends, like TypeScript. */
export function templateMatches(value: string, pattern: TemplateLiteralType): boolean {
    const partSource = (t: Type): string => {
        switch (t.kind) {
            case "literal": return escapeRegExp(String(t.value))
            case "primitive":
                if (t.name === "number") return "-?\\d+(?:\\.\\d+)?"
                if (t.name === "boolean") return "true|false"
                return "[\\s\\S]*"
            case "union": return t.types.map(m => `(?:${partSource(m)})`).join("|")
            default: return "[\\s\\S]*"
        }
    }
    let source = "^" + escapeRegExp(pattern.quasis[0])
    pattern.types.forEach((t, i) => {
        source += `(?:${partSource(t)})` + escapeRegExp(pattern.quasis[i + 1])
    })
    return new RegExp(source + "$").test(value)
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Do these two types share any value? The compatibility test behind
 *  discriminant filtering and `narrowTo`. */
export function overlaps(a: Type, b: Type): boolean {
    return isAssignable(a, b) || isAssignable(b, a)
}

// ============================================================
// formatting (also the structural key for dedupe)
// ============================================================

/** `formatType` doubles as the structural key for union/intersection dedupe
 *  and `equalTypes`, so it runs constantly — and a class hierarchy formats to
 *  a very large string. Types are immutable by construction (every
 *  constructor returns a fresh value), so caching by identity is sound. */
const formatCache = new WeakMap<object, string>()

export function formatType(t: Type): string {
    const cached = formatCache.get(t)
    if (cached !== undefined) return cached
    const out = formatTypeUncached(t)
    formatCache.set(t, out)
    return out
}

function formatTypeUncached(t: Type): string {
    switch (t.kind) {
        case "any": return "any"
        case "unknown": return "unknown"
        case "never": return "never"
        case "primitive": return t.name
        case "literal": return t.base === "string" ? JSON.stringify(t.value) : String(t.value)
        case "array": return `${formatAtom(t.element)}[]`
        case "tuple": {
            if (!t.elements.length) return "()"
            const inner = t.elements.map(formatType).join(", ")
            // A pack prints the way it is written: `(number, string)`.
            return t.isPack ? `(${inner})` : `[${inner}]`
        }
        case "object": {
            if (t.name) return t.name
            const props = [...t.properties.entries()]
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([k, v]) => `${v.readonly ? "readonly " : ""}${formatKey(k)}${v.optional ? "?" : ""}: ${formatType(v.type)}`)
            if (t.indexer) props.push(`[${formatType(t.indexer.key)}]: ${formatType(t.indexer.value)}`)
            return props.length ? `{ ${props.join(", ")} }` : "{}"
        }
        case "function": {
            const consts = new Set(
                t.params.filter(p => p.type.kind === "typeParam" && p.type.isConst)
                    .map(p => (p.type as TypeParamType).name),
            )
            const gen = t.typeParams?.length
                ? `<${t.typeParams.map(n => (consts.has(n) ? `const ${n}` : n)).join(", ")}>`
                : ""
            const ps = t.params.map(p => `${p.name ? p.name + ": " : ""}${formatType(p.type)}`)
            if (t.varargs) ps.push(`...${formatType(t.varargs)}`)
            return `${gen}(${ps.join(", ")}) -> ${formatPredicate(t) ?? formatType(t.returns)}`
        }
        case "typeParam": return t.name
        case "union": return t.types.map(formatAtom).join(" | ")
        case "intersection": return t.name ?? t.types.map(formatAtom).join(" & ")
        case "genericRef":
            return t.typeArguments.length
                ? `${t.name}<${t.typeArguments.map(formatType).join(", ")}>`
                : t.name
        case "keyof": return `keyof ${formatAtom(t.target)}`
        case "difference": return `${formatAtom(t.base)} - ${formatAtom(t.excluded)}`
        case "templateLiteral": {
            let out = "`" + t.quasis[0]
            t.types.forEach((x, i) => { out += "${" + formatType(x) + "}" + t.quasis[i + 1] })
            return out + "`"
        }
        case "indexedAccess": return `${formatAtom(t.objectType)}[${formatType(t.indexType)}]`
        case "infer": return `infer ${t.name}`
        case "conditional":
            return `${formatAtom(t.checkType)} extends ${formatAtom(t.extendsType)} ? ${formatType(t.trueType)} : ${formatType(t.falseType)}`
        case "mapped": {
            const ro = t.readonly === true ? "readonly " : t.readonly === false ? "-readonly " : ""
            const opt = t.optional === true ? "?" : t.optional === false ? "-?" : ""
            const as = t.nameType ? ` as ${formatType(t.nameType)}` : ""
            return `{ ${ro}[${t.parameter} in ${formatType(t.constraint)}${as}]${opt}: ${formatType(t.template)} }`
        }
    }
}

/** `v is string` / `asserts v` — the return position of a type guard. */
function formatPredicate(t: FunctionType): string | undefined {
    const p = t.predicate
    if (!p) return undefined
    const name = t.params[p.param]?.name ?? `arg${p.param}`
    const head = p.asserts ? "asserts " : ""
    return p.type ? `${head}${name} is ${formatType(p.type)}` : `${head}${name}`
}

function formatAtom(t: Type): string {
    // A named intersection prints as a bare alias name, so it needs no parens.
    if (t.kind === "intersection" && t.name) return t.name
    if (t.kind === "union" || t.kind === "intersection" || t.kind === "function" ||
        t.kind === "difference") {
        return `(${formatType(t)})`
    }
    return formatType(t)
}

const IDENT_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/
function formatKey(k: string): string {
    return IDENT_KEY.test(k) ? k : JSON.stringify(k)
}

/** The object members of an intersection merged into one object: every
 *  property of every member, with a property several members declare getting
 *  the intersection of their types. Aliases are seen through. `undefined` when
 *  a member is not an object (a function, a primitive), since merging would
 *  then lose what that member means. */
function mergeObjectMembers(types: readonly Type[]): ObjectType | undefined {
    const objects: ObjectType[] = []
    const seen = new Set<Type>()
    const collect = (t: Type): boolean => {
        if (seen.has(t)) return true
        seen.add(t)
        if (t.kind === "genericRef") {
            const expanded = expandAlias?.(t)
            return expanded !== undefined && expanded !== t && collect(expanded)
        }
        if (t.kind === "intersection") return t.types.every(collect)
        if (t.kind === "object") {
            objects.push(t)
            return true
        }
        return false
    }
    if (!types.every(collect) || objects.length < 2) return undefined

    const properties = new Map<string, ObjectProperty>()
    let indexer: ObjectType["indexer"]
    for (const object of objects) {
        indexer ??= object.indexer
        for (const [name, property] of object.properties) {
            const existing = properties.get(name)
            properties.set(name, existing
                ? {
                    type: intersection([existing.type, property.type]),
                    optional: existing.optional && property.optional,
                    readonly: existing.readonly || property.readonly,
                }
                : property)
        }
    }
    return objectType([...properties], indexer)
}

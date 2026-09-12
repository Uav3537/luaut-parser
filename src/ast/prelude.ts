import { parse } from "./builders"
import type { Program } from "./nodes"

/**
 * The types that belong to the language itself, available in every file with
 * or without a type library — as TypeScript's `Partial` and `ReturnType` are.
 *
 * They are written in luaut on top of `keyof`, `T[K]`, conditional types with
 * `infer`, mapped types and set difference; the analyzer knows none of these
 * names. A type library or the file itself may declare one of them again, and
 * that declaration wins.
 *
 * What a runtime provides — `print`, `string`, `game` — is not here: that is a
 * type library's job (`@luaut/lua`, `@luaut/roblox`).
 *
 * `ArrayMethods<T>` and `StringMethods` are the exception that proves it: they
 * are the language's own, because `names:filter(f)` is lowered to a call the
 * compiler emits rather than to anything a library provides. `propertyType`
 * reads a member of an array or a string out of them.
 */
export const PRELUDE_SOURCE = `
-- In Luau only \`nil\` and \`false\` are falsy: \`0\` and \`""\` are truthy.
-- These are what truthiness narrowing computes, made available to write down.
type Falsy = nil | false
type Truthy<T> = T - Falsy

-- \`-\` is set difference. Over a union it drops members; over a concrete type
-- it simplifies away; over an opaque type (\`unknown\`, an unresolved parameter)
-- it is kept, so \`Exclude<unknown, 1>\` stays \`unknown - 1\`.
type Exclude<T, U> = T - U
type Extract<T, U> = T extends U ? T : never
type NonNullable<T> = T - nil

type ReturnType<T> = T extends (...unknown) -> infer R ? R : never
type Parameters<T> = T extends (...infer P) -> unknown ? P : never

type Partial<T> = { [K in keyof T]?: T[K] }
type Required<T> = { [K in keyof T]-?: T[K] }
type Readonly<T> = { readonly [K in keyof T]: T[K] }
type Mutable<T> = { -readonly [K in keyof T]: T[K] }

type Pick<T, K> = { [P in K]: T[P] }
type Omit<T, K> = Pick<T, Exclude<keyof T, K>>
type Record<K, V> = { [P in K]: V }

-- The methods every array has: \`names:filter(f)\`, \`names:map(f)\`. Nothing is
-- attached to the table at runtime — the compiler lowers each call to a plain
-- function — so these work on any array, including one a Luau library made.
--
-- Indices are Luau's: the first element is 1, and \`indexOf\` / \`findIndex\`
-- answer \`nil\` rather than JavaScript's -1 when there is no match. \`sort\`
-- takes Luau's comparator (true when \`a\` comes first), as \`table.sort\` does.
-- \`push\`, \`pop\`, \`shift\`, \`unshift\`, \`sort\` and \`reverse\` change the array
-- they are called on; everything else returns a new one.
type ArrayMethods<T> = {
    find: (self: T[], test: (value: T, index: number) -> boolean) -> T | nil,
    findIndex: (self: T[], test: (value: T, index: number) -> boolean) -> number | nil,
    filter: (self: T[], test: (value: T, index: number) -> boolean) -> T[],
    map: <U>(self: T[], transform: (value: T, index: number) -> U) -> U[],
    forEach: (self: T[], visit: (value: T, index: number) -> ()) -> (),
    some: (self: T[], test: (value: T, index: number) -> boolean) -> boolean,
    every: (self: T[], test: (value: T, index: number) -> boolean) -> boolean,
    reduce: <U>(self: T[], step: (total: U, value: T, index: number) -> U, initial: U) -> U,
    includes: (self: T[], value: T) -> boolean,
    indexOf: (self: T[], value: T, start?: number) -> number | nil,
    join: (self: T[], separator?: string) -> string,
    concat: (self: T[], ...T[]) -> T[],
    slice: (self: T[], start?: number, stop?: number) -> T[],
    flat: (self: T[]) -> T[],
    reverse: (self: T[]) -> T[],
    sort: (self: T[], compare?: (a: T, b: T) -> boolean) -> T[],
    push: (self: T[], ...T) -> number,
    pop: (self: T[]) -> T | nil,
    shift: (self: T[]) -> T | nil,
    unshift: (self: T[], ...T) -> number,
}

-- The methods every string has. The first group is Luau's own string library,
-- which a string already answers to; the second is written the way JavaScript
-- writes it and is lowered to a plain call, like the array methods.
--
-- Positions are Luau's here too: \`sub\` and \`slice\` count from 1, and
-- \`indexOf\` gives \`nil\` when the text is not there.
type StringMethods = {
    upper: (self: string) -> string,
    lower: (self: string) -> string,
    len: (self: string) -> number,
    sub: (self: string, i: number, j?: number) -> string,
    rep: (self: string, n: number, separator?: string) -> string,
    reverse: (self: string) -> string,
    split: (self: string, separator?: string) -> string[],
    format: (self: string, ...unknown) -> string,
    byte: (self: string, i?: number, j?: number) -> ...number,
    find: (self: string, pattern: string, init?: number, plain?: boolean) -> (number | nil, number | nil),
    match: (self: string, pattern: string, init?: number) -> ...unknown,
    gmatch: (self: string, pattern: string) -> () -> ...string,
    gsub: (self: string, pattern: string, replacement: unknown, n?: number) -> (string, number),

    trim: (self: string) -> string,
    trimStart: (self: string) -> string,
    trimEnd: (self: string) -> string,
    startsWith: (self: string, text: string) -> boolean,
    endsWith: (self: string, text: string) -> boolean,
    includes: (self: string, text: string) -> boolean,
    indexOf: (self: string, text: string, start?: number) -> number | nil,
    slice: (self: string, start?: number, stop?: number) -> string,
    replace: (self: string, text: string, replacement: string) -> string,
    replaceAll: (self: string, text: string, replacement: string) -> string,
    padStart: (self: string, length: number, padding?: string) -> string,
    padEnd: (self: string, length: number, padding?: string) -> string,
}
`

let prelude: Program | undefined

/** The prelude, parsed once. */
export function preludeProgram(): Program {
    return (prelude ??= parse(PRELUDE_SOURCE))
}

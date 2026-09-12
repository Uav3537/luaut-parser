import { parse, analyzeScopes, analyzeTypes, formatType } from "../src/index.js"

const run = (code: string) => {
    const program = parse(code)
    const scopes = analyzeScopes(program)
    const types = analyzeTypes(program, scopes)
    const bindings: Record<string, string> = {}
    for (const [id, t] of types.bindingType) bindings[scopes.bindings.get(id)!.name] = formatType(t)
    return { bindings, errors: types.diagnostics.map(d => d.message) }
}

// 1. narrowing away a member with an early return
const narrowed = run([
    `declare function GetClass(): "None" | "Sans" | "Asgore"`,
    `function f()`,
    `    const Class = GetClass()`,
    `    if Class == "None" then return false end`,
    `    const after = Class`,
    `    return after`,
    `end`,
].join("\n"))
console.log("1 after the guard:", narrowed.bindings.after, narrowed.errors)

// 2. indexing a string
const indexed = run([
    `declare Skill: "a" | "b"`,
    `declare Class: "Sans" | "Asgore"`,
    `const value = Skill[Class]`,
].join("\n"))
console.log("2 string[key]:", indexed.bindings.value, indexed.errors)

// 3. indexing a table with a narrowed key, as the user meant
const table = run([
    `const Skills = { Sans: [1], Asgore: [2] } as const`,
    `declare function GetClass(): "None" | "Sans" | "Asgore"`,
    `function f()`,
    `    const Class = GetClass()`,
    `    if Class == "None" then return nil end`,
    `    const rows = Skills[Class]`,
    `    return rows`,
    `end`,
].join("\n"))
console.log("3 table[narrowed key]:", table.bindings.rows, table.errors)

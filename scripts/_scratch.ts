import { readFileSync } from "node:fs"
import { parse, analyzeScopes, analyzeTypes, formatType } from "../src/index.js"

const libs = ["lua", "roblox"].map(n =>
    parse(readFileSync(`C:/Users/uav3537/Desktop/develop/luaut-language-server/node_modules/@luaut/${n}/index.d.luaut`, "utf8")))

const code = [
    `const StatValue = {`,
    `    BlockTick: "NumberValue",`,
    `    CanGetup: "BoolValue",`,
    `    Class: "StringValue",`,
    `} as const`,
    `export type StatType = keyof typeof StatValue`,
    `export function Stat<K extends StatType>(Target: Player | nil, Name: K): CreatableClassMap[typeof StatValue[K]] | nil`,
    `    const Obj = Instance.new(StatValue[Name])`,
    `    return Obj`,
    `end`,
    `const a = Stat(nil, "BlockTick")`,
    `const b = Stat(nil, "Class")`,
    `const c = Stat(nil, "CanGetup")`,
].join("\n")

const program = parse(code)
const scopes = analyzeScopes(program)
const types = analyzeTypes(program, scopes, { libs })
for (const [id, t] of types.bindingType) {
    const name = scopes.bindings.get(id)!.name
    if (["a", "b", "c", "Obj"].includes(name)) console.log(name, "=", formatType(t))
}
console.log("errors:", types.diagnostics.map(d => d.message.slice(0, 140)))

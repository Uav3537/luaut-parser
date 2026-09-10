// Loads the baseline Roblox/Luau ambient definitions (`roblox.d.luaut`,
// written in luaut) and exposes the parsed program.
//
//   import { robloxLib } from "luaut-parser"
//   analyzeTypes(program, scopes, { libs: [robloxLib] })
//
// The definitions themselves live in `roblox.d.luaut` next to this file — edit
// that, not this loader. Node-only (uses `fs`); a browser consumer should read
// the `.d.luaut` text itself and call `parse(text)`.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parse } from "@ast/builders"
import type { Program } from "@ast/nodes"

/** Absolute path to the shipped `roblox.d.luaut`. */
export const robloxDefsPath = fileURLToPath(new URL("./roblox.d.luaut", import.meta.url))

/** Raw source of the baseline definitions. */
export const robloxDefs: string = readFileSync(robloxDefsPath, "utf8")

/** Parsed baseline definitions — pass as `analyzeTypes(..., { libs: [robloxLib] })`. */
export const robloxLib: Program = parse(robloxDefs)

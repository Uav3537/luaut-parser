// Loads the core Luau ambient definitions (`luau.d.luaut`, written in luaut)
// and exposes the parsed program.
//
//   import { luauLib, defaultLibs } from "luaut-parser"
//   analyzeTypes(program, scopes, { libs: defaultLibs })
//
// These definitions are what teach the analyzer `type` / `typeof`: it has no
// built-in knowledge of either name. Edit `luau.d.luaut`, not this loader.
// Node-only (uses `fs`); a browser consumer should read the `.d.luaut` text
// itself and call `parse(text)`.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parse } from "@ast/builders"
import type { Program } from "@ast/nodes"

/** Absolute path to the shipped `luau.d.luaut`. */
export const luauDefsPath = fileURLToPath(new URL("./luau.d.luaut", import.meta.url))

/** Raw source of the core definitions. */
export const luauDefs: string = readFileSync(luauDefsPath, "utf8")

/** Parsed core Luau definitions. */
export const luauLib: Program = parse(luauDefs)

import { parse, parseTokens, parseExpressionFromSource, parseWithRecovery, ParseError } from '@ast/builders'
export type { RecoverResult, ParserOptions } from '@ast/builders'
import { tokenize, LexError } from '@lexer/lexer'

// Re-export every AST/token type so consumers can `import type { ... } from "luaut-parser"`.
export * from '@lexer/token'
export * from '@ast/nodes'
import { analyzeScopes, getBinding, isGlobal, isUnassignedGlobal } from '@ast/analyzeScopes'
export type { ScopeAnalysis, ScopeDiagnostic, Binding, BindingId, BindingKind } from '@ast/analyzeScopes'
import { analyzeTypes, moduleExports } from '@ast/analyzeTypes'
export type { TypeAnalysis, AnalyzeTypesOptions, TypeDiagnostic, ModuleExports, ExportedType } from '@ast/analyzeTypes'
export * from '@ast/typeModel'
export { luauLib, luauDefs, luauDefsPath } from './lib/luau'
export { robloxLib, robloxDefs, robloxDefsPath } from './lib/roblox'
import { luauLib } from './lib/luau'
import { robloxLib } from './lib/roblox'
import type { Program } from '@ast/nodes'

/** Core Luau plus the Roblox baseline, in the order `analyzeTypes` expects.
 *
 *  The analyzer has no built-in knowledge of `type` / `typeof` — they are
 *  ordinary overload sets declared in these files, and narrowing is derived
 *  from them. Pass this (or your own list) or those built-ins narrow nothing:
 *
 *      analyzeTypes(program, scopes, { libs: defaultLibs })
 */
export const defaultLibs: readonly Program[] = [luauLib, robloxLib]

// This package is the luaut *front end* only: source -> luaut AST (+ scope
// analysis). Emitting Luau is the downstream compiler's job — it lowers the
// luaut AST to a plain Luau AST and runs its own Luau printer (which lives in
// a separate project). There is deliberately no printer here.
export {
    tokenize, LexError,
    parse, parseTokens, parseExpressionFromSource, parseWithRecovery, ParseError,
    analyzeScopes, getBinding, isGlobal, isUnassignedGlobal,
    analyzeTypes, moduleExports,
}

export const luautparser = {
    tokenize,
    parseTokens,
    parse,
    parseExpressionFromSource,
    parseWithRecovery,
    analyzeScopes,
    getBinding,
    isGlobal,
    isUnassignedGlobal,
    analyzeTypes,
} as const

export default luautparser

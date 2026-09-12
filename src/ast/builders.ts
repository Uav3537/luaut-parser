import { tokenize, LexError, type Token, type SourceComment } from "@lexer/lexer"
import { readDirectives, type Directives } from "./directives"
import type {
    Program, Block, Statement, Expression, TypeNode,
    VariableDeclaration, FunctionDeclaration, FunctionDeclarationStatement,
    AssignmentStatement, CompoundAssignmentStatement, CallStatement,
    DoStatement, WhileStatement, RepeatStatement, IfStatement, IfClause,
    NumericForStatement, GenericForStatement, ReturnStatement,
    BreakStatement, ContinueStatement, TypeAliasStatement, ExportTypeAliasStatement,
    ImportStatement, ImportSpecifier, ExportStatement, ExportDefaultStatement, DeclareStatement,
    DeclareClassStatement, ExportNamedStatement, ExportSpecifier, ExportAllStatement,
    FunctionName, TypedIdentifier, GenericTypeParameter, FunctionSignature, TypePredicateNode,
    MappedTypeNode,
    BindingTarget, IdentifierPattern, ObjectPattern, ObjectPatternProperty,
    ArrayPattern, ArrayPatternElement, SpreadElement,
    Identifier, NilLiteral, BooleanLiteral, NumberLiteral, StringLiteral,
    InterpolatedStringExpression, InterpolatedStringPart, VarargExpression,
    FunctionExpression, FunctionBody, FunctionParameter,
    TableExpression, TableField, ArrayExpression,
    BinaryExpression, UnaryExpression, MemberExpression, IndexExpression,
    CallExpression, MethodCallExpression, ParenthesizedExpression,
    TypeAssertionExpression, AsConstExpression, IfElseExpression, ErrorExpression,
    TypeReference, TypeLiteralString, TypeLiteralBoolean, TypeLiteralNumber, TableTypeNode,
    ArrayTypeNode, TupleTypeNode,
    TableTypeProperty, FunctionTypeNode, FunctionTypeParameter,
    UnionTypeNode, IntersectionTypeNode, SatisfiesExpression,
    ParenthesizedTypeNode, TypeofTypeNode, VariadicTypeNode, TypePackNode,
} from "@ast/nodes"

export class ParseError extends Error {
    constructor(message: string, public line: number, public column: number) {
        super(`${message} (${line}:${column})`)
    }
}

/** Thrown by `error()` in recovery mode and caught at the nearest statement
 *  boundary. Internal — never escapes the parser. */
class ParseRecover extends Error {}

// ------------------------------------------------------------
// Span helpers
// ------------------------------------------------------------

interface Span {
    line: { start: number; end: number }
    column: { start: number; end: number }
}

function spanFrom(start: Span, end: Span): Span {
    return {
        line: { start: start.line.start, end: end.line.end },
        column: { start: start.column.start, end: end.column.end },
    }
}

/** Move a tree parsed from a fragment to where that fragment sits in the file:
 *  `${a}` inside a template is parsed on its own, from 1:1. */
function shiftSpans<T>(node: T, line: number, column: number): T {
    const visit = (value: unknown): void => {
        if (!value || typeof value !== "object") return
        if (Array.isArray(value)) {
            for (const item of value) visit(item)
            return
        }
        const span = value as { line?: { start: number; end: number }; column?: { start: number; end: number } }
        if (span.line && span.column) {
            // Only the fragment's first line starts where the `${` does.
            if (span.column.start !== undefined && span.line.start === 1) span.column.start += column - 1
            if (span.column.end !== undefined && span.line.end === 1) span.column.end += column - 1
            span.line.start += line - 1
            span.line.end += line - 1
        }
        for (const child of Object.values(value)) visit(child)
    }
    visit(node)
    return node
}

/** An Identifier node for a name token. */
function tokenIdentifier(t: Span & { value?: unknown }): Identifier {
    return { type: "Identifier", name: t.value as string, ...spanFrom(t, t) }
}

/** An Identifier for a name that starts the node at `at` — for nodes built
 *  after the name token is gone, which still know where they begin. */
function nameIdentifier(name: string, at: Span): Identifier {
    return {
        type: "Identifier", name,
        line: { start: at.line.start, end: at.line.start },
        column: { start: at.column.start, end: at.column.start + name.length },
    }
}

// ------------------------------------------------------------
// Operator precedence
// ------------------------------------------------------------

export const BINARY_PRECEDENCE: Record<string, number> = {
    "or": 1,
    "and": 2,
    "<": 3, ">": 3, "<=": 3, ">=": 3, "~=": 3, "==": 3,
    "..": 4,
    "+": 5, "-": 5,
    "*": 6, "/": 6, "//": 6, "%": 6,
    "^": 8,
}
export const RIGHT_ASSOCIATIVE = new Set(["..", "^"])
export const UNARY_PRECEDENCE = 7

export const COMPOUND_ASSIGN_OPS = new Set(["+=", "-=", "*=", "/=", "//=", "%=", "^=", "..="])

// ============================================================
// Parser
// ============================================================

export interface ParserOptions {
    /** When true, `parseProgram` records syntax errors in `.errors` and
     *  synchronizes to the next statement boundary instead of throwing on the
     *  first one. The returned AST has an `ErrorStatement` wherever a statement
     *  could not be parsed. */
    recover?: boolean
    /** Recovery only: read where a block ends from indentation when an `end`
     *  is missing — a line indented no deeper than the line that opened the
     *  block is past it. Valid code never needs this; `parseWithRecovery`
     *  reparses with it when the first pass found an `end` missing. */
    indentation?: boolean
}

/** Keywords that start a statement or end a block: no expression contains one
 *  outside a function, so skipping a broken expression stops there. */
const STATEMENT_KEYWORDS = new Set([
    "const", "let", "while", "for", "return", "do", "repeat", "break", "continue",
    "import", "export", "end", "else", "elseif", "until", "then",
])

export class Parser {
    private tokens: Token[]
    private cursor = 0
    private recover: boolean
    private indentation: boolean
    /** Populated in recovery mode. */
    readonly errors: ParseError[] = []
    /** Recovery found a block without its `end`. */
    missingEnd = false
    /** The column of the first token on each line, for `indentation`. */
    private lineIndent?: Map<number, number>

    constructor(tokens: Token[], options: ParserOptions = {}) {
        this.tokens = tokens
        this.recover = options.recover ?? false
        this.indentation = this.recover && (options.indentation ?? false)
    }

    private current(): Token {
        return this.tokens[this.cursor]
    }

    private peek(offset: number): Token {
        return this.tokens[Math.min(this.cursor + offset, this.tokens.length - 1)]
    }

    private previous(): Token {
        return this.tokens[this.cursor - 1]
    }

    private isAtEnd(): boolean {
        return this.current().type === "EOF"
    }

    private advance(): Token {
        const t = this.current()
        if (t.type !== "EOF") this.cursor++
        return t
    }

    private checkType(type: Token["type"]): boolean {
        return this.current().type === type
    }

    private checkKeyword(value: string): boolean {
        const t = this.current()
        return t.type === "Keyword" && (t as any).value === value
    }

    private checkOperator(value: string): boolean {
        const t = this.current()
        return t.type === "Operator" && (t as any).value === value
    }

    private checkPunctuator(value: string): boolean {
        const t = this.current()
        return t.type === "Punctuator" && (t as any).value === value
    }

    /** Match a word by spelling whether the lexer classified it as an
     *  identifier or a hard keyword (`as` is a keyword because of `as const`,
     *  but it is also the mapped-type key-remapping word). */
    private checkWord(value: string): boolean {
        const t = this.current()
        return (t.type === "Identifier" || t.type === "Keyword") &&
            (t as { value?: unknown }).value === value
    }

    private checkPunctuatorAt(offset: number, value: string): boolean {
        const t = this.peek(offset)
        return t.type === "Punctuator" && (t as { value?: unknown }).value === value
    }

    private checkIdentifierValue(value: string): boolean {
        const t = this.current()
        return t.type === "Identifier" && (t as any).value === value
    }

    private matchKeyword(value: string): boolean {
        if (this.checkKeyword(value)) { this.advance(); return true }
        return false
    }

    private matchOperator(value: string): boolean {
        if (this.checkOperator(value)) { this.advance(); return true }
        return false
    }

    private matchPunctuator(value: string): boolean {
        if (this.checkPunctuator(value)) { this.advance(); return true }
        return false
    }

    private expectKeyword(value: string): Token {
        if (!this.checkKeyword(value)) this.error(`Expected keyword '${value}'`)
        return this.advance()
    }

    private expectOperator(value: string): Token {
        if (!this.checkOperator(value)) this.error(`Expected '${value}'`)
        return this.advance()
    }

    private expectPunctuator(value: string): Token {
        if (!this.checkPunctuator(value)) this.error(`Expected '${value}'`)
        return this.advance()
    }

    private expectIdentifier(): Token & { value: string } {
        if (!this.checkType("Identifier")) this.error(`Expected identifier`)
        return this.advance() as Token & { value: string }
    }

    private error(message: string): never {
        const t = this.current()
        const err = new ParseError(`${message}, got '${this.describeToken(t)}'`, t.line.start, t.column.start)
        if (this.recover) {
            this.record(err)
            throw new ParseRecover(err.message)
        }
        throw err
    }

    // ============================================================
    // Recovery
    // ============================================================
    //
    // In recovery mode a syntax error costs as little of the tree as it can.
    // A broken expression becomes an `ErrorExpression` where it stood; a broken
    // field, element or argument is skipped up to the next `,`; a missing `)`,
    // `}`, `then`, `do` or `end` is recorded and parsing goes on as if it were
    // there. Only what none of these cover abandons a whole statement.

    /** An error at the position of the one before it is the same problem seen
     *  again, and is not recorded twice. */
    private record(error: ParseError): void {
        const last = this.errors[this.errors.length - 1]
        if (last && last.line === error.line && last.column === error.column) return
        this.errors.push(error)
    }

    /** Record an error without abandoning what is being parsed. */
    private softError(message: string): void {
        const t = this.current()
        this.record(new ParseError(`${message}, got '${this.describeToken(t)}'`, t.line.start, t.column.start))
    }

    /** `parse()`; in recovery mode, when it fails, skip to where parsing can go
     *  on and return `fallback` instead. */
    private attempt<T>(parse: () => T, stop: () => boolean, fallback: (start: Token, from: number) => T): T {
        if (!this.recover) return parse()
        const from = this.cursor
        const start = this.current()
        try {
            return parse()
        } catch (e) {
            if (e instanceof ParseError) this.record(e)
            else if (!(e instanceof ParseRecover)) throw e
            this.skip(stop, from, "expression")
            return fallback(start, from)
        }
    }

    /** An expression, or an `ErrorExpression` over what could not be parsed. */
    private expressionOr(stop: () => boolean): Expression {
        return this.attempt(() => this.parseExpression(), stop, (start, from) => this.errorExpression(start, from))
    }

    private expressionListOr(stop: () => boolean): Expression[] {
        const item = (): Expression => this.expressionOr(() => stop() || this.checkPunctuator(","))
        const list = [item()]
        while (this.matchPunctuator(",")) list.push(item())
        return list
    }

    /** A type annotation, or none when it could not be parsed. */
    private typeOr(stop: () => boolean): TypeNode | undefined {
        return this.attempt<TypeNode | undefined>(() => this.parseType(), stop, () => undefined)
    }

    private errorExpression(start: Token, from: number): ErrorExpression {
        if (this.cursor > from) return { type: "ErrorExpression", ...spanFrom(start, this.previous()) }
        return {
            type: "ErrorExpression",
            line: { start: start.line.start, end: start.line.start },
            column: { start: start.column.start, end: start.column.start },
        }
    }

    /** A closing bracket; in recovery mode a missing one is recorded and the
     *  construct ends where it is. */
    private expectCloser(value: string): void {
        if (this.matchPunctuator(value)) return
        if (!this.recover) this.error(`Expected '${value}'`)
        this.softError(`Expected '${value}'`)
    }

    /** `then` / `do` / `in`; in recovery mode a missing one is recorded and
     *  what follows is read as if it were there. */
    private expectKeywordSoft(value: string): void {
        if (this.matchKeyword(value)) return
        if (!this.recover) this.error(`Expected keyword '${value}'`)
        this.softError(`Expected keyword '${value}'`)
    }

    /** The `end` of the block `opener` began. */
    private expectEnd(opener: Token): void {
        if (this.checkKeyword("end") && !this.endBelongsOutside(opener)) {
            this.advance()
            return
        }
        if (!this.recover) this.error("Expected keyword 'end'")
        this.softError(`Expected 'end' to close '${this.describeToken(opener)}' on line ${opener.line.start}`)
        this.missingEnd = true
    }

    /** Indentation mode: an `end` indented less than the line that opened the
     *  block closes something outside it. */
    private endBelongsOutside(opener: Token): boolean {
        if (!this.indentation) return false
        const t = this.current()
        return t.line.start > opener.line.start && t.column.start < this.indentOf(opener)
    }

    /** Indentation mode: a statement indented no deeper than the line that
     *  opened the block is past the block. */
    private dedentedPast(opener: Token | undefined): boolean {
        if (!this.indentation || !opener) return false
        const t = this.current()
        return t.line.start > opener.line.start && t.column.start <= this.indentOf(opener)
    }

    private indentOf(token: Token): number {
        if (!this.lineIndent) {
            this.lineIndent = new Map()
            for (const t of this.tokens) {
                if (!this.lineIndent.has(t.line.start)) this.lineIndent.set(t.line.start, t.column.start)
            }
        }
        return this.lineIndent.get(token.line.start) ?? token.column.start
    }

    /** Is the current token on a later line than the one before it? */
    private onNewLine(): boolean {
        const previous = this.previous()
        return previous !== undefined && this.current().line.start > previous.line.end
    }

    /** Recovery: move past what could not be parsed.
     *
     *  Skipping stops at a token `stop` accepts, at a bracket closing something
     *  opened before the skip, or at a keyword that starts a statement. The
     *  tokens from `from` on — including those the failed attempt already
     *  consumed — count towards nesting, so a bracket or a `function ... end`
     *  is skipped whole and an `end` or `}` inside it cannot end what encloses
     *  it. A statement keyword inside brackets but outside any function means a
     *  bracket was never closed, and it stops the skip as well. */
    private skip(stop: () => boolean, from: number, mode: "expression" | "statement"): void {
        const closers: string[] = []
        for (let i = from; i < this.cursor; i++) this.nest(this.tokens[i], closers, mode)
        while (!this.isAtEnd()) {
            if (this.stopsSkip(closers, stop, mode)) return
            const t = this.advance()
            this.nest(t, closers, mode)
            if (mode === "statement" && closers.length === 0 && t.type === "Punctuator" && t.value === ";") return
        }
    }

    private nest(t: Token, closers: string[], mode: "expression" | "statement"): void {
        const value = (t as { value?: unknown }).value
        const popTo = (closer: string): void => {
            const at = closers.lastIndexOf(closer)
            if (at >= 0) closers.length = at
        }
        if (t.type === "Punctuator") {
            if (value === "(") closers.push(")")
            else if (value === "[") closers.push("]")
            else if (value === "{") closers.push("}")
            else if (value === ")" || value === "]" || value === "}") popTo(value)
            return
        }
        if (t.type !== "Keyword") return
        // Statements live in function bodies, and at the top of a statement.
        const inBody = closers.includes("end") || closers.includes("until") || (mode === "statement" && closers.length === 0)
        switch (value) {
            case "function": closers.push("end"); return
            case "if": closers.push(inBody ? "end" : "else"); return
            case "do": if (inBody) closers.push("end"); return
            case "repeat": if (inBody) closers.push("until"); return
            case "else": if (closers[closers.length - 1] === "else") closers.pop(); return
            case "end": popTo("end"); return
            case "until": popTo("until"); return
        }
    }

    private stopsSkip(closers: string[], stop: () => boolean, mode: "expression" | "statement"): boolean {
        const t = this.current()
        const value = (t as { value?: unknown }).value
        const inFunction = closers.includes("end") || closers.includes("until")
        if (!inFunction && t.type === "Keyword" && typeof value === "string") {
            const inIfExpression = closers.includes("else") && (value === "then" || value === "elseif" || value === "else")
            if (STATEMENT_KEYWORDS.has(value) && !inIfExpression && !(mode === "statement" && value === "then")) return true
            if (mode === "statement" && closers.length === 0 &&
                (value === "if" || (value === "function" && this.peek(1).type === "Identifier"))) return true
        }
        if (closers.length) return false
        if (t.type === "Punctuator" && (value === ")" || value === "]" || value === "}")) return true
        if (mode === "statement" && t.type === "Punctuator" && value === "@") return true
        if (mode === "expression" && t.type === "Punctuator" && value === ";") return true
        return stop()
    }

    private describeToken(t: Token): string {
        if (t.type === "EOF") return "<eof>"
        if ("value" in t) return String((t as any).value)
        return t.type
    }

    // ============================================================
    // Entry point
    // ============================================================

    parseProgram(): Program {
        const start = this.current()
        const body = this.parseBlock()
        if (!this.isAtEnd()) {
            if (!this.recover) this.error("Expected end of file")
            // A stray `end` (or `else`, `until`) at the top: skip it and read on.
            while (!this.isAtEnd()) {
                this.softError("Expected end of file")
                this.advance()
                body.statements.push(...this.parseBlock().statements)
            }
            Object.assign(body, spanFrom(body, this.previous() ?? start))
        }
        return { type: "Program", body, ...spanFrom(start, this.previous() ?? start) }
    }

    // ============================================================
    // Block / Statement
    // ============================================================

    private isBlockEnd(): boolean {
        return this.isAtEnd() ||
            this.checkKeyword("end") ||
            this.checkKeyword("else") ||
            this.checkKeyword("elseif") ||
            this.checkKeyword("until")
    }

    /** `opener` is the token that began the block (`if`, `function`, ...), for
     *  indentation recovery. */
    private parseBlock(opener?: Token): Block {
        const start = this.current()
        const statements: Statement[] = []
        while (!this.isBlockEnd()) {
            if (this.matchPunctuator(";")) continue
            if (this.dedentedPast(opener)) break
            if (this.recover) {
                const at = this.cursor
                const errStart = this.current()
                try {
                    const stmt = this.parseStatement()
                    statements.push(stmt)
                    if (stmt.type === "ReturnStatement") {
                        this.matchPunctuator(";")
                        break
                    }
                } catch (e) {
                    if (e instanceof ParseRecover) {
                        // error already recorded by error()
                    } else if (e instanceof ParseError) {
                        this.record(e)
                    } else {
                        throw e
                    }
                    this.skip(() => false, at, "statement")
                    // Guarantee forward progress even if synchronize() couldn't.
                    if (this.cursor === at) {
                        if (this.isAtEnd()) break
                        this.advance()
                    }
                    statements.push({
                        type: "ErrorStatement",
                        ...spanFrom(errStart, this.previous() ?? errStart),
                    })
                }
                continue
            }
            const stmt = this.parseStatement()
            statements.push(stmt)
            if (stmt.type === "ReturnStatement") {
                this.matchPunctuator(";")
                break
            }
        }
        const end = this.previous() ?? start
        return { type: "Block", statements, ...spanFrom(start, end) }
    }

    private parseAttributes(): { attributes: string[]; start: Token } {
        const start = this.current()
        const attributes: string[] = []
        while (this.current().type === "Punctuator" && (this.current() as any).value === "@") {
            this.advance()
            attributes.push(this.expectIdentifier().value)
        }
        return { attributes, start }
    }

    private parseStatement(): Statement {
        const t = this.current()

        if (t.type === "Punctuator" && (t as any).value === "@") {
            const { attributes, start } = this.parseAttributes()
            const next = this.current()
            if (next.type === "Keyword" && (next as any).value === "function") {
                const stmt = this.parseFunctionStatement()
                stmt.attributes = attributes
                stmt.line.start = start.line.start
                stmt.column.start = start.column.start
                return stmt
            }
            throw new ParseError("Expected 'function' after an attribute", next.line.start, next.column.start)
        }

        if (t.type === "Keyword") {
            switch ((t as any).value) {
                case "const":
                case "let": return this.parseVariableDeclaration()
                case "if": return this.parseIfStatement()
                case "while": return this.parseWhileStatement()
                case "repeat": return this.parseRepeatStatement()
                case "do": return this.parseDoStatement()
                case "for": return this.parseForStatement()
                case "function": return this.parseFunctionStatement()
                case "return": return this.parseReturnStatement()
                case "import": return this.parseImportStatement()
                case "export": return this.parseExportStatement()
                case "break": {
                    this.advance()
                    return { type: "BreakStatement", ...spanFrom(t, this.previous()) } as BreakStatement
                }
                case "continue": {
                    this.advance()
                    return { type: "ContinueStatement", ...spanFrom(t, this.previous()) } as ContinueStatement
                }
            }
        }

        // Lua's `local`, out of habit: say what luaut writes, and read it as `let`.
        if (this.recover && t.type === "Identifier" && (t as any).value === "local" &&
            (this.peek(1).type === "Identifier" || this.checkPunctuatorAt(1, "{") || this.checkPunctuatorAt(1, "["))) {
            this.softError("luaut has no 'local'; declare with 'const' or 'let'")
            return this.parseVariableDeclaration("let")
        }

        if (t.type === "Identifier" && (t as any).value === "type" &&
            this.peek(1).type === "Identifier") {
            return this.parseTypeAliasStatement()
        }

        if (t.type === "Identifier" && (t as any).value === "declare") {
            const p1 = this.peek(1)
            // `class` is a soft keyword: `declare class: T` still declares a
            // global named `class`.
            if (p1.type === "Identifier" && (p1 as any).value === "class" &&
                this.peek(2).type === "Identifier") {
                return this.parseDeclareClassStatement()
            }
            if (p1.type === "Identifier" ||
                (p1.type === "Keyword" && (p1 as any).value === "function")) {
                return this.parseDeclareStatement()
            }
        }

        return this.parseExpressionStatement()
    }

    // `declare NAME: T` / `declare function NAME<G>(params): R` — ambient
    // declarations for a `.d.luaut` definitions file. `declare type X = ...`
    // is written as a plain `type X = ...` (aliases are ambient already).
    private parseDeclareStatement(): DeclareStatement {
        const start = this.current()
        this.advance() // 'declare'

        if (this.matchKeyword("function")) {
            const nameTok = this.expectIdentifier()
            const head = this.parseFunctionHead()
            // Each parameter keeps its own span (and its name's), so tools can
            // point at `name` in `declare function f(name: string)` rather than
            // at the whole statement.
            const params: FunctionTypeParameter[] = head.params.map(p => ({
                type: "FunctionTypeParameter",
                name: p.name || undefined,
                id: p.name ? nameIdentifier(p.name, p) : undefined,
                optional: p.optional,
                typeAnnotation: p.typeAnnotation ?? { type: "TypeReference", base: "any", typeArguments: [], line: p.line, column: p.column },
                line: p.line,
                column: p.column,
            }))
            const valueType: FunctionTypeNode = {
                type: "FunctionTypeNode",
                generics: head.generics,
                params,
                hasVarargs: head.hasVarargs,
                varargType: head.varargTypeAnnotation,
                returnType: head.returnType ??
                    { type: "TypeReference", base: head.predicate ? "boolean" : "unknown", typeArguments: [], ...spanFrom(start, start) },
                predicate: head.predicate,
                ...spanFrom(start, this.previous()),
            }
            return { type: "DeclareStatement", name: nameTok.value as string, id: tokenIdentifier(nameTok), valueType, ...spanFrom(start, this.previous()) }
        }

        const nameTok = this.expectIdentifier()
        this.expectPunctuator(":")
        const valueType = this.parseType()
        return { type: "DeclareStatement", name: nameTok.value as string, id: tokenIdentifier(nameTok), valueType, ...spanFrom(start, this.previous()) }
    }

    /** A declared type's name. It may be qualified once — `Enum.Material` —
     *  which is how a definitions file names types under a namespace, and how
     *  they are then written (`const m: Enum.Material`). */
    private parseTypeName(): Identifier {
        const first = this.expectIdentifier()
        if (this.checkPunctuator(".") && this.peek(1).type === "Identifier") {
            this.advance()
            const second = this.expectIdentifier()
            return { type: "Identifier", name: `${first.value}.${second.value}`, ...spanFrom(first, second) }
        }
        return tokenIdentifier(first)
    }

    // `declare class Name extends Base { member: T, ... }`
    private parseDeclareClassStatement(): DeclareClassStatement {
        const start = this.current()
        this.advance() // 'declare'
        this.advance() // 'class'
        const name = this.parseTypeName()
        let superclass: TypeReference | undefined
        if (this.checkIdentifierValue("extends")) {
            this.advance()
            const base = this.parseType()
            if (base.type !== "TypeReference") this.error("A class can only extend another class, written by name")
            superclass = base as TypeReference
        }
        if (!this.checkPunctuator("{")) this.error("Expected '{' to start the class body")
        const body = this.parseTableType()
        if (body.type !== "TableTypeNode") this.error("A class body lists members ('name: T'), not a mapped type")
        return { type: "DeclareClassStatement", name, superclass, body: body as TableTypeNode, ...spanFrom(start, this.previous()) }
    }

    // `import { a, b as c } from '...'` / `import Default from '...'` /
    // `import Default, { a } from '...'`. Compiled away entirely by the
    // bundler — never survives into emitted Luau.
    private parseImportStatement(): ImportStatement {
        const start = this.current()
        this.advance() // consume 'import'

        // `import type { A } from` / `import type D from` / `import type * as M from`.
        // `import type from "./m"` is still a default import named `type`.
        const next = this.peek(1)
        const isTypeOnly = this.checkIdentifierValue("type") && (
            (next.type === "Punctuator" && (next as any).value === "{") ||
            (next.type === "Operator" && (next as any).value === "*") ||
            next.type === "Identifier")
        if (isTypeOnly) this.advance()

        let defaultImport: Identifier | undefined
        const specifiers: ImportSpecifier[] = []

        let namespaceImport: Identifier | undefined
        // `{ a, b as c }` or `* as Module`, after an optional default import.
        const parseBindings = (): void => {
            if (this.checkOperator("*")) {
                this.advance()
                if (!this.checkKeyword("as")) this.error("Expected 'as' after 'import *'")
                this.advance()
                namespaceImport = this.parseIdentifier()
                return
            }
            this.expectPunctuator("{")
            this.parseImportSpecifierList(specifiers)
            this.expectPunctuator("}")
        }
        if (this.checkType("Identifier")) {
            const nameTok = this.expectIdentifier()
            defaultImport = { type: "Identifier", name: nameTok.value as string, ...spanFrom(nameTok, nameTok) }
            if (this.matchPunctuator(",")) parseBindings()
        } else {
            parseBindings()
        }

        if (!this.checkKeyword("from")) {
            this.error("Expected 'from' in import statement")
        }
        this.advance() // consume 'from'

        const sourceTok = this.current()
        if (sourceTok.type !== "Literal" || (sourceTok as any).kind !== "string") {
            this.error("Expected string literal module path after 'from'")
        }
        this.advance()
        const source: StringLiteral = {
            type: "StringLiteral",
            value: (sourceTok as any).value,
            raw: (sourceTok as any).raw,
            ...spanFrom(sourceTok, sourceTok),
        }

        return {
            type: "ImportStatement", defaultImport, namespaceImport, specifiers, source,
            isTypeOnly: isTypeOnly || undefined,
            ...spanFrom(start, this.previous()),
        }
    }

    private parseImportSpecifierList(out: ImportSpecifier[]): void {
        if (this.checkPunctuator("}")) return
        out.push(this.parseImportSpecifier())
        while (this.matchPunctuator(",")) {
            if (this.checkPunctuator("}")) break // trailing comma
            out.push(this.parseImportSpecifier())
        }
    }

    private parseImportSpecifier(): ImportSpecifier {
        const importedTok = this.expectIdentifier()
        const imported: Identifier = { type: "Identifier", name: importedTok.value as string, ...spanFrom(importedTok, importedTok) }
        let local = imported
        if (this.checkKeyword("as")) {
            this.advance()
            const localTok = this.expectIdentifier()
            local = { type: "Identifier", name: localTok.value as string, ...spanFrom(localTok, localTok) }
        }
        return { type: "ImportSpecifier", imported, local, ...spanFrom(imported, local) }
    }

    /** `from "<path>"`: consumes `from` and the module string. */
    private parseModuleSource(): StringLiteral {
        this.advance() // 'from'
        const sourceTok = this.current()
        if (sourceTok.type !== "Literal" || (sourceTok as any).kind !== "string") {
            this.error("Expected string literal module path after 'from'")
        }
        this.advance()
        return {
            type: "StringLiteral",
            value: (sourceTok as any).value,
            raw: (sourceTok as any).raw,
            ...spanFrom(sourceTok, sourceTok),
        }
    }

    // `export const ...` / `export let ...` / `export function ...` /
    // `export type ...` / `export default <expr>`
    private parseExportStatement():
        ExportStatement | ExportTypeAliasStatement | ExportDefaultStatement | ExportNamedStatement | ExportAllStatement {
        const start = this.current()
        this.advance() // consume 'export'

        if (this.checkIdentifierValue("default")) {
            this.advance()
            const declaration = this.parseExpression(0)
            return { type: "ExportDefaultStatement", declaration, ...spanFrom(start, this.previous()) }
        }

        if (this.checkIdentifierValue("type") && this.peek(1).type === "Identifier") {
            const alias = this.parseTypeAliasStatement()
            return { type: "ExportTypeAliasStatement", alias, ...spanFrom(start, this.previous()) }
        }

        if (this.checkKeyword("const") || this.checkKeyword("let")) {
            const declaration = this.parseVariableDeclaration()
            return { type: "ExportStatement", declaration, ...spanFrom(start, this.previous()) }
        }

        if (this.checkKeyword("function")) {
            const declaration = this.parseFunctionStatement(true)
            if (declaration.type !== "FunctionDeclaration") this.error("An exported function needs a plain name: 'export function name()'")
            return { type: "ExportStatement", declaration: declaration as FunctionDeclaration, ...spanFrom(start, this.previous()) }
        }

        // `export { a, b as c }` / `export { a } from "./x"`
        if (this.checkPunctuator("{")) {
            this.advance()
            const specifiers: ExportSpecifier[] = []
            while (!this.checkPunctuator("}")) {
                const local = this.parseIdentifier()
                let exported = local
                if (this.checkKeyword("as")) {
                    this.advance()
                    exported = this.parseIdentifier()
                }
                specifiers.push({ type: "ExportSpecifier", local, exported, ...spanFrom(local, exported) })
                if (!this.matchPunctuator(",")) break
            }
            this.expectPunctuator("}")
            const source = this.checkKeyword("from") ? this.parseModuleSource() : undefined
            return { type: "ExportNamedStatement", specifiers, source, ...spanFrom(start, this.previous()) }
        }

        // `export * from "./x"`
        if (this.checkOperator("*")) {
            this.advance()
            if (!this.checkKeyword("from")) this.error("Expected 'from' after 'export *'")
            const source = this.parseModuleSource()
            return { type: "ExportAllStatement", source, ...spanFrom(start, this.previous()) }
        }

        this.error("Expected 'const', 'let', 'function', 'type', 'default', '{' or '*' after 'export'")
    }

    // `const x = ...` / `let x, y = ...`.
    // luaut has no `local` — `const` bindings are immutable, `let` mutable.
    /** `kind` reads the leading word as that keyword (recovery's `local`). */
    private parseVariableDeclaration(as?: "let"): VariableDeclaration {
        const start = this.current()
        const word = (this.advance() as any).value as "const" | "let"
        const kind = as ?? word

        if (this.checkKeyword("function")) {
            this.error(`A function is declared as 'function name()'; '${kind}' does not apply to functions`)
        }

        const names = [this.parseBindingTarget(true)]
        while (this.matchPunctuator(",")) {
            names.push(this.parseBindingTarget(true))
        }

        let init: Expression[] = []
        if (this.matchOperator("=")) {
            init = this.expressionListOr(() => false)
        } else if (kind === "const") {
            // Keep the name declared: everything after it refers to it.
            if (!this.recover) this.error("'const' declaration requires an initializer")
            this.softError("'const' declaration requires an initializer")
        }

        return { type: "VariableDeclaration", kind, names, init, ...spanFrom(start, this.previous()) }
    }

    private parseIfStatement(): IfStatement {
        const start = this.current()
        this.expectKeyword("if")
        const clauses: IfClause[] = []

        const untilThen = (): boolean => this.checkKeyword("then")
        const cond = this.expressionOr(untilThen)
        this.expectKeywordSoft("then")
        const body = this.parseBlock(start)
        clauses.push({ type: "IfClause", condition: cond, body, ...spanFrom(cond, this.previous()) })

        while (this.checkKeyword("elseif")) {
            const clauseStart = this.current()
            this.advance()
            const c = this.expressionOr(untilThen)
            this.expectKeywordSoft("then")
            const b = this.parseBlock(start)
            clauses.push({ type: "IfClause", condition: c, body: b, ...spanFrom(clauseStart, this.previous()) })
        }

        let alternate: Block | undefined
        if (this.matchKeyword("else")) {
            alternate = this.parseBlock(start)
        }

        this.expectEnd(start)
        return { type: "IfStatement", clauses, alternate, ...spanFrom(start, this.previous()) }
    }

    private parseWhileStatement(): WhileStatement {
        const start = this.current()
        this.expectKeyword("while")
        const condition = this.expressionOr(() => this.checkKeyword("do"))
        this.expectKeywordSoft("do")
        const body = this.parseBlock(start)
        this.expectEnd(start)
        return { type: "WhileStatement", condition, body, ...spanFrom(start, this.previous()) }
    }

    private parseRepeatStatement(): RepeatStatement {
        const start = this.current()
        this.expectKeyword("repeat")
        const body = this.parseBlock(start)
        let condition: Expression
        if (this.checkKeyword("until") || !this.recover) {
            this.expectKeyword("until")
            condition = this.expressionOr(() => false)
        } else {
            this.softError(`Expected 'until' to close 'repeat' on line ${start.line.start}`)
            this.missingEnd = true
            condition = this.errorExpression(this.current(), this.cursor)
        }
        return { type: "RepeatStatement", body, condition, ...spanFrom(start, this.previous()) }
    }

    private parseDoStatement(): DoStatement {
        const start = this.current()
        this.expectKeyword("do")
        const body = this.parseBlock(start)
        this.expectEnd(start)
        return { type: "DoStatement", body, ...spanFrom(start, this.previous()) }
    }

    private parseForStatement(): NumericForStatement | GenericForStatement {
        const start = this.current()
        this.expectKeyword("for")

        const first = this.parseBindingTarget(true)

        const untilDo = (): boolean => this.checkKeyword("do")
        if (first.type === "IdentifierPattern" && this.matchOperator("=")) {
            const from = this.expressionOr(() => untilDo() || this.checkPunctuator(","))
            this.expectPunctuator(",")
            const to = this.expressionOr(() => untilDo() || this.checkPunctuator(","))
            let step: Expression | undefined
            if (this.matchPunctuator(",")) {
                step = this.expressionOr(untilDo)
            }
            this.expectKeywordSoft("do")
            const body = this.parseBlock(start)
            this.expectEnd(start)
            return {
                type: "NumericForStatement",
                variable: this.identifierPatternToTypedIdentifier(first),
                start: from, end: to, step, body,
                ...spanFrom(start, this.previous()),
            }
        }

        const variables: BindingTarget[] = [first]
        while (this.matchPunctuator(",")) {
            variables.push(this.parseBindingTarget(true))
        }
        this.expectKeyword("in")
        const iterators = this.expressionListOr(untilDo)
        this.expectKeywordSoft("do")
        const body = this.parseBlock(start)
        this.expectEnd(start)
        return {
            type: "GenericForStatement",
            variables, iterators, body,
            ...spanFrom(start, this.previous()),
        }
    }

    /** `function name() end` declares `name`; `function a.b() end` and
     *  `function T:m() end` define a member. */
    /** `exported` — the `export` before this `function` has been consumed, so
     *  each overload signature after it must carry one as well. */
    private parseFunctionStatement(exported = false): FunctionDeclaration | FunctionDeclarationStatement {
        const start = this.current()
        this.expectKeyword("function")
        const target = this.parseFunctionName()
        const isMethod = target.method !== undefined
        // Overloads are only recognized for a plain `function name(...)` — not
        // `function a.b()` or `function T:m()`.
        const simpleName = !isMethod && target.path.length === 0 ? target.base.name : undefined

        const signatures: FunctionSignature[] = []
        while (true) {
            const head = this.parseFunctionHead()
            if (simpleName !== undefined && this.isOverloadContinuation(simpleName)) {
                signatures.push(this.headToSignature(head))
                // As in TypeScript, every signature of an overload set agrees
                // about `export` — the set is one declaration.
                const nextExported = this.matchKeyword("export")
                if (nextExported !== exported) {
                    this.problem("Overload signatures must all be exported or non-exported")
                }
                this.expectKeyword("function")
                this.parseFunctionName() // consume the repeated name
                continue
            }
            const func = this.headToBody(head, start)
            if (simpleName !== undefined) {
                return {
                    type: "FunctionDeclaration", name: target.base, func,
                    signatures: signatures.length ? signatures : undefined,
                    ...spanFrom(start, this.previous()),
                }
            }
            if (isMethod) {
                // `function T:m(a)` is `function T.m(self, a)`. The `self`
                // parameter is made real here so every later pass — scopes,
                // types, arity — sees an ordinary first parameter.
                func.params.unshift({ type: "FunctionParameter", name: "self", ...spanFrom(target, target) })
                func.isMethod = true
            }
            return {
                type: "FunctionDeclarationStatement", target, isMethod, func,
                signatures: signatures.length ? signatures : undefined,
                ...spanFrom(start, this.previous()),
            }
        }
    }

    /** After a bodyless function head, is the next token the start of another
     *  declaration for the same simple `name` (making the head an overload
     *  signature rather than an implementation)? */
    private isOverloadContinuation(name: string): boolean {
        const named = (offset: number): boolean =>
            this.peek(offset).type === "Identifier" && (this.peek(offset) as { value?: unknown }).value === name
        if (this.checkKeyword("function")) return named(1)
        // `export function f(...)` repeated: an exported overload set.
        return this.checkKeyword("export") &&
            this.peek(1).type === "Keyword" && (this.peek(1) as { value?: unknown }).value === "function" &&
            named(2)
    }

    /** A mistake that does not stop the parse: refused outside recovery, where
     *  the compiler must not accept it, and recorded inside. The message says
     *  what is wrong on its own — no token is appended. */
    private problem(message: string): void {
        const t = this.current()
        const error = new ParseError(message, t.line.start, t.column.start)
        if (!this.recover) throw error
        this.record(error)
    }

    private parseFunctionName(): FunctionName {
        const start = this.current()
        const base = this.parseIdentifier()
        const path: Identifier[] = []
        while (this.checkPunctuator(".")) {
            this.advance()
            path.push(this.parseIdentifier())
        }
        let method: Identifier | undefined
        if (this.matchPunctuator(":")) {
            method = this.parseIdentifier()
        }
        return { type: "FunctionName", base, path, method, ...spanFrom(start, this.previous()) }
    }

    private isExpressionStart(): boolean {
        const t = this.current()
        if (t.type === "Literal" || t.type === "InterpolatedString" || t.type === "Identifier") return true
        if (t.type === "Keyword") {
            return ["function", "if", "not", "nil", "true", "false"].includes((t as any).value)
        }
        if (t.type === "Operator") {
            return ["...", "-", "#"].includes((t as any).value)
        }
        if (t.type === "Punctuator") {
            const v = (t as any).value
            return v === "(" || v === "{" || v === "["
        }
        return false
    }

    private parseReturnStatement(): ReturnStatement {
        const start = this.current()
        this.expectKeyword("return")
        let args: Expression[] = []
        if (this.isExpressionStart()) {
            args = this.expressionListOr(() => false)
        }
        return { type: "ReturnStatement", arguments: args, ...spanFrom(start, this.previous()) }
    }

    private parseTypeAliasStatement(): TypeAliasStatement {
        const start = this.current()
        this.advance()
        const name = this.parseTypeName()

        let generics: GenericTypeParameter[] = []
        if (this.checkOperator("<")) {
            generics = this.parseGenericTypeParameterList()
        }
        this.expectOperator("=")
        const definition = this.parseType()
        return { type: "TypeAliasStatement", name, generics, definition, ...spanFrom(start, this.previous()) }
    }

    private parseExportTypeAliasStatement(): ExportTypeAliasStatement {
        const start = this.current()
        this.advance()
        const alias = this.parseTypeAliasStatement()
        return { type: "ExportTypeAliasStatement", alias, ...spanFrom(start, this.previous()) }
    }

    private parseExpressionStatement(): Statement {
        const start = this.current()

        // Destructuring assignment: `{a, b} = t` / `[a, b] = t`. A statement
        // can't otherwise begin with `{` or `[`, so this is unambiguous (no
        // parens required, unlike JS).
        if (this.checkPunctuator("{") || this.checkPunctuator("[")) {
            const targets: (Expression | ObjectPattern | ArrayPattern)[] = [
                this.checkPunctuator("{") ? this.parseObjectPattern() : this.parseArrayPattern(),
            ]
            while (this.matchPunctuator(",")) {
                targets.push(this.parseAssignTarget())
            }
            this.expectOperator("=")
            const values = this.expressionListOr(() => false)
            return { type: "AssignmentStatement", targets, values, ...spanFrom(start, this.previous()) }
        }

        const first = this.parsePrefixExpression()

        if (this.checkOperator("=") || this.checkPunctuator(",")) {
            const targets: (Expression | ObjectPattern | ArrayPattern)[] = [first]
            while (this.matchPunctuator(",")) {
                targets.push(this.parseAssignTarget())
            }
            for (const target of targets) this.rejectOptionalTarget(target)
            this.expectOperator("=")
            const values = this.expressionListOr(() => false)
            return { type: "AssignmentStatement", targets, values, ...spanFrom(start, this.previous()) }
        }

        const t = this.current()
        if (t.type === "Operator" && COMPOUND_ASSIGN_OPS.has((t as any).value)) {
            this.rejectOptionalTarget(first)
            const op = (this.advance() as any).value
            const value = this.expressionOr(() => false)
            return {
                type: "CompoundAssignmentStatement",
                operator: op,
                target: first,
                value,
                ...spanFrom(start, this.previous()),
            }
        }

        if (first.type === "CallExpression" || first.type === "MethodCallExpression") {
            return { type: "CallStatement", expression: first, ...spanFrom(start, this.previous()) }
        }

        this.error("Unexpected expression statement (expected assignment or call)")
    }

    // ============================================================
    // Expressions
    // ============================================================

    private parseExpressionList(): Expression[] {
        const list = [this.parseExpression()]
        while (this.matchPunctuator(",")) {
            list.push(this.parseExpression())
        }
        return list
    }

    private isBinaryOperator(): string | null {
        const t = this.current()
        if (t.type === "Keyword" && ((t as any).value === "and" || (t as any).value === "or")) {
            return (t as any).value
        }
        if (t.type === "Operator" && (t as any).value in BINARY_PRECEDENCE) {
            return (t as any).value
        }
        return null
    }

    /** Is the `:` at the cursor the start of a method call (`obj:name(...)`)
     *  rather than the `:` of a ternary (`cond ? obj : other`)? Lua requires a
     *  method call to be called, so the answer is exact rather than heuristic:
     *  `:` Identifier followed by one of Lua's call forms. */
    private startsMethodCall(offset = 0): boolean {
        if (this.peek(offset + 1).type !== "Identifier") return false
        const after = this.peek(offset + 2)
        if (after.type === "Punctuator") {
            const v = String((after as { value?: unknown }).value)
            return v === "(" || v === "{"
        }
        if (after.type === "InterpolatedString") return true
        if (after.type === "Literal" && (after as { kind?: unknown }).kind === "string") return true
        // `obj:m<T>(...)` — a method call too, if a call really follows the
        // type arguments. `cond ? obj : name < 3` must stay a ternary.
        if (after.type === "Operator" && String((after as { value?: unknown }).value) === "<") {
            const save = this.cursor
            this.cursor += offset + 2
            const found = this.tryCallTypeArguments() !== undefined
            this.cursor = save
            return found
        }
        return false
    }

    /** Does the next token start right where the current one ends? */
    private touchesNext(): boolean {
        const current = this.current()
        const next = this.peek(1)
        return current.line.end === next.line.start && current.column.end === next.column.start
    }

    /** `a?.b = 1` cannot be written: there may be nothing to assign to. */
    private rejectOptionalTarget(target: Expression | ObjectPattern | ArrayPattern): void {
        for (let e: unknown = target; e && typeof e === "object";) {
            const node = e as { type?: string; optional?: boolean; object?: unknown; callee?: unknown }
            if (node.optional) {
                const at = target as Expression
                const err = new ParseError("An optional chain cannot be assigned to", at.line.start, at.column.start)
                if (!this.recover) throw err
                this.record(err)
                return
            }
            e = node.type === "MemberExpression" || node.type === "IndexExpression" || node.type === "MethodCallExpression"
                ? node.object
                : node.type === "CallExpression" ? node.callee : undefined
        }
    }

    private isUnaryOperator(): string | null {
        const t = this.current()
        if (t.type === "Keyword" && (t as any).value === "not") return "not"
        if (t.type === "Operator" && ((t as any).value === "-" || (t as any).value === "#")) return (t as any).value
        return null
    }

    parseExpression(minPrec = 0): Expression {
        const expr = this.parseBinaryExpression(minPrec)
        // `cond ? a : b`. Lowest precedence and right-associative, as in
        // TypeScript, so `a ? b : c ? d : e` nests to the right. It produces
        // the same `IfElseExpression` node as `if a then b else c` — one node
        // for the compiler to lower, two ways to write it.
        if (minPrec > 0 || !this.checkPunctuator("?")) return expr
        this.advance()
        const consequent = this.parseExpression()
        this.expectPunctuator(":")
        const alternate = this.parseExpression()
        return {
            type: "IfElseExpression",
            clauses: [{ condition: expr, body: consequent }],
            alternate,
            ...spanFrom(expr, alternate),
        }
    }

    private parseBinaryExpression(minPrec: number): Expression {
        let left = this.parseUnaryOrAtom()

        while (true) {
            const op = this.isBinaryOperator()
            if (!op) break
            const prec = BINARY_PRECEDENCE[op]
            if (prec < minPrec) break

            this.advance()
            const rightAssoc = RIGHT_ASSOCIATIVE.has(op)
            const nextMinPrec = rightAssoc ? prec : prec + 1
            const right = this.parseBinaryExpression(nextMinPrec)
            left = {
                type: "BinaryExpression",
                operator: op as any,
                left, right,
                ...spanFrom(left, right),
            }
        }

        return left
    }

    private parseUnaryOrAtom(): Expression {
        const op = this.isUnaryOperator()
        if (op) {
            const opTok = this.advance()
            const argument = this.parseExpression(UNARY_PRECEDENCE)
            return {
                type: "UnaryExpression",
                operator: op as any,
                argument,
                ...spanFrom(opTok, argument),
            }
        }
        return this.parseAtomWithAssertion()
    }

    private parseAtomWithAssertion(): Expression {
        let expr = this.parseAtom()
        // luaut drops Luau's `::` assertion syntax entirely in favor of `as`,
        // mirroring TypeScript. `as const` is a special case with no TypeNode
        // on the right — the checker infers the narrowest literal type itself.
        while (this.checkKeyword("as") || this.checkIdentifierValue("satisfies")) {
            // `expr satisfies T` validates without changing the type; `as T`
            // reinterprets. `satisfies` is a soft keyword.
            if (this.checkIdentifierValue("satisfies")) {
                this.advance()
                const typeAnnotation = this.parseType()
                expr = {
                    type: "SatisfiesExpression",
                    expression: expr,
                    typeAnnotation,
                    ...spanFrom(expr, typeAnnotation),
                }
                continue
            }
            this.advance()
            if (this.checkKeyword("const")) {
                const constTok = this.advance()
                expr = {
                    type: "AsConstExpression",
                    expression: expr,
                    ...spanFrom(expr, constTok),
                }
                continue
            }
            const typeAnnotation = this.parseType()
            expr = {
                type: "TypeAssertionExpression",
                expression: expr,
                typeAnnotation,
                ...spanFrom(expr, typeAnnotation),
            }
        }
        return expr
    }

    private parseAtom(): Expression {
        const t = this.current()

        if (t.type === "Literal") {
            this.advance()
            const lit = t as any
            switch (lit.kind) {
                case "nil":
                    return { type: "NilLiteral", ...spanFrom(t, t) } as NilLiteral
                case "boolean":
                    return { type: "BooleanLiteral", value: lit.value, ...spanFrom(t, t) } as BooleanLiteral
                case "number":
                    return { type: "NumberLiteral", value: lit.value, raw: lit.raw, ...spanFrom(t, t) } as NumberLiteral
                case "string":
                    return { type: "StringLiteral", value: lit.value, raw: lit.raw, ...spanFrom(t, t) } as StringLiteral
            }
        }

        if (t.type === "InterpolatedString") {
            this.advance()
            return this.buildInterpolatedString(t as any)
        }

        if (t.type === "Operator" && (t as any).value === "...") {
            this.advance()
            return { type: "VarargExpression", ...spanFrom(t, t) } as VarargExpression
        }

        if (t.type === "Keyword" && (t as any).value === "function") {
            this.advance()
            const func = this.parseFunctionBody(t)
            return { type: "FunctionExpression", func, ...spanFrom(t, this.previous()) } as FunctionExpression
        }

        if (t.type === "Keyword" && (t as any).value === "if") {
            return this.parseIfElseExpression()
        }

        if (t.type === "Punctuator" && (t as any).value === "{") {
            return this.parseTableExpression()
        }

        if (t.type === "Punctuator" && (t as any).value === "[") {
            return this.parseArrayExpression()
        }

        if (t.type === "Identifier" || (t.type === "Punctuator" && (t as any).value === "(")) {
            return this.parsePrefixExpression()
        }

        this.error("Unexpected token in expression")
    }

    private buildInterpolatedString(token: {
        parts: { kind: "string"; value: string; raw: string }[] | any
        line: any; column: any
    }): InterpolatedStringExpression {
        const parts: InterpolatedStringPart[] = []
        for (const p of (token as any).parts as any[]) {
            if (p.kind === "string") {
                parts.push({ kind: "string", value: p.value, raw: p.raw })
            } else {
                let expression: Expression
                try {
                    expression = shiftSpans(parseExpressionFromSource(p.raw), p.line, p.column)
                } catch (e) {
                    if (!this.recover || !(e instanceof ParseError || e instanceof LexError)) throw e
                    const at = token as unknown as Span
                    this.record(new ParseError(
                        `In '\${${p.raw}}': ${e.message.replace(/ \(\d+:\d+\)$/, "")}`, at.line.start, at.column.start))
                    expression = { type: "ErrorExpression", ...spanFrom(at, at) }
                }
                parts.push({ kind: "expression", expression })
            }
        }
        return { type: "InterpolatedStringExpression", parts, ...spanFrom(token as any, token as any) }
    }

    private parseIfElseExpression(): IfElseExpression {
        const start = this.current()
        this.expectKeyword("if")
        const clauses: { condition: Expression; body: Expression }[] = []
        const cond = this.parseExpression()
        this.expectKeyword("then")
        const body = this.parseExpression()
        clauses.push({ condition: cond, body })

        while (this.checkKeyword("elseif")) {
            this.advance()
            const c = this.parseExpression()
            this.expectKeyword("then")
            const b = this.parseExpression()
            clauses.push({ condition: c, body: b })
        }

        this.expectKeyword("else")
        const alternate = this.parseExpression()
        return { type: "IfElseExpression", clauses, alternate, ...spanFrom(start, this.previous()) }
    }

    private parsePrefixExpression(): Expression {
        const start = this.current()
        let base: Expression

        if (this.checkType("Identifier")) {
            base = this.parseIdentifier()
        } else if (this.matchPunctuator("(")) {
            const inner = this.parseExpression()
            this.expectPunctuator(")")
            base = { type: "ParenthesizedExpression", expression: inner, ...spanFrom(start, this.previous()) }
        } else {
            this.error("Expected identifier or '('")
        }

        while (true) {
            // `a?.b` / `a?:m()`: the `?` must touch what follows it, as one
            // token would. `?` alone still starts a ternary's middle.
            if (this.checkPunctuator("?") && this.touchesNext()) {
                const next = this.peek(1)
                const punct = next.type === "Punctuator" ? String((next as { value?: unknown }).value) : undefined
                if (punct === "." && this.peek(2).type === "Identifier") {
                    this.advance()
                    this.advance()
                    const prop = this.parseIdentifier()
                    base = { type: "MemberExpression", object: base, property: prop, optional: true, ...spanFrom(base, prop) }
                    continue
                }
                if (punct === ":" && this.startsMethodCall(1)) {
                    this.advance()
                    this.advance()
                    const method = this.parseIdentifier()
                    const typeArguments = this.tryCallTypeArguments()
                    const args = this.parseCallArguments()
                    base = {
                        type: "MethodCallExpression",
                        object: base, method, arguments: args, typeArguments, optional: true,
                        ...spanFrom(base, this.previous()),
                    }
                    continue
                }
            }
            if (this.matchPunctuator(".")) {
                if (this.recover && !this.checkType("Identifier")) {
                    // `obj.` mid-typing: the access has no name yet.
                    this.softError("Expected identifier")
                    base = { type: "ErrorExpression", ...spanFrom(base, this.previous()) }
                    break
                }
                const prop = this.parseIdentifier()
                base = { type: "MemberExpression", object: base, property: prop, ...spanFrom(base, prop) }
                continue
            }
            if (this.matchPunctuator("[")) {
                const index = this.parseExpression()
                this.expectPunctuator("]")
                base = { type: "IndexExpression", object: base, index, ...spanFrom(base, this.previous()) }
                continue
            }
            if (this.checkPunctuator(":") && this.startsMethodCall()) {
                this.advance()
                const method = this.parseIdentifier()
                const typeArguments = this.tryCallTypeArguments()
                const args = this.parseCallArguments()
                base = {
                    type: "MethodCallExpression",
                    object: base, method, arguments: args, typeArguments,
                    ...spanFrom(base, this.previous()),
                }
                continue
            }
            if (this.checkOperator("<")) {
                const typeArguments = this.tryCallTypeArguments()
                if (typeArguments) {
                    const args = this.parseCallArguments()
                    base = {
                        type: "CallExpression",
                        callee: base, arguments: args, typeArguments,
                        ...spanFrom(base, this.previous()),
                    }
                    continue
                }
            }
            if (this.startsCallArguments()) {
                const args = this.parseCallArguments()
                base = {
                    type: "CallExpression",
                    callee: base, arguments: args,
                    ...spanFrom(base, this.previous()),
                }
                continue
            }
            break
        }

        return base
    }

    /** An assignment target after the first: a prefix expression (`a.b`,
     *  `a[i]`, `a`) or a nested destructuring pattern. */
    private parseAssignTarget(): Expression | ObjectPattern | ArrayPattern {
        if (this.checkPunctuator("{")) return this.parseObjectPattern()
        if (this.checkPunctuator("[")) return this.parseArrayPattern()
        return this.parsePrefixExpression()
    }

    /** Does a call's argument list start here? Lua's three forms: `(`, a
     *  string, or a table. */
    private startsCallArguments(): boolean {
        return this.checkPunctuator("(") || this.checkPunctuator("{") ||
            this.checkType("InterpolatedString") ||
            (this.checkType("Literal") && (this.current() as { kind?: unknown }).kind === "string")
    }

    /** `f<A, B>(x)` — type arguments, when that is what this is. `a < b > (c)`
     *  is three operators, and only what follows the `>` tells them apart, so
     *  this reads ahead and puts the cursor back when the guess was wrong. */
    private tryCallTypeArguments(): (TypeNode | TypePackNode)[] | undefined {
        if (!this.checkOperator("<")) return undefined
        const start = this.cursor
        const errors = this.errors.length
        try {
            this.advance()
            const list: (TypeNode | TypePackNode)[] = [this.parseTypeArgument()]
            while (this.matchPunctuator(",") && !this.checkOperator(">")) list.push(this.parseTypeArgument())
            this.expectOperator(">")
            if (!this.startsCallArguments()) throw new ParseRecover("not a call")
            return list
        } catch (e) {
            if (!(e instanceof ParseError || e instanceof ParseRecover)) throw e
            this.cursor = start
            this.errors.length = errors
            return undefined
        }
    }

    private parseCallArguments(): Expression[] {
        if (this.matchPunctuator("(")) {
            const list: Expression[] = []
            const stop = (): boolean => this.checkPunctuator(",")
            if (!this.checkPunctuator(")")) {
                while (true) {
                    // `f(,` and then `Key: value` on the next line: the call
                    // was never closed, and that is the enclosing object's field.
                    if (this.recover && this.onNewLine() && this.startsTableField() && !this.startsMethodCall(1)) break
                    const before = this.cursor
                    const argument = this.expressionOr(stop)
                    // `f(` with nothing written yet is no argument.
                    if (argument.type !== "ErrorExpression" || this.cursor > before || list.length) list.push(argument)
                    if (this.matchPunctuator(",") && !this.checkPunctuator(")")) continue
                    if (!this.recover || this.checkPunctuator(")")) break
                    // `print(a` and then the next line: the `)` is what is missing.
                    if (this.onNewLine() && (this.checkType("Identifier") || this.checkType("Keyword"))) break
                    this.softError("Expected ',' or ')'")
                    this.skip(stop, this.cursor, "expression")
                    if (this.matchPunctuator(",")) continue
                    break
                }
            }
            this.expectCloser(")")
            return list
        }

        const t = this.current()
        if (t.type === "Literal" && (t as any).kind === "string") {
            this.advance()
            return [{ type: "StringLiteral", value: (t as any).value, raw: (t as any).raw, ...spanFrom(t, t) }]
        }
        if (t.type === "InterpolatedString") {
            this.advance()
            return [this.buildInterpolatedString(t as any)]
        }
        if (t.type === "Punctuator" && (t as any).value === "{") {
            return [this.parseTableExpression()]
        }

        this.error("Expected function call arguments")
    }

    private parseIdentifier(): Identifier {
        const t = this.expectIdentifier()
        return { type: "Identifier", name: t.value as string, ...spanFrom(t, t) }
    }

    // `{}` is an OBJECT literal only in luaut: `{ a = 1, [k] = v, shorthand }`.
    // Positional entries (`{ 1, 2, 3 }`) are gone — use an array literal `[...]`.
    private parseTableExpression(): TableExpression {
        const start = this.current()
        this.expectPunctuator("{")
        const fields: TableField[] = []
        const stop = (): boolean =>
            this.checkPunctuator(",") || this.checkPunctuator(";") || (this.onNewLine() && this.startsTableField())

        while (!this.checkPunctuator("}")) {
            const field = this.attempt<TableField | undefined>(() => this.parseTableField(stop), stop, () => undefined)
            if (field) fields.push(field)
            if (this.matchPunctuator(",") || this.matchPunctuator(";")) continue
            if (!this.recover || this.checkPunctuator("}")) break
            // A field on its own line after one without a comma: the comma is
            // what is missing, not the field.
            if (this.onNewLine() && this.startsTableField()) {
                this.softError("Expected ','")
                continue
            }
            if (this.isAtEnd() || this.onNewLine() && this.checkType("Keyword")) break
            this.softError("Expected ',' or '}'")
            const before = this.cursor
            this.skip(stop, this.cursor, "expression")
            if (this.matchPunctuator(",") || this.matchPunctuator(";")) continue
            if (this.cursor > before && this.onNewLine() && this.startsTableField()) continue
            break
        }

        this.expectCloser("}")
        return { type: "TableExpression", fields, ...spanFrom(start, this.previous()) }
    }

    /** Does a `key: value` field, or a spread, start here? */
    private startsTableField(): boolean {
        const next = this.peek(1)
        const colon = next.type === "Punctuator" && (next as { value?: unknown }).value === ":"
        if (this.checkType("Identifier")) return colon
        if (this.checkType("Literal") && (this.current() as { kind?: unknown }).kind === "string") return colon
        return this.checkOperator("...")
    }

    private parseTableField(stop: () => boolean): TableField {
        if (this.checkOperator("...")) {
            this.advance()
            return { type: "TableFieldSpread", argument: this.expressionOr(stop) }
        }
        if (this.matchPunctuator("[")) {
            const key = this.expressionOr(() => this.checkPunctuator("]"))
            this.expectPunctuator("]")
            this.expectPunctuator(":")
            return { type: "TableFieldComputed", key, value: this.expressionOr(stop) }
        }
        if (this.checkType("Literal") && (this.current() as any).kind === "string") {
            const t = this.advance() as any
            const key: StringLiteral = { type: "StringLiteral", value: t.value, raw: t.raw, ...spanFrom(t, t) }
            this.expectPunctuator(":")
            return { type: "TableFieldNamed", key, value: this.expressionOr(stop) }
        }
        if (this.checkType("Identifier") && this.peek(1).type === "Punctuator" && (this.peek(1) as any).value === ":") {
            const key = this.parseIdentifier()
            this.expectPunctuator(":")
            return { type: "TableFieldNamed", key, value: this.expressionOr(stop) }
        }
        if (this.checkType("Identifier")) {
            return { type: "TableFieldShorthand", name: this.parseIdentifier() }
        }
        this.error("Expected object field ('key: value', '[expr]: value', shorthand, or '...spread'); use '[...]' for arrays")
    }

    // `[1, 2, 3]` — array literal (trailing comma allowed).
    private parseArrayExpression(): ArrayExpression {
        const start = this.current()
        this.expectPunctuator("[")
        const elements: (Expression | SpreadElement)[] = []
        const stop = (): boolean => this.checkPunctuator(",")
        while (!this.checkPunctuator("]")) {
            if (this.checkOperator("...")) {
                const dots = this.advance()
                const argument = this.expressionOr(stop)
                elements.push({ type: "SpreadElement", argument, ...spanFrom(dots, argument) })
            } else {
                elements.push(this.expressionOr(stop))
            }
            if (this.matchPunctuator(",")) continue
            if (!this.recover || this.checkPunctuator("]")) break
            // An element on its own line after one without a comma.
            if (this.onNewLine() && this.isExpressionStart() && !this.checkType("Keyword")) {
                this.softError("Expected ','")
                continue
            }
            if (this.isAtEnd() || this.onNewLine() && this.checkType("Keyword")) break
            this.softError("Expected ',' or ']'")
            this.skip(stop, this.cursor, "expression")
            if (this.matchPunctuator(",")) continue
            break
        }
        this.expectCloser("]")
        return { type: "ArrayExpression", elements, ...spanFrom(start, this.previous()) }
    }

    // ============================================================
    // Destructuring patterns (JS-style)
    // ============================================================

    /** Parses a binding target. When `topLevel`, also consumes a trailing
     *  `<attr>` list (identifier only) and a `: Type` annotation — these are
     *  only valid at the outermost level of a `local` / parameter binding,
     *  never nested inside another pattern. */
    private parseBindingTarget(topLevel: boolean): BindingTarget {
        let target: BindingTarget

        if (this.checkPunctuator("{")) {
            target = this.parseObjectPattern()
        } else if (this.checkPunctuator("[")) {
            target = this.parseArrayPattern()
        } else {
            const nameTok = this.expectIdentifier()
            let attributes: string[] | undefined
            if (topLevel && this.checkOperator("<")) {
                this.advance()
                attributes = [this.expectIdentifier().value as string]
                while (this.matchPunctuator(",")) attributes.push(this.expectIdentifier().value as string)
                this.expectOperator(">")
            }
            target = {
                type: "IdentifierPattern",
                name: nameTok.value as string,
                attributes,
                ...spanFrom(nameTok, this.previous()),
            }
        }

        if (topLevel && this.matchPunctuator(":")) {
            target.typeAnnotation = this.typeOr(() => this.checkOperator("=") || this.checkPunctuator(","))
        }
        return target
    }

    private parseObjectPattern(): ObjectPattern {
        const start = this.current()
        this.expectPunctuator("{")
        const properties: ObjectPatternProperty[] = []
        let rest: BindingTarget | undefined

        while (!this.checkPunctuator("}")) {
            if (this.checkOperator("...")) {
                this.advance()
                rest = this.parseBindingTarget(false)
                break
            }

            const propStart = this.current()
            let key: ObjectPatternProperty["key"]
            let computed = false
            let value: BindingTarget
            let shorthand = false

            if (this.matchPunctuator("[")) {
                computed = true
                key = this.parseExpression()
                this.expectPunctuator("]")
                this.expectPunctuator(":")
                value = this.parseBindingTarget(false)
            } else if (this.checkType("Literal") && (this.current() as any).kind === "string") {
                const t = this.advance() as any
                key = { type: "StringLiteral", value: t.value, raw: t.raw, ...spanFrom(t, t) }
                this.expectPunctuator(":")
                value = this.parseBindingTarget(false)
            } else {
                const nameTok = this.expectIdentifier()
                key = { type: "Identifier", name: nameTok.value as string, ...spanFrom(nameTok, nameTok) }
                if (this.matchPunctuator(":")) {
                    value = this.parseBindingTarget(false)
                } else {
                    shorthand = true
                    value = { type: "IdentifierPattern", name: nameTok.value as string, ...spanFrom(nameTok, nameTok) }
                }
            }

            let def: Expression | undefined
            if (this.matchOperator("=")) def = this.parseExpression()

            properties.push({
                type: "ObjectPatternProperty",
                key, computed, value, default: def, shorthand,
                ...spanFrom(propStart, this.previous()),
            })

            if (this.matchPunctuator(",")) continue
            break
        }

        this.expectPunctuator("}")
        return { type: "ObjectPattern", properties, rest, ...spanFrom(start, this.previous()) }
    }

    private parseArrayPattern(): ArrayPattern {
        const start = this.current()
        this.expectPunctuator("[")
        const elements: (ArrayPatternElement | null)[] = []
        let rest: BindingTarget | undefined

        while (!this.checkPunctuator("]")) {
            if (this.checkOperator("...")) {
                this.advance()
                rest = this.parseBindingTarget(false)
                break
            }
            if (this.checkPunctuator(",")) {
                elements.push(null) // elision hole
                this.advance()
                continue
            }

            const elStart = this.current()
            const value = this.parseBindingTarget(false)
            let def: Expression | undefined
            if (this.matchOperator("=")) def = this.parseExpression()
            elements.push({ type: "ArrayPatternElement", value, default: def, ...spanFrom(elStart, this.previous()) })

            if (this.matchPunctuator(",")) continue
            break
        }

        this.expectPunctuator("]")
        return { type: "ArrayPattern", elements, rest, ...spanFrom(start, this.previous()) }
    }

    private identifierPatternToTypedIdentifier(p: IdentifierPattern): TypedIdentifier {
        return {
            type: "TypedIdentifier",
            name: p.name,
            typeAnnotation: p.typeAnnotation,
            attributes: p.attributes,
            line: p.line, column: p.column,
        }
    }

    private parseTypeOrTypePackReference(): TypeNode {
        if (this.checkType("Identifier") && this.peek(1).type === "Operator" && (this.peek(1) as any).value === "...") {
            const start = this.current()
            const base = this.expectIdentifier().value as string
            this.advance()
            const packRef: TypeReference = { type: "TypeReference", base, typeArguments: [], ...spanFrom(start, start) }
            return {
                type: "TypePackNode",
                types: [],
                hasVarargs: true,
                // Wrap in `VariadicTypeNode`, matching the convention used by
                // `parseFunctionTypeAfterParen`'s identifier-pack-reference
                // branch, so the printer can tell `A...` (name-first, this
                // case) apart from `...T` (dots-first) and append rather
                // than prepend the `...`.
                varargType: { type: "VariadicTypeNode", typeAnnotation: packRef, ...spanFrom(start, this.previous()) } as VariadicTypeNode,
                ...spanFrom(start, this.previous()),
            } as TypePackNode
        }
        return this.parseType()
    }

    private parseTypeArgument(): TypeNode | TypePackNode {
        if (this.checkOperator("...")) {
            return this.parseTypePack()
        }
        if (this.checkType("Identifier") && this.peek(1).type === "Operator" && (this.peek(1) as any).value === "...") {
            return this.parseTypeOrTypePackReference()
        }
        return this.parseType()
    }

    /** The part shared by a real function body and an overload signature:
     *  `<generics>(params): ReturnType`, up to (but not including) the block. */
    private parseFunctionHead(): {
        start: Token
        generics: GenericTypeParameter[]
        params: FunctionParameter[]
        hasVarargs: boolean
        varargTypeAnnotation?: TypeNode
        returnType?: TypeNode
        predicate?: TypePredicateNode
    } {
        const start = this.current()
        let generics: GenericTypeParameter[] = []
        if (this.checkOperator("<")) {
            generics = this.parseGenericTypeParameterList()
        }

        this.expectPunctuator("(")
        const params: FunctionParameter[] = []
        let hasVarargs = false
        let varargTypeAnnotation: TypeNode | undefined

        if (!this.checkPunctuator(")")) {
            while (true) {
                if (this.checkOperator("...")) {
                    this.advance()
                    hasVarargs = true
                    if (this.matchPunctuator(":")) {
                        varargTypeAnnotation = this.parseTypeOrTypePackReference()
                    }
                    break
                }
                const paramStart = this.current()
                let name = ""
                let pattern: ObjectPattern | ArrayPattern | undefined
                if (this.checkPunctuator("{")) {
                    pattern = this.parseObjectPattern()
                } else if (this.checkPunctuator("[")) {
                    pattern = this.parseArrayPattern()
                } else {
                    name = this.expectIdentifier().value as string
                }
                // `name?: T` — the argument may be omitted.
                const optional = this.matchPunctuator("?")
                let typeAnnotation: TypeNode | undefined
                const paramEnd = (): boolean => this.checkPunctuator(",")
                if (this.matchPunctuator(":")) {
                    typeAnnotation = this.typeOr(() => paramEnd() || this.checkOperator("="))
                }
                let def: Expression | undefined
                if (this.matchOperator("=")) {
                    def = this.expressionOr(paramEnd)
                }
                params.push({
                    type: "FunctionParameter",
                    name, pattern, typeAnnotation, default: def,
                    optional: optional || undefined,
                    ...spanFrom(paramStart, this.previous()),
                })
                // A trailing comma is allowed, as in TypeScript: a parameter
                // list written one per line ends with one.
                if (this.matchPunctuator(",") && !this.checkPunctuator(")")) continue
                break
            }
        }
        this.expectPunctuator(")")

        let returnType: TypeNode | undefined
        let predicate: TypePredicateNode | undefined
        if (this.matchPunctuator(":")) {
            predicate = this.tryParseTypePredicate()
            if (!predicate) {
                returnType = this.attempt<TypeNode | undefined>(() => this.parseTypeOrTypePackReference(), () => false, () => undefined)
            }
        }

        return { start, generics, params, hasVarargs, varargTypeAnnotation, returnType, predicate }
    }

    /** TypeScript-style type-guard return annotations, in return position only:
     *
     *      : v is string          -- narrows `v` in the caller's true branch
     *      : asserts v            -- narrows `v` for the rest of the caller's block
     *      : asserts v is string
     *
     *  `is` and `asserts` are *soft* keywords -- they lex as plain identifiers,
     *  so a return type that merely happens to be named `is` still parses. We
     *  only commit when the two-token lookahead can't mean anything else. */
    private tryParseTypePredicate(): TypePredicateNode | undefined {
        const start = this.current()
        const isWord = (t: Token, v: string): boolean =>
            t.type === "Identifier" && (t as { value?: unknown }).value === v

        // `asserts x` / `asserts x is T`
        if (isWord(start, "asserts") && this.peek(1).type === "Identifier") {
            this.advance()
            const parameterName = this.expectIdentifier().value as string
            let typeAnnotation: TypeNode | undefined
            if (isWord(this.current(), "is")) {
                this.advance()
                typeAnnotation = this.parseType()
            }
            return {
                type: "TypePredicateNode", parameterName, asserts: true, typeAnnotation,
                ...spanFrom(start, this.previous()),
            }
        }

        // `x is T`
        if (start.type === "Identifier" && isWord(this.peek(1), "is")) {
            const parameterName = this.expectIdentifier().value as string
            this.advance() // 'is'
            const typeAnnotation = this.parseType()
            return {
                type: "TypePredicateNode", parameterName, asserts: false, typeAnnotation,
                ...spanFrom(start, this.previous()),
            }
        }

        return undefined
    }

    private parseFunctionBody(opener: Token): FunctionBody {
        const head = this.parseFunctionHead()
        const body = this.parseBlock(opener)
        this.expectEnd(opener)
        return {
            type: "FunctionBody",
            generics: head.generics, params: head.params, hasVarargs: head.hasVarargs,
            varargTypeAnnotation: head.varargTypeAnnotation, returnType: head.returnType,
            predicate: head.predicate, body,
            ...spanFrom(head.start, this.previous()),
        }
    }

    private headToSignature(head: ReturnType<Parser["parseFunctionHead"]>): FunctionSignature {
        return {
            type: "FunctionSignature",
            generics: head.generics, params: head.params, hasVarargs: head.hasVarargs,
            varargTypeAnnotation: head.varargTypeAnnotation, returnType: head.returnType,
            predicate: head.predicate,
            ...spanFrom(head.start, this.previous()),
        }
    }

    private headToBody(head: ReturnType<Parser["parseFunctionHead"]>, opener: Token): FunctionBody {
        const body = this.parseBlock(opener)
        this.expectEnd(opener)
        return {
            type: "FunctionBody",
            generics: head.generics, params: head.params, hasVarargs: head.hasVarargs,
            varargTypeAnnotation: head.varargTypeAnnotation, returnType: head.returnType,
            predicate: head.predicate, body,
            ...spanFrom(head.start, this.previous()),
        }
    }

    // ============================================================
    // Types
    // ============================================================

    parseType(): TypeNode {
        return this.parseConditionalType()
    }

    /** `C extends E ? A : B`. `?` in type position always means this — luaut
     *  has no `T?` shorthand — so the grammar needs no lookahead beyond the
     *  `extends`, which stays a soft keyword. */
    private parseConditionalType(): TypeNode {
        const start = this.current()
        const checkType = this.parseUnionType()
        if (!this.checkIdentifierValue("extends")) return checkType
        this.advance()
        const extendsType = this.parseUnionType()
        this.expectPunctuator("?")
        const trueType = this.parseConditionalType()
        this.expectPunctuator(":")
        const falseType = this.parseConditionalType()
        return {
            type: "ConditionalTypeNode",
            checkType, extendsType, trueType, falseType,
            ...spanFrom(start, this.previous()),
        }
    }

    private parseUnionType(): TypeNode {
        const start = this.current()
        this.matchPunctuator("|")
        let left = this.parseDifferenceType()
        if (this.checkPunctuator("|")) {
            const types = [left]
            while (this.matchPunctuator("|")) {
                types.push(this.parseDifferenceType())
            }
            return { type: "UnionTypeNode", types, ...spanFrom(start, this.previous()) }
        }
        return left
    }

    /** `A - B` — set difference. Between `|` and `&` in precedence, and left
     *  associative, so `A - B - C` removes both. The lexer gives `->` its own
     *  token, so a function type's arrow is never mistaken for one. */
    private parseDifferenceType(): TypeNode {
        let left = this.parseIntersectionType()
        while (this.checkOperator("-")) {
            this.advance()
            const excluded = this.parseIntersectionType()
            left = { type: "DifferenceTypeNode", base: left, excluded, ...spanFrom(left, excluded) }
        }
        return left
    }

    private parseIntersectionType(): TypeNode {
        const start = this.current()
        this.matchPunctuator("&")
        let left = this.parseSuffixType()
        if (this.checkPunctuator("&")) {
            const types = [left]
            while (this.matchPunctuator("&")) {
                types.push(this.parseSuffixType())
            }
            return { type: "IntersectionTypeNode", types, ...spanFrom(start, this.previous()) }
        }
        return left
    }

    /** Postfix type suffixes. There is deliberately **no `T?` shorthand**:
     *  `?` in type position always belongs to a conditional type
     *  (`C extends E ? A : B`). Write `T | nil` for a nilable type, and
     *  `name?: T` for an optional property or parameter. */
    private parseSuffixType(): TypeNode {
        let t = this.parsePrimaryType()
        while (true) {
            // `T[]` array-type suffix (may repeat: `T[][]`), or `T[K]`
            // indexed access — told apart by whether the brackets are empty.
            if (this.checkPunctuator("[")) {
                if (this.peek(1).type === "Punctuator" && (this.peek(1) as any).value === "]") {
                    this.advance()
                    this.advance()
                    t = { type: "ArrayTypeNode", element: t, ...spanFrom(t, this.previous()) }
                    continue
                }
                this.advance()
                const indexType = this.parseType()
                this.expectPunctuator("]")
                t = { type: "IndexedAccessTypeNode", objectType: t, indexType, ...spanFrom(t, this.previous()) }
                continue
            }
            break
        }
        return t
    }

    private parsePrimaryType(): TypeNode {
        const t = this.current()

        // `` `on${string}` `` — the lexer already split the backtick string
        // into literal chunks and raw interpolation sources; each of those
        // sources is re-parsed here as a *type* rather than an expression.
        if (t.type === "InterpolatedString") {
            this.advance()
            const quasis: string[] = []
            const types: TypeNode[] = []
            let pending = ""
            for (const part of (t as unknown as { parts: { kind: string; value?: string; raw: string }[] }).parts) {
                if (part.kind === "string") {
                    pending += part.value ?? ""
                } else {
                    quasis.push(pending)
                    pending = ""
                    types.push(parseTypeFromSource(part.raw))
                }
            }
            quasis.push(pending)
            return { type: "TemplateLiteralTypeNode", quasis, types, ...spanFrom(t, this.previous()) }
        }

        // `keyof T` / `infer U` — soft-keyword prefixes. Both require a type to
        // follow, so an ordinary type actually named `keyof` still parses.
        if (this.checkIdentifierValue("keyof") && this.startsType(this.peek(1))) {
            this.advance()
            const target = this.parsePrimaryType()
            return { type: "KeyofTypeNode", target, ...spanFrom(t, this.previous()) }
        }
        if (this.checkIdentifierValue("infer") && this.peek(1).type === "Identifier") {
            this.advance()
            const nameTok = this.expectIdentifier()
            const name = nameTok.value as string
            return { type: "InferTypeNode", name, id: tokenIdentifier(nameTok), ...spanFrom(t, this.previous()) }
        }

        if (t.type === "Operator" && (t as any).value === "<") {
            const generics = this.parseGenericTypeParameterList()
            this.expectPunctuator("(")
            return this.parseFunctionTypeAfterParen(t, generics)
        }

        if (t.type === "Punctuator" && (t as any).value === "(") {
            this.advance()
            return this.parseFunctionTypeAfterParen(t, [])
        }

        if (t.type === "Operator" && (t as any).value === "...") {
            this.advance()
            const inner = this.parseType()
            return { type: "VariadicTypeNode", typeAnnotation: inner, ...spanFrom(t, this.previous()) }
        }

        if (t.type === "Punctuator" && (t as any).value === "{") {
            return this.parseTableType()
        }

        // `[number, string]` — tuple type.
        if (t.type === "Punctuator" && (t as any).value === "[") {
            this.advance()
            const elements: TypeNode[] = []
            while (!this.checkPunctuator("]")) {
                elements.push(this.parseType())
                if (this.matchPunctuator(",")) continue
                break
            }
            this.expectPunctuator("]")
            return { type: "TupleTypeNode", elements, ...spanFrom(t, this.previous()) } as TupleTypeNode
        }

        if (t.type === "Identifier" && (t as any).value === "typeof" && this.peek(1).type === "Punctuator" && (this.peek(1) as any).value === "(") {
            this.advance()
            this.advance()
            const expression = this.parseExpression()
            this.expectPunctuator(")")
            return { type: "TypeofTypeNode", expression, ...spanFrom(t, this.previous()) } as TypeofTypeNode
        }

        // `typeof x` / `typeof x.y.z` — TypeScript's type query: the type of a
        // value, without parentheses. (`typeof(expr)` above is Luau's
        // spelling.) Only a name path is allowed, as in TypeScript.
        if (t.type === "Identifier" && (t as any).value === "typeof" && this.peek(1).type === "Identifier") {
            this.advance()
            let expression: Expression = this.parseIdentifier()
            while (this.checkPunctuator(".") && this.peek(1).type === "Identifier") {
                this.advance()
                const property = this.parseIdentifier()
                expression = { type: "MemberExpression", object: expression, property, ...spanFrom(expression, property) }
            }
            return { type: "TypeofTypeNode", expression, ...spanFrom(t, this.previous()) } as TypeofTypeNode
        }

        if (t.type === "Literal" && (t as any).kind === "string") {
            this.advance()
            return { type: "TypeLiteralString", value: (t as any).value, ...spanFrom(t, t) } as TypeLiteralString
        }

        if (t.type === "Literal" && (t as any).kind === "boolean") {
            this.advance()
            return { type: "TypeLiteralBoolean", value: (t as any).value, ...spanFrom(t, t) } as TypeLiteralBoolean
        }

        if (t.type === "Literal" && (t as any).kind === "number") {
            this.advance()
            return { type: "TypeLiteralNumber", value: (t as any).value, ...spanFrom(t, t) } as TypeLiteralNumber
        }

        if (t.type === "Literal" && (t as any).kind === "nil") {
            this.advance()
            return { type: "TypeReference", base: "nil", typeArguments: [], ...spanFrom(t, t) } as TypeReference
        }

        if (t.type === "Identifier") {
            this.advance()
            let namespace: string | undefined
            let base = (t as any).value as string
            if (this.matchPunctuator(".")) {
                namespace = base
                base = this.expectIdentifier().value as string
            }
            const typeArguments: (TypeNode | TypePackNode)[] = []
            if (this.checkOperator("<")) {
                this.advance()
                if (!this.checkOperator(">")) {
                    typeArguments.push(this.parseTypeArgument())
                    while (this.matchPunctuator(",") && !this.checkOperator(">")) {
                        typeArguments.push(this.parseTypeArgument())
                    }
                }
                this.expectOperator(">")
            }
            return { type: "TypeReference", base, namespace, typeArguments, ...spanFrom(t, this.previous()) } as TypeReference
        }

        this.error("Unexpected token in type annotation")
    }

    private parseFunctionTypeAfterParen(start: Token, generics: GenericTypeParameter[]): TypeNode {
        const params: FunctionTypeParameter[] = []
        let hasVarargs = false
        let varargType: TypeNode | undefined

        if (!this.checkPunctuator(")")) {
            while (true) {
                if (this.checkOperator("...")) {
                    this.advance()
                    hasVarargs = true
                    varargType = this.parseType()
                    break
                }

                if (this.checkType("Identifier") && this.peek(1).type === "Operator" && (this.peek(1) as any).value === "...") {
                    const packStart = this.current()
                    const packRef = this.parseType()
                    this.advance()
                    hasVarargs = true
                    varargType = { type: "VariadicTypeNode", typeAnnotation: packRef, ...spanFrom(packStart, this.previous()) } as VariadicTypeNode
                    break
                }

                let name: string | undefined
                let optional = false
                const named = this.checkType("Identifier") && this.peek(1).type === "Punctuator" &&
                    ((this.peek(1) as any).value === ":" ||
                     ((this.peek(1) as any).value === "?" && this.peek(2).type === "Punctuator" &&
                      (this.peek(2) as any).value === ":"))
                let nameTok: Token | undefined
                if (named) {
                    const tok = this.expectIdentifier()
                    nameTok = tok
                    name = tok.value as string
                    optional = this.matchPunctuator("?")
                    this.advance() // ':'
                }
                const paramStart = nameTok ?? this.current()
                const typeAnnotation = this.parseType()
                params.push({
                    type: "FunctionTypeParameter",
                    name, typeAnnotation,
                    id: nameTok && tokenIdentifier(nameTok),
                    optional: optional || undefined,
                    ...spanFrom(paramStart, this.previous()),
                })
                if (this.matchPunctuator(",") && !this.checkPunctuator(")")) continue
                break
            }
        }

        this.expectPunctuator(")")

        if (this.matchPunctuator("->")) {
            const predicate = this.tryParseTypePredicate()
            const returnType: TypeNode = predicate
                ? { type: "TypeReference", base: "boolean", typeArguments: [], ...spanFrom(start, this.previous()) }
                : this.parseTypeOrTypePackReference()
            return {
                type: "FunctionTypeNode",
                generics, params, hasVarargs, varargType, returnType, predicate,
                ...spanFrom(start, this.previous()),
            } as FunctionTypeNode
        }

        if (params.length === 1 && !params[0].name && !hasVarargs) {
            return {
                type: "ParenthesizedTypeNode",
                typeAnnotation: params[0].typeAnnotation,
                ...spanFrom(start, this.previous()),
            } as ParenthesizedTypeNode
        }

        if (params.some(p => p.name !== undefined)) {
            this.error("Expected '->' for function type")
        }

        return {
            type: "TypePackNode",
            types: params.map(p => p.typeAnnotation),
            hasVarargs, varargType,
            ...spanFrom(start, this.previous()),
        } as TypePackNode
    }

    /** Could this token begin a type? Used to keep `keyof` a soft keyword. */
    private startsType(t: Token): boolean {
        if (t.type === "Identifier" || t.type === "Literal") return true
        if (t.type === "Keyword") return ["nil", "true", "false", "function"].includes(String((t as { value?: unknown }).value))
        if (t.type === "Punctuator") return ["{", "[", "("].includes(String((t as { value?: unknown }).value))
        return false
    }

    /** `{ [K in C]: V }`, with the optional `as` remap and `?` / `readonly`
     *  modifiers (`-?` / `-readonly` strip them). Recognised by the `in` that
     *  follows the bound name — an ordinary `[K]: V` indexer has none. */
    private parseMappedType(start: Token): MappedTypeNode {
        let readonly: boolean | undefined
        if (this.checkIdentifierValue("readonly")) {
            this.advance()
            readonly = true
        } else if (this.checkOperator("-") && this.peek(1).type === "Identifier" &&
            (this.peek(1) as { value?: unknown }).value === "readonly") {
            this.advance()
            this.advance()
            readonly = false
        }

        this.expectPunctuator("[")
        const parameterTok = this.expectIdentifier()
        const parameter = parameterTok.value as string
        this.advance() // 'in'
        const constraint = this.parseType()
        let nameType: TypeNode | undefined
        if (this.checkWord("as")) {
            this.advance()
            nameType = this.parseType()
        }
        this.expectPunctuator("]")

        let optional: boolean | undefined
        if (this.matchPunctuator("?")) optional = true
        else if (this.checkOperator("-") && this.peek(1).type === "Punctuator" &&
            (this.peek(1) as { value?: unknown }).value === "?") {
            this.advance()
            this.advance()
            optional = false
        }

        this.expectPunctuator(":")
        const template = this.parseType()
        this.matchPunctuator(",")
        this.matchPunctuator(";")
        this.expectPunctuator("}")
        return {
            type: "MappedTypeNode",
            parameter, parameterId: tokenIdentifier(parameterTok), constraint, nameType, template, optional, readonly,
            ...spanFrom(start, this.previous()),
        }
    }

    /** Does `{` open a mapped type rather than an object type? Looks for
     *  `[ Ident in`, optionally behind a `readonly` / `-readonly` modifier. */
    private looksLikeMappedType(): boolean {
        let i = 1
        const val = (n: number): string => String((this.peek(n) as { value?: unknown }).value)
        if (this.peek(i).type === "Identifier" && val(i) === "readonly") i += 1
        else if (this.peek(i).type === "Operator" && val(i) === "-" &&
            this.peek(i + 1).type === "Identifier" && val(i + 1) === "readonly") i += 2
        return this.peek(i).type === "Punctuator" && val(i) === "[" &&
            this.peek(i + 1).type === "Identifier" &&
            this.peek(i + 2).type === "Keyword" && val(i + 2) === "in"
    }

    private parseTableType(): TableTypeNode | MappedTypeNode {
        const start = this.current()
        if (this.looksLikeMappedType()) {
            this.expectPunctuator("{")
            return this.parseMappedType(start)
        }
        this.expectPunctuator("{")
        const properties: TableTypeProperty[] = []

        while (!this.checkPunctuator("}")) {
            const propStart = this.current()
            if (this.checkPunctuator("[")) {
                this.advance()
                const keyType = this.parseType()
                this.expectPunctuator("]")
                this.expectPunctuator(":")
                const valueType = this.parseType()
                properties.push({ type: "TableTypeIndexer", keyType, valueType, ...spanFrom(propStart, this.previous()) })
            } else if (this.checkIdentifierValue("readonly") && this.peek(1).type === "Identifier") {
                // `readonly name: T` — the property may not be assigned to.
                // Still a soft keyword: a property actually named `readonly`
                // is followed by `:` or `?`, not by another identifier.
                this.advance()
                const keyTok = this.expectIdentifier()
                const name = keyTok.value as string
                const optional = this.matchPunctuator("?")
                this.expectPunctuator(":")
                const valueType = this.parseType()
                properties.push({
                    type: "TableTypeProperty", name, key: tokenIdentifier(keyTok), valueType, optional, readonly: true,
                    ...spanFrom(propStart, this.previous()),
                })
            } else if (this.checkType("Identifier") &&
                ((this.peek(1).type === "Punctuator" && (this.peek(1) as any).value === ":") ||
                 (this.peek(1).type === "Punctuator" && (this.peek(1) as any).value === "?" &&
                  this.peek(2).type === "Punctuator" && (this.peek(2) as any).value === ":"))) {
                // luaut uses TS-style `name?: T` for an optional property
                // (it may be absent). A required property whose value may be
                // nil is written `name: T | nil`.
                const keyTok = this.expectIdentifier()
                const name = keyTok.value as string
                const optional = this.matchPunctuator("?")
                this.expectPunctuator(":")
                const valueType = this.parseType()
                properties.push({
                    type: "TableTypeProperty",
                    name, key: tokenIdentifier(keyTok), valueType, optional,
                    ...spanFrom(propStart, this.previous()),
                })
            } else {
                this.error("Expected object type property ('name: T' or '[K]: V'); use 'T[]' for arrays and '[T, U]' for tuples")
            }

            if (this.matchPunctuator(",") || this.matchPunctuator(";")) continue
            break
        }

        this.expectPunctuator("}")
        return { type: "TableTypeNode", properties, ...spanFrom(start, this.previous()) }
    }

    private parseTypePack(): TypePackNode {
        const start = this.current()
        if (this.matchOperator("...")) {
            const varargType = this.parseType()
            return { type: "TypePackNode", types: [], hasVarargs: true, varargType, ...spanFrom(start, this.previous()) }
        }
        this.expectPunctuator("(")
        const types: TypeNode[] = []
        let hasVarargs = false
        let varargType: TypeNode | undefined
        if (!(this.current().type === "Punctuator" && (this.current() as any).value === ")")) {
            while (true) {
                if (this.matchOperator("...")) {
                    hasVarargs = true
                    varargType = this.parseType()
                    break
                }
                types.push(this.parseType())
                if (this.matchPunctuator(",")) continue
                break
            }
        }
        this.expectPunctuator(")")
        return { type: "TypePackNode", types, hasVarargs, varargType, ...spanFrom(start, this.previous()) }
    }

    private parseGenericTypeParameterList(): GenericTypeParameter[] {
        const list: GenericTypeParameter[] = []
        this.expectOperator("<")
        while (true) {
            // `<const T>` — a hard keyword here, and unambiguous: a type
            // parameter cannot itself be named `const`.
            const isConst = this.matchKeyword("const")
            const nameTok = this.expectIdentifier()
            let isPack = false
            if (this.matchOperator("...")) {
                isPack = true
            }
            let constraint: TypeNode | undefined
            if (this.checkIdentifierValue("extends")) {
                this.advance()
                constraint = this.parseType()
            }
            let def: TypeNode | TypePackNode | undefined
            if (this.matchOperator("=")) {
                if (isPack) {
                    def = this.parseTypePack()
                } else {
                    def = this.parseType()
                }
            }
            list.push({
                type: "GenericTypeParameter",
                name: nameTok.value as string,
                id: tokenIdentifier(nameTok),
                isPack,
                isConst: isConst || undefined,
                constraint,
                default: def,
                ...spanFrom(nameTok, this.previous()),
            })
            if (this.matchPunctuator(",") && !this.checkOperator(">")) continue
            break
        }
        this.expectOperator(">")
        return list
    }
}

// ============================================================
// Public API
// ============================================================

export function parse(source: string): Program {
    const tokens = tokenize(source)
    const parser = new Parser(tokens)
    return parser.parseProgram()
}

export function parseTokens(tokens: Token[]): Program {
    const parser = new Parser(tokens)
    return parser.parseProgram()
}

/** Parse a standalone *type* from source — used for the interpolated slots of
 *  a template literal type, whose raw text the lexer hands over unparsed. */
export function parseTypeFromSource(raw: string): TypeNode {
    const parser = new Parser(tokenize(raw))
    return (parser as unknown as { parseType(): TypeNode }).parseType()
}

export function parseExpressionFromSource(raw: string): Expression {
    const tokens = tokenize(raw)
    const parser = new Parser(tokens)
    const expr = (parser as any).parseExpression() as Expression
    return expr
}

export interface RecoverResult {
    program: Program
    errors: ParseError[]
    /** The file's `--@luaut-...` comments; see `applyDirectives`. */
    directives: Directives
}

/**
 * Like `parse`, but never throws on a syntax error: it records every error and
 * returns a best-effort AST. A broken expression becomes an `ErrorExpression`,
 * a broken field or argument is skipped to the next `,`, a missing `)`, `}`,
 * `then`, `do` or `end` is recorded and read past, and only what none of those
 * cover becomes an `ErrorStatement`. A malformed token (an unclosed string) is
 * an error too, and the rest of the file still lexes.
 *
 * This is the entry point a language server should use for open documents.
 */
export function parseWithRecovery(source: string): RecoverResult {
    const lexErrors: LexError[] = []
    const comments: SourceComment[] = []
    const tokens = tokenize(source, { errors: lexErrors, comments })
    const lexed = lexErrors.map(e => new ParseError(e.message.replace(/ \(\d+:\d+\)$/, ""), e.line, e.column))

    const first = new Parser(tokens, { recover: true })
    let program = first.parseProgram()
    let errors = first.errors
    // A missing `end` makes the block run on to the end of the file. Where the
    // file is indented, the indentation says where the block really ended.
    if (first.missingEnd) {
        const second = new Parser(tokens, { recover: true, indentation: true })
        const reparsed = second.parseProgram()
        if (second.errors.length <= errors.length) {
            program = reparsed
            errors = second.errors
        }
    }
    const all = [...lexed, ...errors].sort((a, b) => a.line - b.line || a.column - b.column)
    return { program, errors: all, directives: readDirectives(comments, tokens) }
}

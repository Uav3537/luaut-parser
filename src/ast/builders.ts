import { tokenize, type Token } from "@lexer/lexer"
import type {
    Program, Block, Statement, Expression, TypeNode,
    VariableDeclaration, FunctionDeclaration, FunctionDeclarationStatement,
    AssignmentStatement, CompoundAssignmentStatement, CallStatement,
    DoStatement, WhileStatement, RepeatStatement, IfStatement, IfClause,
    NumericForStatement, GenericForStatement, ReturnStatement,
    BreakStatement, ContinueStatement, TypeAliasStatement, ExportTypeAliasStatement,
    ImportStatement, ImportSpecifier, ExportStatement, ExportDefaultStatement, DeclareStatement,
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
    TypeAssertionExpression, AsConstExpression, IfElseExpression,
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
}

export class Parser {
    private tokens: Token[]
    private cursor = 0
    private recover: boolean
    /** Populated in recovery mode. */
    readonly errors: ParseError[] = []

    constructor(tokens: Token[], options: ParserOptions = {}) {
        this.tokens = tokens
        this.recover = options.recover ?? false
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
            this.errors.push(err)
            throw new ParseRecover(err.message)
        }
        throw err
    }

    /** Recovery: skip tokens until the start of a plausible next statement (a
     *  leading keyword / `@` attribute / just past a `;`) or a block
     *  terminator. Forward progress past a zero-width failure is guaranteed by
     *  the caller (`parseBlock`). */
    private synchronize(): void {
        while (!this.isAtEnd()) {
            const t = this.current()
            if (t.type === "Punctuator" && t.value === "@") return
            if (t.type === "Keyword") {
                switch (t.value) {
                    case "const": case "let": case "function": case "if": case "while": case "for":
                    case "return": case "do": case "repeat": case "break": case "continue":
                    case "import": case "export":
                    case "end": case "else": case "elseif": case "until":
                        return
                }
            }
            this.advance()
            const prev = this.previous()
            if (prev.type === "Punctuator" && prev.value === ";") return
        }
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
            if (this.recover) {
                const t = this.current()
                this.errors.push(new ParseError(
                    `Expected end of file, got '${this.describeToken(t)}'`, t.line.start, t.column.start))
            } else {
                this.error("Expected end of file")
            }
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

    private parseBlock(): Block {
        const start = this.current()
        const statements: Statement[] = []
        while (!this.isBlockEnd()) {
            if (this.matchPunctuator(";")) continue
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
                        // thrown by a nested sub-parser (e.g. string interpolation)
                        this.errors.push(e)
                    } else {
                        throw e
                    }
                    this.synchronize()
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
            if (next.type === "Keyword" && ((next as any).value === "const" || (next as any).value === "let")) {
                const stmt = this.parseVariableDeclaration()
                if (stmt.type === "FunctionDeclaration") {
                    stmt.attributes = attributes
                    stmt.line.start = start.line.start
                    stmt.column.start = start.column.start
                }
                return stmt
            }
            if (next.type === "Keyword" && (next as any).value === "function") {
                const stmt = this.parseFunctionDeclarationStatement()
                stmt.attributes = attributes
                stmt.line.start = start.line.start
                stmt.column.start = start.column.start
                return stmt
            }
            throw new ParseError("Expected 'function', 'const', or 'let' after attribute", next.line.start, next.column.start)
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
                case "function": return this.parseFunctionDeclarationStatement()
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

        if (t.type === "Identifier" && (t as any).value === "type" &&
            this.peek(1).type === "Identifier") {
            return this.parseTypeAliasStatement()
        }

        if (t.type === "Identifier" && (t as any).value === "declare") {
            const p1 = this.peek(1)
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
            const params: FunctionTypeParameter[] = head.params.map(p => ({
                type: "FunctionTypeParameter",
                name: p.name || undefined,
                optional: p.optional,
                typeAnnotation: p.typeAnnotation ?? { type: "TypeReference", base: "any", typeArguments: [], ...spanFrom(start, start) },
                ...spanFrom(start, this.previous()),
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
            return { type: "DeclareStatement", name: nameTok.value as string, valueType, ...spanFrom(start, this.previous()) }
        }

        const nameTok = this.expectIdentifier()
        this.expectPunctuator(":")
        const valueType = this.parseType()
        return { type: "DeclareStatement", name: nameTok.value as string, valueType, ...spanFrom(start, this.previous()) }
    }

    // `import { a, b as c } from '...'` / `import Default from '...'` /
    // `import Default, { a } from '...'`. Compiled away entirely by the
    // bundler — never survives into emitted Luau.
    private parseImportStatement(): ImportStatement {
        const start = this.current()
        this.advance() // consume 'import'

        let defaultImport: Identifier | undefined
        const specifiers: ImportSpecifier[] = []

        if (this.checkType("Identifier")) {
            const nameTok = this.expectIdentifier()
            defaultImport = { type: "Identifier", name: nameTok.value as string, ...spanFrom(nameTok, nameTok) }
            if (this.matchPunctuator(",")) {
                this.expectPunctuator("{")
                this.parseImportSpecifierList(specifiers)
                this.expectPunctuator("}")
            }
        } else {
            this.expectPunctuator("{")
            this.parseImportSpecifierList(specifiers)
            this.expectPunctuator("}")
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

        return { type: "ImportStatement", defaultImport, specifiers, source, ...spanFrom(start, this.previous()) }
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

    // `export const ...` / `export let ...` / `export const function ...` /
    // `export type ...` / `export default <expr>`
    private parseExportStatement(): ExportStatement | ExportTypeAliasStatement | ExportDefaultStatement {
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

        this.error("Expected 'const', 'let', 'type', or 'default' after 'export'")
    }

    // `const x = ...` / `let x, y = ...` / `const function f() ... end`.
    // luaut has no `local` — `const` bindings are immutable, `let` mutable.
    private parseVariableDeclaration(): VariableDeclaration | FunctionDeclaration {
        const start = this.current()
        const kind = (this.advance() as any).value as "const" | "let"

        if (this.matchKeyword("function")) {
            return this.parseFunctionDeclarationRest(start, kind)
        }

        const names = [this.parseBindingTarget(true)]
        while (this.matchPunctuator(",")) {
            names.push(this.parseBindingTarget(true))
        }

        let init: Expression[] = []
        if (this.matchOperator("=")) {
            init = this.parseExpressionList()
        } else if (kind === "const") {
            this.error("'const' declaration requires an initializer")
        }

        return { type: "VariableDeclaration", kind, names, init, ...spanFrom(start, this.previous()) }
    }

    /** `const/let function` — `function` already consumed. Collects TS-style
     *  overload signatures. */
    private parseFunctionDeclarationRest(start: Token, kind: "const" | "let"): FunctionDeclaration {
        const name = this.parseIdentifier()
        const signatures: FunctionSignature[] = []
        while (true) {
            const head = this.parseFunctionHead()
            if (this.isOverloadContinuation(name.name, kind)) {
                signatures.push(this.headToSignature(head))
                this.advance() // consume 'const' / 'let'
                this.expectKeyword("function")
                this.parseIdentifier() // consume the repeated name
                continue
            }
            const func = this.headToBody(head)
            return {
                type: "FunctionDeclaration", kind, name, func,
                signatures: signatures.length ? signatures : undefined,
                ...spanFrom(start, this.previous()),
            }
        }
    }

    private parseIfStatement(): IfStatement {
        const start = this.current()
        this.expectKeyword("if")
        const clauses: IfClause[] = []

        const cond = this.parseExpression()
        this.expectKeyword("then")
        const body = this.parseBlock()
        clauses.push({ type: "IfClause", condition: cond, body, ...spanFrom(cond, this.previous()) })

        while (this.checkKeyword("elseif")) {
            const clauseStart = this.current()
            this.advance()
            const c = this.parseExpression()
            this.expectKeyword("then")
            const b = this.parseBlock()
            clauses.push({ type: "IfClause", condition: c, body: b, ...spanFrom(clauseStart, this.previous()) })
        }

        let alternate: Block | undefined
        if (this.matchKeyword("else")) {
            alternate = this.parseBlock()
        }

        this.expectKeyword("end")
        return { type: "IfStatement", clauses, alternate, ...spanFrom(start, this.previous()) }
    }

    private parseWhileStatement(): WhileStatement {
        const start = this.current()
        this.expectKeyword("while")
        const condition = this.parseExpression()
        this.expectKeyword("do")
        const body = this.parseBlock()
        this.expectKeyword("end")
        return { type: "WhileStatement", condition, body, ...spanFrom(start, this.previous()) }
    }

    private parseRepeatStatement(): RepeatStatement {
        const start = this.current()
        this.expectKeyword("repeat")
        const body = this.parseBlock()
        this.expectKeyword("until")
        const condition = this.parseExpression()
        return { type: "RepeatStatement", body, condition, ...spanFrom(start, this.previous()) }
    }

    private parseDoStatement(): DoStatement {
        const start = this.current()
        this.expectKeyword("do")
        const body = this.parseBlock()
        this.expectKeyword("end")
        return { type: "DoStatement", body, ...spanFrom(start, this.previous()) }
    }

    private parseForStatement(): NumericForStatement | GenericForStatement {
        const start = this.current()
        this.expectKeyword("for")

        const first = this.parseBindingTarget(true)

        if (first.type === "IdentifierPattern" && this.matchOperator("=")) {
            const from = this.parseExpression()
            this.expectPunctuator(",")
            const to = this.parseExpression()
            let step: Expression | undefined
            if (this.matchPunctuator(",")) {
                step = this.parseExpression()
            }
            this.expectKeyword("do")
            const body = this.parseBlock()
            this.expectKeyword("end")
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
        const iterators = this.parseExpressionList()
        this.expectKeyword("do")
        const body = this.parseBlock()
        this.expectKeyword("end")
        return {
            type: "GenericForStatement",
            variables, iterators, body,
            ...spanFrom(start, this.previous()),
        }
    }

    private parseFunctionDeclarationStatement(): FunctionDeclarationStatement {
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
                this.expectKeyword("function")
                this.parseFunctionName() // consume the repeated name
                continue
            }
            const func = this.headToBody(head)
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
     *  signature rather than an implementation)? `kind` is set for a
     *  `const/let function` group, undefined for a bare `function` group. */
    private isOverloadContinuation(name: string, kind?: "const" | "let"): boolean {
        if (kind) {
            return this.checkKeyword(kind) &&
                this.peek(1).type === "Keyword" && (this.peek(1) as any).value === "function" &&
                this.peek(2).type === "Identifier" && (this.peek(2) as any).value === name
        }
        return this.checkKeyword("function") &&
            this.peek(1).type === "Identifier" && (this.peek(1) as any).value === name
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
            args = this.parseExpressionList()
        }
        return { type: "ReturnStatement", arguments: args, ...spanFrom(start, this.previous()) }
    }

    private parseTypeAliasStatement(): TypeAliasStatement {
        const start = this.current()
        this.advance()
        const nameTok = this.expectIdentifier()
        const name: Identifier = { type: "Identifier", name: nameTok.value as string, ...spanFrom(nameTok, nameTok) }

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
            const values = this.parseExpressionList()
            return { type: "AssignmentStatement", targets, values, ...spanFrom(start, this.previous()) }
        }

        const first = this.parsePrefixExpression()

        if (this.checkOperator("=") || this.checkPunctuator(",")) {
            const targets: (Expression | ObjectPattern | ArrayPattern)[] = [first]
            while (this.matchPunctuator(",")) {
                targets.push(this.parseAssignTarget())
            }
            this.expectOperator("=")
            const values = this.parseExpressionList()
            return { type: "AssignmentStatement", targets, values, ...spanFrom(start, this.previous()) }
        }

        const t = this.current()
        if (t.type === "Operator" && COMPOUND_ASSIGN_OPS.has((t as any).value)) {
            const op = (this.advance() as any).value
            const value = this.parseExpression()
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
    private startsMethodCall(): boolean {
        if (this.peek(1).type !== "Identifier") return false
        const after = this.peek(2)
        if (after.type === "Punctuator") {
            const v = String((after as { value?: unknown }).value)
            return v === "(" || v === "{"
        }
        if (after.type === "InterpolatedString") return true
        return after.type === "Literal" && (after as { kind?: unknown }).kind === "string"
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
            const func = this.parseFunctionBody()
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
                const expression = parseExpressionFromSource(p.raw)
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
            if (this.matchPunctuator(".")) {
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
                const args = this.parseCallArguments()
                base = {
                    type: "MethodCallExpression",
                    object: base, method, arguments: args,
                    ...spanFrom(base, this.previous()),
                }
                continue
            }
            if (this.checkPunctuator("(") || this.checkType("Literal") && (this.current() as any).kind === "string" ||
                this.checkType("InterpolatedString") || this.checkPunctuator("{")) {
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

    private parseCallArguments(): Expression[] {
        if (this.matchPunctuator("(")) {
            if (this.checkPunctuator(")")) {
                this.advance()
                return []
            }
            const list = this.parseExpressionList()
            this.expectPunctuator(")")
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

        while (!this.checkPunctuator("}")) {
            if (this.checkOperator("...")) {
                this.advance()
                const argument = this.parseExpression()
                fields.push({ type: "TableFieldSpread", argument })
            } else if (this.matchPunctuator("[")) {
                const key = this.parseExpression()
                this.expectPunctuator("]")
                this.expectPunctuator(":")
                const value = this.parseExpression()
                fields.push({ type: "TableFieldComputed", key, value })
            } else if (this.checkType("Literal") && (this.current() as any).kind === "string") {
                const t = this.advance() as any
                const key: StringLiteral = { type: "StringLiteral", value: t.value, raw: t.raw, ...spanFrom(t, t) }
                this.expectPunctuator(":")
                const value = this.parseExpression()
                fields.push({ type: "TableFieldNamed", key, value })
            } else if (this.checkType("Identifier") && this.peek(1).type === "Punctuator" && (this.peek(1) as any).value === ":") {
                const key = this.parseIdentifier()
                this.expectPunctuator(":")
                const value = this.parseExpression()
                fields.push({ type: "TableFieldNamed", key, value })
            } else if (this.checkType("Identifier")) {
                const name = this.parseIdentifier()
                fields.push({ type: "TableFieldShorthand", name })
            } else {
                this.error("Expected object field ('key: value', '[expr]: value', shorthand, or '...spread'); use '[...]' for arrays")
            }

            if (this.matchPunctuator(",") || this.matchPunctuator(";")) continue
            break
        }

        this.expectPunctuator("}")
        return { type: "TableExpression", fields, ...spanFrom(start, this.previous()) }
    }

    // `[1, 2, 3]` — array literal (trailing comma allowed).
    private parseArrayExpression(): ArrayExpression {
        const start = this.current()
        this.expectPunctuator("[")
        const elements: (Expression | SpreadElement)[] = []
        while (!this.checkPunctuator("]")) {
            if (this.checkOperator("...")) {
                const dots = this.advance()
                const argument = this.parseExpression()
                elements.push({ type: "SpreadElement", argument, ...spanFrom(dots, argument) })
            } else {
                elements.push(this.parseExpression())
            }
            if (this.matchPunctuator(",")) continue
            break
        }
        this.expectPunctuator("]")
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
            target.typeAnnotation = this.parseType()
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
                if (this.matchPunctuator(":")) {
                    typeAnnotation = this.parseType()
                }
                let def: Expression | undefined
                if (this.matchOperator("=")) {
                    def = this.parseExpression()
                }
                params.push({
                    type: "FunctionParameter",
                    name, pattern, typeAnnotation, default: def,
                    optional: optional || undefined,
                    ...spanFrom(paramStart, this.previous()),
                })
                if (this.matchPunctuator(",")) continue
                break
            }
        }
        this.expectPunctuator(")")

        let returnType: TypeNode | undefined
        let predicate: TypePredicateNode | undefined
        if (this.matchPunctuator(":")) {
            predicate = this.tryParseTypePredicate()
            if (!predicate) returnType = this.parseTypeOrTypePackReference()
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

    private parseFunctionBody(): FunctionBody {
        const head = this.parseFunctionHead()
        const body = this.parseBlock()
        this.expectKeyword("end")
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

    private headToBody(head: ReturnType<Parser["parseFunctionHead"]>): FunctionBody {
        const body = this.parseBlock()
        this.expectKeyword("end")
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
            const name = this.expectIdentifier().value as string
            return { type: "InferTypeNode", name, ...spanFrom(t, this.previous()) }
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
                    while (this.matchPunctuator(",")) {
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
                if (named) {
                    name = this.expectIdentifier().value as string
                    optional = this.matchPunctuator("?")
                    this.advance() // ':'
                }
                const paramStart = this.current()
                const typeAnnotation = this.parseType()
                params.push({
                    type: "FunctionTypeParameter",
                    name, typeAnnotation,
                    optional: optional || undefined,
                    ...spanFrom(paramStart, this.previous()),
                })
                if (this.matchPunctuator(",")) continue
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
        const parameter = this.expectIdentifier().value as string
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
            parameter, constraint, nameType, template, optional, readonly,
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
            if (this.checkPunctuator("[")) {
                this.advance()
                const keyType = this.parseType()
                this.expectPunctuator("]")
                this.expectPunctuator(":")
                const valueType = this.parseType()
                properties.push({ type: "TableTypeIndexer", keyType, valueType })
            } else if (this.checkIdentifierValue("readonly") && this.peek(1).type === "Identifier") {
                // `readonly name: T` — the property may not be assigned to.
                // Still a soft keyword: a property actually named `readonly`
                // is followed by `:` or `?`, not by another identifier.
                this.advance()
                const name = this.expectIdentifier().value as string
                const optional = this.matchPunctuator("?")
                this.expectPunctuator(":")
                const valueType = this.parseType()
                properties.push({ type: "TableTypeProperty", name, valueType, optional, readonly: true })
            } else if (this.checkType("Identifier") &&
                ((this.peek(1).type === "Punctuator" && (this.peek(1) as any).value === ":") ||
                 (this.peek(1).type === "Punctuator" && (this.peek(1) as any).value === "?" &&
                  this.peek(2).type === "Punctuator" && (this.peek(2) as any).value === ":"))) {
                // luaut uses TS-style `name?: T` for an optional property
                // (it may be absent). A required property whose value may be
                // nil is written `name: T | nil`.
                const name = this.expectIdentifier().value as string
                const optional = this.matchPunctuator("?")
                this.expectPunctuator(":")
                const valueType = this.parseType()
                properties.push({
                    type: "TableTypeProperty",
                    name, valueType, optional,
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
                isPack,
                isConst: isConst || undefined,
                constraint,
                default: def,
                ...spanFrom(nameTok, this.previous()),
            })
            if (this.matchPunctuator(",")) continue
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
}

/**
 * Like `parse`, but never throws on a syntax error: it records every error,
 * synchronizes to the next statement boundary, and returns a best-effort AST
 * (with `ErrorStatement` nodes where statements were skipped). A lexer error
 * still can't produce a partial token stream, so it comes back as the sole
 * entry in `errors` alongside an empty program.
 *
 * This is the entry point a language server should use for open documents.
 */
export function parseWithRecovery(source: string): RecoverResult {
    let tokens: Token[]
    try {
        tokens = tokenize(source)
    } catch (e) {
        const le = e as { message?: string; line?: number; column?: number }
        const err = new ParseError(le.message ?? "Lex error", le.line ?? 1, le.column ?? 1)
        const empty: Program = {
            type: "Program",
            body: { type: "Block", statements: [], line: { start: 1, end: 1 }, column: { start: 1, end: 1 } },
            line: { start: 1, end: 1 }, column: { start: 1, end: 1 },
        }
        return { program: empty, errors: [err] }
    }
    const parser = new Parser(tokens, { recover: true })
    const program = parser.parseProgram()
    return { program, errors: parser.errors }
}
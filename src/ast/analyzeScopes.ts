import type { TypeNode, TypePackNode, TypeofTypeNode } from "./nodes"
// ============================================================
// Scope / binding analysis
// ------------------------------------------------------------
// Walks the AST once and resolves every variable-position
// `Identifier` to a `Binding`. Locals and globals are modeled
// symmetrically: both live in `bindings`, both are reachable
// through `bindingOf`, and both expose `references`. The only
// difference is `Binding.kind` and whether `declarationNode`
// is set.
//
// This pass does NOT touch the AST — it produces a side table
// (`ScopeAnalysis`) that later passes (rename, dead-code, a
// language server, ...) read from. Nodes are used as map keys,
// so re-running this pass after rebuilding the AST is fine and
// cheap; there's nothing to keep in sync by hand.
// ============================================================

import type {
    Program, Block, Statement, Expression, Identifier, TypedIdentifier,
    FunctionParameter, FunctionBody, TableField,
    BindingTarget, ObjectPattern, ArrayPattern, IdentifierPattern,
} from "./nodes"

// --------------------------------------------------------
// Public types
// --------------------------------------------------------

export type BindingId = number

export type BindingKind =
    | "local"        // `local x = ...`
    | "param"        // function parameter
    | "self"         // implicit `self` param from `function T:m()`
    | "for-numeric"  // `for i = 1, 10 do`
    | "for-generic"  // `for k, v in ... do`
    | "global"       // no enclosing declaration found

/** A node that can serve as a binding's "declared here" site. */
export type DeclarationNode = Identifier | TypedIdentifier | FunctionParameter | IdentifierPattern

export interface Binding {
    readonly id: BindingId
    /** Name at the point this binding was created. Rename passes update
     *  this and every node in `references` (+ `declarationNode`) together —
     *  this field is just what analysis saw, not a source of truth after a
     *  rename pass has run. */
    name: string
    readonly kind: BindingKind
    /** Absent for a `global` binding that was never assigned to in this
     *  file (e.g. only ever read, or a pre-registered builtin). */
    declarationNode?: DeclarationNode
    /** Every Identifier *usage* resolved to this binding (does not include
     *  `declarationNode` itself). */
    readonly references: Identifier[]
    /** True for globals pre-registered via `analyzeScopes`'s
     *  `builtinGlobals` option (e.g. `game`, `script`, `print`). Such
     *  bindings are never given a `declarationNode` from assignment
     *  inference, since they're not really "defined" in this file. */
    isBuiltin?: boolean
    /** True for a `const` binding — reassigning it is an error. */
    isConst?: boolean
}

export interface ScopeDiagnostic {
    /** the offending node (redeclaration site, or assignment target) */
    node: { line: { start: number; end: number }; column: { start: number; end: number } }
    message: string
    kind: "redeclare" | "const-assign"
}

export interface ScopeAnalysis {
    /** Every Identifier that appears in a variable *usage* position (i.e.
     *  every node also reachable through some `Binding.references`, plus
     *  `FunctionDeclarationStatement.target.base`), mapped to its binding.
     *  Property names, method names, table field names, and type-position
     *  identifiers are never entered here — they aren't variable refs. */
    readonly bindingOf: Map<Identifier | IdentifierPattern, BindingId>
    readonly bindings: Map<BindingId, Binding>
    /** Redeclaration-in-same-scope and assignment-to-const errors. */
    readonly diagnostics: ScopeDiagnostic[]
    /** Convenience: every global binding's id, keyed by name. Global
     *  bindings have no lexical scope, so this is the closest thing to
     *  "the" scope for them — and later a multi-file language server can
     *  swap this map out for a project-wide registry without changing
     *  anything else about this shape. */
    readonly globalsByName: Map<string, BindingId>
}

export interface AnalyzeScopesOptions {
    /** Names to pre-register as global bindings with `isBuiltin: true`
     *  before the walk starts (e.g. Roblox/Luau standard globals:
     *  `game`, `script`, `workspace`, `print`, `pairs`, ...). Referencing
     *  one of these does not count as "defining" it, so `declarationNode`
     *  is left unset even though the binding exists up front. */
    builtinGlobals?: readonly string[]
}

// --------------------------------------------------------
// Convenience accessors
// --------------------------------------------------------

export function getBinding(analysis: ScopeAnalysis, id: Identifier | IdentifierPattern): Binding | undefined {
    const bindingId = analysis.bindingOf.get(id)
    return bindingId === undefined ? undefined : analysis.bindings.get(bindingId)
}

export function isGlobal(binding: Binding): boolean {
    return binding.kind === "global"
}

/** True if a global binding was never assigned to anywhere in this file
 *  (and isn't a pre-registered builtin) — i.e. it's read-only and
 *  undeclared, which is almost always a typo rather than an intentional
 *  implicit global. Handy for a "possibly undefined global" diagnostic. */
export function isUnassignedGlobal(binding: Binding): boolean {
    return binding.kind === "global" && !binding.isBuiltin && binding.declarationNode === undefined
}

// --------------------------------------------------------
// Internal scope tree
// --------------------------------------------------------

interface Scope {
    readonly parent: Scope | null
    readonly declarations: Map<string, BindingId>
}

function childScope(parent: Scope): Scope {
    return { parent, declarations: new Map() }
}

// --------------------------------------------------------
// Analyzer
// --------------------------------------------------------

class Analyzer {
    private nextId = 0
    private readonly bindingOf = new Map<Identifier | IdentifierPattern, BindingId>()
    private readonly bindings = new Map<BindingId, Binding>()
    private readonly diagnostics: ScopeDiagnostic[] = []
    private readonly globalScope: Scope = { parent: null, declarations: new Map() }

    constructor(options: AnalyzeScopesOptions) {
        for (const name of options.builtinGlobals ?? []) {
            const id = this.getOrCreateGlobalBinding(name)
            this.bindings.get(id)!.isBuiltin = true
        }
    }

    run(program: Program): ScopeAnalysis {
        this.visitBlock(program.body, childScope(this.globalScope))
        return {
            bindingOf: this.bindingOf,
            bindings: this.bindings,
            diagnostics: this.diagnostics,
            globalsByName: this.globalScope.declarations,
        }
    }

    // ---------------- declaration / resolution primitives ----------------

    private declare(scope: Scope, name: string, kind: BindingKind, node: DeclarationNode, isConst = false): BindingId {
        // Redeclaration in the same lexical scope is an error (`const x` / `let x`
        // twice, a param named twice, ...). The later binding still wins so the
        // rest of analysis stays sane.
        if (scope.declarations.has(name) && scope !== this.globalScope) {
            this.diagnostics.push({
                node,
                message: `Cannot redeclare '${name}' in the same scope`,
                kind: "redeclare",
            })
        }
        const id = this.nextId++
        this.bindings.set(id, { id, name, kind, declarationNode: node, references: [], isConst })
        scope.declarations.set(name, id)
        return id
    }

    private resolve(scope: Scope, name: string): BindingId {
        for (let s: Scope | null = scope; s; s = s.parent) {
            const id = s.declarations.get(name)
            if (id !== undefined) return id
        }
        return this.getOrCreateGlobalBinding(name)
    }

    private getOrCreateGlobalBinding(name: string): BindingId {
        const existing = this.globalScope.declarations.get(name)
        if (existing !== undefined) return existing
        const id = this.nextId++
        this.bindings.set(id, { id, name, kind: "global", references: [] })
        this.globalScope.declarations.set(name, id)
        return id
    }

    /** Record a variable-usage Identifier as resolved to `scope`'s view of
     *  its name. */
    private reference(scope: Scope, identifier: Identifier): void {
        const id = this.resolve(scope, identifier.name)
        this.bindingOf.set(identifier, id)
        this.bindings.get(id)!.references.push(identifier)
    }

    /** For assignment-like targets (`x = ...`, `function foo() end`): if
     *  this resolved to a global with no declaration site yet, treat this
     *  as its "definition" for go-to-definition purposes. Locals and
     *  builtins are left alone. */
    private recordPossibleGlobalDefinition(id: BindingId, node: DeclarationNode): void {
        const binding = this.bindings.get(id)!
        if (binding.kind === "global" && !binding.isBuiltin && binding.declarationNode === undefined) {
            binding.declarationNode = node
        }
    }

    private referenceAsAssignmentTarget(scope: Scope, identifier: Identifier): void {
        const id = this.resolve(scope, identifier.name)
        this.bindingOf.set(identifier, id)
        this.bindings.get(id)!.references.push(identifier)
        this.recordPossibleGlobalDefinition(id, identifier)
        this.checkConstAssign(id, identifier)
    }

    private checkConstAssign(id: BindingId, node: ScopeDiagnostic["node"]): void {
        const b = this.bindings.get(id)!
        if (b.isConst) {
            this.diagnostics.push({
                node,
                message: `Cannot assign to '${b.name}' — it is a const`,
                kind: "const-assign",
            })
        }
    }

    // ---------------- destructuring patterns ----------------

    /** Declares every leaf binding introduced by `target`. Default values and
     *  computed keys are expressions, evaluated in `evalScope`. */
    private declarePattern(scope: Scope, target: BindingTarget, kind: BindingKind, evalScope: Scope, isConst = false): void {
        switch (target.type) {
            case "IdentifierPattern":
                this.declare(scope, target.name, kind, target, isConst)
                return
            case "ObjectPattern":
                for (const p of target.properties) {
                    if (p.computed) this.visitExpression(p.key as Expression, evalScope)
                    if (p.default) this.visitExpression(p.default, evalScope)
                    this.declarePattern(scope, p.value, kind, evalScope, isConst)
                }
                if (target.rest) this.declarePattern(scope, target.rest, kind, evalScope, isConst)
                return
            case "ArrayPattern":
                for (const el of target.elements) {
                    if (!el) continue
                    if (el.default) this.visitExpression(el.default, evalScope)
                    this.declarePattern(scope, el.value, kind, evalScope, isConst)
                }
                if (target.rest) this.declarePattern(scope, target.rest, kind, evalScope, isConst)
                return
        }
    }

    /** Like `declarePattern`, but for a destructuring *assignment* target
     *  (`{a, b} = t`): leaves resolve to existing bindings rather than
     *  declaring new ones. */
    private assignPattern(scope: Scope, target: ObjectPattern | ArrayPattern): void {
        const walk = (t: BindingTarget): void => {
            switch (t.type) {
                case "IdentifierPattern": {
                    const id = this.resolve(scope, t.name)
                    this.bindingOf.set(t, id)
                    this.recordPossibleGlobalDefinition(id, t)
                    this.checkConstAssign(id, t)
                    return
                }
                case "ObjectPattern":
                    for (const p of t.properties) {
                        if (p.computed) this.visitExpression(p.key as Expression, scope)
                        if (p.default) this.visitExpression(p.default, scope)
                        walk(p.value)
                    }
                    if (t.rest) walk(t.rest)
                    return
                case "ArrayPattern":
                    for (const el of t.elements) {
                        if (!el) continue
                        if (el.default) this.visitExpression(el.default, scope)
                        walk(el.value)
                    }
                    if (t.rest) walk(t.rest)
                    return
            }
        }
        walk(target)
    }

    // ---------------- blocks / statements ----------------

    private visitBlock(block: Block, scope: Scope): void {
        for (const stmt of block.statements) this.visitStatement(stmt, scope)
    }

    /** Visits a block in a *fresh child scope* of `scope` — the common case
     *  for loop/if/do bodies, where the block's own locals shouldn't leak
     *  into the surrounding scope. */
    private visitBlockInNewScope(block: Block, scope: Scope): void {
        this.visitBlock(block, childScope(scope))
    }

    private visitStatement(stmt: Statement, scope: Scope): void {
        switch (stmt.type) {
            case "VariableDeclaration": {
                // Initializers see the *old* bindings — `const x = x` reads
                // the outer `x`, not the one being declared.
                for (const init of stmt.init) this.visitExpression(init, scope)
                for (const name of stmt.names) this.visitType(name.typeAnnotation, scope)
                const isConst = stmt.kind === "const"
                for (const name of stmt.names) this.declarePattern(scope, name, "local", scope, isConst)
                return
            }

            case "FunctionDeclaration": {
                // Declared *before* visiting the body so recursive calls
                // resolve to itself.
                this.declare(scope, stmt.name.name, "local", stmt.name, stmt.kind === "const")
                for (const signature of stmt.signatures ?? []) this.visitSignature(signature, scope)
                this.visitFunctionBody(stmt.func, scope)
                return
            }

            case "FunctionDeclarationStatement": {
                // `function foo() end` rebinds `foo`; `function T.m() end` /
                // `function T:m() end` writes a *member* of `T` (not a rebind,
                // so a `const T` is fine).
                if (stmt.target.path.length === 0 && !stmt.target.method) {
                    this.referenceAsAssignmentTarget(scope, stmt.target.base)
                } else {
                    this.reference(scope, stmt.target.base)
                }
                for (const signature of stmt.signatures ?? []) this.visitSignature(signature, scope)
                this.visitFunctionBody(stmt.func, scope, stmt.isMethod)
                return
            }

            case "AssignmentStatement": {
                for (const value of stmt.values) this.visitExpression(value, scope)
                for (const target of stmt.targets) {
                    if (target.type === "Identifier") {
                        this.referenceAsAssignmentTarget(scope, target)
                    } else if (target.type === "ObjectPattern" || target.type === "ArrayPattern") {
                        this.assignPattern(scope, target)
                    } else {
                        // MemberExpression / IndexExpression target: the
                        // object is a reference, the property/index isn't
                        // (or is itself a full expression already handled).
                        this.visitExpression(target, scope)
                    }
                }
                return
            }

            case "CompoundAssignmentStatement": {
                this.visitExpression(stmt.value, scope)
                if (stmt.target.type === "Identifier") {
                    this.reference(scope, stmt.target)
                    const id = this.bindingOf.get(stmt.target)
                    if (id !== undefined) this.checkConstAssign(id, stmt.target)
                } else {
                    this.visitExpression(stmt.target, scope)
                }
                return
            }

            case "CallStatement":
                this.visitExpression(stmt.expression, scope)
                return

            case "DoStatement":
                this.visitBlockInNewScope(stmt.body, scope)
                return

            case "WhileStatement":
                this.visitExpression(stmt.condition, scope)
                this.visitBlockInNewScope(stmt.body, scope)
                return

            case "RepeatStatement": {
                // Luau/Lua quirk: `until` can see locals declared in the
                // body, unlike `while` — so body + condition share one scope.
                const bodyScope = childScope(scope)
                this.visitBlock(stmt.body, bodyScope)
                this.visitExpression(stmt.condition, bodyScope)
                return
            }

            case "IfStatement": {
                for (const clause of stmt.clauses) {
                    this.visitExpression(clause.condition, scope)
                    this.visitBlockInNewScope(clause.body, scope)
                }
                if (stmt.alternate) this.visitBlockInNewScope(stmt.alternate, scope)
                return
            }

            case "NumericForStatement": {
                this.visitExpression(stmt.start, scope)
                this.visitExpression(stmt.end, scope)
                if (stmt.step) this.visitExpression(stmt.step, scope)
                const bodyScope = childScope(scope)
                this.declare(bodyScope, stmt.variable.name, "for-numeric", stmt.variable)
                this.visitBlock(stmt.body, bodyScope)
                return
            }

            case "GenericForStatement": {
                for (const it of stmt.iterators) this.visitExpression(it, scope)
                const bodyScope = childScope(scope)
                for (const v of stmt.variables) this.declarePattern(bodyScope, v, "for-generic", scope)
                this.visitBlock(stmt.body, bodyScope)
                return
            }

            case "ReturnStatement":
                for (const arg of stmt.arguments) this.visitExpression(arg, scope)
                return

            case "BreakStatement":
            case "ContinueStatement":
            case "ErrorStatement":
                return

            case "DeclareStatement":
                this.visitType(stmt.valueType, scope)
                return

            case "TypeAliasStatement":
            case "ExportTypeAliasStatement":
                // Type-level names live in a separate namespace from value
                // bindings, but a `typeof x` inside the definition reads a
                // value.
                this.visitType((stmt as { definition?: TypeNode }).definition, scope)
                return

            case "ImportStatement": {
                // `import Foo, { a, b as c } from "..."` introduces locals
                // `Foo`, `a`, `c` in the current scope.
                if (stmt.defaultImport) {
                    this.declare(scope, stmt.defaultImport.name, "local", stmt.defaultImport)
                }
                for (const spec of stmt.specifiers) {
                    this.declare(scope, spec.local.name, "local", spec.local)
                }
                return
            }

            case "ExportStatement":
                // `export local x = ...` / `export const f = ...` — the
                // declaration binds normally; `export` is compile-time only.
                this.visitStatement(stmt.declaration, scope)
                return

            case "ExportDefaultStatement":
                this.visitExpression(stmt.declaration, scope)
                return
        }
    }

    // ---------------- functions ----------------

    private visitFunctionBody(func: FunctionBody, outerScope: Scope, isMethod = false): void {
        // Params + body share one scope — nothing meaningful happens
        // "between" param declarations and the body that would need its
        // own layer.
        const fnScope = childScope(outerScope)
        // For `function T:m(...)`, the parser already injects a real
        // `self` FunctionParameter as `params[0]` (see builders.ts) — it's
        // not synthesized here, just classified differently so rename
        // passes can special-case it (e.g. "never rename self").
        func.params.forEach((param, i) => {
            const kind: BindingKind = isMethod && i === 0 ? "self" : "param"
            // Before declaring it: `(a: number, b: typeof a)` sees the earlier
            // parameters, as in TypeScript.
            this.visitType(param.typeAnnotation, fnScope)
            if (param.default) this.visitExpression(param.default, fnScope)
            if (param.pattern) {
                this.declarePattern(fnScope, param.pattern, kind, fnScope)
            } else {
                this.declare(fnScope, param.name, kind, param)
            }
        })
        this.visitType(func.varargTypeAnnotation, fnScope)
        this.visitType(func.returnType, fnScope)
        this.visitBlock(func.body, fnScope)
    }

    /** An overload signature: no body and no bindings, but its types can hold
     *  a `typeof x`. */
    private visitSignature(
        signature: { params: { typeAnnotation?: TypeNode }[]; returnType?: TypeNode | TypePackNode },
        scope: Scope,
    ): void {
        for (const param of signature.params) this.visitType(param.typeAnnotation, scope)
        this.visitType(signature.returnType, scope)
    }

    /** Resolve the value references inside a type. Only `typeof x` has any —
     *  everything else in a type names types, which live in their own
     *  namespace and are not this pass's business. */
    private visitType(node: TypeNode | TypePackNode | undefined, scope: Scope): void {
        if (!node) return
        const walk = (value: unknown): void => {
            if (!value || typeof value !== "object") return
            if (Array.isArray(value)) {
                for (const item of value) walk(item)
                return
            }
            if ((value as { type?: unknown }).type === "TypeofTypeNode") {
                this.visitExpression((value as TypeofTypeNode).expression, scope)
                return
            }
            for (const key of Object.keys(value)) {
                if (key !== "line" && key !== "column") walk((value as Record<string, unknown>)[key])
            }
        }
        walk(node)
    }

    // ---------------- expressions ----------------

    private visitExpression(expr: Expression, scope: Scope): void {
        switch (expr.type) {
            case "Identifier":
                this.reference(scope, expr)
                return

            case "NilLiteral":
            case "BooleanLiteral":
            case "NumberLiteral":
            case "StringLiteral":
            case "VarargExpression":
                return

            case "InterpolatedStringExpression":
                for (const part of expr.parts) {
                    if (part.kind === "expression") this.visitExpression(part.expression, scope)
                }
                return

            case "FunctionExpression":
                this.visitFunctionBody(expr.func, scope)
                return

            case "TableExpression":
                for (const field of expr.fields) this.visitTableField(field, scope)
                return

            case "ArrayExpression":
                for (const el of expr.elements) {
                    this.visitExpression(el.type === "SpreadElement" ? el.argument : el, scope)
                }
                return

            case "AsConstExpression":
                this.visitExpression(expr.expression, scope)
                return

            case "BinaryExpression":
                this.visitExpression(expr.left, scope)
                this.visitExpression(expr.right, scope)
                return

            case "UnaryExpression":
                this.visitExpression(expr.argument, scope)
                return

            case "MemberExpression":
                // `.property` is a field name, not a variable ref.
                this.visitExpression(expr.object, scope)
                return

            case "IndexExpression":
                this.visitExpression(expr.object, scope)
                this.visitExpression(expr.index, scope)
                return

            case "CallExpression":
                this.visitExpression(expr.callee, scope)
                for (const arg of expr.arguments) this.visitExpression(arg, scope)
                return

            case "MethodCallExpression":
                // `.method` is a method name, not a variable ref.
                this.visitExpression(expr.object, scope)
                for (const arg of expr.arguments) this.visitExpression(arg, scope)
                return

            case "ParenthesizedExpression":
                this.visitExpression(expr.expression, scope)
                return

            case "TypeAssertionExpression":
                this.visitExpression(expr.expression, scope)
                this.visitType((expr as { typeAnnotation?: TypeNode }).typeAnnotation, scope)
                return

            case "SatisfiesExpression":
                // Was missing entirely: nothing inside `x satisfies T` was
                // resolved, so `x` had no binding there.
                this.visitExpression(expr.expression, scope)
                this.visitType(expr.typeAnnotation, scope)
                return

            case "IfElseExpression":
                for (const clause of expr.clauses) {
                    this.visitExpression(clause.condition, scope)
                    this.visitExpression(clause.body, scope)
                }
                this.visitExpression(expr.alternate, scope)
                return
        }
    }

    private visitTableField(field: TableField, scope: Scope): void {
        switch (field.type) {
            case "TableFieldNamed":
                // `.name` is a field name, not a variable ref.
                this.visitExpression(field.value, scope)
                return
            case "TableFieldShorthand":
                // `{ a }` reads `a` from scope (sugar for `{ a: a }`).
                this.reference(scope, field.name)
                return
            case "TableFieldSpread":
                this.visitExpression(field.argument, scope)
                return
            case "TableFieldComputed":
                this.visitExpression(field.key, scope)
                this.visitExpression(field.value, scope)
                return
        }
    }
}

// --------------------------------------------------------
// Entry point
// --------------------------------------------------------

export function analyzeScopes(program: Program, options: AnalyzeScopesOptions = {}): ScopeAnalysis {
    return new Analyzer(options).run(program)
}
interface BaseToken {
    line: {
        start: number;
        end: number;
    };
    column: {
        start: number;
        end: number;
    };
}
declare const Keywords: readonly ["and", "break", "do", "else", "elseif", "end", "false", "for", "function", "if", "in", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while", "continue", "const", "let", "import", "export", "from", "as"];
interface KeywordToken extends BaseToken {
    type: "Keyword";
    value: typeof Keywords[number];
}
interface IdentifierToken extends BaseToken {
    type: "Identifier";
    value: string;
}
type LiteralToken = (BaseToken & {
    type: "Literal";
    kind: "number";
    value: number;
    raw: string;
}) | (BaseToken & {
    type: "Literal";
    kind: "string";
    value: string;
    raw: string;
}) | (BaseToken & {
    type: "Literal";
    kind: "nil";
    value: null;
}) | (BaseToken & {
    type: "Literal";
    kind: "boolean";
    value: boolean;
});
declare const Operators: readonly ["+=", "-=", "*=", "/=", "//=", "%=", "^=", "..=", "==", "~=", "<=", ">=", "//", "..", "...", "+", "-", "*", "/", "%", "^", "#", "<", ">", "="];
interface OperatorToken extends BaseToken {
    type: "Operator";
    value: typeof Operators[number];
}
declare const Punctuators: readonly ["::", "(", ")", "{", "}", "[", "]", ";", ":", ",", ".", "?", "->", "&", "|", "@"];
interface PunctuatorToken extends BaseToken {
    type: "Punctuator";
    value: typeof Punctuators[number];
}
interface InterpolatedStringPart_String {
    kind: "string";
    value: string;
    raw: string;
}
interface InterpolatedStringPart_Expression {
    kind: "expression";
    raw: string;
    /** Where `raw` starts in the file, so what is parsed from it can be
     *  placed there rather than at the top of an imaginary one. */
    line: number;
    column: number;
}
interface InterpolatedStringToken extends BaseToken {
    type: "InterpolatedString";
    parts: (InterpolatedStringPart_String | InterpolatedStringPart_Expression)[];
}
interface EOFToken extends BaseToken {
    type: "EOF";
}
type Token = KeywordToken | LiteralToken | OperatorToken | PunctuatorToken | IdentifierToken | InterpolatedStringToken | EOFToken;
declare class LexError extends Error {
    line: number;
    column: number;
    constructor(message: string, line: number, column: number);
}
/** A `--` comment: its text after the dashes (a long comment's content), and
 *  where it starts and ends. */
interface SourceComment {
    text: string;
    line: number;
    column: number;
    endLine: number;
}
interface TokenizeOptions {
    /** When given, a malformed token is recorded here instead of thrown, and
     *  lexing goes on: an unclosed string or comment ends at the end of its
     *  line (a long bracket at the end of the source), and a character that
     *  starts no token is skipped. An editor mid-keystroke still gets every
     *  other token. */
    errors?: LexError[];
    /** When given, every comment is collected here, in order. */
    comments?: SourceComment[];
}
declare function tokenize(source: string, options?: TokenizeOptions): Token[];

/**
 * Comments that switch checking off, as TypeScript's `// @ts-...` comments do:
 *
 *     --@luaut-nocheck         no scope or type errors anywhere in this file
 *     --@luaut-ignore          none on the next line of code
 *     --@luaut-expect-error    none on the next line of code, and an error if
 *                              that line has none to suppress
 *
 * A space after `--` is fine, and so is text after the directive (a reason).
 * `nocheck` counts only in the comments before the first line of code, as in
 * TypeScript. Syntax errors are never suppressed: code that does not parse
 * cannot be compiled either way.
 */
type DirectiveKind = "nocheck" | "ignore" | "expect-error";
interface Directive {
    kind: DirectiveKind;
    /** Where the comment starts. */
    line: number;
    column: number;
    /** `ignore` / `expect-error`: the line whose diagnostics it covers — the
     *  next line with code on it. */
    target?: number;
}
interface Directives {
    /** The file has `--@luaut-nocheck` before its first line of code. */
    nocheck: boolean;
    /** Every directive, in order — a `nocheck` after the code starts included,
     *  so a tool can point out that it does nothing. */
    all: Directive[];
}
/** The directives in `comments`, placed against `tokens` (both from one
 *  `tokenize` of the file). */
declare function readDirectives(comments: readonly SourceComment[], tokens: readonly Token[]): Directives;
/** The directives of `source`, for a caller that parsed it some other way. */
declare function directivesOf(source: string): Directives;
interface DirectiveOutcome<T> {
    /** The diagnostics no directive suppresses. */
    kept: T[];
    /** `--@luaut-expect-error` comments with nothing to suppress. Each is an
     *  error to report: "Unused '@luaut-expect-error' directive". */
    unusedExpectErrors: Directive[];
}
/** Filter scope and type diagnostics — never syntax errors — through the
 *  file's directives. `lineOf` gives the line a diagnostic starts on. */
declare function applyDirectives<T>(directives: Directives, diagnostics: readonly T[], lineOf: (diagnostic: T) => number): DirectiveOutcome<T>;
declare const UNUSED_EXPECT_ERROR = "Unused '@luaut-expect-error' directive";

interface BaseNode {
    line: {
        start: number;
        end: number;
    };
    column: {
        start: number;
        end: number;
    };
}
interface Program extends BaseNode {
    type: "Program";
    body: Block;
}
interface Block extends BaseNode {
    type: "Block";
    statements: Statement[];
}
interface ImportSpecifier extends BaseNode {
    type: "ImportSpecifier";
    /** the exported name in the source module */
    imported: Identifier;
    /** the local binding name — same as `imported` unless renamed with `as` */
    local: Identifier;
}
interface ImportStatement extends BaseNode {
    type: "ImportStatement";
    /** `import Default from '...'` */
    defaultImport?: Identifier;
    /** `import * as Module from '...'` — the module's exports as one value. */
    namespaceImport?: Identifier;
    /** `import type { A } from '...'`: every name it brings in is a type and
     *  may only be used as one — never as a value. It exists for the type
     *  checker alone, and leaves nothing in compiled code. */
    isTypeOnly?: boolean;
    /** `import { a, b as c } from '...'` */
    specifiers: ImportSpecifier[];
    source: StringLiteral;
}
/** `export const x = 1`, `export let y = 2`, `export function f() end` */
interface ExportStatement extends BaseNode {
    type: "ExportStatement";
    declaration: VariableDeclaration | FunctionDeclaration;
}
/** `export default <expr>` — mirrors JS default export / dynamic import()'s
 *  `{ default: ... }` shape. Distinct from ExportStatement because the
 *  right-hand side is any expression, not necessarily a declaration. */
interface ExportDefaultStatement extends BaseNode {
    type: "ExportDefaultStatement";
    declaration: Expression;
}
interface ExportSpecifier extends BaseNode {
    type: "ExportSpecifier";
    /** The name in this module — or, with `from`, in the other module. */
    local: Identifier;
    /** The name it is exported as — same as `local` unless renamed with `as`. */
    exported: Identifier;
}
/** `export { a, b as c }` exports names declared elsewhere in the module;
 *  `export { a, b as c } from "./x"` re-exports another module's names. */
interface ExportNamedStatement extends BaseNode {
    type: "ExportNamedStatement";
    specifiers: ExportSpecifier[];
    source?: StringLiteral;
}
/** `export * from "./x"` — every named export of another module (not its
 *  default), except names this module exports itself. */
interface ExportAllStatement extends BaseNode {
    type: "ExportAllStatement";
    source: StringLiteral;
}
type Statement = VariableDeclaration | FunctionDeclaration | FunctionDeclarationStatement | AssignmentStatement | CompoundAssignmentStatement | CallStatement | DoStatement | WhileStatement | RepeatStatement | IfStatement | NumericForStatement | GenericForStatement | ReturnStatement | BreakStatement | ContinueStatement | TypeAliasStatement | ExportTypeAliasStatement | ImportStatement | ExportStatement | ExportDefaultStatement | ExportNamedStatement | ExportAllStatement | DeclareStatement | DeclareClassStatement | ErrorStatement;
/** `declare game: DataModel` / `declare function require(m: string): unknown`
 *  — an ambient value/function declaration for a definitions file (`.d.luaut`).
 *  Contributes a global type; emits no runtime code. */
interface DeclareStatement extends BaseNode {
    type: "DeclareStatement";
    name: string;
    /** The name as a node, so tools can point at it — `name` has no span. */
    id: Identifier;
    /** the declared value's type (function form is lowered to a FunctionTypeNode) */
    valueType: TypeNode;
}
/** `declare class Part extends BasePart { Shape: EnumItem }` — a *nominal*
 *  type for a definitions file, the way Roblox's own classes are: a `Part` is
 *  an `Instance` because it extends one, not because it has the same members,
 *  and no table literal is ever a `Part`. The body lists the members the class
 *  adds; it inherits the rest. Declares a type only, no value. */
interface DeclareClassStatement extends BaseNode {
    type: "DeclareClassStatement";
    name: Identifier;
    /** `extends Base` — another class. */
    superclass?: TypeReference;
    body: TableTypeNode;
}
/** A statement position that could not be parsed. Only produced when parsing
 *  in recovery mode (`parseWithRecovery`); its span covers the skipped tokens
 *  so tools can still map a cursor there. */
interface ErrorStatement extends BaseNode {
    type: "ErrorStatement";
}
/** `const x = 1` / `let x, y = a, b` — the only variable-binding form in luaut
 *  (Luau's `local` is gone). `const` bindings are immutable and infer literal
 *  types (`const n = 1` → `1`); `let` bindings are mutable and widen. */
interface VariableDeclaration extends BaseNode {
    type: "VariableDeclaration";
    kind: "const" | "let";
    names: BindingTarget[];
    init: Expression[];
}
type BindingTarget = IdentifierPattern | ObjectPattern | ArrayPattern;
interface IdentifierPattern extends BaseNode {
    type: "IdentifierPattern";
    name: string;
    /** only meaningful at the top level of a binding (`local x: T`, `{a}: T`) */
    typeAnnotation?: TypeNode;
    /** `local x <const>` attribute list */
    attributes?: string[];
}
interface ObjectPattern extends BaseNode {
    type: "ObjectPattern";
    properties: ObjectPatternProperty[];
    /** `...rest` — collects the remaining own keys into a new object */
    rest?: BindingTarget;
    typeAnnotation?: TypeNode;
}
interface ObjectPatternProperty extends BaseNode {
    type: "ObjectPatternProperty";
    /** identifier/string key, or any expression when `computed` */
    key: Identifier | StringLiteral | Expression;
    computed: boolean;
    /** binding target; for shorthand this is an IdentifierPattern named after `key` */
    value: BindingTarget;
    /** `{ a = 1 }` / `{ a: b = 1 }` default */
    default?: Expression;
    shorthand: boolean;
}
interface ArrayPattern extends BaseNode {
    type: "ArrayPattern";
    /** `null` entries are elision holes (`[, a]`) */
    elements: (ArrayPatternElement | null)[];
    /** `...rest` — collects the remaining elements into a new array */
    rest?: BindingTarget;
    typeAnnotation?: TypeNode;
}
interface ArrayPatternElement extends BaseNode {
    type: "ArrayPatternElement";
    value: BindingTarget;
    default?: Expression;
}
/** `function f() ... end` — declares `f` in the enclosing scope, visible to
 *  its own body (so it can recurse). Like TypeScript's function declaration,
 *  the name cannot be reassigned. `function a.b() end` and `function T:m() end`
 *  assign to a member instead: see `FunctionDeclarationStatement`. */
interface FunctionDeclaration extends BaseNode {
    type: "FunctionDeclaration";
    /** The name on the line the body is written on, when the declaration is
     *  an overload set — `name` is the first signature's. */
    implementationName?: Identifier;
    name: Identifier;
    func: FunctionBody;
    attributes?: string[];
    /** TS-style overload signatures preceding the implementation (`func`). */
    signatures?: FunctionSignature[];
}
/** `function a.b() end` / `function T:m() end` — defines a member. */
interface FunctionDeclarationStatement extends BaseNode {
    type: "FunctionDeclarationStatement";
    target: FunctionName;
    isMethod: boolean;
    func: FunctionBody;
    attributes?: string[];
    /** TS-style overload signatures preceding the implementation (`func`). */
    signatures?: FunctionSignature[];
}
/** A bodyless function declaration — an overload signature. luaut uses the
 *  exact TS shape: one or more `function f(...): T` lines with no `end`,
 *  followed by the implementation `function f(...) ... end`. */
interface FunctionSignature extends BaseNode {
    type: "FunctionSignature";
    /** The name this signature was written with — one line of an overload
     *  set, each of which a tool can point at on its own. */
    name?: Identifier;
    generics: GenericTypeParameter[];
    params: FunctionParameter[];
    hasVarargs: boolean;
    varargTypeAnnotation?: TypeNode;
    returnType?: TypeNode;
    /** `: v is T` / `: asserts v` instead of a plain return type. */
    predicate?: TypePredicateNode;
}
interface FunctionName extends BaseNode {
    type: "FunctionName";
    base: Identifier;
    path: Identifier[];
    method?: Identifier;
}
interface AssignmentStatement extends BaseNode {
    type: "AssignmentStatement";
    targets: (Expression | ObjectPattern | ArrayPattern)[];
    values: Expression[];
}
interface CompoundAssignmentStatement extends BaseNode {
    type: "CompoundAssignmentStatement";
    operator: "+=" | "-=" | "*=" | "/=" | "//=" | "%=" | "^=" | "..=";
    target: Expression;
    value: Expression;
}
interface CallStatement extends BaseNode {
    type: "CallStatement";
    expression: CallExpression | MethodCallExpression;
}
interface DoStatement extends BaseNode {
    type: "DoStatement";
    body: Block;
}
interface WhileStatement extends BaseNode {
    type: "WhileStatement";
    condition: Expression;
    body: Block;
}
interface RepeatStatement extends BaseNode {
    type: "RepeatStatement";
    body: Block;
    condition: Expression;
}
interface IfClause extends BaseNode {
    type: "IfClause";
    condition: Expression;
    body: Block;
}
interface IfStatement extends BaseNode {
    type: "IfStatement";
    clauses: IfClause[];
    alternate?: Block;
}
interface NumericForStatement extends BaseNode {
    type: "NumericForStatement";
    variable: TypedIdentifier;
    start: Expression;
    end: Expression;
    step?: Expression;
    body: Block;
}
interface GenericForStatement extends BaseNode {
    type: "GenericForStatement";
    variables: BindingTarget[];
    iterators: Expression[];
    body: Block;
}
interface ReturnStatement extends BaseNode {
    type: "ReturnStatement";
    arguments: Expression[];
}
interface BreakStatement extends BaseNode {
    type: "BreakStatement";
}
interface ContinueStatement extends BaseNode {
    type: "ContinueStatement";
}
interface TypeAliasStatement extends BaseNode {
    type: "TypeAliasStatement";
    name: Identifier;
    generics: GenericTypeParameter[];
    definition: TypeNode;
}
interface ExportTypeAliasStatement extends BaseNode {
    type: "ExportTypeAliasStatement";
    alias: TypeAliasStatement;
}
interface GenericTypeParameter extends BaseNode {
    type: "GenericTypeParameter";
    name: string;
    /** The name as a node. Absent on parameters the analyzer synthesizes. */
    id?: Identifier;
    isPack?: boolean;
    /** `<const T>` — infer the argument at its narrowest instead of widening
     *  it: literals stay literal and array literals become tuples. */
    isConst?: boolean;
    /** `<T extends C>` upper bound (TS style). */
    constraint?: TypeNode;
    default?: TypeNode | TypePackNode;
}
type Expression = Identifier | NilLiteral | BooleanLiteral | NumberLiteral | StringLiteral | InterpolatedStringExpression | VarargExpression | FunctionExpression | TableExpression | ArrayExpression | BinaryExpression | UnaryExpression | MemberExpression | IndexExpression | CallExpression | MethodCallExpression | ParenthesizedExpression | TypeAssertionExpression | SatisfiesExpression | AsConstExpression | IfElseExpression | ErrorExpression;
/** An expression that could not be parsed. Only produced in recovery mode
 *  (`parseWithRecovery`), where a broken initializer, condition, field value or
 *  argument keeps its place in the tree; its span covers the skipped tokens
 *  (and is empty when nothing was written). Its type is `any`. */
interface ErrorExpression extends BaseNode {
    type: "ErrorExpression";
}
interface Identifier extends BaseNode {
    type: "Identifier";
    name: string;
}
interface TypedIdentifier extends BaseNode {
    type: "TypedIdentifier";
    name: string;
    typeAnnotation?: TypeNode;
    attributes?: string[];
}
interface NilLiteral extends BaseNode {
    type: "NilLiteral";
}
interface BooleanLiteral extends BaseNode {
    type: "BooleanLiteral";
    value: boolean;
}
interface NumberLiteral extends BaseNode {
    type: "NumberLiteral";
    value: number;
    raw: string;
}
interface StringLiteral extends BaseNode {
    type: "StringLiteral";
    value: string;
    raw: string;
}
type InterpolatedStringPart = {
    kind: "string";
    value: string;
    raw: string;
} | {
    kind: "expression";
    expression: Expression;
};
interface InterpolatedStringExpression extends BaseNode {
    type: "InterpolatedStringExpression";
    parts: InterpolatedStringPart[];
}
interface VarargExpression extends BaseNode {
    type: "VarargExpression";
}
interface FunctionParameter extends BaseNode {
    type: "FunctionParameter";
    /** `name?: T` — the argument may be omitted, and its type admits `nil`. */
    optional?: boolean;
    /** the parameter name, or `""` when `pattern` is set */
    name: string;
    /** JS-style destructured parameter (`function f({a}, [b]) end`) */
    pattern?: ObjectPattern | ArrayPattern;
    typeAnnotation?: TypeNode;
    /** default value (`function f(a = 1) end`) */
    default?: Expression;
}
interface FunctionBody extends BaseNode {
    type: "FunctionBody";
    generics: GenericTypeParameter[];
    params: FunctionParameter[];
    hasVarargs: boolean;
    varargTypeAnnotation?: TypeNode;
    returnType?: TypeNode;
    /** `: v is T` / `: asserts v` instead of a plain return type. */
    predicate?: TypePredicateNode;
    /** Declared as `function T:m(...)`, so `params[0]` is the injected `self`. */
    isMethod?: boolean;
    body: Block;
}
interface FunctionExpression extends BaseNode {
    type: "FunctionExpression";
    func: FunctionBody;
}
type TableField = 
/** `a: v` or `"a": v` — JS colon syntax (NOT Luau `a = v`). */
{
    type: "TableFieldNamed";
    key: Identifier | StringLiteral;
    value: Expression;
}
/** `[expr]: v` — computed key. */
 | {
    type: "TableFieldComputed";
    key: Expression;
    value: Expression;
}
/** `{ a }` shorthand — sugar for `{ a: a }`. */
 | {
    type: "TableFieldShorthand";
    name: Identifier;
}
/** `{ ...expr }` — JS object spread. */
 | {
    type: "TableFieldSpread";
    argument: Expression;
};
/** `{ a: 1, [k]: v }` — object literal (Luau `{}` narrowed to objects only). */
interface TableExpression extends BaseNode {
    type: "TableExpression";
    fields: TableField[];
}
/** `[1, 2, ...rest]` — array literal. Lowers to a Luau `{1, 2}` sequence table. */
interface ArrayExpression extends BaseNode {
    type: "ArrayExpression";
    elements: (Expression | SpreadElement)[];
}
/** `...expr` inside an array literal. */
interface SpreadElement extends BaseNode {
    type: "SpreadElement";
    argument: Expression;
}
declare const BinaryOperators: readonly ["+", "-", "*", "/", "//", "%", "^", "..", "==", "~=", "<", ">", "<=", ">=", "and", "or"];
interface BinaryExpression extends BaseNode {
    type: "BinaryExpression";
    operator: typeof BinaryOperators[number];
    left: Expression;
    right: Expression;
}
declare const UnaryOperators: readonly ["-", "not", "#"];
interface UnaryExpression extends BaseNode {
    type: "UnaryExpression";
    operator: typeof UnaryOperators[number];
    argument: Expression;
}
interface MemberExpression extends BaseNode {
    type: "MemberExpression";
    object: Expression;
    property: Identifier;
    /** `object?.property` — when `object` is nil, the whole chain this link
     *  belongs to is nil and nothing after it is evaluated. */
    optional?: boolean;
}
interface IndexExpression extends BaseNode {
    type: "IndexExpression";
    object: Expression;
    index: Expression;
}
interface CallExpression extends BaseNode {
    type: "CallExpression";
    callee: Expression;
    arguments: Expression[];
    /** `f<T>(x)` — type arguments written out rather than inferred. */
    typeArguments?: (TypeNode | TypePackNode)[];
    /** `f?.(...)` — see `MemberExpression.optional`. The call does not happen,
     *  and the arguments are not evaluated, when `callee` is nil. */
    optional?: boolean;
}
interface MethodCallExpression extends BaseNode {
    type: "MethodCallExpression";
    object: Expression;
    method: Identifier;
    arguments: Expression[];
    /** `obj:m<T>(x)` — see `CallExpression.typeArguments`. */
    typeArguments?: (TypeNode | TypePackNode)[];
    /** `object?:method(...)` — see `MemberExpression.optional`. The
     *  arguments are not evaluated when `object` is nil. */
    optional?: boolean;
}
interface ParenthesizedExpression extends BaseNode {
    type: "ParenthesizedExpression";
    expression: Expression;
}
/** `expr satisfies T` — checks that `expr` is assignable to `T` without
 *  changing its inferred type, so a literal keeps its narrow type while still
 *  being validated against a wider contract. Unlike `as`, it never widens or
 *  reinterprets. */
interface SatisfiesExpression extends BaseNode {
    type: "SatisfiesExpression";
    expression: Expression;
    typeAnnotation: TypeNode;
}
interface TypeAssertionExpression extends BaseNode {
    type: "TypeAssertionExpression";
    expression: Expression;
    typeAnnotation: TypeNode;
}
/** `expr as const` — freezes the expression's inferred type to its narrowest
 *  (literal) form, the way TypeScript's `as const` does. Kept as a distinct
 *  node from TypeAssertionExpression because there's no TypeNode on the
 *  right-hand side: the type checker computes the literal type itself. */
interface AsConstExpression extends BaseNode {
    type: "AsConstExpression";
    expression: Expression;
}
interface IfElseExpression extends BaseNode {
    type: "IfElseExpression";
    clauses: {
        condition: Expression;
        body: Expression;
    }[];
    alternate: Expression;
}
type TypeNode = TypeReference | TypeLiteralString | TypeLiteralBoolean | TypeLiteralNumber | TableTypeNode | ArrayTypeNode | TupleTypeNode | FunctionTypeNode | UnionTypeNode | IntersectionTypeNode | ParenthesizedTypeNode | TypeofTypeNode | VariadicTypeNode | TypePackNode | KeyofTypeNode | IndexedAccessTypeNode | ConditionalTypeNode | InferTypeNode | MappedTypeNode | TemplateLiteralTypeNode | DifferenceTypeNode;
/** `A - B` — every value of `A` that is not a `B`. Binds tighter than `|`
 *  and looser than `&`, so `A | B - C` is `A | (B - C)`.
 *
 *  Mostly it simplifies away (a union drops members; `string - "a"` is just
 *  `string`), but over an opaque type it is retained — which is what lets the
 *  `else` of `if a == 1` on an `unknown` say `unknown - 1` instead of
 *  forgetting the test. `Exclude<T, U>` is defined as `T - U`. */
interface DifferenceTypeNode extends BaseNode {
    type: "DifferenceTypeNode";
    base: TypeNode;
    excluded: TypeNode;
}
/** A template literal type: `` `on${string}` ``, `` `get${K}` ``.
 *  `quasis` are the literal chunks and `types` the interpolated types;
 *  `quasis.length === types.length + 1`, exactly as in an ECMAScript template.
 *  When every interpolation is a union of string literals the type reduces to
 *  the union of all concatenations; otherwise it stays a pattern that literal
 *  strings are matched against. */
interface TemplateLiteralTypeNode extends BaseNode {
    type: "TemplateLiteralTypeNode";
    quasis: string[];
    types: TypeNode[];
}
/** `keyof T` — the union of `T`'s property names as string-literal types,
 *  plus its indexer key type when it has one. */
interface KeyofTypeNode extends BaseNode {
    type: "KeyofTypeNode";
    target: TypeNode;
}
/** `T[K]` — indexed access. Distinguished from the `T[]` array suffix by
 *  whether the brackets are empty. */
interface IndexedAccessTypeNode extends BaseNode {
    type: "IndexedAccessTypeNode";
    objectType: TypeNode;
    indexType: TypeNode;
}
/** `C extends E ? A : B`. Distributes over a naked type parameter, as in
 *  TypeScript, which is what makes `Exclude<T, U>` filter a union. */
interface ConditionalTypeNode extends BaseNode {
    type: "ConditionalTypeNode";
    checkType: TypeNode;
    extendsType: TypeNode;
    trueType: TypeNode;
    falseType: TypeNode;
}
/** `infer U`, only meaningful inside a conditional's `extends` clause: it
 *  binds `U` to whatever matched at that position. */
interface InferTypeNode extends BaseNode {
    type: "InferTypeNode";
    name: string;
    /** The bound name as a node. */
    id?: Identifier;
}
/** `{ [K in C]: V }` — a mapped type. `optional` / `readonly` carry the
 *  modifier as written: `true` adds it (`?`), `false` removes it (`-?`),
 *  `undefined` leaves the source property's modifier alone. */
interface MappedTypeNode extends BaseNode {
    type: "MappedTypeNode";
    /** The name bound to each key in turn (`K`). */
    parameter: string;
    /** `parameter` as a node. */
    parameterId?: Identifier;
    /** The union of keys to map over (`C`). */
    constraint: TypeNode;
    /** `[K in C as R]` — remaps each key through `R`. */
    nameType?: TypeNode;
    /** The property type, which may mention `parameter`. */
    template: TypeNode;
    optional?: boolean;
    readonly?: boolean;
}
/** The return position of a TypeScript-style type guard:
 *  `function isStr(v: unknown): v is string`, `function check(v): asserts v`,
 *  or `function assertStr(v): asserts v is string`.
 *
 *  Deliberately *not* a member of `TypeNode` — it may only appear as a
 *  function's return annotation, and keeping it out of the union means every
 *  existing `TypeNode` consumer stays exhaustive without change. A function
 *  carrying one returns `boolean` (`is`) or nothing (`asserts`). */
interface TypePredicateNode extends BaseNode {
    type: "TypePredicateNode";
    /** Name of the parameter this guard talks about. */
    parameterName: string;
    /** `asserts x` — narrows the rest of the enclosing block, not a branch. */
    asserts: boolean;
    /** Absent for a bare `asserts x` (a truthiness assertion). */
    typeAnnotation?: TypeNode;
}
interface TypePackNode extends BaseNode {
    type: "TypePackNode";
    types: TypeNode[];
    hasVarargs: boolean;
    varargType?: TypeNode;
}
interface TypeReference extends BaseNode {
    type: "TypeReference";
    base: string;
    namespace?: string;
    typeArguments: (TypeNode | TypePackNode)[];
}
interface TypeLiteralString extends BaseNode {
    type: "TypeLiteralString";
    value: string;
}
interface TypeLiteralBoolean extends BaseNode {
    type: "TypeLiteralBoolean";
    value: boolean;
}
/** `1`, `3.5` — a single-valued number type. The checker already produces
 *  these when narrowing (`if n == 1`), so they have to be writable too. */
interface TypeLiteralNumber extends BaseNode {
    type: "TypeLiteralNumber";
    value: number;
}
type TableTypeProperty = ({
    type: "TableTypeIndexer";
    keyType: TypeNode;
    valueType: TypeNode;
} & BaseNode)
/** `name: T` (required) or `name?: T` (optional — TS style, the property
 *  may be absent). `optional` reflects the `?` after the name only;
 *  `name: T | nil` is a required property whose value may be nil. */
 | ({
    type: "TableTypeProperty";
    name: string;
    key: Identifier;
    valueType: TypeNode;
    optional: boolean;
    readonly?: boolean;
} & BaseNode);
interface TableTypeNode extends BaseNode {
    type: "TableTypeNode";
    properties: TableTypeProperty[];
}
/** `T[]` — array type. Replaces Luau's `{T}` array-table notation. */
interface ArrayTypeNode extends BaseNode {
    type: "ArrayTypeNode";
    element: TypeNode;
}
/** `[number, string]` — fixed-length tuple type. */
interface TupleTypeNode extends BaseNode {
    type: "TupleTypeNode";
    elements: TypeNode[];
}
interface FunctionTypeParameter extends BaseNode {
    type: "FunctionTypeParameter";
    /** `name?: T` — the argument may be omitted, and its type admits `nil`. */
    optional?: boolean;
    name?: string;
    /** The name as a node (absent for an unnamed parameter). */
    id?: Identifier;
    typeAnnotation: TypeNode;
}
interface FunctionTypeNode extends BaseNode {
    type: "FunctionTypeNode";
    generics: GenericTypeParameter[];
    params: FunctionTypeParameter[];
    hasVarargs: boolean;
    varargType?: TypeNode;
    returnType: TypeNode;
    /** `(v: unknown) -> v is string` — a guard written as a function *type*. */
    predicate?: TypePredicateNode;
}
interface UnionTypeNode extends BaseNode {
    type: "UnionTypeNode";
    types: TypeNode[];
}
interface IntersectionTypeNode extends BaseNode {
    type: "IntersectionTypeNode";
    types: TypeNode[];
}
interface ParenthesizedTypeNode extends BaseNode {
    type: "ParenthesizedTypeNode";
    typeAnnotation: TypeNode;
}
/** `typeof x` / `typeof x.y` (TypeScript's type query) or `typeof(expr)`
 *  (Luau's spelling): the type of a value. */
interface TypeofTypeNode extends BaseNode {
    type: "TypeofTypeNode";
    expression: Expression;
}
interface VariadicTypeNode extends BaseNode {
    type: "VariadicTypeNode";
    typeAnnotation: TypeNode;
}
type Node = Program | Block | Statement | Expression | TypeNode | FunctionBody | FunctionParameter | FunctionName | IfClause | TypedIdentifier | GenericTypeParameter | FunctionSignature | TypePredicateNode | TableField | SpreadElement | FunctionTypeParameter | TableTypeProperty | BindingTarget | ObjectPatternProperty | ArrayPatternElement;

declare class ParseError extends Error {
    line: number;
    column: number;
    constructor(message: string, line: number, column: number);
}
interface ParserOptions {
    /** When true, `parseProgram` records syntax errors in `.errors` and
     *  synchronizes to the next statement boundary instead of throwing on the
     *  first one. The returned AST has an `ErrorStatement` wherever a statement
     *  could not be parsed. */
    recover?: boolean;
    /** Recovery only: read where a block ends from indentation when an `end`
     *  is missing — a line indented no deeper than the line that opened the
     *  block is past it. Valid code never needs this; `parseWithRecovery`
     *  reparses with it when the first pass found an `end` missing. */
    indentation?: boolean;
}
declare function parse(source: string): Program;
declare function parseTokens(tokens: Token[]): Program;
declare function parseExpressionFromSource(raw: string): Expression;
interface RecoverResult {
    program: Program;
    errors: ParseError[];
    /** The file's `--@luaut-...` comments; see `applyDirectives`. */
    directives: Directives;
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
declare function parseWithRecovery(source: string): RecoverResult;

type BindingId = number;
type BindingKind = "local" | "param" | "self" | "for-numeric" | "for-generic" | "global";
/** A node that can serve as a binding's "declared here" site. */
type DeclarationNode = Identifier | TypedIdentifier | FunctionParameter | IdentifierPattern;
interface Binding {
    readonly id: BindingId;
    /** Name at the point this binding was created. Rename passes update
     *  this and every node in `references` (+ `declarationNode`) together —
     *  this field is just what analysis saw, not a source of truth after a
     *  rename pass has run. */
    name: string;
    readonly kind: BindingKind;
    /** Absent for a `global` binding that was never assigned to in this
     *  file (e.g. only ever read, or a pre-registered builtin). */
    declarationNode?: DeclarationNode;
    /** Every Identifier *usage* resolved to this binding (does not include
     *  `declarationNode` itself). */
    readonly references: Identifier[];
    /** True for globals pre-registered via `analyzeScopes`'s
     *  `builtinGlobals` option (e.g. `game`, `script`, `print`). Such
     *  bindings are never given a `declarationNode` from assignment
     *  inference, since they're not really "defined" in this file. */
    isBuiltin?: boolean;
    /** True for a binding that cannot be reassigned: a `const`, an import, or
     *  a function declaration. */
    isConst?: boolean;
    /** Set when the binding comes from something other than `const` / `let`,
     *  which is also what an error about reassigning it names. */
    declaredBy?: "import" | "namespace" | "function" | "type";
}
interface ScopeDiagnostic {
    /** the offending node (redeclaration site, or assignment target) */
    node: {
        line: {
            start: number;
            end: number;
        };
        column: {
            start: number;
            end: number;
        };
    };
    message: string;
    kind: "redeclare" | "const-assign" | "type-only" | "undeclared" | "use-before-define";
}
interface ScopeAnalysis {
    /** Every Identifier that appears in a variable *usage* position (i.e.
     *  every node also reachable through some `Binding.references`, plus
     *  `FunctionDeclarationStatement.target.base`), mapped to its binding.
     *  Property names, method names, table field names, and type-position
     *  identifiers are never entered here — they aren't variable refs. */
    readonly bindingOf: Map<Identifier | IdentifierPattern, BindingId>;
    readonly bindings: Map<BindingId, Binding>;
    /** Redeclaration-in-same-scope and assignment-to-const errors. */
    readonly diagnostics: ScopeDiagnostic[];
    /** Convenience: every global binding's id, keyed by name. Global
     *  bindings have no lexical scope, so this is the closest thing to
     *  "the" scope for them — and later a multi-file language server can
     *  swap this map out for a project-wide registry without changing
     *  anything else about this shape. */
    readonly globalsByName: Map<string, BindingId>;
}
interface AnalyzeScopesOptions {
    /** Names to pre-register as global bindings with `isBuiltin: true`
     *  before the walk starts (e.g. Roblox/Luau standard globals:
     *  `game`, `script`, `workspace`, `print`, `pairs`, ...). Referencing
     *  one of these does not count as "defining" it, so `declarationNode`
     *  is left unset even though the binding exists up front. */
    builtinGlobals?: readonly string[];
    /** Report each read of a name nothing declares — not a local, not one of
     *  `builtinGlobals`, not `declare`d in the file, never assigned as a
     *  global: "Cannot find name 'x'", as TypeScript says. Only meaningful
     *  when `builtinGlobals` lists everything the file's type libraries
     *  declare, so it is off unless asked for. */
    reportUndeclared?: boolean;
}
declare function getBinding(analysis: ScopeAnalysis, id: Identifier | IdentifierPattern): Binding | undefined;
declare function isGlobal(binding: Binding): boolean;
/** True if a global binding was never assigned to anywhere in this file
 *  (and isn't a pre-registered builtin) — i.e. it's read-only and
 *  undeclared, which is almost always a typo rather than an intentional
 *  implicit global. Handy for a "possibly undefined global" diagnostic. */
declare function isUnassignedGlobal(binding: Binding): boolean;
declare function analyzeScopes(program: Program, options?: AnalyzeScopesOptions): ScopeAnalysis;

type Type = AnyType | UnknownType | NeverType | PrimitiveType | LiteralType | ArrayType | TupleType | ObjectType | FunctionType | UnionType | IntersectionType | TypeParamType | GenericRefType | KeyofType | IndexedAccessType | ConditionalType | InferType | MappedType | TemplateLiteralType | DifferenceType;
/** `any` — opts out of checking. Assignable to and from everything. */
interface AnyType {
    kind: "any";
}
/** `unknown` — top type. Everything is assignable to it; it is assignable to nothing but itself. */
interface UnknownType {
    kind: "unknown";
}
/** `never` — bottom type. Assignable to everything; nothing (but never) is assignable to it. */
interface NeverType {
    kind: "never";
}
type PrimitiveName = "nil" | "boolean" | "number" | "string" | "thread" | "buffer";
interface PrimitiveType {
    kind: "primitive";
    name: PrimitiveName;
}
/** `"foo"`, `42`, `true` — a single-valued type. `base` is the primitive it widens to. */
interface LiteralType {
    kind: "literal";
    base: "boolean" | "number" | "string";
    value: string | number | boolean;
}
/** `T[]` */
interface ArrayType {
    kind: "array";
    element: Type;
}
/** `[A, B, C]` — fixed length.
 *
 *  `isPack` marks the other thing this shape is used for: a *type pack*, the
 *  several values a Lua function returns (`(number, string)`). The two are
 *  structurally identical but behave differently in an expression list — a
 *  pack spreads across several names, a tuple is one value — so they have to
 *  be told apart. */
interface TupleType {
    kind: "tuple";
    elements: Type[];
    isPack?: boolean;
}
interface ObjectProperty {
    type: Type;
    optional: boolean;
    readonly?: boolean;
}
interface ObjectType {
    kind: "object";
    properties: Map<string, ObjectProperty>;
    /** `{ [K]: V }` catch-all, if present. */
    indexer?: {
        key: Type;
        value: Type;
    };
    /** `object` was produced by `as const` — literal members are kept narrow
     *  and every property is `readonly`. */
    frozen?: boolean;
    /** The alias this object was resolved from — display only, ignored by
     *  `isAssignable` (the type is structural). Dropped on `widen`/`substitute`. */
    name?: string;
    /** Set on a `declare class` — the type is then *nominal*. See `ClassInfo`. */
    class?: ClassInfo;
}
/** What makes an object a class instance. `properties` then holds every
 *  member, inherited ones included. Only the class itself and the classes
 *  extending it are assignable to it — no table literal, no structurally
 *  identical class. Going the other way, a class satisfies a shape naming
 *  members it has (`{ Name: string }`) but is not a table: never a
 *  `{ [K]: V }` or `{}`, which is what keeps `typeof(part)` from matching the
 *  `{ [unknown]: unknown }` overload. */
interface ClassInfo {
    name: string;
    /** The class it directly extends, if any. */
    superclass?: string;
    /** The class itself, then each class it extends, nearest first. */
    ancestors: readonly string[];
}
declare function isClassType(t: Type): t is ObjectType & {
    class: ClassInfo;
};
interface FunctionParam {
    name?: string;
    type: Type;
    optional?: boolean;
}
/** A TS-style type guard: `function f(v: unknown): v is string` narrows `v` at
 *  every call site used as a condition. `asserts` variants narrow the *rest of
 *  the enclosing block* instead of a branch (`assert(x)`), and a missing `type`
 *  means a bare truthiness assertion (`asserts v`). */
interface TypePredicate {
    /** Index into `params` of the parameter this guard talks about. */
    param: number;
    /** The type the parameter is narrowed to; absent = narrow to truthy. */
    type?: Type;
    asserts: boolean;
}
interface FunctionType {
    kind: "function";
    params: FunctionParam[];
    varargs?: Type;
    /** A tuple when the function returns multiple values. */
    returns: Type;
    /** Names of the function's own generic parameters (`function f<T>(...)`).
     *  `params` / `returns` may contain `typeParam` nodes for these. */
    typeParams?: string[];
    /** `<T = Instance>` — what a call uses for a parameter it is not given and
     *  cannot infer. */
    typeParamDefaults?: Record<string, Type>;
    /** Set when the function was declared with an `x is T` / `asserts x` return. */
    predicate?: TypePredicate;
}
/** A bound generic parameter (`T` inside `function f<T>(...)` or
 *  `type Box<T> = ...`). Resolved away by `substitute` at instantiation.
 *  `constraint` is the `<T extends C>` upper bound, used for member access on a
 *  bare `T` and as the fallback when `T` can't be inferred. */
interface TypeParamType {
    kind: "typeParam";
    name: string;
    constraint?: Type;
    /** Declared `<const T>`: the call site infers the argument at its
     *  narrowest rather than widening it. */
    isConst?: boolean;
}
declare function typeParam(name: string, constraint?: Type, isConst?: boolean): TypeParamType;
interface UnionType {
    kind: "union";
    types: Type[];
}
interface IntersectionType {
    kind: "intersection";
    types: Type[];
    /** The alias this was resolved from — display only, exactly like
     *  `ObjectType.name`. A class hierarchy written as `type Part = BasePart &
     *  { ... }` is unreadable without it. */
    name?: string;
}
/** An unresolved reference: an in-scope generic parameter, or a named type
 *  that couldn't be resolved to an alias in this pass. */
interface GenericRefType {
    kind: "genericRef";
    name: string;
    typeArguments: Type[];
}
/** `keyof T`. */
interface KeyofType {
    kind: "keyof";
    target: Type;
}
/** `T[K]`. */
interface IndexedAccessType {
    kind: "indexedAccess";
    objectType: Type;
    indexType: Type;
}
/** `C extends E ? A : B`. */
interface ConditionalType {
    kind: "conditional";
    checkType: Type;
    extendsType: Type;
    trueType: Type;
    falseType: Type;
    /** Names bound by `infer` inside `extendsType`. */
    inferVars: string[];
    /** Set when `checkType` is a *naked* type parameter, to that parameter's
     *  name. Such a conditional distributes over a union, and inside each
     *  branch the parameter denotes the single member being tested — the
     *  property `Exclude<T, U>` relies on. */
    distributeParam?: string;
}
/** `infer U`, valid only inside a conditional's `extends` clause. */
interface InferType {
    kind: "infer";
    name: string;
}
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
interface DifferenceType {
    kind: "difference";
    base: Type;
    excluded: Type;
}
/** `` `on${string}` `` — literal chunks interleaved with interpolated types
 *  (`quasis.length === types.length + 1`). Reduced to a union of string
 *  literals when every interpolation is one; otherwise it stays a *pattern*
 *  and `isAssignable` matches literal strings against it. */
interface TemplateLiteralType {
    kind: "templateLiteral";
    quasis: string[];
    types: Type[];
}
/** `{ [K in C]: V }`. `optional` / `readonly`: `true` adds the modifier,
 *  `false` strips it, `undefined` inherits it from the source property. */
interface MappedType {
    kind: "mapped";
    parameter: string;
    constraint: Type;
    nameType?: Type;
    template: Type;
    optional?: boolean;
    readonly?: boolean;
    /** The `T` of `[K in keyof T]`, kept so a homomorphic mapped type can carry
     *  each source property's own `?` / `readonly` across. */
    source?: Type;
}
declare const anyType: AnyType;
declare const unknownType: UnknownType;
declare const neverType: NeverType;
declare const nilType: PrimitiveType;
declare const booleanType: PrimitiveType;
declare const numberType: PrimitiveType;
declare const stringType: PrimitiveType;
declare const threadType: PrimitiveType;
declare const bufferType: PrimitiveType;
declare function primitive(name: PrimitiveName): PrimitiveType;
declare function literal(value: string | number | boolean): LiteralType;
declare function arrayOf(element: Type): ArrayType;
declare function tuple(elements: Type[], isPack?: boolean): TupleType;
declare function objectType(entries: Iterable<[string, ObjectProperty]>, indexer?: ObjectType["indexer"], frozen?: boolean): ObjectType;
declare function fn(params: FunctionParam[], returns: Type, varargs?: Type, typeParams?: string[], predicate?: TypePredicate): FunctionType;
declare function substitute(t: Type, subst: Map<string, Type>): Type;
/** Infer generic bindings by structurally matching a (possibly generic)
 *  `param` type against a concrete `arg` type. Accumulates into `out`. */
declare function unify(param: Type, arg: Type, vars: Set<string>, out: Map<string, Type>): void;
declare function union(types: Type[]): Type;
declare function intersection(types: Type[]): Type;
/** `base - excluded`, simplified as far as the base allows. */
declare function difference(base: Type, excluded: Type): Type;
/** `T | nil` — the type of an optional property or parameter. */
declare function optional(t: Type): Type;
/** Widens literal types to their primitive base (the default for a plain
 *  `local x = "foo"` binding, unless `as const` says otherwise). Recurses
 *  into arrays/tuples/objects/unions. */
declare function widen(t: Type): Type;
declare function setAliasExpander(fn: ((t: GenericRefType) => Type) | undefined): void;
declare function isAssignable(rawA: Type, rawB: Type): boolean;
declare function equalTypes(a: Type, b: Type): boolean;
/** Keep the parts of `t` compatible with `filter` — TypeScript's
 *  `getNarrowedType`. Per union member: a member already assignable to the
 *  filter survives as-is; a member the filter is assignable to is *replaced*
 *  by the filter (so `string` narrowed by `"a"` becomes `"a"`, not `string`);
 *  anything else is dropped. `any` / `unknown` narrow straight to the filter. */
declare function narrowTo(t: Type, filter: Type): Type;
/** Remove the parts of `t` assignable to `exclude` (the `else` branch).
 *  `boolean` minus a `true`/`false` literal leaves the other literal — the
 *  only primitive here with a finite, enumerable domain. */
declare function narrowExclude(t: Type, exclude: Type): Type;
/** `nil | false` — every falsy value in Luau. Built literally rather than via
 *  `union()`, which would format its members for deduping and so touch caches
 *  declared further down this module. */
declare const falsyType: Type;
/** Can a value of this type ever be truthy? */
declare function isPossiblyTruthy(t: Type): boolean;
/** Can a value of this type ever be falsy? */
declare function isPossiblyFalsy(t: Type): boolean;
/** Keep only what can be truthy — drops `nil` and the `false` literal, and
 *  narrows a bare `boolean` to `true`. */
declare function narrowTruthy(t: Type): Type;
/** Keep only what can be falsy — `nil` and `false`. */
declare function narrowFalsy(t: Type): Type;
declare function containsTypeParam(t: Type, seen?: Set<Type>, bound?: Set<string>): boolean;
/** Structurally match `arg` against `pattern`, binding every `infer` name it
 *  contains into `out`. This is what turns `T extends (...unknown) -> infer R`
 *  into `R = <the return type>`. Returns false when the shapes cannot match at
 *  all; a `true` result still needs the usual assignability check. */
declare function matchInfer(arg: Type, pattern: Type, out: Map<string, Type>): boolean;
/** Does a concrete string match a template literal *pattern*? Each
 *  interpolation is matched against the widest thing it could stand for:
 *  `string` swallows any run, `number` a numeric run, and a literal union only
 *  its own members. Anchored at both ends, like TypeScript. */
declare function templateMatches(value: string, pattern: TemplateLiteralType): boolean;
/** Do these two types share any value? The compatibility test behind
 *  discriminant filtering and `narrowTo`. */
declare function overlaps(a: Type, b: Type): boolean;
declare function formatType(t: Type): string;

interface TypeDiagnostic {
    /** Usually an expression or statement; a type where the type is wrong
     *  (`declare class A extends NotAClass`), or a block where nothing in it
     *  is to blame (a function that never returns). Only its span is read. */
    node: Expression | Statement | TypeNode | Block;
    message: string;
}
interface TypeAnalysis {
    /** Inferred type of every expression node. */
    readonly typeOf: Map<Expression, Type>;
    /** Declared (or first-inferred) type of every value binding. */
    readonly bindingType: Map<BindingId, Type>;
    /** Type of a specific variable *reference*, after flow narrowing at that
     *  point. For an un-narrowed reference this equals `bindingType`. */
    readonly narrowedTypeOf: Map<Identifier, Type>;
    /** What every type annotation node resolves to — `number`, `Shape`,
     *  `typeof x`, a property's type inside `{ ... }`. Inside a generic alias or
     *  function its parameters stay unresolved (`T`). */
    readonly typeOfTypeNode: Map<TypeNode | TypePackNode, Type>;
    /** What each call argument is expected to be: the parameter it lands on,
     *  with the signature's type parameters replaced by their constraints — a
     *  union when an overload set disagrees. Recorded even for a call that does
     *  not type-check, since that is exactly when an editor wants to offer the
     *  values that would. */
    readonly expectedTypeOf: Map<Expression, Type>;
    /** Top-level type aliases, resolved — and the type names this module
     *  imports, so tooling treats both alike. */
    readonly aliases: Map<string, Type>;
    readonly diagnostics: TypeDiagnostic[];
}
/** A type a module exports: the resolved type, plus the parameter names of a
 *  generic alias so an importer can instantiate it (`Box<number>`). */
interface ExportedType {
    readonly type: Type;
    readonly params: readonly string[];
}
/** What a module makes available to `import`. See `moduleExports`. */
interface ModuleExports {
    /** `export const` / `export let` / `export function` names. */
    readonly values: ReadonlyMap<string, Type>;
    /** `export type` names. */
    readonly types: ReadonlyMap<string, ExportedType>;
    /** `export default <expr>`. */
    readonly default?: Type;
    /** The module is still being analyzed further up an import cycle. Its
     *  names read as `any`, and nothing about them is reported. */
    readonly partial?: boolean;
}
interface AnalyzeTypesOptions {
    /** Types for pre-registered globals (`analyzeScopes`'s `builtinGlobals`).
     *  Anything not listed is treated as `any`. Overrides `libs`. */
    globalTypes?: Record<string, Type>;
    /** Extra named types available to annotations (e.g. Roblox classes). */
    libTypes?: Record<string, Type>;
    /** Parsed definitions files (`.d.luaut`): their `type` aliases become
     *  available to annotations and their `declare` statements seed global
     *  types. A project lists them under `types` in `luaut.config.json`; see
     *  `resolveTypeLibraries`. */
    libs?: readonly Program[];
    /** Resolve an `import`'s module path to what that module exports. Called
     *  once per distinct path. Return `undefined` when there is no such module:
     *  the import is reported and its names are `any`. Without this option
     *  every import is `any` — a single file cannot know better. */
    resolveModule?: (specifier: string) => ModuleExports | undefined;
    /** Emit assignability diagnostics (default: true). */
    diagnostics?: boolean;
    /** Report each type name nothing declares: "Cannot find name 'Nope'".
     *  Only meaningful when `libs` holds everything the file can name, so it
     *  is off unless asked for — exactly like `analyzeScopes`'s
     *  `reportUndeclared`. */
    reportUnknownTypes?: boolean;
}
declare function analyzeTypes(program: Program, scopes: ScopeAnalysis, options?: AnalyzeTypesOptions): TypeAnalysis;
/** The exports of an analyzed module, in the shape another module's
 *  `resolveModule` returns. */
declare function moduleExports(program: Program, scopes: ScopeAnalysis, types: TypeAnalysis, 
/** For `export ... from`: the same resolver the module was analyzed with. */
resolveModule?: (specifier: string) => ModuleExports | undefined): ModuleExports;

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
 * The methods an array and a string answer to — `names:filter(f)`,
 * `text:trim()` — are a library's too. `propertyType` reads them from types
 * named `ArrayMethods<T>` and `StringMethods`, whichever library declares
 * those; the library also says which of them the compiler must emit code for
 * (`luaut.methods` in its package.json). Nothing about `filter` is written
 * into the analyzer.
 */
declare const PRELUDE_SOURCE = "\n-- In Luau only `nil` and `false` are falsy: `0` and `\"\"` are truthy.\n-- These are what truthiness narrowing computes, made available to write down.\ntype Falsy = nil | false\ntype Truthy<T> = T - Falsy\n\n-- `-` is set difference. Over a union it drops members; over a concrete type\n-- it simplifies away; over an opaque type (`unknown`, an unresolved parameter)\n-- it is kept, so `Exclude<unknown, 1>` stays `unknown - 1`.\ntype Exclude<T, U> = T - U\ntype Extract<T, U> = T extends U ? T : never\ntype NonNullable<T> = T - nil\n\ntype ReturnType<T> = T extends (...unknown) -> infer R ? R : never\ntype Parameters<T> = T extends (...infer P) -> unknown ? P : never\n\ntype Partial<T> = { [K in keyof T]?: T[K] }\ntype Required<T> = { [K in keyof T]-?: T[K] }\ntype Readonly<T> = { readonly [K in keyof T]: T[K] }\ntype Mutable<T> = { -readonly [K in keyof T]: T[K] }\n\ntype Pick<T, K> = { [P in K]: T[P] }\ntype Omit<T, K> = Pick<T, Exclude<keyof T, K>>\ntype Record<K, V> = { [P in K]: V }\n";

interface ProjectHost {
    /** A file's text, or `undefined` when there is no such file. */
    readFile(path: string): string | undefined;
}
declare const nodeHost: ProjectHost;

declare const CONFIG_FILE_NAMES: readonly ["luaut.config.json", "luaut.config.jsonc"];
interface LuautConfig {
    /** Absolute path of the config file. */
    readonly path: string;
    /** The folder it sits in. Relative paths in it resolve from here. */
    readonly directory: string;
    /** The config file's text, for locating problems in it. */
    readonly source: string;
    /** Type libraries to load, in order: `"lua"`, `"@luaut/roblox"`, `"./types"`. */
    readonly types: readonly string[];
    /** Import path aliases, as in tsconfig: `{ "@shared/*": ["src/shared/*"] }`. */
    readonly paths: Readonly<Record<string, readonly string[]>>;
    /** Where `paths` targets resolve from, absolute. The config's folder unless set. */
    readonly baseUrl: string;
    /** Absolute path of a Rojo sourcemap, or `null` for none. */
    readonly sourceMap: string | null;
}
interface ConfigProblem {
    /** The file the problem is about: a config file, or a sourcemap it names. */
    readonly file: string;
    readonly message: string;
    /** 1-based position in `file`, when the problem has one. */
    readonly line?: number;
    readonly column?: number;
}
interface ConfigLookup {
    /** The config that applies, if one was found and could be read. */
    readonly config?: LuautConfig;
    readonly problems: readonly ConfigProblem[];
    /** Every config path looked at on the way up, found or not — what a cache
     *  must watch, so that creating or deleting a config is noticed. */
    readonly searched: readonly string[];
}
/** The config that applies to `file`: the nearest one in its folder or above. */
declare function findConfig(file: string, host?: ProjectHost): ConfigLookup;
/** Read and check one config file. Problems do not stop the rest of it from
 *  applying: an unknown option is reported and the known ones still work. */
declare function loadConfig(path: string, host?: ProjectHost): {
    config?: LuautConfig;
    problems: ConfigProblem[];
};
/** Blank out `//` and `/* *\/` comments and trailing commas, keeping every
 *  other character where it was — so a JSON error's position still points
 *  into the original text. */
declare function stripJsonComments(text: string): string;

interface TypeLibraries {
    /** Definitions files, dependencies before what depends on them. */
    readonly files: readonly string[];
    /** Lowering modules the libraries ship, in the same order. */
    readonly lowerings: readonly LoweringModule[];
    readonly problems: readonly ConfigProblem[];
}
/** A library's own lowering: JavaScript the compiler loads and asks what a
 *  call written against this library's types should become.
 *
 *  The library declares the *types* in its definitions file; this is the other
 *  half. `names:filter(f)` is a call to a function only because `@luaut/lua`
 *  says so and ships the Luau behind it — the compiler knows how to ask, and
 *  nothing about `filter`.
 *
 *  `luaut.lowering` in the package.json names the module; what it must export
 *  is the compiler's business (see luaut-build's `LoweringPlugin`). */
interface LoweringModule {
    /** The JavaScript module to load. */
    readonly file: string;
    /** The package it came from, for reporting. */
    readonly from: string;
}
declare function resolveTypeLibraries(config: LuautConfig, host?: ProjectHost): TypeLibraries;

/**
 * The contract between a type library and the compiler.
 *
 * A library's definitions file says what a value *is*; when what it gives is
 * not something the value already answers to, the library must also say how
 * it runs. `names:filter(f)` is a call to a function because `@luaut/lua`
 * declares the method and ships the Luau behind it — the compiler lowers the
 * language (`import`, `export`, `?.`, `a ? b : c`, destructuring, spreads)
 * and asks a library about everything else.
 *
 * These types are declarations only: nothing here runs, and the parser never
 * loads a lowering module. They live here so a library can be written in
 * TypeScript against the same contract the compiler implements, without
 * depending on the compiler.
 *
 *     // lowering.ts, in a type library
 *     import type { LoweringPlugin } from "luaut-parser"
 *
 *     const plugin: LoweringPlugin = {
 *         runtime: { array: "local __NAME__ = {}\n..." },
 *         methodCall({ method, receiver, use }) {
 *             if (receiver?.kind === "array" && method === "filter") {
 *                 return { callee: `${use("array")}.filter` }
 *             }
 *             return undefined
 *         },
 *     }
 *     export default plugin
 */

interface LoweringPlugin {
    /** Luau the plugin needs in the output, by a key it chooses. Each is a
     *  file's worth of source with `__NAME__` standing for the local the
     *  compiler gives it, and each is emitted once, at the top of the output,
     *  only if `use` asked for it:
     *
     *      local __NAME__ = {}
     *      function __NAME__.filter(t, test) ... end
     */
    readonly runtime?: Readonly<Record<string, string>>;
    /** What `receiver:method(...)` becomes. `undefined` leaves a plain Luau
     *  method call, which is what a value that answers to the method itself
     *  wants — `text:upper()` reaches Lua's own. */
    methodCall?(call: MethodCall): MethodLowering | undefined;
}
interface MethodCall {
    /** The name written after `:`. */
    readonly method: string;
    /** The receiver's type, as the analyzer worked it out. `undefined` when
     *  nothing typed it, where a plugin should decline rather than guess. */
    readonly receiver: Type | undefined;
    /** How many arguments were written. */
    readonly argumentCount: number;
    /** The local name the output gives one of `runtime`'s entries, emitting
     *  it if this is the first call that needed it. */
    use(runtime: string): string;
}
interface MethodLowering {
    /** What to call instead: a name, or a `table.member` path — usually built
     *  from `use(...)`. */
    readonly callee: string;
    /** Pass the receiver as the first argument. Default: yes. */
    readonly passReceiver?: boolean;
}

/** Every file `specifier` could mean from `fromFile`, in the order they are
 *  tried. A resolver that caches should watch all of them: creating an earlier
 *  candidate changes what the import means. */
declare function moduleCandidates(fromFile: string, specifier: string, config?: LuautConfig): string[];
/** The file `specifier` names from `fromFile`, if it exists. */
declare function resolveModulePath(fromFile: string, specifier: string, config?: LuautConfig, host?: ProjectHost): string | undefined;

interface SourceMapNode {
    name: string;
    className: string;
    filePaths?: string[];
    children?: SourceMapNode[];
}
interface SourceMapOptions {
    /** The type names the loaded libraries define. An instance of a class not
     *  among them is typed as `Instance`. */
    readonly classes: ReadonlySet<string>;
    /** A class's own member names. A child whose name a member already takes
     *  is left out — Roblox resolves the member first. Defaults to the members
     *  every instance has. */
    readonly membersOf?: (className: string) => ReadonlySet<string>;
}
interface SourceMapTypes {
    /** The tree's classes, and `game` / `workspace` for a place. */
    readonly program: Program;
    /** `declare script: ...` for a file the tree maps, or `undefined`. */
    scriptFor(file: string): Program | undefined;
}
declare function sourceMapTypes(text: string, path: string, options: SourceMapOptions): {
    types?: SourceMapTypes;
    problem?: string;
};

declare const luautparser: {
    readonly tokenize: typeof tokenize;
    readonly parseTokens: typeof parseTokens;
    readonly parse: typeof parse;
    readonly parseExpressionFromSource: typeof parseExpressionFromSource;
    readonly parseWithRecovery: typeof parseWithRecovery;
    readonly analyzeScopes: typeof analyzeScopes;
    readonly getBinding: typeof getBinding;
    readonly isGlobal: typeof isGlobal;
    readonly isUnassignedGlobal: typeof isUnassignedGlobal;
    readonly analyzeTypes: typeof analyzeTypes;
};

export { type AnalyzeTypesOptions, type AnyType, type ArrayExpression, type ArrayPattern, type ArrayPatternElement, type ArrayType, type ArrayTypeNode, type AsConstExpression, type AssignmentStatement, type BaseNode, type BaseToken, type BinaryExpression, BinaryOperators, type Binding, type BindingId, type BindingKind, type BindingTarget, type Block, type BooleanLiteral, type BreakStatement, CONFIG_FILE_NAMES, type CallExpression, type CallStatement, type ClassInfo, type CompoundAssignmentStatement, type ConditionalType, type ConditionalTypeNode, type ConfigLookup, type ConfigProblem, type ContinueStatement, type DeclareClassStatement, type DeclareStatement, type DifferenceType, type DifferenceTypeNode, type Directive, type DirectiveKind, type DirectiveOutcome, type Directives, type DoStatement, type EOFToken, type ErrorExpression, type ErrorStatement, type ExportAllStatement, type ExportDefaultStatement, type ExportNamedStatement, type ExportSpecifier, type ExportStatement, type ExportTypeAliasStatement, type ExportedType, type Expression, type FunctionBody, type FunctionDeclaration, type FunctionDeclarationStatement, type FunctionExpression, type FunctionName, type FunctionParam, type FunctionParameter, type FunctionSignature, type FunctionType, type FunctionTypeNode, type FunctionTypeParameter, type GenericForStatement, type GenericRefType, type GenericTypeParameter, type Identifier, type IdentifierPattern, type IdentifierToken, type IfClause, type IfElseExpression, type IfStatement, type ImportSpecifier, type ImportStatement, type IndexExpression, type IndexedAccessType, type IndexedAccessTypeNode, type InferType, type InferTypeNode, type InterpolatedStringExpression, type InterpolatedStringPart, type InterpolatedStringPart_Expression, type InterpolatedStringPart_String, type InterpolatedStringToken, type IntersectionType, type IntersectionTypeNode, type KeyofType, type KeyofTypeNode, type KeywordToken, Keywords, LexError, type LiteralToken, type LiteralType, type LoweringModule, type LoweringPlugin, type LuautConfig, type MappedType, type MappedTypeNode, type MemberExpression, type MethodCall, type MethodCallExpression, type MethodLowering, type ModuleExports, type NeverType, type NilLiteral, type Node, type NumberLiteral, type NumericForStatement, type ObjectPattern, type ObjectPatternProperty, type ObjectProperty, type ObjectType, type OperatorToken, Operators, PRELUDE_SOURCE, type ParenthesizedExpression, type ParenthesizedTypeNode, ParseError, type ParserOptions, type PrimitiveName, type PrimitiveType, type Program, type ProjectHost, type PunctuatorToken, Punctuators, type RecoverResult, type RepeatStatement, type ReturnStatement, type SatisfiesExpression, type ScopeAnalysis, type ScopeDiagnostic, type SourceComment, type SourceMapNode, type SourceMapOptions, type SourceMapTypes, type SpreadElement, type Statement, type StringLiteral, type TableExpression, type TableField, type TableTypeNode, type TableTypeProperty, type TemplateLiteralType, type TemplateLiteralTypeNode, type Token, type TokenizeOptions, type TupleType, type TupleTypeNode, type Type, type TypeAliasStatement, type TypeAnalysis, type TypeAssertionExpression, type TypeDiagnostic, type TypeLibraries, type TypeLiteralBoolean, type TypeLiteralNumber, type TypeLiteralString, type TypeNode, type TypePackNode, type TypeParamType, type TypePredicate, type TypePredicateNode, type TypeReference, type TypedIdentifier, type TypeofTypeNode, UNUSED_EXPECT_ERROR, type UnaryExpression, UnaryOperators, type UnionType, type UnionTypeNode, type UnknownType, type VarargExpression, type VariableDeclaration, type VariadicTypeNode, type WhileStatement, analyzeScopes, analyzeTypes, anyType, applyDirectives, arrayOf, booleanType, bufferType, containsTypeParam, luautparser as default, difference, directivesOf, equalTypes, falsyType, findConfig, fn, formatType, getBinding, intersection, isAssignable, isClassType, isGlobal, isPossiblyFalsy, isPossiblyTruthy, isUnassignedGlobal, literal, loadConfig, luautparser, matchInfer, moduleCandidates, moduleExports, narrowExclude, narrowFalsy, narrowTo, narrowTruthy, neverType, nilType, nodeHost, numberType, objectType, optional, overlaps, parse, parseExpressionFromSource, parseTokens, parseWithRecovery, primitive, readDirectives, resolveModulePath, resolveTypeLibraries, setAliasExpander, sourceMapTypes, stringType, stripJsonComments, substitute, templateMatches, threadType, tokenize, tuple, typeParam, unify, union, unknownType, widen };

"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  BinaryOperators: () => BinaryOperators,
  CONFIG_FILE_NAMES: () => CONFIG_FILE_NAMES,
  Keywords: () => Keywords,
  LexError: () => LexError,
  Operators: () => Operators,
  PRELUDE_SOURCE: () => PRELUDE_SOURCE,
  ParseError: () => ParseError,
  Punctuators: () => Punctuators,
  UNUSED_EXPECT_ERROR: () => UNUSED_EXPECT_ERROR,
  UnaryOperators: () => UnaryOperators,
  analyzeScopes: () => analyzeScopes,
  analyzeTypes: () => analyzeTypes,
  anyType: () => anyType,
  applyDirectives: () => applyDirectives,
  arrayOf: () => arrayOf,
  booleanType: () => booleanType,
  bufferType: () => bufferType,
  containsTypeParam: () => containsTypeParam,
  default: () => index_default,
  difference: () => difference,
  directivesOf: () => directivesOf,
  equalTypes: () => equalTypes,
  falsyType: () => falsyType,
  findConfig: () => findConfig,
  fn: () => fn,
  formatType: () => formatType,
  getBinding: () => getBinding,
  intersection: () => intersection,
  isAssignable: () => isAssignable,
  isClassType: () => isClassType,
  isGlobal: () => isGlobal,
  isPossiblyFalsy: () => isPossiblyFalsy,
  isPossiblyTruthy: () => isPossiblyTruthy,
  isUnassignedGlobal: () => isUnassignedGlobal,
  literal: () => literal,
  loadConfig: () => loadConfig,
  luautparser: () => luautparser,
  matchInfer: () => matchInfer,
  moduleCandidates: () => moduleCandidates,
  moduleExports: () => moduleExports,
  narrowExclude: () => narrowExclude,
  narrowFalsy: () => narrowFalsy,
  narrowTo: () => narrowTo,
  narrowTruthy: () => narrowTruthy,
  neverType: () => neverType,
  nilType: () => nilType,
  nodeHost: () => nodeHost,
  numberType: () => numberType,
  objectType: () => objectType,
  optional: () => optional,
  overlaps: () => overlaps,
  parse: () => parse,
  parseExpressionFromSource: () => parseExpressionFromSource,
  parseTokens: () => parseTokens,
  parseWithRecovery: () => parseWithRecovery,
  primitive: () => primitive,
  readDirectives: () => readDirectives,
  resolveModulePath: () => resolveModulePath,
  resolveTypeLibraries: () => resolveTypeLibraries,
  setAliasExpander: () => setAliasExpander,
  setDeferredBound: () => setDeferredBound,
  sourceMapTypes: () => sourceMapTypes,
  stringType: () => stringType,
  stripJsonComments: () => stripJsonComments,
  substitute: () => substitute,
  templateMatches: () => templateMatches,
  threadType: () => threadType,
  tokenize: () => tokenize,
  tuple: () => tuple,
  typeParam: () => typeParam,
  unify: () => unify,
  union: () => union,
  unknownType: () => unknownType,
  widen: () => widen
});
module.exports = __toCommonJS(index_exports);

// src/lexer/lexer.ts
var Keywords = [
  "and",
  "break",
  "do",
  "else",
  "elseif",
  "end",
  "false",
  "for",
  "function",
  "if",
  "in",
  "nil",
  "not",
  "or",
  "repeat",
  "return",
  "then",
  "true",
  "until",
  "while",
  "continue",
  // luaut extensions. `local` is gone — declarations use `const` / `let`
  // (hard keywords). `type` stays a soft keyword.
  "const",
  "let",
  "import",
  "export",
  "from",
  "as"
];
var Operators = [
  "+=",
  "-=",
  "*=",
  "/=",
  "//=",
  "%=",
  "^=",
  "..=",
  "==",
  "~=",
  "<=",
  ">=",
  "//",
  "..",
  "...",
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
  "#",
  "<",
  ">",
  "="
];
var Punctuators = [
  "::",
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  ";",
  ":",
  ",",
  ".",
  "?",
  "=>",
  "->",
  "&",
  "|",
  "@"
];
function isDigit(ch) {
  return ch >= "0" && ch <= "9";
}
function isHexDigit(ch) {
  return isDigit(ch) || ch >= "a" && ch <= "f" || ch >= "A" && ch <= "F";
}
function isAlpha(ch) {
  return ch >= "a" && ch <= "z" || ch >= "A" && ch <= "Z" || ch === "_";
}
function isAlphaNumeric(ch) {
  return isAlpha(ch) || isDigit(ch);
}
var KeywordSet = new Set(Keywords);
var OperatorSet = new Set(Operators);
var SortedSymbols = [...Operators, ...Punctuators].sort((a, b) => b.length - a.length);
var LexError = class extends Error {
  constructor(message, line, column) {
    super(`${message} (${line}:${column})`);
    this.line = line;
    this.column = column;
  }
  line;
  column;
};
function tokenize(source, options = {}) {
  const { errors, comments } = options;
  const tokens = [];
  let cursor = 0;
  let line = 1;
  let column = 1;
  function fail(message, atLine, atColumn) {
    const error = new LexError(message, atLine, atColumn);
    if (!errors) throw error;
    errors.push(error);
  }
  function peek(offset = 0) {
    return source[cursor + offset] ?? "";
  }
  function isAtEnd() {
    return cursor >= source.length;
  }
  function advance() {
    const ch = source[cursor];
    cursor++;
    if (ch === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
    return ch;
  }
  function match(str) {
    if (source.startsWith(str, cursor)) {
      for (let i = 0; i < str.length; i++) advance();
      return true;
    }
    return false;
  }
  function makeBase(startLine, startColumn) {
    return {
      line: { start: startLine, end: line },
      column: { start: startColumn, end: column }
    };
  }
  function tryLongBracketOpen(allowLevel0 = true) {
    const save = cursor;
    const saveLine = line;
    const saveColumn = column;
    if (peek() !== "[") return null;
    let i = cursor + 1;
    let level = 0;
    while (source[i] === "=") {
      level++;
      i++;
    }
    if (source[i] === "[" && (level > 0 || allowLevel0)) {
      advance();
      for (let k = 0; k < level; k++) advance();
      advance();
      return level;
    }
    cursor = save;
    line = saveLine;
    column = saveColumn;
    return null;
  }
  function readLongBracketContent(level) {
    if (peek() === "\r") advance();
    if (peek() === "\n") advance();
    let content = "";
    while (true) {
      if (isAtEnd()) {
        fail("Unterminated long bracket", line, column);
        return content;
      }
      if (peek() === "]") {
        const save = cursor;
        const saveLine = line;
        const saveColumn = column;
        advance();
        let eq = 0;
        while (peek() === "=") {
          eq++;
          advance();
        }
        if (eq === level && peek() === "]") {
          advance();
          return content;
        }
        cursor = save;
        line = saveLine;
        column = saveColumn;
        content += advance();
      } else {
        content += advance();
      }
    }
  }
  function skipLineComment() {
    while (!isAtEnd() && peek() !== "\n") advance();
  }
  function skipWhitespaceAndComments() {
    while (!isAtEnd()) {
      const ch = peek();
      if (ch === " " || ch === "	" || ch === "\r" || ch === "\n") {
        advance();
        continue;
      }
      if (ch === "-" && peek(1) === "-") {
        const startLine = line;
        const startColumn = column;
        advance();
        advance();
        if (peek() === "[") {
          const level = tryLongBracketOpen();
          if (level !== null) {
            const text = readLongBracketContent(level);
            comments?.push({ text, line: startLine, column: startColumn, endLine: line });
            continue;
          }
        }
        const textStart = cursor;
        skipLineComment();
        comments?.push({ text: source.slice(textStart, cursor).replace(/\r$/, ""), line: startLine, column: startColumn, endLine: startLine });
        continue;
      }
      break;
    }
  }
  function readNumber() {
    const startLine = line;
    const startColumn = column;
    const start = cursor;
    if (peek() === "0" && (peek(1) === "x" || peek(1) === "X")) {
      advance();
      advance();
      while (isHexDigit(peek()) || peek() === "_") advance();
    } else if (peek() === "0" && (peek(1) === "b" || peek(1) === "B")) {
      advance();
      advance();
      while (peek() === "0" || peek() === "1" || peek() === "_") advance();
    } else {
      while (isDigit(peek()) || peek() === "_") advance();
      if (peek() === "." && isDigit(peek(1))) {
        advance();
        while (isDigit(peek()) || peek() === "_") advance();
      } else if (peek() === "." && peek(1) !== "." && !isAlpha(peek(1))) {
        advance();
        while (isDigit(peek()) || peek() === "_") advance();
      }
      if (peek() === "e" || peek() === "E") {
        const save = cursor, saveLine = line, saveColumn = column;
        advance();
        if (peek() === "+" || peek() === "-") advance();
        if (isDigit(peek())) {
          while (isDigit(peek())) advance();
        } else {
          cursor = save;
          line = saveLine;
          column = saveColumn;
        }
      }
    }
    const raw = source.slice(start, cursor);
    const cleaned = raw.replace(/_/g, "");
    let value;
    if (/^0[xX]/.test(cleaned)) {
      value = parseInt(cleaned, 16);
    } else if (/^0[bB]/.test(cleaned)) {
      value = parseInt(cleaned.slice(2), 2);
    } else {
      value = parseFloat(cleaned);
    }
    return {
      type: "Literal",
      kind: "number",
      value,
      raw,
      ...makeBase(startLine, startColumn)
    };
  }
  function readEscapeSequence() {
    const ch = advance();
    switch (ch) {
      case "n":
        return "\n";
      case "t":
        return "	";
      case "r":
        return "\r";
      case "a":
        return "\x07";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "v":
        return "\v";
      case "\\":
        return "\\";
      case '"':
        return '"';
      case "'":
        return "'";
      case "`":
        return "`";
      case "\n":
        return "\n";
      case "z": {
        while (!isAtEnd() && /\s/.test(peek())) advance();
        return "";
      }
      case "x": {
        let hex = "";
        for (let i = 0; i < 2 && isHexDigit(peek()); i++) hex += advance();
        return String.fromCharCode(parseInt(hex, 16));
      }
      default: {
        if (isDigit(ch)) {
          let dec = ch;
          for (let i = 0; i < 2 && isDigit(peek()); i++) dec += advance();
          return String.fromCharCode(parseInt(dec, 10));
        }
        return ch;
      }
    }
  }
  function readQuotedString() {
    const startLine = line;
    const startColumn = column;
    const rawStart = cursor;
    const quote = advance();
    let value = "";
    while (true) {
      const ch = peek();
      if (isAtEnd() || ch === "\n") {
        fail("Unterminated string", line, column);
        break;
      }
      if (ch === quote) {
        advance();
        break;
      }
      if (ch === "\\") {
        advance();
        value += readEscapeSequence();
        continue;
      }
      value += advance();
    }
    const raw = source.slice(rawStart, cursor);
    return {
      type: "Literal",
      kind: "string",
      value,
      raw,
      ...makeBase(startLine, startColumn)
    };
  }
  function readLongString() {
    const startLine = line;
    const startColumn = column;
    const rawStart = cursor;
    const level = tryLongBracketOpen(false);
    if (level === null) {
      throw new LexError("Expected long string bracket", line, column);
    }
    const value = readLongBracketContent(level);
    const raw = source.slice(rawStart, cursor);
    return {
      type: "Literal",
      kind: "string",
      value,
      raw,
      ...makeBase(startLine, startColumn)
    };
  }
  function readInterpolatedString() {
    const startLine = line;
    const startColumn = column;
    advance();
    const parts = [];
    let currentRaw = "";
    let currentValue = "";
    function flushString() {
      parts.push({ kind: "string", value: currentValue, raw: currentRaw });
      currentRaw = "";
      currentValue = "";
    }
    while (true) {
      if (isAtEnd()) {
        fail("Unterminated interpolated string", line, column);
        flushString();
        break;
      }
      const ch = peek();
      if (ch === "`") {
        advance();
        flushString();
        break;
      }
      if (ch === "\\") {
        const escStart = cursor;
        advance();
        currentValue += readEscapeSequence();
        currentRaw += source.slice(escStart, cursor);
        continue;
      }
      if (ch === "$" && peek(1) === "{") {
        flushString();
        advance();
        advance();
        const exprStart = cursor;
        const exprLine = line;
        const exprColumn = column;
        let depth = 1;
        let closed = true;
        while (depth > 0) {
          if (isAtEnd()) {
            fail("Unterminated interpolation expression", line, column);
            closed = false;
            break;
          }
          if (peek() === "{") depth++;
          if (peek() === "}") {
            depth--;
            if (depth === 0) break;
          }
          advance();
        }
        const exprRaw = source.slice(exprStart, cursor);
        parts.push({ kind: "expression", raw: exprRaw, line: exprLine, column: exprColumn });
        if (!closed) {
          flushString();
          break;
        }
        advance();
        continue;
      }
      const chStart = cursor;
      const consumed = advance();
      currentValue += consumed;
      currentRaw += source.slice(chStart, cursor);
    }
    return {
      type: "InterpolatedString",
      parts,
      ...makeBase(startLine, startColumn)
    };
  }
  function readIdentifierOrKeyword() {
    const startLine = line;
    const startColumn = column;
    const start = cursor;
    while (!isAtEnd() && isAlphaNumeric(peek())) advance();
    const value = source.slice(start, cursor);
    if (value === "true" || value === "false") {
      return {
        type: "Literal",
        kind: "boolean",
        value: value === "true",
        ...makeBase(startLine, startColumn)
      };
    }
    if (value === "nil") {
      return {
        type: "Literal",
        kind: "nil",
        value: null,
        ...makeBase(startLine, startColumn)
      };
    }
    if (KeywordSet.has(value)) {
      return {
        type: "Keyword",
        value,
        ...makeBase(startLine, startColumn)
      };
    }
    return {
      type: "Identifier",
      value,
      ...makeBase(startLine, startColumn)
    };
  }
  function readOperatorOrPunctuator() {
    const startLine = line;
    const startColumn = column;
    for (const sym of SortedSymbols) {
      if (source.startsWith(sym, cursor)) {
        for (let i = 0; i < sym.length; i++) advance();
        if (OperatorSet.has(sym)) {
          return {
            type: "Operator",
            value: sym,
            ...makeBase(startLine, startColumn)
          };
        }
        return {
          type: "Punctuator",
          value: sym,
          ...makeBase(startLine, startColumn)
        };
      }
    }
    fail(`Unexpected character '${peek()}'`, line, column);
    advance();
    return void 0;
  }
  while (true) {
    skipWhitespaceAndComments();
    if (isAtEnd()) break;
    const ch = peek();
    if (isDigit(ch) || ch === "." && isDigit(peek(1))) {
      tokens.push(readNumber());
      continue;
    }
    if (ch === '"' || ch === "'") {
      tokens.push(readQuotedString());
      continue;
    }
    if (ch === "`") {
      tokens.push(readInterpolatedString());
      continue;
    }
    if (ch === "[" && peek(1) === "=") {
      const save = cursor, saveLine = line, saveColumn = column;
      const level = tryLongBracketOpen(false);
      if (level !== null) {
        cursor = save;
        line = saveLine;
        column = saveColumn;
        tokens.push(readLongString());
        continue;
      }
    }
    if (isAlpha(ch)) {
      tokens.push(readIdentifierOrKeyword());
      continue;
    }
    const symbol = readOperatorOrPunctuator();
    if (symbol) tokens.push(symbol);
  }
  tokens.push({
    type: "EOF",
    line: { start: line, end: line },
    column: { start: column, end: column }
  });
  return tokens;
}

// src/ast/directives.ts
var DIRECTIVE = /^\s*@luaut-(nocheck|ignore|expect-error)(?![\w-])/;
function readDirectives(comments, tokens) {
  const codeLines = [...new Set(tokens.filter((t) => t.type !== "EOF").map((t) => t.line.start))].sort((a, b) => a - b);
  const firstCode = codeLines[0] ?? Infinity;
  const all = [];
  let nocheck = false;
  for (const comment of comments) {
    const match = DIRECTIVE.exec(comment.text);
    if (!match) continue;
    const kind = match[1];
    if (kind === "nocheck") {
      if (comment.line < firstCode) nocheck = true;
      all.push({ kind, line: comment.line, column: comment.column });
      continue;
    }
    const target = codeLines.find((l) => l > comment.endLine);
    all.push({ kind, line: comment.line, column: comment.column, target });
  }
  return { nocheck, all };
}
function directivesOf(source) {
  const comments = [];
  const errors = [];
  const tokens = tokenize(source, { errors, comments });
  return readDirectives(comments, tokens);
}
function applyDirectives(directives, diagnostics, lineOf) {
  if (directives.nocheck) return { kept: [], unusedExpectErrors: [] };
  const covering = /* @__PURE__ */ new Map();
  for (const d of directives.all) {
    if (d.target === void 0) continue;
    covering.set(d.target, [...covering.get(d.target) ?? [], d]);
  }
  const used = /* @__PURE__ */ new Set();
  const kept = diagnostics.filter((diagnostic) => {
    const on = covering.get(lineOf(diagnostic));
    if (!on) return true;
    for (const d of on) used.add(d);
    return false;
  });
  const unusedExpectErrors = directives.all.filter((d) => d.kind === "expect-error" && !used.has(d));
  return { kept, unusedExpectErrors };
}
var UNUSED_EXPECT_ERROR = "Unused '@luaut-expect-error' directive";

// src/ast/builders.ts
function bindThis(func, at) {
  bindThisParam(func.params, at);
  func.isMethod = true;
}
function bindThisParam(params, at) {
  params.unshift({ type: "FunctionParameter", name: "this", ...spanFrom(at, at) });
}
var ParseError = class extends Error {
  constructor(message, line, column) {
    super(`${message} (${line}:${column})`);
    this.line = line;
    this.column = column;
  }
  line;
  column;
};
var ParseRecover = class extends Error {
};
function spanFrom(start, end) {
  return {
    line: { start: start.line.start, end: end.line.end },
    column: { start: start.column.start, end: end.column.end }
  };
}
function shiftSpans(node, line, column) {
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const span = value;
    if (span.line && span.column) {
      if (span.column.start !== void 0 && span.line.start === 1) span.column.start += column - 1;
      if (span.column.end !== void 0 && span.line.end === 1) span.column.end += column - 1;
      span.line.start += line - 1;
      span.line.end += line - 1;
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(node);
  return node;
}
function tokenIdentifier(t) {
  return { type: "Identifier", name: t.value, ...spanFrom(t, t) };
}
function nameIdentifier(name, at) {
  return {
    type: "Identifier",
    name,
    line: { start: at.line.start, end: at.line.start },
    column: { start: at.column.start, end: at.column.start + name.length }
  };
}
var BINARY_PRECEDENCE = {
  "or": 1,
  "and": 2,
  "<": 3,
  ">": 3,
  "<=": 3,
  ">=": 3,
  "~=": 3,
  "==": 3,
  "..": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "//": 6,
  "%": 6,
  "^": 8
};
var RIGHT_ASSOCIATIVE = /* @__PURE__ */ new Set(["..", "^"]);
var UNARY_PRECEDENCE = 7;
var COMPOUND_ASSIGN_OPS = /* @__PURE__ */ new Set(["+=", "-=", "*=", "/=", "//=", "%=", "^=", "..="]);
var STATEMENT_KEYWORDS = /* @__PURE__ */ new Set([
  "const",
  "let",
  "while",
  "for",
  "return",
  "do",
  "repeat",
  "break",
  "continue",
  "import",
  "export",
  "end",
  "else",
  "elseif",
  "until",
  "then"
]);
var Parser = class {
  tokens;
  cursor = 0;
  recover;
  indentation;
  /** Populated in recovery mode. */
  errors = [];
  /** Recovery found a block without its `}`. */
  missingEnd = false;
  /** The column of the first token on each line, for `indentation`. */
  lineIndent;
  /** Inside a class body, where `super` means the base class. Outside
   *  one it is an ordinary name, so existing code using it still reads. */
  classDepth = 0;
  constructor(tokens, options = {}) {
    this.tokens = tokens;
    this.recover = options.recover ?? false;
    this.indentation = this.recover && (options.indentation ?? false);
  }
  current() {
    return this.tokens[this.cursor];
  }
  peek(offset) {
    return this.tokens[Math.min(this.cursor + offset, this.tokens.length - 1)];
  }
  previous() {
    return this.tokens[this.cursor - 1];
  }
  isAtEnd() {
    return this.current().type === "EOF";
  }
  advance() {
    const t = this.current();
    if (t.type !== "EOF") this.cursor++;
    return t;
  }
  checkType(type) {
    return this.current().type === type;
  }
  checkKeyword(value) {
    const t = this.current();
    return t.type === "Keyword" && t.value === value;
  }
  checkOperator(value) {
    const t = this.current();
    return t.type === "Operator" && t.value === value;
  }
  checkPunctuator(value) {
    const t = this.current();
    return t.type === "Punctuator" && t.value === value;
  }
  /** Match a word by spelling whether the lexer classified it as an
   *  identifier or a hard keyword (`as` is a keyword because of `as const`,
   *  but it is also the mapped-type key-remapping word). */
  checkWord(value) {
    const t = this.current();
    return (t.type === "Identifier" || t.type === "Keyword") && t.value === value;
  }
  checkPunctuatorAt(offset, value) {
    const t = this.peek(offset);
    return t.type === "Punctuator" && t.value === value;
  }
  checkIdentifierValue(value) {
    const t = this.current();
    return t.type === "Identifier" && t.value === value;
  }
  matchKeyword(value) {
    if (this.checkKeyword(value)) {
      this.advance();
      return true;
    }
    return false;
  }
  matchOperator(value) {
    if (this.checkOperator(value)) {
      this.advance();
      return true;
    }
    return false;
  }
  matchPunctuator(value) {
    if (this.checkPunctuator(value)) {
      this.advance();
      return true;
    }
    return false;
  }
  expectKeyword(value) {
    if (!this.checkKeyword(value)) this.error(`Expected keyword '${value}'`);
    return this.advance();
  }
  expectOperator(value) {
    if (!this.checkOperator(value)) this.error(`Expected '${value}'`);
    return this.advance();
  }
  expectPunctuator(value) {
    if (!this.checkPunctuator(value)) this.error(`Expected '${value}'`);
    return this.advance();
  }
  expectIdentifier() {
    if (!this.checkType("Identifier")) this.error(`Expected identifier`);
    return this.advance();
  }
  error(message) {
    const t = this.current();
    const err = new ParseError(`${message}, got '${this.describeToken(t)}'`, t.line.start, t.column.start);
    if (this.recover) {
      this.record(err);
      throw new ParseRecover(err.message);
    }
    throw err;
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
  record(error) {
    const last = this.errors[this.errors.length - 1];
    if (last && last.line === error.line && last.column === error.column) return;
    this.errors.push(error);
  }
  /** Record an error without abandoning what is being parsed. */
  softError(message) {
    const t = this.current();
    this.record(new ParseError(`${message}, got '${this.describeToken(t)}'`, t.line.start, t.column.start));
  }
  /** `parse()`; in recovery mode, when it fails, skip to where parsing can go
   *  on and return `fallback` instead. */
  attempt(parse2, stop, fallback) {
    if (!this.recover) return parse2();
    const from = this.cursor;
    const start = this.current();
    try {
      return parse2();
    } catch (e) {
      if (e instanceof ParseError) this.record(e);
      else if (!(e instanceof ParseRecover)) throw e;
      this.skip(stop, from, "expression");
      return fallback(start, from);
    }
  }
  /** An expression, or an `ErrorExpression` over what could not be parsed. */
  expressionOr(stop) {
    return this.attempt(() => this.parseExpression(), stop, (start, from) => this.errorExpression(start, from));
  }
  /** A comma-separated list of values: a `return`'s, a declaration's, an
   *  assignment's. `...xs` spreads an array into it, as in a call's
   *  arguments; bare `...` is the vararg pack, as it always was. */
  expressionListOr(stop) {
    const until = () => stop() || this.checkPunctuator(",");
    const item = () => this.checkOperator("...") && this.startsSpread() ? this.parseSpreadArgument(until) : this.expressionOr(until);
    const list = [item()];
    while (this.matchPunctuator(",")) list.push(item());
    return list;
  }
  /** A type annotation, or none when it could not be parsed. */
  typeOr(stop) {
    return this.attempt(() => this.parseType(), stop, () => void 0);
  }
  errorExpression(start, from) {
    if (this.cursor > from) return { type: "ErrorExpression", ...spanFrom(start, this.previous()) };
    return {
      type: "ErrorExpression",
      line: { start: start.line.start, end: start.line.start },
      column: { start: start.column.start, end: start.column.start }
    };
  }
  /** A closing bracket; in recovery mode a missing one is recorded and the
   *  construct ends where it is. */
  expectCloser(value) {
    if (this.matchPunctuator(value)) return;
    if (!this.recover) this.error(`Expected '${value}'`);
    this.softError(`Expected '${value}'`);
  }
  /** `then` / `do` / `in`; in recovery mode a missing one is recorded and
   *  what follows is read as if it were there. */
  expectKeywordSoft(value) {
    if (this.matchKeyword(value)) return;
    if (!this.recover) this.error(`Expected keyword '${value}'`);
    this.softError(`Expected keyword '${value}'`);
  }
  /** The `end` of the block `opener` began. */
  expectEnd(opener) {
    if (this.checkKeyword("end") && !this.endBelongsOutside(opener)) {
      this.advance();
      return;
    }
    if (!this.recover) this.error("Expected keyword 'end'");
    this.softError(`Expected 'end' to close '${this.describeToken(opener)}' on line ${opener.line.start}`);
    this.missingEnd = true;
  }
  /** Indentation mode: an `end` indented less than the line that opened the
   *  block closes something outside it. */
  endBelongsOutside(opener) {
    if (!this.indentation) return false;
    const t = this.current();
    return t.line.start > opener.line.start && t.column.start < this.indentOf(opener);
  }
  /** Indentation mode: a statement indented no deeper than the line that
   *  opened the block is past the block. */
  dedentedPast(opener) {
    if (!this.indentation || !opener) return false;
    const t = this.current();
    return t.line.start > opener.line.start && t.column.start <= this.indentOf(opener);
  }
  indentOf(token) {
    if (!this.lineIndent) {
      this.lineIndent = /* @__PURE__ */ new Map();
      for (const t of this.tokens) {
        if (!this.lineIndent.has(t.line.start)) this.lineIndent.set(t.line.start, t.column.start);
      }
    }
    return this.lineIndent.get(token.line.start) ?? token.column.start;
  }
  /** Is the current token on a later line than the one before it? */
  onNewLine() {
    const previous = this.previous();
    return previous !== void 0 && this.current().line.start > previous.line.end;
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
  skip(stop, from, mode) {
    const closers = [];
    for (let i = from; i < this.cursor; i++) this.nest(this.tokens[i], closers, mode);
    while (!this.isAtEnd()) {
      if (this.stopsSkip(closers, stop, mode)) return;
      const t = this.advance();
      this.nest(t, closers, mode);
      if (mode === "statement" && closers.length === 0 && t.type === "Punctuator" && t.value === ";") return;
    }
  }
  nest(t, closers, mode) {
    const value = t.value;
    const popTo = (closer) => {
      const at = closers.lastIndexOf(closer);
      if (at >= 0) closers.length = at;
    };
    if (t.type === "Punctuator") {
      if (value === "(") closers.push(")");
      else if (value === "[") closers.push("]");
      else if (value === "{") closers.push("}");
      else if (value === ")" || value === "]" || value === "}") popTo(value);
      return;
    }
    if (t.type !== "Keyword") return;
    const inBody = closers.includes("end") || closers.includes("until") || mode === "statement" && closers.length === 0;
    switch (value) {
      case "function":
        closers.push("end");
        return;
      case "if":
        closers.push(inBody ? "end" : "else");
        return;
      case "do":
        if (inBody) closers.push("end");
        return;
      case "repeat":
        if (inBody) closers.push("until");
        return;
      case "else":
        if (closers[closers.length - 1] === "else") closers.pop();
        return;
      case "end":
        popTo("end");
        return;
      case "until":
        popTo("until");
        return;
    }
  }
  stopsSkip(closers, stop, mode) {
    const t = this.current();
    const value = t.value;
    const inFunction = closers.includes("end") || closers.includes("until");
    if (!inFunction && t.type === "Keyword" && typeof value === "string") {
      const inIfExpression = closers.includes("else") && (value === "then" || value === "elseif" || value === "else");
      if (STATEMENT_KEYWORDS.has(value) && !inIfExpression && !(mode === "statement" && value === "then")) return true;
      if (mode === "statement" && closers.length === 0 && (value === "if" || value === "function" && this.peek(1).type === "Identifier")) return true;
    }
    if (closers.length) return false;
    if (t.type === "Punctuator" && (value === ")" || value === "]" || value === "}")) return true;
    if (mode === "statement" && t.type === "Punctuator" && value === "@") return true;
    if (mode === "expression" && t.type === "Punctuator" && value === ";") return true;
    return stop();
  }
  describeToken(t) {
    if (t.type === "EOF") return "<eof>";
    if ("value" in t) return String(t.value);
    return t.type;
  }
  // ============================================================
  // Entry point
  // ============================================================
  parseProgram() {
    const start = this.current();
    const body = this.parseBlock();
    if (!this.isAtEnd()) {
      if (!this.recover) this.error("Expected end of file");
      while (!this.isAtEnd()) {
        this.softError("Expected end of file");
        this.advance();
        body.statements.push(...this.parseBlock().statements);
      }
      Object.assign(body, spanFrom(body, this.previous() ?? start));
    }
    return { type: "Program", body, ...spanFrom(start, this.previous() ?? start) };
  }
  // ============================================================
  // Block / Statement
  // ============================================================
  isBlockEnd() {
    return this.isAtEnd() || this.checkPunctuator("}") || this.checkKeyword("end") || this.checkKeyword("else") || this.checkKeyword("elseif") || this.checkKeyword("until");
  }
  // ============================================================
  // Bodies
  // ------------------------------------------------------------
  // luaut writes a block in braces — `if (ready) { ... }`, `function f() {
  // ... }`. The `end` spellings Lua uses are still read, so a file written
  // in them keeps working while it is being moved over.
  //
  // A condition is in parentheses because `f {}` is a call: without them
  // `if ready { ... }` would be a call of `ready` and then a block. With
  // them the form is decided by looking past the closing parenthesis, which
  // is why a parenthesized condition in the older spelling still reads.
  // ============================================================
  /** `{ ... }` — a block in braces. */
  parseBraceBlock() {
    const brace = this.advance();
    const body = this.parseBlock(brace);
    if (this.matchPunctuator("}")) return body;
    if (!this.recover) this.error(`Expected '}' to close the block opened on line ${brace.line.start}`);
    this.softError(`Expected '}' to close the block opened on line ${brace.line.start}`);
    this.missingEnd = true;
    return body;
  }
  /** The `{ ... }` a construct's body is written in. Half-written — the
   *  `{` not typed yet — it is empty and says so, rather than throwing the
   *  whole construct away: what has been written is what an editor answers
   *  from. */
  parseBracedBody(what) {
    if (this.checkPunctuator("{")) return this.parseBraceBlock();
    const at = this.current();
    if (!this.recover) this.error(`Expected '{' to open the body of '${what}'`);
    this.softError(`Expected '{' to open the body of '${what}'`);
    return { type: "Block", statements: [], ...spanFrom(at, at) };
  }
  /** Does a `{` follow the parenthesized group starting here? That is what
   *  tells `if (ready) { ... }` from `if (ready) then ... end`. */
  braceFollowsGroup() {
    if (!this.checkPunctuator("(")) return false;
    const closers = { "(": ")", "[": "]", "{": "}" };
    const stack = [];
    for (let i = 0; ; i++) {
      const token = this.peek(i);
      if (token.type === "EOF") return false;
      if (token.type === "Punctuator") {
        const value = String(token.value);
        if (closers[value]) stack.push(closers[value]);
        else if (value === stack[stack.length - 1]) {
          stack.pop();
          if (!stack.length) {
            const next = this.peek(i + 1);
            return next.type === "Punctuator" && next.value === "{";
          }
        }
      }
    }
  }
  /** `opener` is the token that began the block (`if`, `function`, ...), for
   *  indentation recovery. */
  parseBlock(opener) {
    const start = this.current();
    const statements = [];
    while (!this.isBlockEnd()) {
      if (this.matchPunctuator(";")) continue;
      if (this.dedentedPast(opener)) break;
      if (this.recover) {
        const at = this.cursor;
        const errStart = this.current();
        try {
          const stmt2 = this.parseStatement();
          statements.push(stmt2);
          if (stmt2.type === "ReturnStatement") {
            this.matchPunctuator(";");
            break;
          }
        } catch (e) {
          if (e instanceof ParseRecover) {
          } else if (e instanceof ParseError) {
            this.record(e);
          } else {
            throw e;
          }
          this.skip(() => false, at, "statement");
          if (this.cursor === at) {
            if (this.isAtEnd()) break;
            this.advance();
          }
          statements.push({
            type: "ErrorStatement",
            ...spanFrom(errStart, this.previous() ?? errStart)
          });
        }
        continue;
      }
      const stmt = this.parseStatement();
      statements.push(stmt);
      if (stmt.type === "ReturnStatement") {
        this.matchPunctuator(";");
        break;
      }
    }
    const end = this.previous() ?? start;
    return { type: "Block", statements, ...spanFrom(start, end) };
  }
  parseAttributes() {
    const start = this.current();
    const attributes = [];
    while (this.current().type === "Punctuator" && this.current().value === "@") {
      this.advance();
      attributes.push(this.expectIdentifier().value);
    }
    return { attributes, start };
  }
  parseStatement() {
    const t = this.current();
    if (t.type === "Punctuator" && t.value === "@") {
      const { attributes, start } = this.parseAttributes();
      const next = this.current();
      if (next.type === "Keyword" && next.value === "function") {
        const stmt = this.parseFunctionStatement();
        stmt.attributes = attributes;
        stmt.line.start = start.line.start;
        stmt.column.start = start.column.start;
        return stmt;
      }
      throw new ParseError("Expected 'function' after an attribute", next.line.start, next.column.start);
    }
    if (t.type === "Keyword") {
      switch (t.value) {
        case "const":
        case "let":
          return this.parseVariableDeclaration();
        case "if":
          return this.parseIfStatement();
        case "while":
          return this.parseWhileStatement();
        case "repeat":
          return this.parseRepeatStatement();
        case "do":
          return this.parseDoStatement();
        case "for":
          return this.parseForStatement();
        case "function":
          return this.parseFunctionStatement();
        case "return":
          return this.parseReturnStatement();
        case "import":
          return this.parseImportStatement();
        case "export":
          return this.parseExportStatement();
        case "break": {
          this.advance();
          return { type: "BreakStatement", ...spanFrom(t, this.previous()) };
        }
        case "continue": {
          this.advance();
          return { type: "ContinueStatement", ...spanFrom(t, this.previous()) };
        }
      }
    }
    if (this.recover && t.type === "Identifier" && t.value === "local" && (this.peek(1).type === "Identifier" || this.checkPunctuatorAt(1, "{") || this.checkPunctuatorAt(1, "["))) {
      this.softError("luaut has no 'local'; declare with 'const' or 'let'");
      return this.parseVariableDeclaration("let");
    }
    if (t.type === "Identifier" && t.value === "type" && this.peek(1).type === "Identifier") {
      return this.parseTypeAliasStatement();
    }
    if (t.type === "Identifier" && t.value === "class" && this.peek(1).type === "Identifier") {
      return this.parseClassDeclaration();
    }
    if (t.type === "Identifier" && t.value === "declare") {
      const p1 = this.peek(1);
      if (p1.type === "Identifier" && p1.value === "class" && this.peek(2).type === "Identifier") {
        return this.parseDeclareClassStatement();
      }
      if (p1.type === "Identifier" || p1.type === "Keyword" && p1.value === "function") {
        return this.parseDeclareStatement();
      }
    }
    return this.parseExpressionStatement();
  }
  // `declare NAME: T` / `declare function NAME<G>(params): R` — ambient
  // declarations for a `.d.luaut` definitions file. `declare type X = ...`
  // is written as a plain `type X = ...` (aliases are ambient already).
  parseDeclareStatement() {
    const start = this.current();
    this.advance();
    if (this.matchKeyword("function")) {
      const nameTok2 = this.expectIdentifier();
      const head = this.parseFunctionHead();
      const params = head.params.map((p) => ({
        type: "FunctionTypeParameter",
        name: p.name || void 0,
        id: p.name ? nameIdentifier(p.name, p) : void 0,
        optional: p.optional,
        rest: p.rest,
        typeAnnotation: p.typeAnnotation ?? { type: "TypeReference", base: "any", typeArguments: [], line: p.line, column: p.column },
        line: p.line,
        column: p.column
      }));
      const valueType2 = {
        type: "FunctionTypeNode",
        generics: head.generics,
        params,
        hasVarargs: head.hasVarargs,
        varargType: head.varargTypeAnnotation,
        returnType: head.returnType ?? { type: "TypeReference", base: head.predicate ? "boolean" : "unknown", typeArguments: [], ...spanFrom(start, start) },
        predicate: head.predicate,
        ...spanFrom(start, this.previous())
      };
      return { type: "DeclareStatement", name: nameTok2.value, id: tokenIdentifier(nameTok2), valueType: valueType2, ...spanFrom(start, this.previous()) };
    }
    const nameTok = this.expectIdentifier();
    this.expectPunctuator(":");
    const valueType = this.parseType();
    return { type: "DeclareStatement", name: nameTok.value, id: tokenIdentifier(nameTok), valueType, ...spanFrom(start, this.previous()) };
  }
  /** A declared type's name. It may be qualified once — `Enum.Material` —
   *  which is how a definitions file names types under a namespace, and how
   *  they are then written (`const m: Enum.Material`). */
  parseTypeName() {
    const first = this.expectIdentifier();
    if (this.checkPunctuator(".") && this.peek(1).type === "Identifier") {
      this.advance();
      const second = this.expectIdentifier();
      return { type: "Identifier", name: `${first.value}.${second.value}`, ...spanFrom(first, second) };
    }
    return tokenIdentifier(first);
  }
  // `declare class Name extends Base { member: T, ... }`
  parseDeclareClassStatement() {
    const start = this.current();
    this.advance();
    this.advance();
    const name = this.parseTypeName();
    let superclass;
    if (this.checkIdentifierValue("extends")) {
      this.advance();
      const base = this.parseType();
      if (base.type !== "TypeReference") this.error("A class can only extend another class, written by name");
      superclass = base;
    }
    if (!this.checkPunctuator("{")) this.error("Expected '{' to start the class body");
    const body = this.parseTableType();
    if (body.type !== "TableTypeNode") this.error("A class body lists members ('name: T'), not a mapped type");
    return { type: "DeclareClassStatement", name, superclass, body, ...spanFrom(start, this.previous()) };
  }
  // `import { a, b as c } from '...'` / `import Default from '...'` /
  // `import Default, { a } from '...'`. Compiled away entirely by the
  // bundler — never survives into emitted Luau.
  parseImportStatement() {
    const start = this.current();
    this.advance();
    const next = this.peek(1);
    const isTypeOnly = this.checkIdentifierValue("type") && (next.type === "Punctuator" && next.value === "{" || next.type === "Operator" && next.value === "*" || next.type === "Identifier");
    if (isTypeOnly) this.advance();
    let defaultImport;
    const specifiers = [];
    let namespaceImport;
    const parseBindings = () => {
      if (this.checkOperator("*")) {
        this.advance();
        if (!this.checkKeyword("as")) this.error("Expected 'as' after 'import *'");
        this.advance();
        namespaceImport = this.parseIdentifier();
        return;
      }
      this.expectPunctuator("{");
      this.parseImportSpecifierList(specifiers);
      this.expectPunctuator("}");
    };
    if (this.checkType("Identifier")) {
      const nameTok = this.expectIdentifier();
      defaultImport = { type: "Identifier", name: nameTok.value, ...spanFrom(nameTok, nameTok) };
      if (this.matchPunctuator(",")) parseBindings();
    } else {
      parseBindings();
    }
    if (!this.checkKeyword("from")) {
      this.error("Expected 'from' in import statement");
    }
    this.advance();
    const sourceTok = this.current();
    if (sourceTok.type !== "Literal" || sourceTok.kind !== "string") {
      this.error("Expected string literal module path after 'from'");
    }
    this.advance();
    const source = {
      type: "StringLiteral",
      value: sourceTok.value,
      raw: sourceTok.raw,
      ...spanFrom(sourceTok, sourceTok)
    };
    return {
      type: "ImportStatement",
      defaultImport,
      namespaceImport,
      specifiers,
      source,
      isTypeOnly: isTypeOnly || void 0,
      ...spanFrom(start, this.previous())
    };
  }
  parseImportSpecifierList(out) {
    if (this.checkPunctuator("}")) return;
    out.push(this.parseImportSpecifier());
    while (this.matchPunctuator(",")) {
      if (this.checkPunctuator("}")) break;
      out.push(this.parseImportSpecifier());
    }
  }
  parseImportSpecifier() {
    const importedTok = this.expectIdentifier();
    const imported = { type: "Identifier", name: importedTok.value, ...spanFrom(importedTok, importedTok) };
    let local = imported;
    if (this.checkKeyword("as")) {
      this.advance();
      const localTok = this.expectIdentifier();
      local = { type: "Identifier", name: localTok.value, ...spanFrom(localTok, localTok) };
    }
    return { type: "ImportSpecifier", imported, local, ...spanFrom(imported, local) };
  }
  /** `from "<path>"`: consumes `from` and the module string. */
  parseModuleSource() {
    this.advance();
    const sourceTok = this.current();
    if (sourceTok.type !== "Literal" || sourceTok.kind !== "string") {
      this.error("Expected string literal module path after 'from'");
    }
    this.advance();
    return {
      type: "StringLiteral",
      value: sourceTok.value,
      raw: sourceTok.raw,
      ...spanFrom(sourceTok, sourceTok)
    };
  }
  // `export const ...` / `export let ...` / `export function ...` /
  // `export type ...` / `export default <expr>`
  parseExportStatement() {
    const start = this.current();
    this.advance();
    if (this.checkIdentifierValue("default")) {
      this.advance();
      const declaration = this.checkIdentifierValue("class") && this.peek(1).type === "Identifier" && !this.punctuatorAt(2, ":") && !this.operatorAt(2, "=") && !this.punctuatorAt(2, "(") ? this.parseClassDeclaration() : this.parseExpression(0);
      return { type: "ExportDefaultStatement", declaration, ...spanFrom(start, this.previous()) };
    }
    if (this.checkIdentifierValue("type") && this.peek(1).type === "Identifier") {
      const alias = this.parseTypeAliasStatement();
      return { type: "ExportTypeAliasStatement", alias, ...spanFrom(start, this.previous()) };
    }
    if (this.checkKeyword("const") || this.checkKeyword("let")) {
      const declaration = this.parseVariableDeclaration();
      return { type: "ExportStatement", declaration, ...spanFrom(start, this.previous()) };
    }
    if (this.checkIdentifierValue("class") && this.peek(1).type === "Identifier") {
      const declaration = this.parseClassDeclaration();
      return { type: "ExportStatement", declaration, ...spanFrom(start, this.previous()) };
    }
    if (this.checkKeyword("function")) {
      const declaration = this.parseFunctionStatement(true);
      if (declaration.type !== "FunctionDeclaration") this.error("An exported function needs a plain name: 'export function name()'");
      return { type: "ExportStatement", declaration, ...spanFrom(start, this.previous()) };
    }
    if (this.checkPunctuator("{")) {
      this.advance();
      const specifiers = [];
      while (!this.checkPunctuator("}")) {
        const local = this.parseIdentifier();
        let exported = local;
        if (this.checkKeyword("as")) {
          this.advance();
          exported = this.parseIdentifier();
        }
        specifiers.push({ type: "ExportSpecifier", local, exported, ...spanFrom(local, exported) });
        if (!this.matchPunctuator(",")) break;
      }
      this.expectPunctuator("}");
      const source = this.checkKeyword("from") ? this.parseModuleSource() : void 0;
      return { type: "ExportNamedStatement", specifiers, source, ...spanFrom(start, this.previous()) };
    }
    if (this.checkOperator("*")) {
      this.advance();
      if (!this.checkKeyword("from")) this.error("Expected 'from' after 'export *'");
      const source = this.parseModuleSource();
      return { type: "ExportAllStatement", source, ...spanFrom(start, this.previous()) };
    }
    this.error("Expected 'const', 'let', 'function', 'class', 'type', 'default', '{' or '*' after 'export'");
  }
  // `const x = ...` / `let x, y = ...`.
  // luaut has no `local` — `const` bindings are immutable, `let` mutable.
  /** `kind` reads the leading word as that keyword (recovery's `local`). */
  parseVariableDeclaration(as) {
    const start = this.current();
    const word = this.advance().value;
    const kind = as ?? word;
    if (this.checkKeyword("function")) {
      this.error(`A function is declared as 'function name()'; '${kind}' does not apply to functions`);
    }
    const names = [this.parseBindingTarget(true)];
    while (this.matchPunctuator(",")) {
      names.push(this.parseBindingTarget(true));
    }
    let init = [];
    if (this.matchOperator("=")) {
      init = this.expressionListOr(() => false);
    } else if (kind === "const") {
      if (!this.recover) this.error("'const' declaration requires an initializer");
      this.softError("'const' declaration requires an initializer");
    }
    return { type: "VariableDeclaration", kind, names, init, ...spanFrom(start, this.previous()) };
  }
  parseIfStatement() {
    const start = this.current();
    this.expectKeyword("if");
    return this.parseBracedIf(start);
  }
  parseBracedIf(start) {
    const clauses = [];
    const clause = () => {
      const clauseStart = this.current();
      this.expectPunctuator("(");
      const condition = this.expressionOr(() => this.checkPunctuator(")"));
      this.expectCloser(")");
      const body = this.parseBracedBody("if");
      clauses.push({ type: "IfClause", condition, body, ...spanFrom(clauseStart, this.previous()) });
    };
    clause();
    let alternate;
    while (this.checkKeyword("elseif") || this.checkKeyword("else")) {
      const isElse = this.checkKeyword("else");
      this.advance();
      if (!isElse) {
        clause();
        continue;
      }
      alternate = this.parseBracedBody("else");
      break;
    }
    return { type: "IfStatement", clauses, alternate, ...spanFrom(start, this.previous()) };
  }
  parseWhileStatement() {
    const start = this.current();
    this.expectKeyword("while");
    this.expectPunctuator("(");
    const condition = this.expressionOr(() => this.checkPunctuator(")"));
    this.expectCloser(")");
    const body = this.parseBracedBody("while");
    return { type: "WhileStatement", condition, body, ...spanFrom(start, this.previous()) };
  }
  parseRepeatStatement() {
    const start = this.current();
    this.expectKeyword("repeat");
    const body = this.parseBracedBody("repeat");
    this.expectKeyword("until");
    this.expectPunctuator("(");
    const condition = this.expressionOr(() => this.checkPunctuator(")"));
    this.expectCloser(")");
    return { type: "RepeatStatement", body, condition, ...spanFrom(start, this.previous()) };
  }
  parseDoStatement() {
    const start = this.current();
    this.expectKeyword("do");
    const body = this.parseBracedBody("do");
    return { type: "DoStatement", body, ...spanFrom(start, this.previous()) };
  }
  parseForStatement() {
    const start = this.current();
    this.expectKeyword("for");
    this.expectPunctuator("(");
    const first = this.parseBindingTarget(true);
    const untilDo = () => this.checkPunctuator(")");
    if (first.type === "IdentifierPattern" && this.matchOperator("=")) {
      const from = this.expressionOr(() => untilDo() || this.checkPunctuator(","));
      this.expectPunctuator(",");
      const to = this.expressionOr(() => untilDo() || this.checkPunctuator(","));
      let step;
      if (this.matchPunctuator(",")) {
        step = this.expressionOr(untilDo);
      }
      const body2 = this.parseForBody();
      return {
        type: "NumericForStatement",
        variable: this.identifierPatternToTypedIdentifier(first),
        start: from,
        end: to,
        step,
        body: body2,
        ...spanFrom(start, this.previous())
      };
    }
    const variables = [first];
    while (this.matchPunctuator(",")) {
      variables.push(this.parseBindingTarget(true));
    }
    this.expectKeyword("in");
    const iterators = this.expressionListOr(untilDo);
    const body = this.parseForBody();
    return {
      type: "GenericForStatement",
      variables,
      iterators,
      body,
      ...spanFrom(start, this.previous())
    };
  }
  parseForBody() {
    this.expectCloser(")");
    return this.parseBracedBody("for");
  }
  /** `function name() end` declares `name`; `function a.b() end` and
   *  `function T:m() end` define a member. */
  /** `exported` — the `export` before this `function` has been consumed, so
   *  each overload signature after it must carry one as well. */
  parseFunctionStatement(exported = false) {
    const start = this.current();
    this.expectKeyword("function");
    const target = this.parseFunctionName();
    const isMethod = target.method !== void 0;
    const simpleName = !isMethod && target.path.length === 0 ? target.base.name : void 0;
    const signatures = [];
    let written = target.base;
    while (true) {
      const head = this.parseFunctionHead();
      if (simpleName !== void 0 && this.isOverloadContinuation(simpleName)) {
        signatures.push({ ...this.headToSignature(head), name: written });
        const nextExported = this.matchKeyword("export");
        if (nextExported !== exported) {
          this.problem("Overload signatures must all be exported or non-exported");
        }
        this.expectKeyword("function");
        written = this.parseFunctionName().base;
        continue;
      }
      const func = this.headToBody(head, start);
      if (simpleName !== void 0) {
        return {
          type: "FunctionDeclaration",
          name: target.base,
          func,
          signatures: signatures.length ? signatures : void 0,
          implementationName: signatures.length ? written : void 0,
          ...spanFrom(start, this.previous())
        };
      }
      if (isMethod) {
        func.params.unshift({ type: "FunctionParameter", name: "self", ...spanFrom(target, target) });
        func.isMethod = true;
      }
      return {
        type: "FunctionDeclarationStatement",
        target,
        isMethod,
        func,
        signatures: signatures.length ? signatures : void 0,
        ...spanFrom(start, this.previous())
      };
    }
  }
  /** After a bodyless function head, is the next token the start of another
   *  declaration for the same simple `name` (making the head an overload
   *  signature rather than an implementation)? */
  isOverloadContinuation(name) {
    const named = (offset) => this.peek(offset).type === "Identifier" && this.peek(offset).value === name;
    if (this.checkKeyword("function")) return named(1);
    return this.checkKeyword("export") && this.peek(1).type === "Keyword" && this.peek(1).value === "function" && named(2);
  }
  /** A mistake that does not stop the parse: refused outside recovery, where
   *  the compiler must not accept it, and recorded inside. The message says
   *  what is wrong on its own — no token is appended. */
  problem(message) {
    const t = this.current();
    const error = new ParseError(message, t.line.start, t.column.start);
    if (!this.recover) throw error;
    this.record(error);
  }
  /** `class Name extends Base <members> end`.
   *
   *  The body is a block like every other in luaut, closed by `end` — not a
   *  brace-delimited list. Members are written the way the same thing is
   *  written outside a class: a field like a field (`x: number`), a method
   *  like a function (`function m() ... end`). */
  parseClassDeclaration() {
    const start = this.current();
    this.advance();
    const name = this.parseIdentifier();
    const typeParams = this.checkOperator("<") ? this.parseGenericTypeParameterList() : [];
    const { superclass, superArguments } = this.parseExtends();
    const members = this.parseClassBody(start);
    return {
      type: "ClassDeclaration",
      name,
      typeParams,
      superclass,
      superArguments,
      members,
      ...spanFrom(start, this.previous())
    };
  }
  /** `class ... end` as a value. It may be named — the name is for the class
   *  itself, not for the scope around it — and takes no type parameters,
   *  since nothing could write the arguments. */
  parseClassExpression() {
    const start = this.current();
    this.advance();
    const name = this.checkType("Identifier") && !this.checkIdentifierValue("extends") && !this.punctuatorAt(1, ":") && !this.operatorAt(1, "=") && !this.punctuatorAt(1, "(") ? this.parseIdentifier() : void 0;
    if (this.checkOperator("<")) {
      this.error("A class written as a value takes no type parameters: nothing could write the arguments");
    }
    const { superclass, superArguments } = this.parseExtends();
    const members = this.parseClassBody(start);
    return { type: "ClassExpression", name, superclass, superArguments, members, ...spanFrom(start, this.previous()) };
  }
  /** `extends Base` / `extends Box<number>`. */
  parseExtends() {
    if (!this.checkIdentifierValue("extends")) return {};
    this.advance();
    const superclass = this.parseIdentifier();
    let superArguments;
    if (this.checkOperator("<")) {
      const written = this.tryTypeArguments();
      if (written) superArguments = written;
    }
    return { superclass, superArguments };
  }
  parseClassBody(start) {
    void start;
    if (!this.checkPunctuator("{")) this.error("Expected '{' to open the class body");
    this.advance();
    const members = [];
    this.classDepth++;
    try {
      while (!this.checkPunctuator("}") && !this.isAtEnd()) {
        if (this.matchPunctuator(",") || this.matchPunctuator(";")) continue;
        const member = this.parseClassMember();
        if (member) members.push(member);
      }
    } finally {
      this.classDepth--;
    }
    this.expectCloser("}");
    return members;
  }
  /** `<A, B>` in a type position that is not a call: the arguments a class
   *  extends its base with. */
  tryTypeArguments() {
    const saved = this.cursor;
    try {
      this.expectOperator("<");
      const args = [this.parseType()];
      while (this.matchPunctuator(",")) args.push(this.parseType());
      this.expectOperator(">");
      return args;
    } catch (error) {
      if (error instanceof ParseError || error instanceof ParseRecover) {
        this.cursor = saved;
        return void 0;
      }
      throw error;
    }
  }
  parseClassMember() {
    const start = this.current();
    const isStatic = this.checkIdentifierValue("static") && !this.punctuatorAt(1, ":") && !this.operatorAt(1, "=");
    if (isStatic) this.advance();
    if (this.checkKeyword("function")) {
      this.advance();
      const memberName = this.parseIdentifier();
      const signatures = [];
      let written = memberName;
      while (true) {
        const head = this.parseFunctionHead();
        if (this.isClassOverloadContinuation(memberName.name, isStatic)) {
          if (!isStatic) bindThisParam(head.params, start);
          signatures.push({ ...this.headToSignature(head), name: written });
          if (isStatic) this.advance();
          this.expectKeyword("function");
          written = this.parseIdentifier();
          continue;
        }
        const func = this.headToBody(head, start);
        if (!isStatic) bindThis(func, start);
        return {
          type: "ClassMethod",
          name: memberName,
          isStatic,
          func,
          signatures: signatures.length ? signatures : void 0,
          ...spanFrom(start, this.previous())
        };
      }
    }
    if (!isStatic && this.checkIdentifierValue("constructor") && this.punctuatorAt(1, "(")) {
      this.advance();
      const head = this.parseFunctionHead();
      if (head.returnType) this.problem("A constructor has no return type; it always builds the instance");
      const func = this.headToBody(head, start);
      bindThis(func, start);
      return { type: "ClassConstructor", func, ...spanFrom(start, this.previous()) };
    }
    if ((this.checkIdentifierValue("get") || this.checkIdentifierValue("set")) && this.peek(1).type === "Identifier" && this.punctuatorAt(2, "(")) {
      const kind = this.advance().value;
      const memberName = this.parseIdentifier();
      const head = this.parseFunctionHead();
      const func = this.headToBody(head, start);
      if (!isStatic) bindThis(func, start);
      const written = func.params.length - (isStatic ? 0 : 1);
      if (kind === "get" && written > 0) {
        this.problem("A getter takes no parameters");
      }
      if (kind === "set" && written !== 1) {
        this.problem("A setter takes exactly one parameter: the value being assigned");
      }
      return { type: "ClassAccessor", kind, name: memberName, isStatic, func, ...spanFrom(start, this.previous()) };
    }
    if (this.checkType("Identifier")) {
      const memberName = this.parseIdentifier();
      let typeAnnotation;
      if (this.matchPunctuator(":")) {
        typeAnnotation = this.typeOr(() => this.checkOperator("="));
      }
      let init;
      if (this.matchOperator("=")) init = this.expressionOr(() => false);
      if (!typeAnnotation && !init) {
        this.error("A class field needs a type ('name: T') or a value ('name = v')");
      }
      return { type: "ClassField", name: memberName, isStatic, typeAnnotation, init, ...spanFrom(start, this.previous()) };
    }
    if (this.recover) {
      this.softError("Expected a class member: a field, 'function', 'constructor', 'get' or 'set'");
      this.advance();
      return void 0;
    }
    this.error("Expected a class member: a field, 'function', 'constructor', 'get' or 'set'");
  }
  /** Give a class method its `this`: a real first parameter, the way
   *  `function T:m()` gets a real `self`. Every later pass — scopes, types,
   *  arity, lowering — then sees an ordinary parameter and needs to know
   *  nothing about classes. */
  /** After a bodyless head inside a class body, does another declaration of
   *  the same member follow? Then the head was an overload signature. */
  isClassOverloadContinuation(name, isStatic) {
    const offset = isStatic ? 1 : 0;
    if (isStatic && !this.checkIdentifierValue("static")) return false;
    const keyword = this.peek(offset);
    if (!(keyword.type === "Keyword" && keyword.value === "function")) return false;
    const named = this.peek(offset + 1);
    return named.type === "Identifier" && named.value === name;
  }
  operatorAt(ahead, value) {
    const token = this.peek(ahead);
    return token.type === "Operator" && token.value === value;
  }
  parseFunctionName() {
    const start = this.current();
    const base = this.parseIdentifier();
    const path = [];
    while (this.checkPunctuator(".")) {
      this.advance();
      path.push(this.parseIdentifier());
    }
    let method;
    if (this.matchPunctuator(":")) {
      method = this.parseIdentifier();
    }
    return { type: "FunctionName", base, path, method, ...spanFrom(start, this.previous()) };
  }
  isExpressionStart() {
    const t = this.current();
    if (t.type === "Literal" || t.type === "InterpolatedString" || t.type === "Identifier") return true;
    if (t.type === "Keyword") {
      return ["function", "if", "not", "nil", "true", "false"].includes(t.value);
    }
    if (t.type === "Operator") {
      return ["...", "-", "#"].includes(t.value);
    }
    if (t.type === "Punctuator") {
      const v = t.value;
      return v === "(" || v === "{" || v === "[";
    }
    return false;
  }
  parseReturnStatement() {
    const start = this.current();
    this.expectKeyword("return");
    let args = [];
    if (this.isExpressionStart()) {
      args = this.expressionListOr(() => false);
    }
    return { type: "ReturnStatement", arguments: args, ...spanFrom(start, this.previous()) };
  }
  parseTypeAliasStatement() {
    const start = this.current();
    this.advance();
    const name = this.parseTypeName();
    let generics = [];
    if (this.checkOperator("<")) {
      generics = this.parseGenericTypeParameterList();
    }
    this.expectOperator("=");
    const definition = this.parseType();
    return { type: "TypeAliasStatement", name, generics, definition, ...spanFrom(start, this.previous()) };
  }
  parseExportTypeAliasStatement() {
    const start = this.current();
    this.advance();
    const alias = this.parseTypeAliasStatement();
    return { type: "ExportTypeAliasStatement", alias, ...spanFrom(start, this.previous()) };
  }
  parseExpressionStatement() {
    const start = this.current();
    if (this.checkPunctuator("{") || this.checkPunctuator("[")) {
      const targets = [
        this.checkPunctuator("{") ? this.parseObjectPattern() : this.parseArrayPattern()
      ];
      while (this.matchPunctuator(",")) {
        targets.push(this.parseAssignTarget());
      }
      this.expectOperator("=");
      const values = this.expressionListOr(() => false);
      return { type: "AssignmentStatement", targets, values, ...spanFrom(start, this.previous()) };
    }
    const first = this.parsePrefixExpression();
    if (this.checkOperator("=") || this.checkPunctuator(",")) {
      const targets = [first];
      while (this.matchPunctuator(",")) {
        targets.push(this.parseAssignTarget());
      }
      for (const target of targets) this.rejectOptionalTarget(target);
      this.expectOperator("=");
      const values = this.expressionListOr(() => false);
      return { type: "AssignmentStatement", targets, values, ...spanFrom(start, this.previous()) };
    }
    const t = this.current();
    if (t.type === "Operator" && COMPOUND_ASSIGN_OPS.has(t.value)) {
      this.rejectOptionalTarget(first);
      const op = this.advance().value;
      const value = this.expressionOr(() => false);
      return {
        type: "CompoundAssignmentStatement",
        operator: op,
        target: first,
        value,
        ...spanFrom(start, this.previous())
      };
    }
    if (first.type === "CallExpression" || first.type === "MethodCallExpression" || first.type === "NewExpression") {
      return { type: "CallStatement", expression: first, ...spanFrom(start, this.previous()) };
    }
    this.error("Unexpected expression statement (expected assignment or call)");
  }
  // ============================================================
  // Expressions
  // ============================================================
  parseExpressionList() {
    const list = [this.parseExpression()];
    while (this.matchPunctuator(",")) {
      list.push(this.parseExpression());
    }
    return list;
  }
  isBinaryOperator() {
    const t = this.current();
    if (t.type === "Keyword" && (t.value === "and" || t.value === "or")) {
      return t.value;
    }
    if (t.type === "Operator" && t.value in BINARY_PRECEDENCE) {
      return t.value;
    }
    return null;
  }
  /** Is the `:` at the cursor the start of a method call (`obj:name(...)`)
   *  rather than the `:` of a ternary (`cond ? obj : other`)? Lua requires a
   *  method call to be called, so the answer is exact rather than heuristic:
   *  `:` Identifier followed by one of Lua's call forms. */
  startsMethodCall(offset = 0) {
    if (this.peek(offset + 1).type !== "Identifier") return false;
    const after = this.peek(offset + 2);
    if (after.type === "Punctuator") {
      const v = String(after.value);
      return v === "(" || v === "{";
    }
    if (after.type === "InterpolatedString") return true;
    if (after.type === "Literal" && after.kind === "string") return true;
    if (after.type === "Operator" && String(after.value) === "<") {
      const save = this.cursor;
      this.cursor += offset + 2;
      const found = this.tryCallTypeArguments() !== void 0;
      this.cursor = save;
      return found;
    }
    return false;
  }
  /** Does the next token start right where the current one ends? */
  touchesNext() {
    const current = this.current();
    const next = this.peek(1);
    return current.line.end === next.line.start && current.column.end === next.column.start;
  }
  /** `a?.b = 1` cannot be written: there may be nothing to assign to. */
  rejectOptionalTarget(target) {
    for (let e = target; e && typeof e === "object"; ) {
      const node = e;
      if (node.optional) {
        const at = target;
        const err = new ParseError("An optional chain cannot be assigned to", at.line.start, at.column.start);
        if (!this.recover) throw err;
        this.record(err);
        return;
      }
      e = node.type === "MemberExpression" || node.type === "IndexExpression" || node.type === "MethodCallExpression" ? node.object : node.type === "CallExpression" ? node.callee : void 0;
    }
  }
  isUnaryOperator() {
    const t = this.current();
    if (t.type === "Keyword" && t.value === "not") return "not";
    if (t.type === "Operator" && (t.value === "-" || t.value === "#")) return t.value;
    return null;
  }
  parseExpression(minPrec = 0) {
    const expr = this.parseBinaryExpression(minPrec);
    if (minPrec > 0 || !this.checkPunctuator("?")) return expr;
    this.advance();
    const consequent = this.parseExpression();
    this.expectPunctuator(":");
    const alternate = this.parseExpression();
    return {
      type: "IfElseExpression",
      clauses: [{ condition: expr, body: consequent }],
      alternate,
      ...spanFrom(expr, alternate)
    };
  }
  parseBinaryExpression(minPrec) {
    let left = this.parseUnaryOrAtom();
    while (true) {
      const op = this.isBinaryOperator();
      if (!op) break;
      const prec = BINARY_PRECEDENCE[op];
      if (prec < minPrec) break;
      this.advance();
      const rightAssoc = RIGHT_ASSOCIATIVE.has(op);
      const nextMinPrec = rightAssoc ? prec : prec + 1;
      const right = this.parseBinaryExpression(nextMinPrec);
      left = {
        type: "BinaryExpression",
        operator: op,
        left,
        right,
        ...spanFrom(left, right)
      };
    }
    return left;
  }
  parseUnaryOrAtom() {
    const op = this.isUnaryOperator();
    if (op) {
      const opTok = this.advance();
      const argument = this.parseExpression(UNARY_PRECEDENCE);
      return {
        type: "UnaryExpression",
        operator: op,
        argument,
        ...spanFrom(opTok, argument)
      };
    }
    return this.parseAtomWithAssertion();
  }
  parseAtomWithAssertion() {
    let expr = this.parseAtom();
    while (this.checkKeyword("as") || this.checkIdentifierValue("satisfies")) {
      if (this.checkIdentifierValue("satisfies")) {
        this.advance();
        const typeAnnotation2 = this.parseType();
        expr = {
          type: "SatisfiesExpression",
          expression: expr,
          typeAnnotation: typeAnnotation2,
          ...spanFrom(expr, typeAnnotation2)
        };
        continue;
      }
      this.advance();
      if (this.checkKeyword("const")) {
        const constTok = this.advance();
        expr = {
          type: "AsConstExpression",
          expression: expr,
          ...spanFrom(expr, constTok)
        };
        continue;
      }
      const typeAnnotation = this.parseType();
      expr = {
        type: "TypeAssertionExpression",
        expression: expr,
        typeAnnotation,
        ...spanFrom(expr, typeAnnotation)
      };
    }
    return expr;
  }
  parseAtom() {
    const t = this.current();
    if (t.type === "Literal") {
      this.advance();
      const lit = t;
      switch (lit.kind) {
        case "nil":
          return { type: "NilLiteral", ...spanFrom(t, t) };
        case "boolean":
          return { type: "BooleanLiteral", value: lit.value, ...spanFrom(t, t) };
        case "number":
          return { type: "NumberLiteral", value: lit.value, raw: lit.raw, ...spanFrom(t, t) };
        case "string":
          return { type: "StringLiteral", value: lit.value, raw: lit.raw, ...spanFrom(t, t) };
      }
    }
    if (t.type === "InterpolatedString") {
      this.advance();
      return this.buildInterpolatedString(t);
    }
    if (t.type === "Operator" && t.value === "...") {
      this.advance();
      return { type: "VarargExpression", ...spanFrom(t, t) };
    }
    if (t.type === "Keyword" && t.value === "function") {
      this.advance();
      const func = this.parseFunctionBody(t);
      return { type: "FunctionExpression", func, ...spanFrom(t, this.previous()) };
    }
    if (t.type === "Keyword" && t.value === "if") {
      return this.parseIfElseExpression();
    }
    if (t.type === "Identifier" && t.value === "class") {
      return this.parseClassExpression();
    }
    if (t.type === "Punctuator" && t.value === "{") {
      return this.parseTableExpression();
    }
    if (t.type === "Punctuator" && t.value === "[") {
      return this.parseArrayExpression();
    }
    if (this.checkType("Identifier") && this.punctuatorAt(1, "=>")) return this.parseArrow();
    if (this.checkPunctuator("(") || this.checkOperator("<")) {
      const arrow = this.tryParse(() => this.parseArrow());
      if (arrow) return arrow;
    }
    if (t.type === "Identifier" || t.type === "Punctuator" && t.value === "(") {
      return this.parsePrefixExpression();
    }
    this.error("Unexpected token in expression");
  }
  buildInterpolatedString(token) {
    const parts = [];
    for (const p of token.parts) {
      if (p.kind === "string") {
        parts.push({ kind: "string", value: p.value, raw: p.raw });
      } else {
        let expression;
        try {
          expression = shiftSpans(parseExpressionFromSource(p.raw, this.classDepth > 0), p.line, p.column);
        } catch (e) {
          if (!this.recover || !(e instanceof ParseError || e instanceof LexError)) throw e;
          const at = token;
          this.record(new ParseError(
            `In '\${${p.raw}}': ${e.message.replace(/ \(\d+:\d+\)$/, "")}`,
            at.line.start,
            at.column.start
          ));
          expression = { type: "ErrorExpression", ...spanFrom(at, at) };
        }
        parts.push({ kind: "expression", expression });
      }
    }
    return { type: "InterpolatedStringExpression", parts, ...spanFrom(token, token) };
  }
  parseIfElseExpression() {
    const start = this.current();
    this.expectKeyword("if");
    const clauses = [];
    const cond = this.parseExpression();
    this.expectKeyword("then");
    const body = this.parseExpression();
    clauses.push({ condition: cond, body });
    while (this.checkKeyword("elseif")) {
      this.advance();
      const c = this.parseExpression();
      this.expectKeyword("then");
      const b = this.parseExpression();
      clauses.push({ condition: c, body: b });
    }
    this.expectKeyword("else");
    const alternate = this.parseExpression();
    return { type: "IfElseExpression", clauses, alternate, ...spanFrom(start, this.previous()) };
  }
  parsePrefixExpression() {
    const start = this.current();
    let base;
    if (this.startsNew()) {
      base = this.parseNewExpression();
    } else if (this.classDepth > 0 && this.checkIdentifierValue("super") && this.startsSuperUse()) {
      this.advance();
      base = { type: "SuperExpression", ...spanFrom(start, start) };
    } else if (this.checkType("Identifier")) {
      base = this.parseIdentifier();
    } else if (this.matchPunctuator("(")) {
      const inner = this.parseExpression();
      this.expectPunctuator(")");
      base = { type: "ParenthesizedExpression", expression: inner, ...spanFrom(start, this.previous()) };
    } else {
      this.error("Expected identifier or '('");
    }
    while (true) {
      if (this.checkPunctuator("?") && this.touchesNext()) {
        const next = this.peek(1);
        const punct = next.type === "Punctuator" ? String(next.value) : void 0;
        if (punct === "." && this.peek(2).type === "Identifier") {
          this.advance();
          this.advance();
          const prop = this.parseIdentifier();
          base = { type: "MemberExpression", object: base, property: prop, optional: true, ...spanFrom(base, prop) };
          continue;
        }
        if (punct === "." && this.punctuatorAt(2, "(")) {
          this.advance();
          this.advance();
          const args = this.parseCallArguments();
          base = {
            type: "CallExpression",
            callee: base,
            arguments: args,
            optional: true,
            ...spanFrom(base, this.previous())
          };
          continue;
        }
        if (punct === ":" && this.startsMethodCall(1)) {
          this.advance();
          this.advance();
          const method = this.parseIdentifier();
          const typeArguments = this.tryCallTypeArguments();
          const args = this.parseCallArguments();
          base = {
            type: "MethodCallExpression",
            object: base,
            method,
            arguments: args,
            typeArguments,
            optional: true,
            ...spanFrom(base, this.previous())
          };
          continue;
        }
      }
      if (this.matchPunctuator(".")) {
        if (this.recover && !this.checkType("Identifier")) {
          this.softError("Expected identifier");
          base = { type: "ErrorExpression", ...spanFrom(base, this.previous()) };
          break;
        }
        const prop = this.parseIdentifier();
        base = { type: "MemberExpression", object: base, property: prop, ...spanFrom(base, prop) };
        continue;
      }
      if (this.matchPunctuator("[")) {
        const index = this.parseExpression();
        this.expectPunctuator("]");
        base = { type: "IndexExpression", object: base, index, ...spanFrom(base, this.previous()) };
        continue;
      }
      if (this.checkPunctuator(":") && this.startsMethodCall()) {
        this.advance();
        const method = this.parseIdentifier();
        const typeArguments = this.tryCallTypeArguments();
        const args = this.parseCallArguments();
        base = {
          type: "MethodCallExpression",
          object: base,
          method,
          arguments: args,
          typeArguments,
          ...spanFrom(base, this.previous())
        };
        continue;
      }
      if (this.checkOperator("<")) {
        const typeArguments = this.tryCallTypeArguments();
        if (typeArguments) {
          const args = this.parseCallArguments();
          base = {
            type: "CallExpression",
            callee: base,
            arguments: args,
            typeArguments,
            ...spanFrom(base, this.previous())
          };
          continue;
        }
      }
      if (this.startsCallArguments()) {
        const onNewLine = this.current().line.start > base.line.end;
        const args = this.parseCallArguments();
        base = {
          type: "CallExpression",
          callee: base,
          arguments: args,
          argumentsOnNewLine: onNewLine || void 0,
          ...spanFrom(base, this.previous())
        };
        continue;
      }
      break;
    }
    return base;
  }
  /** `new` is a soft keyword: it starts a construction only when a name
   *  follows it, so a function or field called `new` — `Instance.new(x)`,
   *  and `Vec.new(1)` itself — is untouched. */
  startsNew() {
    return this.checkIdentifierValue("new") && this.peek(1).type === "Identifier";
  }
  /** `super` on its own means the base class, and only `super(...)` and
   *  `super.member` say anything; anything else is a name that happens to
   *  be spelled that way. */
  startsSuperUse() {
    return this.punctuatorAt(1, "(") || this.punctuatorAt(1, ".") && this.peek(2).type === "Identifier";
  }
  /** `new Name(args)` / `new Module.Name(args)`. The callee is a name, or a
   *  name reached through a module — never an arbitrary expression, so the
   *  arguments are unambiguously the constructor's. */
  parseNewExpression() {
    const start = this.current();
    this.advance();
    let callee = this.parseIdentifier();
    while (this.checkPunctuator(".") && this.peek(1).type === "Identifier") {
      this.advance();
      const property = this.parseIdentifier();
      callee = { type: "MemberExpression", object: callee, property, ...spanFrom(start, property) };
    }
    const typeArguments = this.tryCallTypeArguments();
    if (!this.checkPunctuator("(")) {
      this.error("Expected '(' after the class being constructed: 'new Name(...)'");
    }
    const args = this.parseCallArguments();
    return { type: "NewExpression", callee, arguments: args, typeArguments, ...spanFrom(start, this.previous()) };
  }
  /** After `...`, is there something to spread? Nothing following it means
   *  the vararg pack, which is what `f(...)` has always passed on. */
  startsSpread() {
    const next = this.peek(1);
    if (next.type === "Punctuator") {
      const value = next.value;
      return value === "(" || value === "{" || value === "[";
    }
    return next.type === "Identifier" || next.type === "Literal" || next.type === "InterpolatedString";
  }
  parseSpreadArgument(stop) {
    const dots = this.advance();
    const argument = this.expressionOr(stop);
    return { type: "SpreadElement", argument, ...spanFrom(dots, argument) };
  }
  /** Is the token `ahead` places on the punctuator `value`? */
  punctuatorAt(ahead, value) {
    const token = this.peek(ahead);
    return token.type === "Punctuator" && token.value === value;
  }
  /** An assignment target after the first: a prefix expression (`a.b`,
   *  `a[i]`, `a`) or a nested destructuring pattern. */
  parseAssignTarget() {
    if (this.checkPunctuator("{")) return this.parseObjectPattern();
    if (this.checkPunctuator("[")) return this.parseArrayPattern();
    return this.parsePrefixExpression();
  }
  /** Does a call's argument list start here? Lua's three forms: `(`, a
   *  string, or a table. */
  startsCallArguments() {
    return this.checkPunctuator("(") || this.checkPunctuator("{") || this.checkType("InterpolatedString") || this.checkType("Literal") && this.current().kind === "string";
  }
  /** `f<A, B>(x)` — type arguments, when that is what this is. `a < b > (c)`
   *  is three operators, and only what follows the `>` tells them apart, so
   *  this reads ahead and puts the cursor back when the guess was wrong. */
  tryCallTypeArguments() {
    if (!this.checkOperator("<")) return void 0;
    const start = this.cursor;
    const errors = this.errors.length;
    try {
      this.advance();
      const list = [this.parseTypeArgument()];
      while (this.matchPunctuator(",") && !this.checkOperator(">")) list.push(this.parseTypeArgument());
      this.expectOperator(">");
      if (!this.startsCallArguments()) throw new ParseRecover("not a call");
      return list;
    } catch (e) {
      if (!(e instanceof ParseError || e instanceof ParseRecover)) throw e;
      this.cursor = start;
      this.errors.length = errors;
      return void 0;
    }
  }
  parseCallArguments() {
    if (this.matchPunctuator("(")) {
      const list = [];
      const stop = () => this.checkPunctuator(",");
      if (!this.checkPunctuator(")")) {
        while (true) {
          if (this.recover && this.onNewLine() && this.startsTableField() && !this.startsMethodCall(1)) break;
          const before = this.cursor;
          const argument = this.checkOperator("...") && this.startsSpread() ? this.parseSpreadArgument(stop) : this.expressionOr(stop);
          if (argument.type !== "ErrorExpression" || this.cursor > before || list.length) list.push(argument);
          if (this.matchPunctuator(",") && !this.checkPunctuator(")")) continue;
          if (!this.recover || this.checkPunctuator(")")) break;
          if (this.onNewLine() && (this.checkType("Identifier") || this.checkType("Keyword"))) break;
          this.softError("Expected ',' or ')'");
          this.skip(stop, this.cursor, "expression");
          if (this.matchPunctuator(",")) continue;
          break;
        }
      }
      this.expectCloser(")");
      return list;
    }
    const t = this.current();
    if (t.type === "Literal" && t.kind === "string") {
      this.advance();
      return [{ type: "StringLiteral", value: t.value, raw: t.raw, ...spanFrom(t, t) }];
    }
    if (t.type === "InterpolatedString") {
      this.advance();
      return [this.buildInterpolatedString(t)];
    }
    if (t.type === "Punctuator" && t.value === "{") {
      return [this.parseTableExpression()];
    }
    this.error("Expected function call arguments");
  }
  parseIdentifier() {
    const t = this.expectIdentifier();
    return { type: "Identifier", name: t.value, ...spanFrom(t, t) };
  }
  // `{}` is an OBJECT literal only in luaut: `{ a = 1, [k] = v, shorthand }`.
  // Positional entries (`{ 1, 2, 3 }`) are gone — use an array literal `[...]`.
  parseTableExpression() {
    const start = this.current();
    this.expectPunctuator("{");
    const fields = [];
    const stop = () => this.checkPunctuator(",") || this.checkPunctuator(";") || this.onNewLine() && this.startsTableField();
    while (!this.checkPunctuator("}")) {
      const field = this.attempt(() => this.parseTableField(stop), stop, () => void 0);
      if (field) fields.push(field);
      if (this.matchPunctuator(",") || this.matchPunctuator(";")) continue;
      if (!this.recover || this.checkPunctuator("}")) break;
      if (this.onNewLine() && this.startsTableField()) {
        this.softError("Expected ','");
        continue;
      }
      if (this.isAtEnd() || this.onNewLine() && this.checkType("Keyword")) break;
      this.softError("Expected ',' or '}'");
      const before = this.cursor;
      this.skip(stop, this.cursor, "expression");
      if (this.matchPunctuator(",") || this.matchPunctuator(";")) continue;
      if (this.cursor > before && this.onNewLine() && this.startsTableField()) continue;
      break;
    }
    this.expectCloser("}");
    return { type: "TableExpression", fields, ...spanFrom(start, this.previous()) };
  }
  /** Does a `key: value` field, or a spread, start here? */
  startsTableField() {
    const next = this.peek(1);
    const colon = next.type === "Punctuator" && next.value === ":";
    if (this.checkType("Identifier")) return colon;
    if (this.checkType("Literal") && this.current().kind === "string") return colon;
    return this.checkOperator("...");
  }
  parseTableField(stop) {
    if (this.checkOperator("...")) {
      this.advance();
      return { type: "TableFieldSpread", argument: this.expressionOr(stop) };
    }
    if (this.matchPunctuator("[")) {
      const key = this.expressionOr(() => this.checkPunctuator("]"));
      this.expectPunctuator("]");
      this.expectPunctuator(":");
      return { type: "TableFieldComputed", key, value: this.expressionOr(stop) };
    }
    if (this.checkType("Literal") && this.current().kind === "string") {
      const t = this.advance();
      const key = { type: "StringLiteral", value: t.value, raw: t.raw, ...spanFrom(t, t) };
      this.expectPunctuator(":");
      return { type: "TableFieldNamed", key, value: this.expressionOr(stop) };
    }
    if (this.checkType("Identifier") && this.peek(1).type === "Punctuator" && this.peek(1).value === ":") {
      const key = this.parseIdentifier();
      this.expectPunctuator(":");
      return { type: "TableFieldNamed", key, value: this.expressionOr(stop) };
    }
    if (this.checkType("Identifier")) {
      return { type: "TableFieldShorthand", name: this.parseIdentifier() };
    }
    this.error("Expected object field ('key: value', '[expr]: value', shorthand, or '...spread'); use '[...]' for arrays");
  }
  // `[1, 2, 3]` — array literal (trailing comma allowed).
  parseArrayExpression() {
    const start = this.current();
    this.expectPunctuator("[");
    const elements = [];
    const stop = () => this.checkPunctuator(",");
    while (!this.checkPunctuator("]")) {
      if (this.checkOperator("...")) {
        const dots = this.advance();
        if (this.checkPunctuator("]") || this.checkPunctuator(",")) {
          elements.push({ type: "VarargExpression", ...spanFrom(dots, dots) });
        } else {
          const argument = this.expressionOr(stop);
          elements.push({ type: "SpreadElement", argument, ...spanFrom(dots, argument) });
        }
      } else {
        elements.push(this.expressionOr(stop));
      }
      if (this.matchPunctuator(",")) continue;
      if (!this.recover || this.checkPunctuator("]")) break;
      if (this.onNewLine() && this.isExpressionStart() && !this.checkType("Keyword")) {
        this.softError("Expected ','");
        continue;
      }
      if (this.isAtEnd() || this.onNewLine() && this.checkType("Keyword")) break;
      this.softError("Expected ',' or ']'");
      this.skip(stop, this.cursor, "expression");
      if (this.matchPunctuator(",")) continue;
      break;
    }
    this.expectCloser("]");
    return { type: "ArrayExpression", elements, ...spanFrom(start, this.previous()) };
  }
  // ============================================================
  // Destructuring patterns (JS-style)
  // ============================================================
  /** Parses a binding target. When `topLevel`, also consumes a trailing
   *  `<attr>` list (identifier only) and a `: Type` annotation — these are
   *  only valid at the outermost level of a `local` / parameter binding,
   *  never nested inside another pattern. */
  parseBindingTarget(topLevel) {
    let target;
    if (this.checkPunctuator("{")) {
      target = this.parseObjectPattern();
    } else if (this.checkPunctuator("[")) {
      target = this.parseArrayPattern();
    } else {
      const nameTok = this.expectIdentifier();
      let attributes;
      if (topLevel && this.checkOperator("<")) {
        this.advance();
        attributes = [this.expectIdentifier().value];
        while (this.matchPunctuator(",")) attributes.push(this.expectIdentifier().value);
        this.expectOperator(">");
      }
      target = {
        type: "IdentifierPattern",
        name: nameTok.value,
        attributes,
        ...spanFrom(nameTok, this.previous())
      };
    }
    if (topLevel && this.matchPunctuator(":")) {
      target.typeAnnotation = this.typeOr(() => this.checkOperator("=") || this.checkPunctuator(","));
    }
    return target;
  }
  parseObjectPattern() {
    const start = this.current();
    this.expectPunctuator("{");
    const properties = [];
    let rest;
    while (!this.checkPunctuator("}")) {
      if (this.checkOperator("...")) {
        this.advance();
        rest = this.parseBindingTarget(false);
        break;
      }
      const propStart = this.current();
      let key;
      let computed = false;
      let value;
      let shorthand = false;
      if (this.matchPunctuator("[")) {
        computed = true;
        key = this.parseExpression();
        this.expectPunctuator("]");
        this.expectPunctuator(":");
        value = this.parseBindingTarget(false);
      } else if (this.checkType("Literal") && this.current().kind === "string") {
        const t = this.advance();
        key = { type: "StringLiteral", value: t.value, raw: t.raw, ...spanFrom(t, t) };
        this.expectPunctuator(":");
        value = this.parseBindingTarget(false);
      } else {
        const nameTok = this.expectIdentifier();
        key = { type: "Identifier", name: nameTok.value, ...spanFrom(nameTok, nameTok) };
        if (this.matchPunctuator(":")) {
          value = this.parseBindingTarget(false);
        } else {
          shorthand = true;
          value = { type: "IdentifierPattern", name: nameTok.value, ...spanFrom(nameTok, nameTok) };
        }
      }
      let def;
      if (this.matchOperator("=")) def = this.parseExpression();
      properties.push({
        type: "ObjectPatternProperty",
        key,
        computed,
        value,
        default: def,
        shorthand,
        ...spanFrom(propStart, this.previous())
      });
      if (this.matchPunctuator(",")) continue;
      break;
    }
    this.expectPunctuator("}");
    return { type: "ObjectPattern", properties, rest, ...spanFrom(start, this.previous()) };
  }
  parseArrayPattern() {
    const start = this.current();
    this.expectPunctuator("[");
    const elements = [];
    let rest;
    while (!this.checkPunctuator("]")) {
      if (this.checkOperator("...")) {
        this.advance();
        rest = this.parseBindingTarget(false);
        break;
      }
      if (this.checkPunctuator(",")) {
        elements.push(null);
        this.advance();
        continue;
      }
      const elStart = this.current();
      const value = this.parseBindingTarget(false);
      let def;
      if (this.matchOperator("=")) def = this.parseExpression();
      elements.push({ type: "ArrayPatternElement", value, default: def, ...spanFrom(elStart, this.previous()) });
      if (this.matchPunctuator(",")) continue;
      break;
    }
    this.expectPunctuator("]");
    return { type: "ArrayPattern", elements, rest, ...spanFrom(start, this.previous()) };
  }
  identifierPatternToTypedIdentifier(p) {
    return {
      type: "TypedIdentifier",
      name: p.name,
      typeAnnotation: p.typeAnnotation,
      attributes: p.attributes,
      line: p.line,
      column: p.column
    };
  }
  parseTypeOrTypePackReference() {
    if (this.checkType("Identifier") && this.peek(1).type === "Operator" && this.peek(1).value === "...") {
      const start = this.current();
      const base = this.expectIdentifier().value;
      this.advance();
      const packRef = { type: "TypeReference", base, typeArguments: [], ...spanFrom(start, start) };
      return {
        type: "TypePackNode",
        types: [],
        hasVarargs: true,
        // Wrap in `VariadicTypeNode`, matching the convention used by
        // `parseFunctionTypeAfterParen`'s identifier-pack-reference
        // branch, so the printer can tell `A...` (name-first, this
        // case) apart from `...T` (dots-first) and append rather
        // than prepend the `...`.
        varargType: { type: "VariadicTypeNode", typeAnnotation: packRef, ...spanFrom(start, this.previous()) },
        ...spanFrom(start, this.previous())
      };
    }
    return this.parseType();
  }
  parseTypeArgument() {
    if (this.checkOperator("...")) {
      return this.parseTypePack();
    }
    if (this.checkType("Identifier") && this.peek(1).type === "Operator" && this.peek(1).value === "...") {
      return this.parseTypeOrTypePackReference();
    }
    return this.parseType();
  }
  /** The part shared by a real function body and an overload signature:
   *  `<generics>(params): ReturnType`, up to (but not including) the block. */
  parseFunctionHead() {
    const start = this.current();
    let generics = [];
    if (this.checkOperator("<")) {
      generics = this.parseGenericTypeParameterList();
    }
    this.expectPunctuator("(");
    const params = [];
    let hasVarargs = false;
    let varargTypeAnnotation;
    if (!this.checkPunctuator(")")) {
      while (true) {
        if (this.checkOperator("...")) {
          const dots = this.advance();
          hasVarargs = true;
          if (this.checkType("Identifier")) {
            const nameTok = this.expectIdentifier();
            let typeAnnotation2;
            if (this.matchPunctuator(":")) {
              typeAnnotation2 = this.typeOr(() => this.checkPunctuator(")"));
            }
            params.push({
              type: "FunctionParameter",
              name: nameTok.value,
              typeAnnotation: typeAnnotation2,
              rest: true,
              ...spanFrom(dots, this.previous())
            });
            if (this.checkPunctuator(",")) {
              this.problem("A rest parameter is the last one: nothing can follow '...'");
            }
            break;
          }
          if (this.matchPunctuator(":")) {
            varargTypeAnnotation = this.parseTypeOrTypePackReference();
          }
          break;
        }
        const paramStart = this.current();
        let name = "";
        let pattern;
        if (this.checkPunctuator("{")) {
          pattern = this.parseObjectPattern();
        } else if (this.checkPunctuator("[")) {
          pattern = this.parseArrayPattern();
        } else {
          name = this.expectIdentifier().value;
        }
        const optional2 = this.matchPunctuator("?");
        let typeAnnotation;
        const paramEnd = () => this.checkPunctuator(",");
        if (this.matchPunctuator(":")) {
          typeAnnotation = this.typeOr(() => paramEnd() || this.checkOperator("="));
        }
        let def;
        if (this.matchOperator("=")) {
          def = this.expressionOr(paramEnd);
        }
        params.push({
          type: "FunctionParameter",
          name,
          pattern,
          typeAnnotation,
          default: def,
          optional: optional2 || void 0,
          ...spanFrom(paramStart, this.previous())
        });
        if (this.matchPunctuator(",") && !this.checkPunctuator(")")) continue;
        break;
      }
    }
    this.expectPunctuator(")");
    let returnType;
    let predicate;
    if (this.matchPunctuator(":")) {
      predicate = this.tryParseTypePredicate();
      if (!predicate) {
        returnType = this.attempt(() => this.parseTypeOrTypePackReference(), () => false, () => void 0);
      }
    }
    return { start, generics, params, hasVarargs, varargTypeAnnotation, returnType, predicate };
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
  tryParseTypePredicate() {
    const start = this.current();
    const isWord = (t, v) => t.type === "Identifier" && t.value === v;
    if (isWord(start, "asserts") && this.peek(1).type === "Identifier") {
      this.advance();
      const parameterName = this.expectIdentifier().value;
      let typeAnnotation;
      if (isWord(this.current(), "is")) {
        this.advance();
        typeAnnotation = this.parseType();
      }
      return {
        type: "TypePredicateNode",
        parameterName,
        asserts: true,
        typeAnnotation,
        ...spanFrom(start, this.previous())
      };
    }
    if (start.type === "Identifier" && isWord(this.peek(1), "is")) {
      const parameterName = this.expectIdentifier().value;
      this.advance();
      const typeAnnotation = this.parseType();
      return {
        type: "TypePredicateNode",
        parameterName,
        asserts: false,
        typeAnnotation,
        ...spanFrom(start, this.previous())
      };
    }
    return void 0;
  }
  /** Run `parse`, and put the parser back where it was if it fails. Used
   *  where two forms start alike and only their end tells them apart: `(a,
   *  b) => a + b` and `(a + b)` both open with a `(`. */
  tryParse(parse2) {
    const cursor = this.cursor;
    const errors = this.errors.length;
    try {
      return parse2();
    } catch (error) {
      if (!(error instanceof ParseError || error instanceof ParseRecover)) throw error;
      this.cursor = cursor;
      this.errors.length = errors;
      return void 0;
    }
  }
  /** `x => x * 2` — a function, written short. The body is an expression,
   *  which is returned, or a block in braces, as in TypeScript. */
  parseArrow() {
    const start = this.current();
    const head = this.checkType("Identifier") ? (() => {
      const name = this.expectIdentifier();
      return {
        start,
        generics: [],
        params: [{ type: "FunctionParameter", name: name.value, ...spanFrom(name, name) }],
        hasVarargs: false,
        varargTypeAnnotation: void 0,
        returnType: void 0,
        predicate: void 0
      };
    })() : this.parseFunctionHead();
    this.expectPunctuator("=>");
    const body = this.checkPunctuator("{") ? this.parseBraceBlock() : this.returnOf(this.parseExpression(0));
    const func = {
      type: "FunctionBody",
      generics: head.generics,
      params: head.params,
      hasVarargs: head.hasVarargs,
      varargTypeAnnotation: head.varargTypeAnnotation,
      returnType: head.returnType,
      predicate: head.predicate,
      body,
      ...spanFrom(start, this.previous())
    };
    return { type: "FunctionExpression", func, ...spanFrom(start, this.previous()) };
  }
  /** A one-expression body: the value is what the function returns. */
  returnOf(expression) {
    const statement = {
      type: "ReturnStatement",
      arguments: [expression],
      ...spanFrom(expression, expression)
    };
    return { type: "Block", statements: [statement], ...spanFrom(expression, expression) };
  }
  parseFunctionBody(opener) {
    const head = this.parseFunctionHead();
    const body = this.parseStatementBody(opener);
    return {
      type: "FunctionBody",
      generics: head.generics,
      params: head.params,
      hasVarargs: head.hasVarargs,
      varargTypeAnnotation: head.varargTypeAnnotation,
      returnType: head.returnType,
      predicate: head.predicate,
      body,
      ...spanFrom(head.start, this.previous())
    };
  }
  headToSignature(head) {
    return {
      type: "FunctionSignature",
      generics: head.generics,
      params: head.params,
      hasVarargs: head.hasVarargs,
      varargTypeAnnotation: head.varargTypeAnnotation,
      returnType: head.returnType,
      predicate: head.predicate,
      ...spanFrom(head.start, this.previous())
    };
  }
  /** A function's statements. */
  parseStatementBody(opener) {
    void opener;
    return this.parseBracedBody("function");
  }
  headToBody(head, opener) {
    const body = this.parseStatementBody(opener);
    return {
      type: "FunctionBody",
      generics: head.generics,
      params: head.params,
      hasVarargs: head.hasVarargs,
      varargTypeAnnotation: head.varargTypeAnnotation,
      returnType: head.returnType,
      predicate: head.predicate,
      body,
      ...spanFrom(head.start, this.previous())
    };
  }
  // ============================================================
  // Types
  // ============================================================
  parseType() {
    return this.parseConditionalType();
  }
  /** `C extends E ? A : B`. `?` in type position always means this — luaut
   *  has no `T?` shorthand — so the grammar needs no lookahead beyond the
   *  `extends`, which stays a soft keyword. */
  parseConditionalType() {
    const start = this.current();
    const checkType = this.parseUnionType();
    if (!this.checkIdentifierValue("extends")) return checkType;
    this.advance();
    const extendsType = this.parseUnionType();
    this.expectPunctuator("?");
    const trueType = this.parseConditionalType();
    this.expectPunctuator(":");
    const falseType = this.parseConditionalType();
    return {
      type: "ConditionalTypeNode",
      checkType,
      extendsType,
      trueType,
      falseType,
      ...spanFrom(start, this.previous())
    };
  }
  parseUnionType() {
    const start = this.current();
    this.matchPunctuator("|");
    let left = this.parseDifferenceType();
    if (this.checkPunctuator("|")) {
      const types = [left];
      while (this.matchPunctuator("|")) {
        types.push(this.parseDifferenceType());
      }
      return { type: "UnionTypeNode", types, ...spanFrom(start, this.previous()) };
    }
    return left;
  }
  /** `A - B` — set difference. Between `|` and `&` in precedence, and left
   *  associative, so `A - B - C` removes both. The lexer gives `->` its own
   *  token, so a function type's arrow is never mistaken for one. */
  parseDifferenceType() {
    let left = this.parseIntersectionType();
    while (this.checkOperator("-")) {
      this.advance();
      const excluded = this.parseIntersectionType();
      left = { type: "DifferenceTypeNode", base: left, excluded, ...spanFrom(left, excluded) };
    }
    return left;
  }
  parseIntersectionType() {
    const start = this.current();
    this.matchPunctuator("&");
    let left = this.parseSuffixType();
    if (this.checkPunctuator("&")) {
      const types = [left];
      while (this.matchPunctuator("&")) {
        types.push(this.parseSuffixType());
      }
      return { type: "IntersectionTypeNode", types, ...spanFrom(start, this.previous()) };
    }
    return left;
  }
  /** Postfix type suffixes. There is deliberately **no `T?` shorthand**:
   *  `?` in type position always belongs to a conditional type
   *  (`C extends E ? A : B`). Write `T | nil` for a nilable type, and
   *  `name?: T` for an optional property or parameter. */
  parseSuffixType() {
    let t = this.parsePrimaryType();
    while (true) {
      if (this.checkPunctuator("[")) {
        if (this.peek(1).type === "Punctuator" && this.peek(1).value === "]") {
          this.advance();
          this.advance();
          t = { type: "ArrayTypeNode", element: t, ...spanFrom(t, this.previous()) };
          continue;
        }
        this.advance();
        const indexType = this.parseType();
        this.expectPunctuator("]");
        t = { type: "IndexedAccessTypeNode", objectType: t, indexType, ...spanFrom(t, this.previous()) };
        continue;
      }
      break;
    }
    return t;
  }
  parsePrimaryType() {
    const t = this.current();
    if (t.type === "InterpolatedString") {
      this.advance();
      const quasis = [];
      const types = [];
      let pending = "";
      for (const part of t.parts) {
        if (part.kind === "string") {
          pending += part.value ?? "";
        } else {
          quasis.push(pending);
          pending = "";
          types.push(parseTypeFromSource(part.raw));
        }
      }
      quasis.push(pending);
      return { type: "TemplateLiteralTypeNode", quasis, types, ...spanFrom(t, this.previous()) };
    }
    if (this.checkIdentifierValue("keyof") && this.startsType(this.peek(1))) {
      this.advance();
      const target = this.parsePrimaryType();
      return { type: "KeyofTypeNode", target, ...spanFrom(t, this.previous()) };
    }
    if (this.checkIdentifierValue("infer") && this.peek(1).type === "Identifier") {
      this.advance();
      const nameTok = this.expectIdentifier();
      const name = nameTok.value;
      return { type: "InferTypeNode", name, id: tokenIdentifier(nameTok), ...spanFrom(t, this.previous()) };
    }
    if (t.type === "Operator" && t.value === "<") {
      const generics = this.parseGenericTypeParameterList();
      this.expectPunctuator("(");
      return this.parseFunctionTypeAfterParen(t, generics);
    }
    if (t.type === "Punctuator" && t.value === "(") {
      this.advance();
      return this.parseFunctionTypeAfterParen(t, []);
    }
    if (t.type === "Operator" && t.value === "...") {
      this.advance();
      const inner = this.parseType();
      return { type: "VariadicTypeNode", typeAnnotation: inner, ...spanFrom(t, this.previous()) };
    }
    if (t.type === "Punctuator" && t.value === "{") {
      return this.parseTableType();
    }
    if (t.type === "Punctuator" && t.value === "[") {
      this.advance();
      const elements = [];
      while (!this.checkPunctuator("]")) {
        elements.push(this.parseType());
        if (this.matchPunctuator(",")) continue;
        break;
      }
      this.expectPunctuator("]");
      return { type: "TupleTypeNode", elements, ...spanFrom(t, this.previous()) };
    }
    if (t.type === "Identifier" && t.value === "typeof" && this.peek(1).type === "Punctuator" && this.peek(1).value === "(") {
      this.advance();
      this.advance();
      const expression = this.parseExpression();
      this.expectPunctuator(")");
      return { type: "TypeofTypeNode", expression, ...spanFrom(t, this.previous()) };
    }
    if (t.type === "Identifier" && t.value === "typeof" && this.peek(1).type === "Identifier") {
      this.advance();
      let expression = this.parseIdentifier();
      while (this.checkPunctuator(".") && this.peek(1).type === "Identifier") {
        this.advance();
        const property = this.parseIdentifier();
        expression = { type: "MemberExpression", object: expression, property, ...spanFrom(expression, property) };
      }
      return { type: "TypeofTypeNode", expression, ...spanFrom(t, this.previous()) };
    }
    if (t.type === "Literal" && t.kind === "string") {
      this.advance();
      return { type: "TypeLiteralString", value: t.value, ...spanFrom(t, t) };
    }
    if (t.type === "Literal" && t.kind === "boolean") {
      this.advance();
      return { type: "TypeLiteralBoolean", value: t.value, ...spanFrom(t, t) };
    }
    if (t.type === "Literal" && t.kind === "number") {
      this.advance();
      return { type: "TypeLiteralNumber", value: t.value, ...spanFrom(t, t) };
    }
    if (t.type === "Literal" && t.kind === "nil") {
      this.advance();
      return { type: "TypeReference", base: "nil", typeArguments: [], ...spanFrom(t, t) };
    }
    if (t.type === "Identifier") {
      this.advance();
      let namespace;
      let base = t.value;
      if (this.matchPunctuator(".")) {
        namespace = base;
        base = this.expectIdentifier().value;
      }
      const typeArguments = [];
      if (this.checkOperator("<")) {
        this.advance();
        if (!this.checkOperator(">")) {
          typeArguments.push(this.parseTypeArgument());
          while (this.matchPunctuator(",") && !this.checkOperator(">")) {
            typeArguments.push(this.parseTypeArgument());
          }
        }
        this.expectOperator(">");
      }
      return { type: "TypeReference", base, namespace, typeArguments, ...spanFrom(t, this.previous()) };
    }
    this.error("Unexpected token in type annotation");
  }
  parseFunctionTypeAfterParen(start, generics) {
    const params = [];
    let hasVarargs = false;
    let varargType;
    if (!this.checkPunctuator(")")) {
      while (true) {
        if (this.checkOperator("...")) {
          const dots = this.advance();
          hasVarargs = true;
          if (this.checkType("Identifier") && this.punctuatorAt(1, ":")) {
            const nameTok2 = this.expectIdentifier();
            this.advance();
            params.push({
              type: "FunctionTypeParameter",
              name: nameTok2.value,
              id: tokenIdentifier(nameTok2),
              typeAnnotation: this.parseType(),
              rest: true,
              ...spanFrom(dots, this.previous())
            });
            break;
          }
          varargType = this.parseType();
          break;
        }
        if (this.checkType("Identifier") && this.peek(1).type === "Operator" && this.peek(1).value === "...") {
          const packStart = this.current();
          const packRef = this.parseType();
          this.advance();
          hasVarargs = true;
          varargType = { type: "VariadicTypeNode", typeAnnotation: packRef, ...spanFrom(packStart, this.previous()) };
          break;
        }
        let name;
        let optional2 = false;
        const named = this.checkType("Identifier") && this.peek(1).type === "Punctuator" && (this.peek(1).value === ":" || this.peek(1).value === "?" && this.peek(2).type === "Punctuator" && this.peek(2).value === ":");
        let nameTok;
        if (named) {
          const tok = this.expectIdentifier();
          nameTok = tok;
          name = tok.value;
          optional2 = this.matchPunctuator("?");
          this.advance();
        }
        const paramStart = nameTok ?? this.current();
        const typeAnnotation = this.parseType();
        params.push({
          type: "FunctionTypeParameter",
          name,
          typeAnnotation,
          id: nameTok && tokenIdentifier(nameTok),
          optional: optional2 || void 0,
          ...spanFrom(paramStart, this.previous())
        });
        if (this.matchPunctuator(",") && !this.checkPunctuator(")")) continue;
        break;
      }
    }
    this.expectPunctuator(")");
    if (this.matchPunctuator("=>") || this.matchPunctuator("->")) {
      const predicate = this.tryParseTypePredicate();
      const returnType = predicate ? { type: "TypeReference", base: "boolean", typeArguments: [], ...spanFrom(start, this.previous()) } : this.parseTypeOrTypePackReference();
      return {
        type: "FunctionTypeNode",
        generics,
        params,
        hasVarargs,
        varargType,
        returnType,
        predicate,
        ...spanFrom(start, this.previous())
      };
    }
    if (params.length === 1 && !params[0].name && !hasVarargs) {
      return {
        type: "ParenthesizedTypeNode",
        typeAnnotation: params[0].typeAnnotation,
        ...spanFrom(start, this.previous())
      };
    }
    if (params.some((p) => p.name !== void 0)) {
      this.error("Expected '->' for function type");
    }
    return {
      type: "TypePackNode",
      types: params.map((p) => p.typeAnnotation),
      hasVarargs,
      varargType,
      ...spanFrom(start, this.previous())
    };
  }
  /** Could this token begin a type? Used to keep `keyof` a soft keyword. */
  startsType(t) {
    if (t.type === "Identifier" || t.type === "Literal") return true;
    if (t.type === "Keyword") return ["nil", "true", "false", "function"].includes(String(t.value));
    if (t.type === "Punctuator") return ["{", "[", "("].includes(String(t.value));
    return false;
  }
  /** `{ [K in C]: V }`, with the optional `as` remap and `?` / `readonly`
   *  modifiers (`-?` / `-readonly` strip them). Recognised by the `in` that
   *  follows the bound name — an ordinary `[K]: V` indexer has none. */
  parseMappedType(start) {
    let readonly;
    if (this.checkIdentifierValue("readonly")) {
      this.advance();
      readonly = true;
    } else if (this.checkOperator("-") && this.peek(1).type === "Identifier" && this.peek(1).value === "readonly") {
      this.advance();
      this.advance();
      readonly = false;
    }
    this.expectPunctuator("[");
    const parameterTok = this.expectIdentifier();
    const parameter = parameterTok.value;
    this.advance();
    const constraint = this.parseType();
    let nameType;
    if (this.checkWord("as")) {
      this.advance();
      nameType = this.parseType();
    }
    this.expectPunctuator("]");
    let optional2;
    if (this.matchPunctuator("?")) optional2 = true;
    else if (this.checkOperator("-") && this.peek(1).type === "Punctuator" && this.peek(1).value === "?") {
      this.advance();
      this.advance();
      optional2 = false;
    }
    this.expectPunctuator(":");
    const template = this.parseType();
    this.matchPunctuator(",");
    this.matchPunctuator(";");
    this.expectPunctuator("}");
    return {
      type: "MappedTypeNode",
      parameter,
      parameterId: tokenIdentifier(parameterTok),
      constraint,
      nameType,
      template,
      optional: optional2,
      readonly,
      ...spanFrom(start, this.previous())
    };
  }
  /** Does `{` open a mapped type rather than an object type? Looks for
   *  `[ Ident in`, optionally behind a `readonly` / `-readonly` modifier. */
  looksLikeMappedType() {
    let i = 1;
    const val = (n) => String(this.peek(n).value);
    if (this.peek(i).type === "Identifier" && val(i) === "readonly") i += 1;
    else if (this.peek(i).type === "Operator" && val(i) === "-" && this.peek(i + 1).type === "Identifier" && val(i + 1) === "readonly") i += 2;
    return this.peek(i).type === "Punctuator" && val(i) === "[" && this.peek(i + 1).type === "Identifier" && this.peek(i + 2).type === "Keyword" && val(i + 2) === "in";
  }
  parseTableType() {
    const start = this.current();
    if (this.looksLikeMappedType()) {
      this.expectPunctuator("{");
      return this.parseMappedType(start);
    }
    this.expectPunctuator("{");
    const properties = [];
    while (!this.checkPunctuator("}")) {
      const propStart = this.current();
      if (this.checkPunctuator("[")) {
        this.advance();
        const keyType = this.parseType();
        this.expectPunctuator("]");
        this.expectPunctuator(":");
        const valueType = this.parseType();
        properties.push({ type: "TableTypeIndexer", keyType, valueType, ...spanFrom(propStart, this.previous()) });
      } else if (this.checkIdentifierValue("readonly") && this.peek(1).type === "Identifier") {
        this.advance();
        const keyTok = this.expectIdentifier();
        const name = keyTok.value;
        const optional2 = this.matchPunctuator("?");
        this.expectPunctuator(":");
        const valueType = this.parseType();
        properties.push({
          type: "TableTypeProperty",
          name,
          key: tokenIdentifier(keyTok),
          valueType,
          optional: optional2,
          readonly: true,
          ...spanFrom(propStart, this.previous())
        });
      } else if (this.checkType("Identifier") && (this.peek(1).type === "Punctuator" && this.peek(1).value === ":" || this.peek(1).type === "Punctuator" && this.peek(1).value === "?" && this.peek(2).type === "Punctuator" && this.peek(2).value === ":")) {
        const keyTok = this.expectIdentifier();
        const name = keyTok.value;
        const optional2 = this.matchPunctuator("?");
        this.expectPunctuator(":");
        const valueType = this.parseType();
        properties.push({
          type: "TableTypeProperty",
          name,
          key: tokenIdentifier(keyTok),
          valueType,
          optional: optional2,
          ...spanFrom(propStart, this.previous())
        });
      } else if (this.checkType("Literal") && this.current().kind === "string" && this.peek(1).type === "Punctuator" && (this.peek(1).value === ":" || this.peek(1).value === "?" && this.peek(2).type === "Punctuator" && this.peek(2).value === ":")) {
        const keyTok = this.advance();
        const name = String(keyTok.value);
        const optional2 = this.matchPunctuator("?");
        this.expectPunctuator(":");
        const valueType = this.parseType();
        properties.push({
          type: "TableTypeProperty",
          name,
          key: tokenIdentifier(keyTok),
          valueType,
          optional: optional2,
          ...spanFrom(propStart, this.previous())
        });
      } else {
        this.error(`Expected object type property ('name: T', '"name": T' or '[K]: V'); use 'T[]' for arrays and '[T, U]' for tuples`);
      }
      if (this.matchPunctuator(",") || this.matchPunctuator(";")) continue;
      break;
    }
    this.expectPunctuator("}");
    return { type: "TableTypeNode", properties, ...spanFrom(start, this.previous()) };
  }
  parseTypePack() {
    const start = this.current();
    if (this.matchOperator("...")) {
      const varargType2 = this.parseType();
      return { type: "TypePackNode", types: [], hasVarargs: true, varargType: varargType2, ...spanFrom(start, this.previous()) };
    }
    this.expectPunctuator("(");
    const types = [];
    let hasVarargs = false;
    let varargType;
    if (!(this.current().type === "Punctuator" && this.current().value === ")")) {
      while (true) {
        if (this.matchOperator("...")) {
          hasVarargs = true;
          varargType = this.parseType();
          break;
        }
        types.push(this.parseType());
        if (this.matchPunctuator(",")) continue;
        break;
      }
    }
    this.expectPunctuator(")");
    return { type: "TypePackNode", types, hasVarargs, varargType, ...spanFrom(start, this.previous()) };
  }
  parseGenericTypeParameterList() {
    const list = [];
    this.expectOperator("<");
    while (true) {
      const isConst = this.matchKeyword("const");
      const nameTok = this.expectIdentifier();
      let isPack = false;
      if (this.matchOperator("...")) {
        isPack = true;
      }
      let constraint;
      if (this.checkIdentifierValue("extends")) {
        this.advance();
        constraint = this.parseType();
      }
      let def;
      if (this.matchOperator("=")) {
        if (isPack) {
          def = this.parseTypePack();
        } else {
          def = this.parseType();
        }
      }
      list.push({
        type: "GenericTypeParameter",
        name: nameTok.value,
        id: tokenIdentifier(nameTok),
        isPack,
        isConst: isConst || void 0,
        constraint,
        default: def,
        ...spanFrom(nameTok, this.previous())
      });
      if (this.matchPunctuator(",") && !this.checkOperator(">")) continue;
      break;
    }
    this.expectOperator(">");
    return list;
  }
};
function parse(source) {
  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  return parser.parseProgram();
}
function parseTokens(tokens) {
  const parser = new Parser(tokens);
  return parser.parseProgram();
}
function parseTypeFromSource(raw) {
  const parser = new Parser(tokenize(raw));
  return parser.parseType();
}
function parseExpressionFromSource(raw, inClass = false) {
  const tokens = tokenize(raw);
  const parser = new Parser(tokens);
  if (inClass) parser.classDepth = 1;
  const expr = parser.parseExpression();
  return expr;
}
function parseWithRecovery(source) {
  const lexErrors = [];
  const comments = [];
  const tokens = tokenize(source, { errors: lexErrors, comments });
  const lexed = lexErrors.map((e) => new ParseError(e.message.replace(/ \(\d+:\d+\)$/, ""), e.line, e.column));
  const first = new Parser(tokens, { recover: true });
  let program = first.parseProgram();
  let errors = first.errors;
  if (first.missingEnd) {
    const second = new Parser(tokens, { recover: true, indentation: true });
    const reparsed = second.parseProgram();
    if (second.errors.length <= errors.length) {
      program = reparsed;
      errors = second.errors;
    }
  }
  const all = [...lexed, ...errors].sort((a, b) => a.line - b.line || a.column - b.column);
  return { program, errors: all, directives: readDirectives(comments, tokens) };
}

// src/ast/nodes.ts
var BinaryOperators = [
  "+",
  "-",
  "*",
  "/",
  "//",
  "%",
  "^",
  "..",
  "==",
  "~=",
  "<",
  ">",
  "<=",
  ">=",
  "and",
  "or"
];
var UnaryOperators = ["-", "not", "#"];

// src/ast/analyzeScopes.ts
function getBinding(analysis, id) {
  const bindingId = analysis.bindingOf.get(id);
  return bindingId === void 0 ? void 0 : analysis.bindings.get(bindingId);
}
function isGlobal(binding) {
  return binding.kind === "global";
}
function isUnassignedGlobal(binding) {
  return binding.kind === "global" && !binding.isBuiltin && binding.declarationNode === void 0;
}
function childScope(parent) {
  return { parent, declarations: /* @__PURE__ */ new Map() };
}
var Analyzer = class {
  constructor(options) {
    this.options = options;
    for (const name of options.builtinGlobals ?? []) {
      const id = this.getOrCreateGlobalBinding(name);
      this.bindings.get(id).isBuiltin = true;
    }
  }
  options;
  nextId = 0;
  bindingOf = /* @__PURE__ */ new Map();
  bindings = /* @__PURE__ */ new Map();
  diagnostics = [];
  globalScope = { parent: null, declarations: /* @__PURE__ */ new Map() };
  run(program) {
    this.moduleScope = childScope(this.globalScope);
    this.visitBlock(program.body, this.moduleScope);
    this.resolveForwardReferences();
    if (this.options.reportUndeclared) this.reportUndeclared(program);
    return {
      bindingOf: this.bindingOf,
      bindings: this.bindings,
      diagnostics: this.diagnostics,
      globalsByName: this.globalScope.declarations
    };
  }
  // ---------------- hoisting ----------------
  //
  // As in TypeScript, and as the bundle runs a module:
  //
  // - a function declaration is visible to its whole block, before it too;
  // - a name the module declares at its top level is visible to code that
  //   runs later — function bodies, and `typeof` in a type — even where that
  //   code is written above the declaration. A bundle declares every
  //   top-level name before any of the module runs, so this is what happens.
  //
  // A read of a later `const` straight in the module's own flow is not
  // resolved to it: that still reads what was there before.
  moduleScope = this.globalScope;
  /** How many function bodies enclose the walk. */
  functionDepth = 0;
  /** Function declarations already declared by their block's hoisting, with
   *  the function depth of that block. */
  hoisted = /* @__PURE__ */ new Map();
  /** Names that resolved to a global from code that runs later, with the
   *  scope they were read in. */
  deferredGlobals = [];
  hoistFunctions(block, scope) {
    for (const statement of block.statements) {
      const declaration = statement.type === "ExportStatement" ? statement.declaration : statement;
      if (declaration.type === "ClassDeclaration") {
        this.declare(scope, declaration.name.name, "local", declaration.name, true, "class");
        this.hoisted.set(declaration.name, scope === this.moduleScope ? -1 : this.functionDepth);
        continue;
      }
      if (declaration.type !== "FunctionDeclaration") continue;
      this.declare(scope, declaration.name.name, "local", declaration.name, true, "function");
      this.hoisted.set(declaration.name, scope === this.moduleScope ? -1 : this.functionDepth);
    }
  }
  /** Inside a function, a function declared further down its block is
   *  hoisted only as a name: code that runs later (another function's body)
   *  can call it, but a call straight in the block before the declaration
   *  finds nothing there yet. At a module's top level the whole function is
   *  hoisted, and this does not apply. */
  checkUseBeforeDefine(identifier, id) {
    const binding = this.bindings.get(id);
    if (binding.declaredBy !== "function" && binding.declaredBy !== "class" || this.typeQueryDepth > 0) return;
    const declaration = binding.declarationNode;
    const depth = declaration && this.hoisted.get(declaration);
    if (depth === void 0 || depth !== this.functionDepth) return;
    const before = identifier.line.start < declaration.line.start || identifier.line.start === declaration.line.start && identifier.column.start < declaration.column.start;
    if (!before) return;
    this.diagnostics.push({
      node: identifier,
      message: `'${binding.name}' is used before its definition: inside a function, a function declared further down is only there once its declaration has run`,
      kind: "use-before-define"
    });
  }
  noteDeferred(identifier, scope, id, assignment) {
    if (this.functionDepth === 0 && this.typeQueryDepth === 0) return;
    if (this.bindings.get(id).kind !== "global") return;
    this.deferredGlobals.push({ node: identifier, scope, assignment });
  }
  /** Point each deferred read of a global at the declaration of that name
   *  that turned up later — in the module, or in any block around the code
   *  that reads it. Such code runs after the declaration has: a closure
   *  written inside a value reads the name the value is bound to. */
  resolveForwardReferences() {
    for (const { node, scope, assignment } of this.deferredGlobals) {
      const localId = this.lookup(scope, node.name);
      const globalId = this.bindingOf.get(node);
      if (localId === void 0 || globalId === void 0 || localId === globalId) continue;
      const global = this.bindings.get(globalId);
      const at = global.references.indexOf(node);
      if (at >= 0) global.references.splice(at, 1);
      if (global.declarationNode === node) global.declarationNode = void 0;
      if (!global.isBuiltin && !global.references.length && global.declarationNode === void 0) {
        this.bindings.delete(globalId);
        this.globalScope.declarations.delete(node.name);
      }
      this.bindingOf.set(node, localId);
      this.bindings.get(localId).references.push(node);
      if (assignment) this.checkConstAssign(localId, node);
      else if (this.typeQueryDepth === 0) this.checkTypeOnly(localId, node);
    }
  }
  /** Every read of a global nothing declares. A global assigned somewhere
   *  in the file (`x = 1`) is Lua's implicit global, and is left alone. */
  reportUndeclared(program) {
    const declared = /* @__PURE__ */ new Set();
    for (const statement of program.body.statements) {
      if (statement.type === "DeclareStatement") declared.add(statement.name);
    }
    const found = [];
    for (const binding of this.bindings.values()) {
      if (!isUnassignedGlobal(binding) || declared.has(binding.name)) continue;
      for (const reference of binding.references) {
        found.push({ node: reference, message: `Cannot find name '${binding.name}'`, kind: "undeclared" });
      }
    }
    found.sort((a, b) => a.node.line.start - b.node.line.start || a.node.column.start - b.node.column.start);
    this.diagnostics.push(...found);
  }
  // ---------------- declaration / resolution primitives ----------------
  declare(scope, name, kind, node, isConst = false, declaredBy) {
    if (scope.declarations.has(name) && scope !== this.globalScope) {
      this.diagnostics.push({
        node,
        message: `Cannot redeclare '${name}' in the same scope`,
        kind: "redeclare"
      });
    }
    const id = this.nextId++;
    this.bindings.set(id, { id, name, kind, declarationNode: node, references: [], isConst, declaredBy });
    scope.declarations.set(name, id);
    return id;
  }
  resolve(scope, name) {
    for (let s = scope; s; s = s.parent) {
      const id = s.declarations.get(name);
      if (id !== void 0) return id;
    }
    return this.getOrCreateGlobalBinding(name);
  }
  /** Like `resolve`, but never creates a global: `undefined` when no
   *  enclosing scope declares the name. */
  lookup(scope, name) {
    for (let s = scope; s; s = s.parent) {
      const id = s.declarations.get(name);
      if (id !== void 0) return id;
    }
    return void 0;
  }
  getOrCreateGlobalBinding(name) {
    const existing = this.globalScope.declarations.get(name);
    if (existing !== void 0) return existing;
    const id = this.nextId++;
    this.bindings.set(id, { id, name, kind: "global", references: [] });
    this.globalScope.declarations.set(name, id);
    return id;
  }
  /** Record a variable-usage Identifier as resolved to `scope`'s view of
   *  its name. */
  reference(scope, identifier) {
    const id = this.resolve(scope, identifier.name);
    this.bindingOf.set(identifier, id);
    this.bindings.get(id).references.push(identifier);
    if (this.typeQueryDepth === 0) this.checkTypeOnly(id, identifier);
    this.checkUseBeforeDefine(identifier, id);
    this.noteDeferred(identifier, scope, id, false);
  }
  /** Inside `typeof x` in a type, where a type-only import may be named. */
  typeQueryDepth = 0;
  /** A name from `import type` used as a value. */
  checkTypeOnly(id, node) {
    const b = this.bindings.get(id);
    if (b.declaredBy !== "type") return;
    this.diagnostics.push({
      node,
      message: `'${b.name}' is imported with 'import type' and can only be used as a type`,
      kind: "type-only"
    });
  }
  /** For assignment-like targets (`x = ...`, `function foo() end`): if
   *  this resolved to a global with no declaration site yet, treat this
   *  as its "definition" for go-to-definition purposes. Locals and
   *  builtins are left alone. */
  recordPossibleGlobalDefinition(id, node) {
    const binding = this.bindings.get(id);
    if (binding.kind === "global" && !binding.isBuiltin && binding.declarationNode === void 0) {
      binding.declarationNode = node;
    }
  }
  referenceAsAssignmentTarget(scope, identifier) {
    const id = this.resolve(scope, identifier.name);
    this.bindingOf.set(identifier, id);
    this.bindings.get(id).references.push(identifier);
    this.recordPossibleGlobalDefinition(id, identifier);
    this.checkTypeOnly(id, identifier);
    this.checkConstAssign(id, identifier);
    this.noteDeferred(identifier, scope, id, true);
  }
  /** `Module.x = 1` through `import * as Module`: a module's exports belong
   *  to it and are read-only, as in ES modules. Deeper writes (`Module.x.y`)
   *  change the value, not the module, and are fine. */
  checkModuleWrite(target) {
    if (target.type !== "MemberExpression" && target.type !== "IndexExpression") return;
    if (target.object.type !== "Identifier") return;
    const id = this.bindingOf.get(target.object);
    if (id !== void 0 && this.bindings.get(id).declaredBy === "namespace") {
      this.moduleWriteError(target.object.name, target);
    }
  }
  moduleWriteError(name, node) {
    this.diagnostics.push({
      node,
      message: `Cannot assign to a member of '${name}' \u2014 a module's exports are read-only`,
      kind: "const-assign"
    });
  }
  checkConstAssign(id, node) {
    const b = this.bindings.get(id);
    if (b.declaredBy === "type") return;
    if (b.isConst) {
      this.diagnostics.push({
        node,
        message: `Cannot assign to '${b.name}' \u2014 it is ${b.declaredBy === "import" || b.declaredBy === "namespace" ? "an import" : b.declaredBy === "function" ? "a function" : "a const"}`,
        kind: "const-assign"
      });
    }
  }
  // ---------------- destructuring patterns ----------------
  /** Declares every leaf binding introduced by `target`. Default values and
   *  computed keys are expressions, evaluated in `evalScope`. */
  declarePattern(scope, target, kind, evalScope, isConst = false) {
    switch (target.type) {
      case "IdentifierPattern":
        this.declare(scope, target.name, kind, target, isConst);
        return;
      case "ObjectPattern":
        for (const p of target.properties) {
          if (p.computed) this.visitExpression(p.key, evalScope);
          if (p.default) this.visitExpression(p.default, evalScope);
          this.declarePattern(scope, p.value, kind, evalScope, isConst);
        }
        if (target.rest) this.declarePattern(scope, target.rest, kind, evalScope, isConst);
        return;
      case "ArrayPattern":
        for (const el of target.elements) {
          if (!el) continue;
          if (el.default) this.visitExpression(el.default, evalScope);
          this.declarePattern(scope, el.value, kind, evalScope, isConst);
        }
        if (target.rest) this.declarePattern(scope, target.rest, kind, evalScope, isConst);
        return;
    }
  }
  /** Like `declarePattern`, but for a destructuring *assignment* target
   *  (`{a, b} = t`): leaves resolve to existing bindings rather than
   *  declaring new ones. */
  assignPattern(scope, target) {
    const walk = (t) => {
      switch (t.type) {
        case "IdentifierPattern": {
          const id = this.resolve(scope, t.name);
          this.bindingOf.set(t, id);
          this.recordPossibleGlobalDefinition(id, t);
          this.checkTypeOnly(id, t);
          this.checkConstAssign(id, t);
          return;
        }
        case "ObjectPattern":
          for (const p of t.properties) {
            if (p.computed) this.visitExpression(p.key, scope);
            if (p.default) this.visitExpression(p.default, scope);
            walk(p.value);
          }
          if (t.rest) walk(t.rest);
          return;
        case "ArrayPattern":
          for (const el of t.elements) {
            if (!el) continue;
            if (el.default) this.visitExpression(el.default, scope);
            walk(el.value);
          }
          if (t.rest) walk(t.rest);
          return;
      }
    };
    walk(target);
  }
  // ---------------- blocks / statements ----------------
  visitBlock(block, scope) {
    this.hoistFunctions(block, scope);
    for (const stmt of block.statements) this.visitStatement(stmt, scope);
  }
  /** Visits a block in a *fresh child scope* of `scope` — the common case
   *  for loop/if/do bodies, where the block's own locals shouldn't leak
   *  into the surrounding scope. */
  visitBlockInNewScope(block, scope) {
    this.visitBlock(block, childScope(scope));
  }
  visitStatement(stmt, scope) {
    switch (stmt.type) {
      case "VariableDeclaration": {
        for (const init of stmt.init) this.visitExpression(init, scope);
        for (const name of stmt.names) this.visitType(name.typeAnnotation, scope);
        const isConst = stmt.kind === "const";
        for (const name of stmt.names) this.declarePattern(scope, name, "local", scope, isConst);
        return;
      }
      case "FunctionDeclaration": {
        if (!this.hoisted.has(stmt.name)) this.declare(scope, stmt.name.name, "local", stmt.name, true, "function");
        for (const signature of stmt.signatures ?? []) {
          if (signature.name && signature.name !== stmt.name) this.reference(scope, signature.name);
        }
        if (stmt.implementationName) this.reference(scope, stmt.implementationName);
        for (const signature of stmt.signatures ?? []) this.visitSignature(signature, scope);
        this.visitFunctionBody(stmt.func, scope);
        return;
      }
      case "ClassDeclaration": {
        if (!this.hoisted.has(stmt.name)) this.declare(scope, stmt.name.name, "local", stmt.name, true, "class");
        this.visitClassBody(stmt, scope);
        return;
      }
      case "FunctionDeclarationStatement": {
        if (stmt.target.path.length === 0 && !stmt.target.method) {
          this.referenceAsAssignmentTarget(scope, stmt.target.base);
        } else {
          this.reference(scope, stmt.target.base);
          const id = this.bindingOf.get(stmt.target.base);
          const depth = stmt.target.path.length + (stmt.target.method ? 1 : 0);
          if (id !== void 0 && depth === 1 && this.bindings.get(id).declaredBy === "namespace") {
            this.moduleWriteError(stmt.target.base.name, stmt.target);
          }
        }
        for (const signature of stmt.signatures ?? []) this.visitSignature(signature, scope);
        this.visitFunctionBody(stmt.func, scope, stmt.isMethod);
        return;
      }
      case "AssignmentStatement": {
        for (const value of stmt.values) this.visitExpression(value, scope);
        for (const target of stmt.targets) {
          if (target.type === "Identifier") {
            this.referenceAsAssignmentTarget(scope, target);
          } else if (target.type === "ObjectPattern" || target.type === "ArrayPattern") {
            this.assignPattern(scope, target);
          } else {
            this.visitExpression(target, scope);
            this.checkModuleWrite(target);
          }
        }
        return;
      }
      case "CompoundAssignmentStatement": {
        this.visitExpression(stmt.value, scope);
        if (stmt.target.type === "Identifier") {
          this.reference(scope, stmt.target);
          const id = this.bindingOf.get(stmt.target);
          if (id !== void 0) this.checkConstAssign(id, stmt.target);
        } else {
          this.visitExpression(stmt.target, scope);
          this.checkModuleWrite(stmt.target);
        }
        return;
      }
      case "CallStatement":
        this.visitExpression(stmt.expression, scope);
        return;
      case "DoStatement":
        this.visitBlockInNewScope(stmt.body, scope);
        return;
      case "WhileStatement":
        this.visitExpression(stmt.condition, scope);
        this.visitBlockInNewScope(stmt.body, scope);
        return;
      case "RepeatStatement": {
        const bodyScope = childScope(scope);
        this.visitBlock(stmt.body, bodyScope);
        this.visitExpression(stmt.condition, bodyScope);
        return;
      }
      case "IfStatement": {
        for (const clause of stmt.clauses) {
          this.visitExpression(clause.condition, scope);
          this.visitBlockInNewScope(clause.body, scope);
        }
        if (stmt.alternate) this.visitBlockInNewScope(stmt.alternate, scope);
        return;
      }
      case "NumericForStatement": {
        this.visitExpression(stmt.start, scope);
        this.visitExpression(stmt.end, scope);
        if (stmt.step) this.visitExpression(stmt.step, scope);
        const bodyScope = childScope(scope);
        this.declare(bodyScope, stmt.variable.name, "for-numeric", stmt.variable);
        this.visitBlock(stmt.body, bodyScope);
        return;
      }
      case "GenericForStatement": {
        for (const it of stmt.iterators) this.visitExpression(it, scope);
        const bodyScope = childScope(scope);
        for (const v of stmt.variables) this.declarePattern(bodyScope, v, "for-generic", scope);
        this.visitBlock(stmt.body, bodyScope);
        return;
      }
      case "ReturnStatement":
        for (const arg of stmt.arguments) this.visitExpression(arg, scope);
        return;
      case "BreakStatement":
      case "ContinueStatement":
      case "ErrorStatement":
        return;
      case "DeclareStatement":
        this.visitType(stmt.valueType, scope);
        return;
      case "DeclareClassStatement":
        this.visitType(stmt.body, scope);
        return;
      case "TypeAliasStatement":
      case "ExportTypeAliasStatement":
        this.visitGenerics(
          (stmt.type === "TypeAliasStatement" ? stmt : stmt.alias).generics,
          scope
        );
        this.visitType(stmt.type === "TypeAliasStatement" ? stmt.definition : stmt.alias.definition, scope);
        return;
      case "ImportStatement": {
        const typeOnly = stmt.isTypeOnly ? "type" : void 0;
        if (stmt.defaultImport) {
          this.declare(scope, stmt.defaultImport.name, "local", stmt.defaultImport, true, typeOnly ?? "import");
        }
        if (stmt.namespaceImport) {
          this.declare(scope, stmt.namespaceImport.name, "local", stmt.namespaceImport, true, typeOnly ?? "namespace");
        }
        for (const spec of stmt.specifiers) {
          this.declare(scope, spec.local.name, "local", spec.local, true, typeOnly ?? "import");
        }
        return;
      }
      case "ExportStatement":
        this.visitStatement(stmt.declaration, scope);
        return;
      case "ExportDefaultStatement":
        if (stmt.declaration.type === "ClassDeclaration") this.visitStatement(stmt.declaration, scope);
        else this.visitExpression(stmt.declaration, scope);
        return;
      case "ExportNamedStatement":
        if (!stmt.source) {
          for (const specifier of stmt.specifiers) {
            const id = this.lookup(scope, specifier.local.name);
            if (id === void 0) continue;
            this.bindingOf.set(specifier.local, id);
            this.bindings.get(id).references.push(specifier.local);
          }
        }
        return;
      case "ExportAllStatement":
        return;
    }
  }
  // ---------------- functions ----------------
  visitFunctionBody(func, outerScope, isMethod = false) {
    const fnScope = childScope(outerScope);
    this.visitGenerics(func.generics, fnScope);
    func.params.forEach((param, i) => {
      const kind = isMethod && i === 0 ? "self" : "param";
      this.visitType(param.typeAnnotation, fnScope);
      if (param.default) this.visitExpression(param.default, fnScope);
      if (param.pattern) {
        this.declarePattern(fnScope, param.pattern, kind, fnScope);
      } else {
        this.declare(fnScope, param.name, kind, param);
      }
    });
    this.visitType(func.varargTypeAnnotation, fnScope);
    this.visitType(func.returnType, fnScope);
    this.functionDepth++;
    try {
      this.visitBlock(func.body, fnScope);
    } finally {
      this.functionDepth--;
    }
  }
  /** An overload signature: no body and no bindings, but its types can hold
   *  a `typeof x`. */
  visitSignature(signature, scope) {
    this.visitGenerics(signature.generics, scope);
    for (const param of signature.params) this.visitType(param.typeAnnotation, scope);
    this.visitType(signature.returnType, scope);
  }
  /** `<K extends typeof config>` — a constraint is a type like any other,
   *  and the `typeof` in it reads a value. */
  /** A class body. Its type parameters live in a scope of their own, and
   *  every member is written inside it — so a method's annotations see `T`,
   *  and everything else sees what the class declaration sees, itself
   *  included. `this` is not declared here: the parser makes it a real first
   *  parameter, so it arrives with the rest of them. */
  visitClassBody(node, outer) {
    const scope = node.typeParams?.length ? childScope(outer) : outer;
    this.visitGenerics(node.typeParams, scope);
    if (node.superclass) this.reference(outer, node.superclass);
    for (const argument of node.superArguments ?? []) this.visitType(argument, scope);
    for (const member of node.members) {
      switch (member.type) {
        case "ClassField":
          this.visitType(member.typeAnnotation, scope);
          if (member.init) this.visitExpression(member.init, scope);
          break;
        case "ClassMethod":
          for (const signature of member.signatures ?? []) this.visitSignature(signature, scope);
          this.visitFunctionBody(member.func, scope, member.func.isMethod);
          break;
        case "ClassAccessor":
        case "ClassConstructor":
          this.visitFunctionBody(member.func, scope, member.func.isMethod);
          break;
      }
    }
  }
  visitGenerics(generics, scope) {
    for (const generic of generics ?? []) {
      this.visitType(generic.constraint, scope);
      this.visitType(generic.default, scope);
    }
  }
  /** Resolve the value references inside a type. Only `typeof x` has any —
   *  everything else in a type names types, which live in their own
   *  namespace and are not this pass's business. */
  visitType(node, scope) {
    if (!node) return;
    const walk = (value) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
        return;
      }
      if (value.type === "TypeofTypeNode") {
        this.typeQueryDepth++;
        try {
          this.visitExpression(value.expression, scope);
        } finally {
          this.typeQueryDepth--;
        }
        return;
      }
      for (const key of Object.keys(value)) {
        if (key !== "line" && key !== "column") walk(value[key]);
      }
    };
    walk(node);
  }
  // ---------------- expressions ----------------
  visitExpression(expr, scope) {
    switch (expr.type) {
      case "Identifier":
        this.reference(scope, expr);
        return;
      case "NilLiteral":
      case "BooleanLiteral":
      case "NumberLiteral":
      case "StringLiteral":
      case "VarargExpression":
      case "ErrorExpression":
        return;
      case "InterpolatedStringExpression":
        for (const part of expr.parts) {
          if (part.kind === "expression") this.visitExpression(part.expression, scope);
        }
        return;
      case "FunctionExpression":
        this.visitFunctionBody(expr.func, scope);
        return;
      case "TableExpression":
        for (const field of expr.fields) this.visitTableField(field, scope);
        return;
      case "ArrayExpression":
        for (const el of expr.elements) {
          this.visitExpression(el.type === "SpreadElement" ? el.argument : el, scope);
        }
        return;
      case "AsConstExpression":
        this.visitExpression(expr.expression, scope);
        return;
      case "BinaryExpression":
        this.visitExpression(expr.left, scope);
        this.visitExpression(expr.right, scope);
        return;
      case "UnaryExpression":
        this.visitExpression(expr.argument, scope);
        return;
      case "MemberExpression":
        this.visitExpression(expr.object, scope);
        return;
      case "IndexExpression":
        this.visitExpression(expr.object, scope);
        this.visitExpression(expr.index, scope);
        return;
      case "CallExpression":
        this.visitExpression(expr.callee, scope);
        for (const arg of expr.arguments) this.visitExpression(arg, scope);
        return;
      case "NewExpression":
        this.visitExpression(expr.callee, scope);
        for (const argument of expr.arguments) this.visitExpression(argument, scope);
        for (const argument of expr.typeArguments ?? []) this.visitType(argument, scope);
        return;
      case "SuperExpression":
        return;
      case "SpreadElement":
        this.visitExpression(expr.argument, scope);
        return;
      case "ClassExpression": {
        const inner = childScope(scope);
        if (expr.name) this.declare(inner, expr.name.name, "local", expr.name, true, "class");
        this.visitClassBody(expr, inner);
        return;
      }
      case "MethodCallExpression":
        this.visitExpression(expr.object, scope);
        for (const arg of expr.arguments) this.visitExpression(arg, scope);
        return;
      case "ParenthesizedExpression":
        this.visitExpression(expr.expression, scope);
        return;
      case "TypeAssertionExpression":
        this.visitExpression(expr.expression, scope);
        this.visitType(expr.typeAnnotation, scope);
        return;
      case "SatisfiesExpression":
        this.visitExpression(expr.expression, scope);
        this.visitType(expr.typeAnnotation, scope);
        return;
      case "IfElseExpression":
        for (const clause of expr.clauses) {
          this.visitExpression(clause.condition, scope);
          this.visitExpression(clause.body, scope);
        }
        this.visitExpression(expr.alternate, scope);
        return;
    }
  }
  visitTableField(field, scope) {
    switch (field.type) {
      case "TableFieldNamed":
        this.visitExpression(field.value, scope);
        return;
      case "TableFieldShorthand":
        this.reference(scope, field.name);
        return;
      case "TableFieldSpread":
        this.visitExpression(field.argument, scope);
        return;
      case "TableFieldComputed":
        this.visitExpression(field.key, scope);
        this.visitExpression(field.value, scope);
        return;
    }
  }
};
function analyzeScopes(program, options = {}) {
  return new Analyzer(options).run(program);
}

// src/ast/prelude.ts
var PRELUDE_SOURCE = `
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
`;
var prelude;
function preludeProgram() {
  return prelude ??= parse(PRELUDE_SOURCE);
}

// src/ast/typeModel.ts
function isClassType(t) {
  return t.kind === "object" && t.class !== void 0;
}
function isClassAssignable(got, want) {
  if (!got || !got.ancestors.includes(want.name)) return false;
  const wanted = want.typeArguments?.get(want.name);
  if (!wanted?.length) return true;
  const given = got.typeArguments?.get(want.name);
  if (!given) return true;
  return wanted.every((w, i) => given[i] !== void 0 && isAssignable(given[i], w));
}
function typeParam(name, constraint, isConst) {
  return { kind: "typeParam", name, constraint, isConst };
}
var anyType = { kind: "any" };
var unknownType = { kind: "unknown" };
var neverType = { kind: "never" };
var nilType = { kind: "primitive", name: "nil" };
var booleanType = { kind: "primitive", name: "boolean" };
var numberType = { kind: "primitive", name: "number" };
var stringType = { kind: "primitive", name: "string" };
var threadType = { kind: "primitive", name: "thread" };
var bufferType = { kind: "primitive", name: "buffer" };
function primitive(name) {
  return { kind: "primitive", name };
}
function literal(value) {
  const base = typeof value === "string" ? "string" : typeof value === "number" ? "number" : "boolean";
  return { kind: "literal", base, value };
}
function arrayOf(element) {
  return { kind: "array", element };
}
function tuple(elements, isPack) {
  return { kind: "tuple", elements, isPack };
}
function objectType(entries, indexer, frozen) {
  return { kind: "object", properties: new Map(entries), indexer, frozen };
}
function fn(params, returns, varargs, typeParams, predicate) {
  return {
    kind: "function",
    params,
    varargs,
    returns,
    typeParams: typeParams?.length ? typeParams : void 0,
    predicate
  };
}
function substitute(t, subst) {
  if (subst.size === 0) return t;
  if (!containsTypeParam(t)) return t;
  switch (t.kind) {
    case "typeParam":
      return subst.get(t.name) ?? t;
    case "array":
      return arrayOf(substitute(t.element, subst));
    case "tuple":
      return tuple(t.elements.map((e) => substitute(e, subst)), t.isPack);
    case "object": {
      const entries = [];
      for (const [k, v] of t.properties) entries.push([k, { ...v, type: substitute(v.type, subst) }]);
      const out = objectType(
        entries,
        t.indexer && { key: substitute(t.indexer.key, subst), value: substitute(t.indexer.value, subst) },
        t.frozen
      );
      if (t.name) out.name = t.name;
      if (t.class) {
        out.class = {
          ...t.class,
          typeArguments: t.class.typeArguments && new Map(
            [...t.class.typeArguments].map(([name, args]) => [name, args.map((a) => substitute(a, subst))])
          )
        };
      }
      return out;
    }
    case "function": {
      const inner = t.typeParams ? new Map([...subst].filter(([k]) => !t.typeParams.includes(k))) : subst;
      let params = t.params.map((p) => ({ ...p, type: substitute(p.type, inner) }));
      let varargs = t.varargs && substitute(t.varargs, inner);
      if (varargs?.kind === "tuple" && varargs.isPack) {
        params = [...params, ...varargs.elements.map((type) => ({ type }))];
        varargs = void 0;
      }
      return {
        kind: "function",
        params,
        varargs,
        returns: substitute(t.returns, inner),
        typeParams: t.typeParams,
        typeParamDefaults: t.typeParamDefaults,
        predicate: t.predicate && {
          ...t.predicate,
          type: t.predicate.type && substitute(t.predicate.type, inner)
        }
      };
    }
    case "union":
      return union(t.types.map((x) => substitute(x, subst)));
    case "intersection": {
      const r = intersection(t.types.map((x) => substitute(x, subst)));
      return t.name && r.kind === "intersection" && !r.name ? { ...r, name: t.name } : r;
    }
    case "genericRef":
      return { kind: "genericRef", name: t.name, typeArguments: t.typeArguments.map((a) => substitute(a, subst)) };
    case "keyof":
      return { kind: "keyof", target: substitute(t.target, subst) };
    case "templateLiteral":
      return { kind: "templateLiteral", quasis: t.quasis, types: t.types.map((x) => substitute(x, subst)) };
    case "difference":
      return difference(substitute(t.base, subst), substitute(t.excluded, subst));
    case "indexedAccess":
      return {
        kind: "indexedAccess",
        objectType: substitute(t.objectType, subst),
        indexType: substitute(t.indexType, subst)
      };
    case "conditional": {
      const branch = t.distributeParam ? new Map([...subst].filter(([k]) => k !== t.distributeParam)) : subst;
      return {
        ...t,
        checkType: substitute(t.checkType, subst),
        extendsType: substitute(t.extendsType, subst),
        trueType: substitute(t.trueType, branch),
        falseType: substitute(t.falseType, branch)
      };
    }
    case "mapped": {
      const inner = new Map([...subst].filter(([k]) => k !== t.parameter));
      return {
        ...t,
        constraint: substitute(t.constraint, subst),
        nameType: t.nameType && substitute(t.nameType, inner),
        template: substitute(t.template, inner),
        source: t.source && substitute(t.source, subst)
      };
    }
    default:
      return t;
  }
}
function classArguments(t, name) {
  if (t.kind === "genericRef") return t.name === name ? t.typeArguments : void 0;
  if (t.kind === "object") return t.class?.typeArguments?.get(name);
  return void 0;
}
function unify(param, arg, vars, out) {
  if (param.kind === "typeParam" && param.constraint && !vars.has(param.name)) {
    unify(param.constraint, arg, vars, out);
    return;
  }
  if (param.kind === "typeParam" && vars.has(param.name)) {
    const prev = out.get(param.name);
    out.set(param.name, prev ? union([prev, arg]) : arg);
    return;
  }
  if (arg.kind === "any" || arg.kind === "never") return;
  switch (param.kind) {
    case "array":
      if (arg.kind === "array") unify(param.element, arg.element, vars, out);
      else if (arg.kind === "tuple") for (const e of arg.elements) unify(param.element, e, vars, out);
      return;
    case "tuple":
      if (arg.kind === "tuple") param.elements.forEach((p, i) => arg.elements[i] && unify(p, arg.elements[i], vars, out));
      else if (arg.kind === "array") for (const p of param.elements) unify(p, arg.element, vars, out);
      return;
    case "function":
      if (arg.kind === "function") {
        param.params.forEach((p, i) => arg.params[i] && unify(p.type, arg.params[i].type, vars, out));
        unify(param.returns, arg.returns, vars, out);
      }
      return;
    case "object":
      if (param.class) {
        const wanted = param.class.typeArguments?.get(param.class.name);
        const given = classArguments(arg, param.class.name);
        if (wanted && given) wanted.forEach((w, i) => given[i] && unify(w, given[i], vars, out));
        return;
      }
      if (arg.kind === "object" && !arg.class) {
        for (const [k, pv] of param.properties) {
          const av = arg.properties.get(k);
          if (av) unify(pv.type, av.type, vars, out);
        }
        if (param.indexer && arg.indexer) unify(param.indexer.value, arg.indexer.value, vars, out);
      }
      return;
    case "genericRef": {
      const given = classArguments(arg, param.name);
      if (given) param.typeArguments.forEach((p, i) => given[i] && unify(p, given[i], vars, out));
      return;
    }
    case "union":
      for (const m of param.types) unify(m, arg, vars, out);
      return;
  }
}
function union(types) {
  const flat = [];
  for (const t of types) {
    if (t.kind === "union") flat.push(...t.types);
    else flat.push(t);
  }
  if (flat.some((t) => t.kind === "any")) return anyType;
  if (flat.some((t) => t.kind === "unknown")) return unknownType;
  const seen = /* @__PURE__ */ new Map();
  for (const t of flat) {
    if (t.kind === "never") continue;
    const key = formatType(t);
    if (!seen.has(key)) seen.set(key, t);
  }
  let members = reduceSubtypes([...seen.values()]);
  if (members.length === 0) return neverType;
  if (members.length === 1) return members[0];
  return { kind: "union", types: members };
}
function reduceSubtypes(members) {
  const primitives = new Set(
    members.filter((t) => t.kind === "primitive").map((t) => t.name)
  );
  const bools = members.filter((t) => t.kind === "literal" && t.base === "boolean");
  if (!primitives.has("boolean") && bools.length === 2) {
    members = [booleanType, ...members.filter((t) => !bools.includes(t))];
    primitives.add("boolean");
  }
  if (!primitives.size) return members;
  return members.filter((t) => !(t.kind === "literal" && primitives.has(t.base)));
}
function intersection(types) {
  const flat = [];
  for (const t of types) {
    if (t.kind === "intersection" && !t.name) flat.push(...t.types);
    else flat.push(t);
  }
  const seen = /* @__PURE__ */ new Map();
  for (const t of flat) {
    if (t.kind === "unknown") continue;
    seen.set(formatType(t), t);
  }
  const members = [...seen.values()];
  if (members.length === 0) return unknownType;
  if (members.length === 1) return members[0];
  return { kind: "intersection", types: members };
}
function difference(base, excluded) {
  if (excluded.kind === "never" || base.kind === "never" || base.kind === "any") return base;
  if (base.kind === "union") return union(base.types.filter((m) => !isAssignable(m, excluded)));
  if (base.kind === "difference") {
    return difference(base.base, union([base.excluded, excluded]));
  }
  if (isAssignable(base, excluded)) return neverType;
  const deferred = base.kind === "keyof" || base.kind === "indexedAccess" || base.kind === "conditional" || base.kind === "mapped" || base.kind === "templateLiteral";
  const opaque = base.kind === "unknown" || base.kind === "typeParam" || base.kind === "genericRef" || deferred || containsTypeParam(base);
  return opaque ? { kind: "difference", base, excluded } : base;
}
function optional(t) {
  return union([t, nilType]);
}
function widen(t) {
  switch (t.kind) {
    case "literal":
      return primitive(t.base);
    case "array":
      return arrayOf(widen(t.element));
    case "tuple":
      return tuple(t.elements.map(widen), t.isPack);
    case "object": {
      if (t.frozen || t.class) return t;
      const entries = [];
      for (const [k, v] of t.properties) entries.push([k, { ...v, type: widen(v.type) }]);
      const w = objectType(entries, t.indexer && { key: t.indexer.key, value: widen(t.indexer.value) });
      if (t.name) w.name = t.name;
      return w;
    }
    case "union":
      return union(t.types.map(widen));
    case "difference":
      return difference(widen(t.base), t.excluded);
    default:
      return t;
  }
}
var expandAlias;
function setAliasExpander(fn2) {
  expandAlias = fn2;
}
var deferredBound;
function setDeferredBound(fn2) {
  deferredBound = fn2;
}
var comparing = [];
function isAssignable(rawA, rawB) {
  let a = isNoValue(rawA) ? nilType : rawA;
  let b = isNoValue(rawB) ? nilType : rawB;
  if (a === b) return true;
  if (expandAlias) {
    if (a.kind === "genericRef" && b.kind !== "genericRef") a = expandAlias(a);
    else if (b.kind === "genericRef" && a.kind !== "genericRef") b = expandAlias(b);
    else if (a.kind === "genericRef" && b.kind === "genericRef" && a.name !== b.name) {
      a = expandAlias(a);
      b = expandAlias(b);
    }
    if (a === b) return true;
  }
  for (let i = 0; i < comparing.length; i += 2) {
    if (comparing[i] === a && comparing[i + 1] === b) return true;
  }
  comparing.push(a, b);
  try {
    return isAssignableInner(a, b);
  } finally {
    comparing.length -= 2;
  }
}
function isAssignableInner(a, b) {
  if (a.kind === "any" || b.kind === "any") return true;
  if (a.kind === "never") return true;
  if (b.kind === "unknown") return true;
  if (b.kind === "never") return false;
  if (a.kind === "unknown") return false;
  if (a.kind === "difference" && b.kind === "difference") {
    return isAssignable(a.base, b.base) && isAssignable(b.excluded, a.excluded);
  }
  if (b.kind === "difference") {
    return isAssignable(a, b.base) && !overlaps(a, b.excluded);
  }
  if (a.kind === "difference") {
    if (b.kind === "union" && b.types.some((m) => isAssignable(a, m))) return true;
    return isAssignable(a.base, b);
  }
  if (a.kind === "conditional" || a.kind === "indexedAccess") {
    if ((b.kind === "conditional" || b.kind === "indexedAccess" || b.kind === "union") && equalTypes(a, b)) {
      return true;
    }
    if (b.kind === "union" && b.types.some((m) => equalTypes(a, m))) return true;
    const bound = deferredBound?.(a);
    if (bound && bound !== a) return isAssignable(bound, b);
  }
  if (a.kind === "typeParam") {
    if (b.kind === "typeParam" && a.name === b.name) return true;
    if (b.kind === "union" && b.types.some((m) => m.kind === "typeParam" && m.name === a.name)) return true;
    return a.constraint ? isAssignable(a.constraint, b) : false;
  }
  if (a.kind === "union") return a.types.every((t) => isAssignable(t, b));
  if (b.kind === "union") return b.types.some((t) => isAssignable(a, t));
  if (b.kind === "intersection") return b.types.every((t) => isAssignable(a, t));
  if (a.kind === "intersection") {
    if (a.types.some((t) => isAssignable(t, b))) return true;
    const merged = mergeObjectMembers(a.types);
    return merged !== void 0 && isAssignable(merged, b);
  }
  if (a.kind === "literal") {
    if (b.kind === "literal") return a.value === b.value;
    if (b.kind === "primitive") return b.name === a.base;
    if (b.kind === "templateLiteral") {
      return a.base === "string" && templateMatches(String(a.value), b);
    }
    return false;
  }
  if (a.kind === "templateLiteral") {
    return b.kind === "primitive" && b.name === "string";
  }
  if (a.kind === "primitive") return b.kind === "primitive" && b.name === a.name;
  if (a.kind === "array") {
    if (b.kind === "array") return isAssignable(a.element, b.element);
    return false;
  }
  if (a.kind === "tuple") {
    if (b.kind === "tuple") {
      return a.elements.length === b.elements.length && a.elements.every((t, i) => isAssignable(t, b.elements[i]));
    }
    if (b.kind === "array") return a.elements.every((t) => isAssignable(t, b.element));
    return false;
  }
  if (a.kind === "object") {
    if (b.kind !== "object") return false;
    if (b.class) return isClassAssignable(a.class, b.class);
    if (a.class && (b.indexer || b.properties.size === 0)) return false;
    for (const [name, bp] of b.properties) {
      const ap = a.properties.get(name);
      if (!ap) {
        if (bp.optional) continue;
        if (a.indexer && isAssignable(a.indexer.value, bp.type)) continue;
        return false;
      }
      if (!isAssignable(ap.type, bp.optional ? optional(bp.type) : bp.type)) return false;
    }
    if (b.indexer) {
      for (const [name, ap] of a.properties) {
        if (b.properties.has(name) || !isAssignable(literal(name), b.indexer.key)) continue;
        if (!isAssignable(ap.type, b.indexer.value)) return false;
      }
      if (a.indexer && isAssignable(a.indexer.key, b.indexer.key) && !isAssignable(a.indexer.value, b.indexer.value)) {
        return false;
      }
    }
    return true;
  }
  if (a.kind === "function") {
    if (b.kind !== "function") return false;
    const n = Math.min(a.params.length, b.params.length);
    for (let i = 0; i < n; i++) {
      if (!isAssignable(a.params[i].type, b.params[i].type) && !isAssignable(b.params[i].type, a.params[i].type)) return false;
    }
    return isAssignable(a.returns, b.returns);
  }
  if (b.kind === "typeParam") return false;
  if (a.kind === "genericRef" || b.kind === "genericRef") {
    return a.kind === "genericRef" && b.kind === "genericRef" && a.name === b.name && a.typeArguments.length === b.typeArguments.length && a.typeArguments.every((x, i) => equalTypes(x, b.typeArguments[i]));
  }
  return false;
}
function isNoValue(t) {
  return t.kind === "tuple" && t.elements.length === 0;
}
function equalTypes(a, b) {
  return formatType(a) === formatType(b);
}
function narrowTo(t, filter) {
  if (filter.kind === "any") return t;
  if (t.kind === "difference") return difference(narrowTo(t.base, filter), t.excluded);
  if (t.kind === "any" || t.kind === "unknown") return filter;
  const members = t.kind === "union" ? t.types : [t];
  const kept = [];
  for (const m of members) {
    if (m.kind === "any") {
      kept.push(filter);
      continue;
    }
    if (isAssignable(m, filter)) kept.push(m);
    else if (isAssignable(filter, m)) kept.push(filter);
  }
  return union(kept);
}
function narrowExclude(t, exclude) {
  if (exclude.kind === "never" || t.kind === "any") return t;
  if (t.kind === "unknown" || t.kind === "typeParam" || t.kind === "genericRef" || t.kind === "difference") {
    return difference(t, exclude);
  }
  const members = t.kind === "union" ? t.types : [t];
  const kept = [];
  for (const m of members) {
    if (isAssignable(m, exclude)) continue;
    if (m.kind === "primitive" && m.name === "boolean" && exclude.kind === "literal" && exclude.base === "boolean") {
      kept.push(literal(!exclude.value));
      continue;
    }
    kept.push(m);
  }
  return union(kept);
}
var falsyType = { kind: "union", types: [nilType, { kind: "literal", base: "boolean", value: false }] };
function isPossiblyTruthy(t) {
  if (t.kind === "never") return false;
  if (t.kind === "difference") return isPossiblyTruthy(t.base) && !isAssignable(t.base, t.excluded);
  if (t.kind === "union") return t.types.some(isPossiblyTruthy);
  if (t.kind === "primitive" && t.name === "nil") return false;
  if (t.kind === "literal" && t.value === false) return false;
  return true;
}
function isPossiblyFalsy(t) {
  if (t.kind === "never") return false;
  if (t.kind === "difference") return isPossiblyFalsy(t.base) && !isAssignable(falsyType, t.excluded);
  if (t.kind === "union") return t.types.some(isPossiblyFalsy);
  if (t.kind === "any" || t.kind === "unknown") return true;
  if (t.kind === "primitive") return t.name === "nil" || t.name === "boolean";
  if (t.kind === "literal") return t.value === false;
  return t.kind === "typeParam" || t.kind === "genericRef";
}
function narrowTruthy(t) {
  if (t.kind === "any") return t;
  if (t.kind === "unknown" || t.kind === "typeParam" || t.kind === "genericRef") {
    return difference(t, falsyType);
  }
  if (t.kind === "difference") return difference(narrowTruthy(t.base), t.excluded);
  const members = t.kind === "union" ? t.types : [t];
  const out = [];
  for (const m of members) {
    if (!isPossiblyTruthy(m)) continue;
    if (m.kind === "primitive" && m.name === "boolean") out.push(literal(true));
    else out.push(m);
  }
  return union(out);
}
function narrowFalsy(t) {
  const members = t.kind === "union" ? t.types : [t];
  const out = [];
  for (const m of members) {
    if (m.kind === "primitive" && m.name === "nil") out.push(nilType);
    else if (m.kind === "primitive" && m.name === "boolean") out.push(literal(false));
    else if (m.kind === "literal" && m.value === false) out.push(literal(false));
    else if (m.kind === "any" || m.kind === "unknown" || m.kind === "typeParam" || m.kind === "genericRef") {
      out.push(nilType);
      out.push(literal(false));
    }
  }
  return union(out);
}
var freeParamCache = /* @__PURE__ */ new WeakMap();
function containsTypeParam(t, seen = /* @__PURE__ */ new Set(), bound = /* @__PURE__ */ new Set()) {
  const cacheable = seen.size === 0 && bound.size === 0;
  if (cacheable) {
    const hit = freeParamCache.get(t);
    if (hit !== void 0) return hit;
  }
  const result = containsFreeTypeParam(t, seen, bound);
  if (cacheable) freeParamCache.set(t, result);
  return result;
}
function containsFreeTypeParam(t, seen, bound) {
  if (seen.has(t)) return false;
  seen.add(t);
  switch (t.kind) {
    case "typeParam":
      return !bound.has(t.name);
    case "infer":
      return !bound.has(t.name);
    case "array":
      return containsTypeParam(t.element, seen, bound);
    case "tuple":
      return t.elements.some((e) => containsTypeParam(e, seen, bound));
    case "union":
    case "intersection":
      return t.types.some((m) => containsTypeParam(m, seen, bound));
    case "object":
      if (t.class) {
        return [...t.class.typeArguments?.values() ?? []].some((args) => args.some((a) => containsTypeParam(a, seen, bound)));
      }
      return [...t.properties.values()].some((v) => containsTypeParam(v.type, seen, bound)) || !!t.indexer && (containsTypeParam(t.indexer.key, seen, bound) || containsTypeParam(t.indexer.value, seen, bound));
    case "function": {
      const inner = t.typeParams?.length ? /* @__PURE__ */ new Set([...bound, ...t.typeParams]) : bound;
      return t.params.some((p) => containsTypeParam(p.type, seen, inner)) || !!t.varargs && containsTypeParam(t.varargs, seen, inner) || containsTypeParam(t.returns, seen, inner);
    }
    case "genericRef":
      return t.typeArguments.some((a) => containsTypeParam(a, seen, bound));
    case "keyof":
      return containsTypeParam(t.target, seen, bound);
    case "templateLiteral":
      return t.types.some((x) => containsTypeParam(x, seen, bound));
    case "difference":
      return containsTypeParam(t.base, seen, bound) || containsTypeParam(t.excluded, seen, bound);
    case "indexedAccess":
      return containsTypeParam(t.objectType, seen, bound) || containsTypeParam(t.indexType, seen, bound);
    case "conditional": {
      const inner = t.inferVars.length ? /* @__PURE__ */ new Set([...bound, ...t.inferVars]) : bound;
      return containsTypeParam(t.checkType, seen, bound) || containsTypeParam(t.extendsType, seen, inner) || containsTypeParam(t.trueType, seen, inner) || containsTypeParam(t.falseType, seen, bound);
    }
    case "mapped": {
      const inner = /* @__PURE__ */ new Set([...bound, t.parameter]);
      return containsTypeParam(t.constraint, seen, bound) || !!t.nameType && containsTypeParam(t.nameType, seen, inner) || containsTypeParam(t.template, seen, inner) || !!t.source && containsTypeParam(t.source, seen, bound);
    }
    default:
      return false;
  }
}
function matchInfer(arg, pattern, out) {
  if (pattern.kind === "infer") {
    const prev = out.get(pattern.name);
    out.set(pattern.name, prev ? union([prev, arg]) : arg);
    return true;
  }
  if (!containsTypeParam(pattern)) return true;
  switch (pattern.kind) {
    case "array":
      if (arg.kind === "array") return matchInfer(arg.element, pattern.element, out);
      if (arg.kind === "tuple") return matchInfer(union(arg.elements), pattern.element, out);
      return false;
    case "tuple":
      if (arg.kind !== "tuple" || arg.elements.length !== pattern.elements.length) return false;
      return pattern.elements.every((pt, i) => matchInfer(arg.elements[i], pt, out));
    case "function": {
      if (arg.kind !== "function") return false;
      if (pattern.varargs?.kind === "infer" && !pattern.params.length) {
        out.set(pattern.varargs.name, tuple(arg.params.map((p) => p.type)));
      } else {
        for (let i = 0; i < pattern.params.length; i++) {
          if (!arg.params[i]) return false;
          if (!matchInfer(arg.params[i].type, pattern.params[i].type, out)) return false;
        }
      }
      return matchInfer(arg.returns, pattern.returns, out);
    }
    case "object": {
      if (arg.kind !== "object") return false;
      for (const [k, pv] of pattern.properties) {
        const av = arg.properties.get(k);
        if (!av || !matchInfer(av.type, pv.type, out)) return false;
      }
      return true;
    }
    case "union":
      return pattern.types.some((m) => matchInfer(arg, m, out));
    case "genericRef":
      if (arg.kind !== "genericRef" || arg.name !== pattern.name) return false;
      return pattern.typeArguments.every((a, i) => arg.typeArguments[i] !== void 0 && matchInfer(arg.typeArguments[i], a, out));
    default:
      return true;
  }
}
function templateMatches(value, pattern) {
  const partSource = (t) => {
    switch (t.kind) {
      case "literal":
        return escapeRegExp(String(t.value));
      case "primitive":
        if (t.name === "number") return "-?\\d+(?:\\.\\d+)?";
        if (t.name === "boolean") return "true|false";
        return "[\\s\\S]*";
      case "union":
        return t.types.map((m) => `(?:${partSource(m)})`).join("|");
      default:
        return "[\\s\\S]*";
    }
  };
  let source = "^" + escapeRegExp(pattern.quasis[0]);
  pattern.types.forEach((t, i) => {
    source += `(?:${partSource(t)})` + escapeRegExp(pattern.quasis[i + 1]);
  });
  return new RegExp(source + "$").test(value);
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function overlaps(a, b) {
  if (a.kind === "union") return a.types.some((m) => overlaps(m, b));
  if (b.kind === "union") return b.types.some((m) => overlaps(a, m));
  return isAssignable(a, b) || isAssignable(b, a);
}
var formatCache = /* @__PURE__ */ new WeakMap();
function briefConstraint(t) {
  if (t.kind === "union" && t.types.length > 8) {
    return `${t.types.slice(0, 6).map(formatType).join(" | ")} | ... ${t.types.length - 6} more`;
  }
  return formatType(t);
}
function collectTypeParams(t, out, seen = /* @__PURE__ */ new Set()) {
  if (!t || seen.has(t)) return;
  seen.add(t);
  switch (t.kind) {
    case "typeParam":
      if (t.constraint && !out.has(t.name)) out.set(t.name, t.constraint);
      collectTypeParams(t.constraint, out, seen);
      return;
    case "array":
      collectTypeParams(t.element, out, seen);
      return;
    case "tuple":
      for (const e of t.elements) collectTypeParams(e, out, seen);
      return;
    case "union":
    case "intersection":
      for (const m of t.types) collectTypeParams(m, out, seen);
      return;
    case "keyof":
      collectTypeParams(t.target, out, seen);
      return;
    case "indexedAccess":
      collectTypeParams(t.objectType, out, seen);
      collectTypeParams(t.indexType, out, seen);
      return;
    case "genericRef":
      for (const a of t.typeArguments) collectTypeParams(a, out, seen);
      return;
    case "object":
      for (const [, p] of t.properties) collectTypeParams(p.type, out, seen);
      return;
    default:
      return;
  }
}
function formatType(t) {
  const cached = formatCache.get(t);
  if (cached !== void 0) return cached;
  const out = formatTypeUncached(t);
  formatCache.set(t, out);
  return out;
}
function formatTypeUncached(t) {
  switch (t.kind) {
    case "any":
      return "any";
    case "unknown":
      return "unknown";
    case "never":
      return "never";
    case "primitive":
      return t.name;
    case "literal":
      return t.base === "string" ? JSON.stringify(t.value) : String(t.value);
    case "array":
      return `${formatAtom(t.element)}[]`;
    case "tuple": {
      if (!t.elements.length) return "()";
      const inner = t.elements.map(formatType).join(", ");
      return t.isPack ? `(${inner})` : `[${inner}]`;
    }
    case "object": {
      if (t.name) {
        const args = t.class?.typeArguments?.get(t.class.name);
        return args?.length ? `${t.name}<${args.map(formatType).join(", ")}>` : t.name;
      }
      const props = [...t.properties.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${v.readonly ? "readonly " : ""}${formatKey(k)}${v.optional ? "?" : ""}: ${formatType(v.type)}`);
      if (t.indexer) props.push(`[${formatType(t.indexer.key)}]: ${formatType(t.indexer.value)}`);
      return props.length ? `{ ${props.join(", ")} }` : "{}";
    }
    case "function": {
      const consts = new Set(
        t.params.filter((p) => p.type.kind === "typeParam" && p.type.isConst).map((p) => p.type.name)
      );
      const constraints = /* @__PURE__ */ new Map();
      for (const part of [...t.params.map((p) => p.type), t.varargs, t.returns]) {
        collectTypeParams(part, constraints);
      }
      const gen = t.typeParams?.length ? `<${t.typeParams.map((n) => {
        const constraint = constraints.get(n);
        return `${consts.has(n) ? "const " : ""}${n}${constraint ? ` extends ${briefConstraint(constraint)}` : ""}`;
      }).join(", ")}>` : "";
      const ps = t.params.map((p) => `${p.name ? p.name + ": " : ""}${formatType(p.type)}`);
      if (t.varargs) ps.push(`...${formatType(t.varargs)}`);
      return `${gen}(${ps.join(", ")}) => ${formatPredicate(t) ?? formatType(t.returns)}`;
    }
    case "typeParam":
      return t.name;
    case "union":
      return t.types.map(formatAtom).join(" | ");
    case "intersection":
      return t.name ?? t.types.map(formatAtom).join(" & ");
    case "genericRef":
      return t.typeArguments.length ? `${t.name}<${t.typeArguments.map(formatType).join(", ")}>` : t.name;
    case "keyof":
      return `keyof ${formatAtom(t.target)}`;
    case "difference":
      return `${formatAtom(t.base)} - ${formatAtom(t.excluded)}`;
    case "templateLiteral": {
      let out = "`" + t.quasis[0];
      t.types.forEach((x, i) => {
        out += "${" + formatType(x) + "}" + t.quasis[i + 1];
      });
      return out + "`";
    }
    case "indexedAccess":
      return `${formatAtom(t.objectType)}[${formatType(t.indexType)}]`;
    case "infer":
      return `infer ${t.name}`;
    case "conditional":
      return `${formatAtom(t.checkType)} extends ${formatAtom(t.extendsType)} ? ${formatType(t.trueType)} : ${formatType(t.falseType)}`;
    case "mapped": {
      const ro = t.readonly === true ? "readonly " : t.readonly === false ? "-readonly " : "";
      const opt = t.optional === true ? "?" : t.optional === false ? "-?" : "";
      const as = t.nameType ? ` as ${formatType(t.nameType)}` : "";
      return `{ ${ro}[${t.parameter} in ${formatType(t.constraint)}${as}]${opt}: ${formatType(t.template)} }`;
    }
  }
}
function formatPredicate(t) {
  const p = t.predicate;
  if (!p) return void 0;
  const name = t.params[p.param]?.name ?? `arg${p.param}`;
  const head = p.asserts ? "asserts " : "";
  return p.type ? `${head}${name} is ${formatType(p.type)}` : `${head}${name}`;
}
function formatAtom(t) {
  if (t.kind === "intersection" && t.name) return t.name;
  if (t.kind === "union" || t.kind === "intersection" || t.kind === "function" || t.kind === "difference" || t.kind === "conditional") {
    return `(${formatType(t)})`;
  }
  return formatType(t);
}
var IDENT_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
function formatKey(k) {
  return IDENT_KEY.test(k) ? k : JSON.stringify(k);
}
function mergeObjectMembers(types) {
  const objects = [];
  const seen = /* @__PURE__ */ new Set();
  const collect = (t) => {
    if (seen.has(t)) return true;
    seen.add(t);
    if (t.kind === "genericRef") {
      const expanded = expandAlias?.(t);
      return expanded !== void 0 && expanded !== t && collect(expanded);
    }
    if (t.kind === "intersection") return t.types.every(collect);
    if (t.kind === "object" && !t.class) {
      objects.push(t);
      return true;
    }
    return false;
  };
  if (!types.every(collect) || objects.length < 2) return void 0;
  const properties = /* @__PURE__ */ new Map();
  let indexer;
  for (const object of objects) {
    indexer ??= object.indexer;
    for (const [name, property] of object.properties) {
      const existing = properties.get(name);
      properties.set(name, existing ? {
        type: intersection([existing.type, property.type]),
        optional: existing.optional && property.optional,
        readonly: existing.readonly || property.readonly
      } : property);
    }
  }
  return objectType([...properties], indexer);
}

// src/ast/analyzeTypes.ts
function analyzeTypes(program, scopes, options = {}) {
  return new TypeAnalyzer(program, scopes, options).run();
}
function moduleExports(program, scopes, types, resolveModule) {
  const byDeclaration = /* @__PURE__ */ new Map();
  for (const binding of scopes.bindings.values()) {
    if (binding.declarationNode) byDeclaration.set(binding.declarationNode, binding.id);
  }
  const values = /* @__PURE__ */ new Map();
  const exportedTypes = /* @__PURE__ */ new Map();
  let defaultType;
  const stars = [];
  const setValue = (name, type) => {
    if (name === "default") defaultType = type;
    else values.set(name, type);
  };
  const reexport = (from, name, as) => {
    if (!from || from.partial) {
      setValue(as, anyType);
      return;
    }
    if (name === "default") {
      if (from.default) setValue(as, from.default);
      return;
    }
    const value = from.values.get(name);
    if (value) setValue(as, value);
    const type = from.types.get(name);
    if (type) exportedTypes.set(as, type);
  };
  const aliasParams = (name) => {
    for (const s of program.body.statements) {
      const alias = s.type === "TypeAliasStatement" ? s : s.type === "ExportTypeAliasStatement" ? s.alias : void 0;
      if (alias?.name.name === name) return alias.generics.map((g) => g.name);
    }
    return [];
  };
  const exportName = (declaration, name) => {
    const id = byDeclaration.get(declaration);
    values.set(name, (id !== void 0 ? types.bindingType.get(id) : void 0) ?? anyType);
  };
  const exportPattern = (target) => {
    switch (target.type) {
      case "IdentifierPattern":
        exportName(target, target.name);
        return;
      case "ObjectPattern":
        for (const p of target.properties) exportPattern(p.value);
        if (target.rest) exportPattern(target.rest);
        return;
      case "ArrayPattern":
        for (const el of target.elements) if (el) exportPattern(el.value);
        if (target.rest) exportPattern(target.rest);
        return;
    }
  };
  for (const stmt of program.body.statements) {
    if (stmt.type === "ExportStatement") {
      const declaration = stmt.declaration;
      if (declaration.type === "FunctionDeclaration") exportName(declaration.name, declaration.name.name);
      else if (declaration.type === "ClassDeclaration") {
        exportName(declaration.name, declaration.name.name);
        const instance = types.aliases.get(declaration.name.name);
        if (instance) {
          exportedTypes.set(declaration.name.name, {
            type: instance,
            params: declaration.typeParams.map((g) => g.name)
          });
        }
      } else for (const target of declaration.names) exportPattern(target);
    } else if (stmt.type === "ExportTypeAliasStatement") {
      const name = stmt.alias.name.name;
      const type = types.aliases.get(name);
      if (type) exportedTypes.set(name, { type, params: stmt.alias.generics.map((g) => g.name) });
    } else if (stmt.type === "ExportDefaultStatement") {
      if (stmt.declaration.type === "ClassDeclaration") {
        const id = byDeclaration.get(stmt.declaration.name);
        defaultType = (id !== void 0 ? types.bindingType.get(id) : void 0) ?? anyType;
        const instance = types.aliases.get(stmt.declaration.name.name);
        if (instance) {
          const exported = { type: instance, params: stmt.declaration.typeParams.map((g) => g.name) };
          exportedTypes.set(stmt.declaration.name.name, exported);
          exportedTypes.set("default", exported);
        }
      } else {
        defaultType = types.typeOf.get(stmt.declaration) ?? anyType;
      }
    } else if (stmt.type === "ExportNamedStatement") {
      if (stmt.source) {
        const from = resolveModule?.(stmt.source.value);
        for (const s of stmt.specifiers) reexport(from, s.local.name, s.exported.name);
      } else {
        for (const s of stmt.specifiers) {
          const id = scopes.bindingOf.get(s.local);
          if (id !== void 0) setValue(s.exported.name, types.bindingType.get(id) ?? anyType);
          const alias = types.aliases.get(s.local.name);
          if (alias) exportedTypes.set(s.exported.name, { type: alias, params: aliasParams(s.local.name) });
        }
      }
    } else if (stmt.type === "ExportAllStatement") {
      stars.push(stmt.source.value);
    }
  }
  for (const specifier of stars) {
    const from = resolveModule?.(specifier);
    if (!from || from.partial) continue;
    for (const [name, type] of from.values) if (!values.has(name)) values.set(name, type);
    for (const [name, type] of from.types) if (!exportedTypes.has(name)) exportedTypes.set(name, type);
  }
  return { values, types: exportedTypes, default: defaultType };
}
function bindKey(id) {
  return `$${id}`;
}
function forkEnv(env) {
  return new Map(env);
}
function mergeEnv(a, b, base) {
  const out = /* @__PURE__ */ new Map();
  const keys = /* @__PURE__ */ new Set([...a.keys(), ...b.keys()]);
  for (const k of keys) {
    out.set(k, union([a.get(k) ?? base(k), b.get(k) ?? base(k)]));
  }
  return out;
}
function mergeIndexer(a, b) {
  return a ? { key: union([a.key, b.key]), value: union([a.value, b.value]) } : b;
}
function producesMultipleValues(e) {
  return e.type === "CallExpression" || e.type === "MethodCallExpression" || e.type === "VarargExpression";
}
function isFreshLiteralExpr(e) {
  if (!e) return false;
  switch (e.type) {
    case "NumberLiteral":
    case "StringLiteral":
    case "BooleanLiteral":
    case "InterpolatedStringExpression":
    case "TableExpression":
    case "ArrayExpression":
      return true;
    case "ParenthesizedExpression":
      return isFreshLiteralExpr(e.expression);
    case "UnaryExpression":
      return isFreshLiteralExpr(e.argument);
    // `let n = 5 satisfies number` widens like `let n = 5`. An object or
    // array has already taken its literals from the contract, and keeps them.
    case "SatisfiesExpression": {
      const inner = unwrapParens(e.expression);
      return inner.type !== "TableExpression" && inner.type !== "ArrayExpression" && isFreshLiteralExpr(inner);
    }
    default:
      return false;
  }
}
function collectInferNames(node) {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    switch (n.type) {
      case "InferTypeNode":
        out.push(n.name);
        return;
      case "ArrayTypeNode":
        walk(n.element);
        return;
      case "ParenthesizedTypeNode":
      case "VariadicTypeNode":
        walk(n.typeAnnotation);
        return;
      case "TupleTypeNode":
        n.elements.forEach(walk);
        return;
      case "UnionTypeNode":
      case "IntersectionTypeNode":
        n.types.forEach(walk);
        return;
      case "TypeReference":
        n.typeArguments.forEach(walk);
        return;
      case "KeyofTypeNode":
        walk(n.target);
        return;
      case "IndexedAccessTypeNode":
        walk(n.objectType);
        walk(n.indexType);
        return;
      case "FunctionTypeNode":
        n.params.forEach((pp) => walk(pp.typeAnnotation));
        walk(n.varargType);
        walk(n.returnType);
        return;
      case "TableTypeNode":
        for (const prop of n.properties) {
          if (prop.type === "TableTypeIndexer") {
            walk(prop.keyType);
            walk(prop.valueType);
          } else walk(prop.valueType);
        }
        return;
      default:
        return;
    }
  };
  walk(node);
  return out;
}
function keepsLiterals(paramType) {
  if (paramType.kind !== "typeParam") return false;
  if (paramType.isConst) return true;
  if (!paramType.constraint) return false;
  const members = paramType.constraint.kind === "union" ? paramType.constraint.types : [paramType.constraint];
  return members.some((m) => m.kind === "literal");
}
var CLASS_LINKS = /* @__PURE__ */ new Set(["new", "ClassObject", "ParentClass"]);
var CLASS_RESERVED = /* @__PURE__ */ new Set([
  "new",
  "ClassObject",
  "ParentClass",
  "__init",
  "__index",
  "__newindex",
  "__getters",
  "__setters",
  "__dynamic"
]);
function callsSuper(block) {
  let found = false;
  walkNodes(block, (node) => {
    const record = node;
    if (record.type === "CallExpression" && record.callee?.type === "SuperExpression") found = true;
  });
  return found;
}
function assignedFields(block) {
  const names = /* @__PURE__ */ new Set();
  walkNodes(block, (node) => {
    const record = node;
    const targets = record.type === "AssignmentStatement" ? record.targets : record.type === "CompoundAssignmentStatement" ? [record.target] : void 0;
    for (const target of targets ?? []) {
      const member = target;
      if (member.type === "MemberExpression" && member.object?.type === "Identifier" && member.object.name === "this" && member.property?.name) {
        names.add(member.property.name);
      }
    }
  });
  return names;
}
function walkNodes(root, visit) {
  if (!root || typeof root !== "object") return;
  if (Array.isArray(root)) {
    for (const item of root) walkNodes(item, visit);
    return;
  }
  visit(root);
  for (const [key, value] of Object.entries(root)) {
    if (key !== "line" && key !== "column" && value && typeof value === "object") walkNodes(value, visit);
  }
}
var AliasMap = class extends Map {
  pending = /* @__PURE__ */ new Map();
  defer(name, resolve5) {
    super.delete(name);
    this.pending.set(name, resolve5);
  }
  get(name) {
    const resolved = super.get(name);
    if (resolved !== void 0) return resolved;
    const resolve5 = this.pending.get(name);
    if (!resolve5) return void 0;
    this.pending.delete(name);
    const type = resolve5();
    super.set(name, type);
    return type;
  }
  has(name) {
    return super.has(name) || (this.pending?.has(name) ?? false);
  }
  set(name, type) {
    this.pending?.delete(name);
    return super.set(name, type);
  }
  delete(name) {
    const deferred = this.pending?.delete(name) ?? false;
    return super.delete(name) || deferred;
  }
  get size() {
    return super.size + (this.pending?.size ?? 0);
  }
  keys() {
    return [...super.keys(), ...this.pending?.keys() ?? []][Symbol.iterator]();
  }
  entries() {
    return [...this.keys()].map((name) => [name, this.get(name)])[Symbol.iterator]();
  }
  values() {
    return [...this.keys()].map((name) => this.get(name))[Symbol.iterator]();
  }
  forEach(callback, thisArg) {
    for (const [name, type] of this.entries()) callback.call(thisArg, type, name, this);
  }
  [Symbol.iterator]() {
    return this.entries();
  }
};
function unwrapParens(e) {
  while (e.type === "ParenthesizedExpression") e = e.expression;
  return e;
}
function expressionLabel(e, depth = 0) {
  if (depth > 6) return void 0;
  const args = (list) => {
    const parts = list.map((a) => a.type === "StringLiteral" ? JSON.stringify(a.value) : a.type === "NumberLiteral" ? a.raw : a.type === "Identifier" ? a.name : void 0);
    return parts.every((p) => p !== void 0) && parts.join(", ").length <= 40 ? `(${parts.join(", ")})` : "(...)";
  };
  switch (e.type) {
    case "Identifier":
      return e.name;
    case "MemberExpression": {
      const o = expressionLabel(e.object, depth + 1);
      return o === void 0 ? void 0 : `${o}${e.optional ? "?." : "."}${e.property.name}`;
    }
    case "MethodCallExpression": {
      const o = expressionLabel(e.object, depth + 1);
      return o === void 0 ? void 0 : `${o}${e.optional ? "?:" : ":"}${e.method.name}${args(e.arguments)}`;
    }
    case "CallExpression": {
      const o = expressionLabel(e.callee, depth + 1);
      return o === void 0 ? void 0 : `${o}${e.optional ? "?." : ""}${args(e.arguments)}`;
    }
    case "IndexExpression": {
      const o = expressionLabel(e.object, depth + 1);
      const i = e.index.type === "StringLiteral" ? JSON.stringify(e.index.value) : e.index.type === "NumberLiteral" ? e.index.raw : e.index.type === "Identifier" ? e.index.name : "...";
      return o === void 0 ? void 0 : `${o}[${i}]`;
    }
    case "ParenthesizedExpression": {
      const inner = expressionLabel(e.expression, depth + 1);
      return inner === void 0 ? void 0 : `(${inner})`;
    }
    default:
      return void 0;
  }
}
function withoutNil(t) {
  if (t.kind !== "union") return t.kind === "primitive" && t.name === "nil" ? neverType : t;
  return union(t.types.filter((m) => !(m.kind === "primitive" && m.name === "nil")));
}
var METAMETHODS = {
  "+": "__add",
  "-": "__sub",
  "*": "__mul",
  "/": "__div",
  "//": "__idiv",
  "%": "__mod",
  "^": "__pow",
  "..": "__concat"
};
function posKey(name, line, column) {
  return `${name}@${line}:${column}`;
}
var TypeAnalyzer = class {
  constructor(program, scopes, options) {
    this.program = program;
    this.scopes = scopes;
    this.options = options;
    this.emitDiagnostics = options.diagnostics ?? true;
  }
  program;
  scopes;
  options;
  typeOf = /* @__PURE__ */ new Map();
  bindingType = /* @__PURE__ */ new Map();
  narrowedTypeOf = /* @__PURE__ */ new Map();
  typeOfTypeNode = /* @__PURE__ */ new Map();
  expectedTypeOf = /* @__PURE__ */ new Map();
  /** Public: each alias resolved once (generic aliases keep their params as
   *  `typeParam` nodes in the body). */
  aliases = new AliasMap();
  /** Uninstantiated alias definitions, for `Name<Args>` instantiation. */
  aliasDefs = /* @__PURE__ */ new Map();
  /** See `resolveClass`. */
  classTypes = /* @__PURE__ */ new WeakMap();
  /** See `instanceType` — one instance type per `class ... end`. */
  instanceTypes = /* @__PURE__ */ new WeakMap();
  classMembers = /* @__PURE__ */ new WeakMap();
  /** Generic parameters currently in lexical scope (alias body / generic fn),
   *  with their `extends` constraints resolved. */
  typeParamScope = [];
  /** Global types contributed by `declare` statements (libs, then this program). */
  libGlobalTypes = /* @__PURE__ */ new Map();
  /** Declaration node -> binding, built once so `bindingIdByName` is O(1)
   *  instead of a scan of every binding per declaration site. */
  bindingByDecl = /* @__PURE__ */ new Map();
  /** Fallback index for the same lookup, keyed by `name@line:column` — used
   *  when the caller holds a different node object at the same source span. */
  bindingByPos = /* @__PURE__ */ new Map();
  /** Bindings whose type came from an explicit annotation (vs. inferred from
   *  the initializer) — reassignment narrows within these, but replaces the
   *  inferred type of an un-annotated binding. */
  annotated = /* @__PURE__ */ new Set();
  /** Guard against runaway recursive alias instantiation. */
  instantiationDepth = 0;
  /** Guard against a self-referential type-level operator. */
  reduceDepth = 0;
  /** One entry per enclosing loop: the flow states its `break`s jump from. */
  breakStates = [];
  /** Memoised `reduceType`, keyed by type identity. */
  reduceCache = /* @__PURE__ */ new WeakMap();
  /** Resolved alias bodies, keyed by reference. See `expand`. */
  expandCache = /* @__PURE__ */ new Map();
  /** Alias names currently being resolved — a re-entry means a recursive type
   *  (`type Tree = { children: Tree[] }`); it resolves to a nominal ref. */
  resolvingAliases = /* @__PURE__ */ new Set();
  diagnostics = [];
  /** `import`ed type names, from `resolveModule`. */
  importedTypes = /* @__PURE__ */ new Map();
  /** `resolveModule` results, one lookup per module path. */
  resolvedModules = /* @__PURE__ */ new Map();
  emitDiagnostics;
  /** Recursion guard for `preVisitBody`. */
  preVisitDepth = 0;
  run() {
    this.registerAliasDefs(preludeProgram().body, true);
    for (const lib of this.options.libs ?? []) this.registerAliasDefs(lib.body, true);
    this.registerAliasDefs(this.program.body);
    this.registerNestedClasses();
    for (const lib of this.options.libs ?? []) this.harvestDeclares(lib.body);
    this.registerImportedTypes();
    this.resolveAllAliases();
    this.harvestDeclares(this.program.body, true);
    this.indexDeclarations();
    for (const [name, id] of this.scopes.globalsByName) {
      if (this.deferredDeclares.has(name) && !this.options.globalTypes?.[name]) continue;
      const t = this.options.globalTypes?.[name] ?? this.libGlobalTypes.get(name) ?? anyType;
      this.bindingType.set(id, t);
    }
    setAliasExpander((t) => this.expand(t));
    setDeferredBound((t) => this.deferredBound(t));
    try {
      const env = /* @__PURE__ */ new Map();
      this.visitBlock(this.program.body, env);
      this.resolveDeferredDeclares();
      if (this.options.reportUnknownTypes) this.reportUnknownTypes();
    } finally {
      setAliasExpander(void 0);
      setDeferredBound(void 0);
    }
    return {
      typeOf: this.typeOf,
      bindingType: this.bindingType,
      narrowedTypeOf: this.narrowedTypeOf,
      typeOfTypeNode: this.typeOfTypeNode,
      expectedTypeOf: this.expectedTypeOf,
      aliases: this.resolveDeferredAliases(),
      diagnostics: this.diagnostics
    };
  }
  // --------------------------------------------------------
  // Aliases
  // --------------------------------------------------------
  moduleFor(specifier) {
    if (!this.resolvedModules.has(specifier)) {
      this.resolvedModules.set(specifier, this.options.resolveModule?.(specifier));
    }
    return this.resolvedModules.get(specifier);
  }
  /** `export ... from "./x"`: the module must exist, and so must each name. */
  checkReexport(source, names) {
    if (!this.options.resolveModule || !this.emitDiagnostics) return;
    const exports2 = this.moduleFor(source.value);
    if (!exports2) {
      this.diagnostics.push({ node: source, message: `Cannot find module '${source.value}'` });
      return;
    }
    if (exports2.partial) return;
    for (const name of names) {
      const found = name.name === "default" ? exports2.default !== void 0 : exports2.values.has(name.name) || exports2.types.has(name.name);
      if (!found) {
        this.diagnostics.push({ node: name, message: `Module '${source.value}' has no exported member '${name.name}'` });
      }
    }
  }
  registerImportedTypes() {
    if (!this.options.resolveModule) return;
    for (const stmt of this.program.body.statements) {
      if (stmt.type !== "ImportStatement") continue;
      const exports2 = this.moduleFor(stmt.source.value);
      if (!exports2) continue;
      if (stmt.namespaceImport) {
        for (const [name, exported] of exports2.types) {
          const qualified = `${stmt.namespaceImport.name}.${name}`;
          this.importedTypes.set(qualified, exported);
          this.aliases.set(qualified, exported.type);
        }
      }
      const asDefault = stmt.defaultImport && exports2.types.get("default");
      if (stmt.defaultImport && asDefault) {
        this.importedTypes.set(stmt.defaultImport.name, asDefault);
        this.aliases.set(stmt.defaultImport.name, asDefault.type);
      }
      for (const s of stmt.specifiers) {
        const exported = exports2.types.get(s.imported.name);
        if (exported) {
          this.importedTypes.set(s.local.name, exported);
          this.aliases.set(s.local.name, exported.type);
        }
      }
    }
  }
  /** `layering` is on for the prelude and for definitions files: a second
   *  library that declares an alias already declared *adds* to it, the way a
   *  second `declare` of a table's name does, so `@luaut/roblox` can give
   *  `StringMethods` Luau's `split` without restating Lua's. The file being
   *  analysed is not a layer: its own alias replaces what the libraries
   *  gave, which is how a project opts out of a set. */
  registerAliasDefs(block, layering = false) {
    for (const stmt of block.statements) {
      const alias = stmt.type === "TypeAliasStatement" ? stmt : stmt.type === "ExportTypeAliasStatement" ? stmt.alias : void 0;
      if (alias) {
        const previous = layering ? this.aliasDefs.get(alias.name.name) : void 0;
        const node = previous && !previous.class ? {
          type: "IntersectionTypeNode",
          types: [previous.node, alias.definition],
          line: alias.definition.line,
          column: alias.definition.column
        } : alias.definition;
        this.aliasDefs.set(alias.name.name, {
          params: previous && !previous.class && previous.params.length ? previous.params : alias.generics,
          node
        });
      }
      if (stmt.type === "DeclareClassStatement") {
        this.aliasDefs.set(stmt.name.name, { params: [], node: stmt.body, class: stmt });
      }
      const declaration = stmt.type === "ExportStatement" || stmt.type === "ExportDefaultStatement" ? stmt.declaration : stmt;
      if (declaration.type === "ClassDeclaration") this.registerClass(declaration);
    }
  }
  /** A class written inside a function or a block names a type too — its
   *  own instances', which its methods' `this` is annotated with. Type names
   *  are one namespace here, so it is registered with the rest; only a
   *  second class of the same name would notice. */
  registerNestedClasses() {
    walkNodes(this.program.body, (node) => {
      const record = node;
      if (record.type !== "ClassDeclaration") return;
      const declaration = node;
      if (this.aliasDefs.has(declaration.name.name)) return;
      this.registerClass(declaration);
    });
  }
  /** A class's name as a type. `node` is a placeholder: `resolveDef` and
   *  `instantiateAlias` both go to the declaration itself. */
  registerClass(declaration) {
    this.aliasDefs.set(declaration.name.name, {
      params: declaration.typeParams,
      node: {
        type: "TableTypeNode",
        properties: [],
        line: declaration.line,
        column: declaration.column
      },
      runtimeClass: declaration
    });
  }
  /** A non-generic definition's type. */
  resolveDef(def) {
    if (def.runtimeClass) return this.instanceType(def.runtimeClass);
    return def.class ? this.classType(def.class) : this.resolveType(def.node);
  }
  /** One type per class declaration, so every mention of a class is the same
   *  object — its own members included, which refer back to it. */
  classType(stmt) {
    return this.classTypes.get(stmt) ?? this.resolveClass(stmt);
  }
  /** A class's members are resolved the first time anyone asks for
   *  `properties` — its own from its body, the inherited ones from its
   *  superclass.
   *
   *  Both have to wait. A definitions file for a whole engine declares
   *  thousands of classes that all refer to one another; resolving each body
   *  as soon as the class is named would resolve every class on every
   *  analysis, when a script touches a handful. And classes refer to one
   *  another constantly — `Object.IsA` mentions a map of every class, each
   *  of which extends `Object` — so while one class resolves, one it extends
   *  may itself be half-resolved; copying its members then would miss some
   *  for good. */
  resolveClass(stmt) {
    const name = stmt.name.name;
    const { ancestors, cyclic } = this.classChain(stmt);
    const superclass = !cyclic && ancestors.length > 1 ? this.aliasDefs.get(ancestors[1])?.class : void 0;
    let own;
    let resolvingOwn = false;
    const ownMembers = () => {
      if (own || resolvingOwn) return own;
      resolvingOwn = true;
      try {
        own = this.resolveType(stmt.body);
      } finally {
        resolvingOwn = false;
      }
      return own;
    };
    let complete;
    const members = () => {
      if (complete) return complete;
      const mine = ownMembers();
      if (!mine) return void 0;
      const base = superclass ? this.classMembers.get(this.classType(superclass))?.() : void 0;
      if (superclass && !base) return void 0;
      return complete = {
        properties: new Map([...base?.properties ?? [], ...mine.properties]),
        indexer: mine.indexer ?? base?.indexer
      };
    };
    const type = { kind: "object", name, class: { name, superclass: superclass?.name.name, ancestors } };
    Object.defineProperties(type, {
      properties: { enumerable: true, get: () => members()?.properties ?? own?.properties ?? /* @__PURE__ */ new Map() },
      indexer: { enumerable: true, get: () => members()?.indexer ?? own?.indexer }
    });
    this.classTypes.set(stmt, type);
    this.classMembers.set(type, members);
    if (this.program.body.statements.includes(stmt)) ownMembers();
    return type;
  }
  // ============================================================
  // `class ... end` — the runtime kind
  // ------------------------------------------------------------
  // A declaration says two things at once. Its *name as a type* is
  // the type of its instances, nominal the way `declare class` is:
  // only the class and the classes extending it produce one. Its
  // *name as a value* is the class table — the statics, the class
  // it extends (`ParentClass`), and the `new` that builds an
  // instance, which is an ordinary function and can be called as
  // one. An instance reaches its own class back through
  // `ClassObject`.
  //
  // Members are resolved into one shape, filled in two passes: the
  // fields first, then the functions. That order is what lets a
  // method body read `this.x` while the class it belongs to is
  // still being worked out.
  // ============================================================
  classShapes = /* @__PURE__ */ new WeakMap();
  classValues = /* @__PURE__ */ new WeakMap();
  /** Identity for a class written as a value, which has no name to be known
   *  by: two of them are different types however alike they look. */
  classIdentities = /* @__PURE__ */ new WeakMap();
  classIdentityCount = 0;
  /** The class whose members are being read, so `super` knows its base. */
  currentClass;
  withClass(stmt, fn2) {
    const previous = this.currentClass;
    this.currentClass = stmt;
    try {
      return fn2();
    } finally {
      this.currentClass = previous;
    }
  }
  /** What the class is known by. A declaration is known by its name, the way
   *  a `declare class` is — that is what makes it the same class across
   *  modules. A class written as a value is known by where it is written. */
  classIdentity(stmt) {
    if (stmt.type === "ClassDeclaration") return stmt.name.name;
    let identity = this.classIdentities.get(stmt);
    if (!identity) {
      identity = `${stmt.name?.name ?? "class"}@${++this.classIdentityCount}`;
      this.classIdentities.set(stmt, identity);
    }
    return identity;
  }
  /** What it is *shown* as. A class written as a value has no name of its
   *  own, so it borrows the one it is being bound to — `const Counter =
   *  class ... end` reads as `Counter` everywhere. */
  className(stmt) {
    return stmt.name?.name ?? this.classDisplayNames.get(stmt) ?? "(class)";
  }
  classDisplayNames = /* @__PURE__ */ new WeakMap();
  /** `const Name = class ... end` — the name the class will be known by. */
  nameClassExpressions(stmt) {
    stmt.names.forEach((target, i) => {
      const value = stmt.init[i];
      if (target.type === "IdentifierPattern" && value?.type === "ClassExpression" && !value.name) {
        this.classDisplayNames.set(value, target.name);
      }
    });
  }
  classTypeParams(stmt) {
    return stmt.type === "ClassDeclaration" ? stmt.typeParams : [];
  }
  /** The class a declaration extends, when it is one written in this file.
   *  An imported class is reached through its type and its value instead. */
  superDecl(stmt) {
    if (!stmt.superclass) return void 0;
    const base = this.aliasDefs.get(stmt.superclass.name)?.runtimeClass;
    return base && base !== stmt && !this.extendsThrough(base, stmt) ? base : void 0;
  }
  /** Does `from` reach `target` by `extends`? Guards against a cycle turning
   *  resolution into a loop. */
  extendsThrough(from, target) {
    const seen = /* @__PURE__ */ new Set();
    for (let cls = from; cls && !seen.has(cls); ) {
      if (cls === target) return true;
      seen.add(cls);
      cls = cls.superclass ? this.aliasDefs.get(cls.superclass.name)?.runtimeClass : void 0;
    }
    return false;
  }
  /** The instance type of what `stmt` extends, with the arguments it was
   *  extended with filled in — a class in this file, or any class type a
   *  name in scope stands for (an imported one). */
  baseInstance(stmt) {
    if (!stmt.superclass) return void 0;
    const written = (stmt.superArguments ?? []).map((argument) => this.resolveType(argument));
    if (this.aliasDefs.get(stmt.superclass.name)?.runtimeClass) {
      const local = this.superDecl(stmt);
      if (!local) return void 0;
      const base = this.instanceType(local);
      const params = this.classTypeParams(local);
      if (!params.length) return base;
      const applied = substitute(base, this.bindTypeArguments(params, written));
      return applied.kind === "object" ? applied : void 0;
    }
    const imported = this.importedTypes.get(stmt.superclass.name);
    const named = imported ? this.importedType(imported, stmt.superArguments ?? []) : this.aliases.get(stmt.superclass.name);
    return named && isClassType(named) ? named : void 0;
  }
  /** One instance type per declaration, so every mention of the class is the
   *  same object — the `this` of its own methods included. Members are read
   *  lazily for the reason `declare class` reads them lazily: a class can
   *  name itself, and two classes can name each other. */
  instanceType(stmt) {
    const cached = this.instanceTypes.get(stmt);
    if (cached) return cached;
    const name = this.className(stmt);
    const identity = this.classIdentity(stmt);
    const params = this.classTypeParams(stmt);
    const type = { kind: "object", name };
    this.instanceTypes.set(stmt, type);
    const own = params.map((p) => typeParam(p.name, p.constraint ? this.resolveType(p.constraint) : void 0));
    const info = () => {
      const base = this.baseInstance(stmt)?.class;
      const typeArguments = new Map(base?.typeArguments ?? []);
      if (own.length) typeArguments.set(identity, own);
      return {
        name: identity,
        superclass: base?.name,
        ancestors: [identity, ...base?.ancestors ?? []],
        typeArguments: typeArguments.size ? typeArguments : void 0
      };
    };
    Object.defineProperties(type, {
      properties: {
        enumerable: true,
        get: () => {
          const shape = this.shapeOf(stmt);
          const base = this.baseInstance(stmt)?.properties;
          const members = base?.size ? new Map([...base, ...shape.instance]) : new Map(shape.instance);
          members.set("ClassObject", { type: this.classValueType(stmt), optional: false, readonly: true });
          return members;
        }
      },
      class: { enumerable: true, get: info }
    });
    return type;
  }
  /** `Box<T>` as its own methods see it — a reference, not the object, so
   *  substituting the arguments in does not have to walk the class. */
  selfTypeOf(stmt) {
    const params = this.classTypeParams(stmt);
    if (!params.length || stmt.type !== "ClassDeclaration") return this.instanceType(stmt);
    return {
      kind: "genericRef",
      name: stmt.name.name,
      typeArguments: params.map((p) => typeParam(p.name, p.constraint ? this.resolveType(p.constraint) : void 0))
    };
  }
  /** The class table: the statics, what it inherits from the class it
   *  extends, `ParentClass`, `ClassObject`, and `new`. */
  classValueType(stmt) {
    const cached = this.classValues.get(stmt);
    if (cached) return cached;
    const type = objectType([]);
    this.classValues.set(stmt, type);
    type.name = `typeof ${this.className(stmt)}`;
    const shape = this.shapeOf(stmt);
    const local = this.superDecl(stmt);
    const parent = local ? this.classValueType(local) : stmt.superclass ? this.classStaticsByNameType(stmt.superclass.name) : void 0;
    if (parent?.kind === "object") {
      for (const [key, property] of parent.properties) {
        if (!CLASS_LINKS.has(key)) type.properties.set(key, property);
      }
    }
    for (const [key, property] of shape.statics) type.properties.set(key, property);
    const constructor = this.constructorType(stmt);
    const params = this.classTypeParams(stmt);
    type.properties.set("new", {
      type: fn(
        constructor?.params.filter((p) => p.name !== "this") ?? [],
        this.selfTypeOf(stmt),
        constructor?.varargs,
        params.map((p) => p.name)
      ),
      optional: false,
      readonly: true
    });
    type.properties.set("ParentClass", { type: parent ?? nilType, optional: false, readonly: true });
    return type;
  }
  /** The value side of a class named by a binding rather than by a
   *  declaration in this file — an imported one. */
  classStaticsByNameType(name) {
    const id = this.classBindingByName(name);
    const declared = id !== void 0 ? this.bindingType.get(id) : void 0;
    return declared?.kind === "object" ? declared : void 0;
  }
  /** The binding a class name stands for, wherever it was declared. */
  classBindingByName(name) {
    for (const [id, binding] of this.scopes.bindings) {
      if (binding.name === name && binding.declaredBy === "class") return id;
    }
    return this.scopes.globalsByName.get(name);
  }
  /** What `super(...)` takes: the constructor of the class `stmt` extends,
   *  its own skipped. */
  baseConstructorType(stmt) {
    return this.constructorType(stmt, /* @__PURE__ */ new Set([stmt]));
  }
  /** A class's constructor signature — its own, or the one it inherits. */
  constructorType(stmt, seen = /* @__PURE__ */ new Set()) {
    if (seen.has(stmt)) return void 0;
    seen.add(stmt);
    const own = this.shapeOf(stmt).ctor;
    if (own) return own;
    const local = this.superDecl(stmt);
    if (local) return this.constructorType(local, seen);
    const parent = stmt.superclass ? this.classStaticsByNameType(stmt.superclass.name) : void 0;
    const inherited = parent && this.overloadsOf(this.propertyType(parent, "new"))[0];
    return inherited;
  }
  /** `super` as a value: the base class's instance members with the `this`
   *  slot already filled, because `super.m(a)` passes this instance. */
  superType(stmt) {
    const base = this.baseInstance(stmt);
    if (!base) return anyType;
    const entries = [];
    for (const [name, property] of base.properties) {
      const bound = this.overloadsOf(property.type);
      entries.push([name, bound.length ? {
        ...property,
        type: intersection(bound.map((f) => this.takesSelf(f) ? fn(f.params.slice(1), f.returns, f.varargs, f.typeParams) : f))
      } : property]);
    }
    return objectType(entries);
  }
  shapeOf(stmt) {
    const cached = this.classShapes.get(stmt);
    if (cached) return cached;
    const shape = { instance: /* @__PURE__ */ new Map(), statics: /* @__PURE__ */ new Map(), filling: true };
    this.classShapes.set(stmt, shape);
    const wasEmitting = this.emitDiagnostics;
    this.emitDiagnostics = false;
    try {
      this.withClass(stmt, () => this.withTypeParams(this.classTypeParams(stmt), () => {
        this.withSelfType(this.selfTypeOf(stmt), () => this.fillShape(stmt, shape));
      }));
    } finally {
      this.emitDiagnostics = wasEmitting;
      shape.filling = false;
    }
    return shape;
  }
  fillShape(stmt, shape) {
    const put = (isStatic, name, property) => {
      (isStatic ? shape.statics : shape.instance).set(name, property);
    };
    for (const member of stmt.members) {
      if (member.type !== "ClassField") continue;
      const type = member.typeAnnotation ? this.resolveType(member.typeAnnotation) : member.init ? widen(this.infer(member.init, /* @__PURE__ */ new Map())) : anyType;
      put(member.isStatic, member.name.name, { type, optional: false });
    }
    for (const member of stmt.members) {
      switch (member.type) {
        case "ClassField":
          break;
        case "ClassMethod": {
          this.paramsFromSignatures(member.func, member.signatures);
          const type = member.signatures?.length ? intersection(member.signatures.map((sig) => this.signatureToFnType(sig))) : this.inferFunctionBody(member.func, /* @__PURE__ */ new Map());
          put(member.isStatic, member.name.name, { type, optional: false });
          break;
        }
        case "ClassAccessor": {
          const signature = this.inferFunctionBody(member.func, /* @__PURE__ */ new Map());
          if (signature.kind !== "function") break;
          const target = member.isStatic ? shape.statics : shape.instance;
          const existing = target.get(member.name.name);
          if (member.kind === "get") {
            put(member.isStatic, member.name.name, {
              type: signature.returns,
              optional: false,
              readonly: existing === void 0 || existing.readonly !== false
            });
          } else {
            put(member.isStatic, member.name.name, {
              type: existing?.type ?? signature.params[signature.params.length - 1]?.type ?? anyType,
              optional: false,
              readonly: false
            });
          }
          break;
        }
        case "ClassConstructor": {
          const signature = this.inferFunctionBody(member.func, /* @__PURE__ */ new Map());
          if (signature.kind === "function") shape.ctor = signature;
          break;
        }
      }
    }
  }
  /** Bind the class's value, and check what its members say. Shared by the
   *  declaration and the expression forms. */
  visitClass(stmt, env) {
    this.checkClassDeclaration(stmt);
    const value = this.classValueType(stmt);
    this.withClass(stmt, () => this.withTypeParams(this.classTypeParams(stmt), () => {
      this.withSelfType(this.selfTypeOf(stmt), () => {
        for (const member of stmt.members) {
          if (member.type === "ClassField") {
            if (!member.init) continue;
            const declared = member.typeAnnotation ? this.resolveType(member.typeAnnotation) : void 0;
            if (declared) this.applyContext(member.init, declared);
            const actual = this.infer(member.init, env);
            if (declared && this.emitDiagnostics && !isAssignable(actual, declared)) {
              this.diagnostics.push({
                node: member.init,
                message: `Type '${formatType(actual)}' is not assignable to type '${formatType(declared)}'`
              });
            }
            continue;
          }
          this.checkParamOrder(member.func.params, member);
          for (const signature of member.signatures ?? []) {
            this.checkParamOrder(signature.params, member);
          }
          this.visitFunctionBody(member.func, env);
        }
      });
    }));
    return value;
  }
  /** What a class gets wrong, reported where it is written. */
  checkClassDeclaration(stmt) {
    if (!this.emitDiagnostics) return;
    const report = (node, message) => {
      this.diagnostics.push({ node, message });
    };
    const name = this.className(stmt);
    if (stmt.superclass) {
      const local = this.aliasDefs.get(stmt.superclass.name)?.runtimeClass;
      if (local && this.extendsThrough(local, stmt)) {
        report(stmt.superclass, `'${name}' cannot extend itself`);
      } else if (!this.baseInstance(stmt)) {
        const known = this.aliases.has(stmt.superclass.name) || this.importedTypes.has(stmt.superclass.name);
        report(stmt.superclass, known ? `'${stmt.superclass.name}' is not a class; a class can only extend another class` : `Cannot find class '${stmt.superclass.name}'`);
      }
    }
    for (const member of stmt.members) {
      if (member.type === "ClassConstructor") continue;
      if (CLASS_RESERVED.has(member.name.name)) {
        report(member.name, `'${member.name.name}' is what the compiler calls part of a class; a member cannot be named that`);
      }
    }
    const seen = /* @__PURE__ */ new Map();
    for (const member of stmt.members) {
      if (member.type === "ClassConstructor") {
        if (seen.has("constructor")) report(member, "A class has one constructor");
        seen.set("constructor", member.type);
        continue;
      }
      const key = `${member.isStatic ? "static " : ""}${member.name.name}`;
      const before = seen.get(key);
      const pair = member.type === "ClassAccessor" && before === "ClassAccessor";
      if (before !== void 0 && !pair) {
        report(member.name, `'${member.name.name}' is declared twice in class '${name}'`);
      }
      seen.set(key, member.type);
    }
    const constructor = stmt.members.find((m) => m.type === "ClassConstructor");
    if (stmt.superclass && this.baseInstance(stmt) && constructor && !callsSuper(constructor.func.body)) {
      report(constructor, `'${name}' extends '${stmt.superclass.name}', so its constructor must call 'super(...)'`);
    }
    const assigned = constructor ? assignedFields(constructor.func.body) : /* @__PURE__ */ new Set();
    for (const member of stmt.members) {
      if (member.type !== "ClassField" || member.isStatic || member.init) continue;
      if (assigned.has(member.name.name)) continue;
      const type = member.typeAnnotation ? this.withTypeParams(this.classTypeParams(stmt), () => this.resolveType(member.typeAnnotation)) : anyType;
      if (isAssignable(nilType, type)) continue;
      report(member.name, `'${member.name.name}' has no value: give it one, assign it in the constructor, or let its type admit nil`);
    }
  }
  /** `extends` must name a class, and the chain must end. */
  checkClass(stmt) {
    if (!stmt.superclass || !this.emitDiagnostics) return;
    const base = stmt.superclass.base;
    if (!this.aliasDefs.get(base)?.class) {
      const known = this.aliasDefs.has(base) || this.importedTypes.has(base);
      this.diagnostics.push({
        node: stmt.superclass,
        message: known ? `'${base}' is not a class; a class can only extend another class` : `Cannot find class '${base}'`
      });
    } else if (this.classChain(stmt).cyclic) {
      this.diagnostics.push({ node: stmt.superclass, message: `'${stmt.name.name}' cannot extend itself` });
    }
  }
  /** The class and the classes it extends, nearest first, read from the
   *  declarations — no type has to be resolved to know them. The walk stops
   *  at a superclass that is not a class. */
  classChain(stmt) {
    const ancestors = [stmt.name.name];
    for (let cls = stmt; cls?.superclass; ) {
      const base = cls.superclass.base;
      if (ancestors.includes(base)) return { ancestors, cyclic: true };
      cls = this.aliasDefs.get(base)?.class;
      if (!cls) break;
      ancestors.push(base);
    }
    return { ancestors, cyclic: false };
  }
  /** Seed global types from `declare` statements. Repeating a function name
   *  builds an *overload set* (an intersection, in declaration order) rather
   *  than replacing — which is how `typeof` gets one signature per result
   *  string. Any other value is simply redeclared: a sourcemap's
   *  `declare script: <this file's instance>` replaces the library's
   *  `declare script: LuaSourceContainer`. */
  /** Program `declare`s whose type depends on a value's, by name. */
  deferredDeclares = /* @__PURE__ */ new Map();
  /** A library that declares a name a second time adds to it rather than
   *  replacing it: `declare table: { find: ... }` on top of Lua's `table`
   *  leaves both members there, the way overloads of a function accumulate.
   *  This is what lets one definitions file build on another's — Luau's on
   *  Lua's, Roblox's on Luau's. A property declared twice takes its later
   *  type. Classes stay as they are: they come from one generated file and
   *  merging them would only blur it. */
  mergeDeclared(prev, next) {
    if (!prev || prev.kind !== "object" || next.kind !== "object") return next;
    if (prev.class || next.class) return next;
    return objectType(
      [...prev.properties, ...next.properties],
      next.indexer ?? prev.indexer,
      next.frozen ?? prev.frozen
    );
  }
  harvestDeclares(block, own = false) {
    for (const stmt of block.statements) {
      if (stmt.type !== "DeclareStatement") continue;
      if (own && (containsTypeQuery(stmt.valueType) || referencedTypeNames(stmt.valueType).some((name) => this.dependsOnTypeQuery(name)))) {
        this.deferredDeclares.set(stmt.name, stmt);
        continue;
      }
      const t = this.resolveType(stmt.valueType);
      const prev = this.libGlobalTypes.get(stmt.name);
      const overload = prev && stmt.valueType.type === "FunctionTypeNode" && (prev.kind === "function" || prev.kind === "intersection");
      this.libGlobalTypes.set(
        stmt.name,
        overload ? intersection([prev, t]) : this.mergeDeclared(prev, t)
      );
    }
  }
  resolveAllAliases() {
    for (const [name, def] of this.aliasDefs) {
      if (def.class && !this.program.body.statements.includes(def.class)) {
        const cls = def.class;
        this.aliases.defer(name, () => this.classType(cls));
        continue;
      }
      if (this.dependsOnTypeQuery(name)) continue;
      this.withTypeParams(def.params, () => {
        this.aliases.set(name, this.resolveDef(def));
      });
    }
  }
  typeQueryDependents = /* @__PURE__ */ new Map();
  /** Does alias `name` contain a `typeof`, itself or through an alias it
   *  names? */
  dependsOnTypeQuery(name, visiting = /* @__PURE__ */ new Set()) {
    const known = this.typeQueryDependents.get(name);
    if (known !== void 0) return known;
    const def = this.aliasDefs.get(name);
    if (!def || def.class || visiting.has(name)) return false;
    visiting.add(name);
    const result = containsTypeQuery(def.node) || referencedTypeNames(def.node).some((other) => other !== name && this.dependsOnTypeQuery(other, visiting));
    visiting.delete(name);
    this.typeQueryDependents.set(name, result);
    return result;
  }
  /** The aliases `resolveAllAliases` left for later, now that every binding
   *  has its type. */
  /** Names this file imports. A module that could not be found is reported
   *  as the missing module it is; the names it was to bring are not also
   *  typos. */
  importedNames() {
    if (this.imported) return this.imported;
    this.imported = /* @__PURE__ */ new Set();
    for (const statement of this.program.body.statements) {
      if (statement.type !== "ImportStatement") continue;
      if (statement.defaultImport) this.imported.add(statement.defaultImport.name);
      if (statement.namespaceImport) this.imported.add(statement.namespaceImport.name);
      for (const specifier of statement.specifiers) this.imported.add(specifier.local.name);
    }
    return this.imported;
  }
  imported;
  /** What a `return` gives, against what the function declared. */
  checkReturn(stmt, declared, types, sources, env) {
    if (!declared || !this.emitDiagnostics) return;
    if (declared.kind === "any" || declared.kind === "unknown" || this.namesNothing(declared)) return;
    const actual = stmt.arguments.length === 0 ? nilType : types.length === 1 ? types[0] : tuple([...types], true);
    const source = stmt.arguments.length === 1 ? sources[0] : void 0;
    const fits = source ? this.fitsAnnotation(source, declared, actual, env) : isAssignable(actual, declared) || isAssignable(widen(actual), declared);
    if (fits) return;
    this.diagnostics.push({
      node: stmt,
      message: `Type '${formatType(actual)}' is not assignable to '${briefType(declared)}'`
    });
  }
  /** A function that declared what it returns but never does. Only a body
   *  with no `return` at all is reported: anything subtler needs to know
   *  which paths can run off the end, and a wrong guess there is worse than
   *  a missing complaint. */
  checkReturnsAtAll(func, declared) {
    if (!declared || !this.emitDiagnostics) return;
    if (func.predicate) return;
    if (declared.kind === "any" || declared.kind === "unknown" || declared.kind === "never") return;
    if (isAssignable(nilType, declared) || this.namesNothing(declared)) return;
    let found = false;
    const walk = (statements) => {
      for (const statement of statements) {
        if (found) return;
        if (statement.type === "ReturnStatement") {
          found = true;
          return;
        }
        for (const value of Object.values(statement)) {
          if (value && typeof value === "object" && "statements" in value) {
            walk(value.statements);
          } else if (Array.isArray(value)) {
            for (const item of value) {
              const block = item;
              if (block?.body?.statements) walk(block.body.statements);
            }
          }
        }
      }
    };
    walk(func.body.statements);
    if (found) return;
    this.diagnostics.push({
      node: func.body,
      message: `A function that returns '${briefType(declared)}' must return a value`
    });
  }
  /** Does this type rest on a name nothing declares? Such a type says
   *  nothing about what fits it, so checking against it only piles a second
   *  complaint on top of "Cannot find name". */
  namesNothing(t, seen = /* @__PURE__ */ new Set()) {
    if (seen.has(t)) return false;
    seen.add(t);
    if (t.kind === "genericRef") {
      return !this.aliasDefs.has(t.name) && !this.importedTypes.has(t.name) && this.options.libTypes?.[t.name] === void 0;
    }
    switch (t.kind) {
      case "union":
      case "intersection":
        return t.types.some((m) => this.namesNothing(m, seen));
      case "array":
        return this.namesNothing(t.element, seen);
      case "tuple":
        return t.elements.some((e) => this.namesNothing(e, seen));
      case "object":
        if (t.class) return false;
        return [...t.properties.values()].some((v) => this.namesNothing(v.type, seen));
      default:
        return false;
    }
  }
  /** Every type name in the program that resolved to nothing — a typo, or a
   *  library the config does not load. A name that resolves to a type
   *  parameter, an alias (even one still being resolved), an imported type or
   *  a primitive is fine; what is left is a reference that stayed itself. */
  reportUnknownTypes() {
    if (!this.emitDiagnostics) return;
    const reported = /* @__PURE__ */ new Set();
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      const record = node;
      if (record.type === "TypeReference" && typeof record.base === "string") {
        const name = typeof record.namespace === "string" ? `${record.namespace}.${record.base}` : record.base;
        const resolved = this.typeOfTypeNode.get(node);
        const unresolved = resolved?.kind === "genericRef" && resolved.name === name && !this.aliasDefs.has(name) && !this.importedTypes.has(name) && this.options.libTypes?.[name] === void 0 && !STRING_INTRINSICS.has(name) && !this.importedNames().has(name.split(".")[0]);
        const at = node;
        const key = `${at.line.start}:${at.column.start}`;
        if (unresolved && !reported.has(key)) {
          reported.add(key);
          this.diagnostics.push({ node, message: `Cannot find name '${name}'` });
        }
      }
      for (const [key, value] of Object.entries(node)) {
        if (key !== "line" && key !== "column" && value && typeof value === "object") visit(value);
      }
    };
    visit(this.program.body);
  }
  /** Deferred `declare`s nothing used, typed now for tools that ask. */
  resolveDeferredDeclares() {
    for (const name of this.deferredDeclares.keys()) {
      const id = this.scopes.globalsByName.get(name);
      if (id !== void 0 && !this.bindingType.has(id)) this.bindingType.set(id, this.declaredAhead(id) ?? anyType);
    }
  }
  resolveDeferredAliases() {
    for (const [name, def] of this.aliasDefs) {
      if (this.aliases.has(name)) continue;
      this.withTypeParams(def.params, () => {
        this.aliases.set(name, this.resolveDef(def));
      });
    }
    return this.aliases;
  }
  withTypeParams(params, fn2) {
    const start = this.typeParamScope.length;
    for (const p of params) this.typeParamScope.push({ name: p.name, isConst: p.isConst });
    for (let i = 0; i < params.length; i++) {
      if (params[i].constraint) {
        this.typeParamScope[start + i].constraint = this.resolveType(params[i].constraint);
      }
    }
    try {
      return fn2();
    } finally {
      this.typeParamScope.length = start;
    }
  }
  lookupTypeParam(name) {
    for (let i = this.typeParamScope.length - 1; i >= 0; i--) {
      if (this.typeParamScope[i].name === name) return this.typeParamScope[i];
    }
    return void 0;
  }
  /** Instantiate a generic alias: `Box<number>` -> `{ value: number }`. */
  instantiateAlias(def, args) {
    if (this.instantiationDepth > 20) return unknownType;
    const subst = this.bindTypeArguments(def.params, args);
    if (def.runtimeClass) return substitute(this.instanceType(def.runtimeClass), subst);
    this.instantiationDepth++;
    try {
      const body = this.withTypeParams(def.params, () => this.resolveType(def.node));
      return this.reduceType(substitute(body, subst));
    } finally {
      this.instantiationDepth--;
    }
  }
  /** Pair written type arguments with the parameters they instantiate. A
   *  pack parameter (`T...`) takes every argument from its position on, as
   *  one pack: `Signal<Instance, string>` binds `T` to `(Instance, string)`,
   *  and `Signal<()>` to the empty pack. Left out, a parameter takes its
   *  default (`T... = ...any` is `any`), or `unknown`. */
  bindTypeArguments(params, args) {
    const subst = /* @__PURE__ */ new Map();
    params.forEach((p, i) => {
      let arg = args[i];
      if (p.isPack && i < args.length) {
        const rest = args.slice(i);
        const single = rest.length === 1 ? rest[0] : void 0;
        arg = single && (single.kind === "tuple" && single.isPack || single.kind === "typeParam" || single.kind === "any") ? single : tuple([...rest], true);
      }
      subst.set(p.name, arg ?? (p.default ? this.resolveType(p.default) : unknownType));
    });
    return subst;
  }
  /** An imported type, with its type arguments applied. */
  importedType(imported, typeArguments) {
    if (!imported.params.length) return imported.type;
    const subst = /* @__PURE__ */ new Map();
    imported.params.forEach((name, i) => {
      const arg = typeArguments[i];
      subst.set(name, arg ? this.resolveType(arg) : unknownType);
    });
    return this.reduceType(substitute(imported.type, subst));
  }
  // --------------------------------------------------------
  // TypeNode -> Type
  // --------------------------------------------------------
  resolveType(node) {
    const type = this.resolveTypeNode(node);
    if (this.instantiationDepth === 0) this.typeOfTypeNode.set(node, type);
    return type;
  }
  resolveTypeNode(node) {
    switch (node.type) {
      case "TypeReference": {
        const name = node.namespace ? `${node.namespace}.${node.base}` : node.base;
        switch (node.base) {
          case "any":
            return anyType;
          case "unknown":
            return unknownType;
          case "never":
            return neverType;
          case "nil":
            return nilType;
          case "boolean":
            return booleanType;
          case "number":
            return numberType;
          case "string":
            return stringType;
          case "thread":
            return primitive("thread");
          case "buffer":
            return primitive("buffer");
        }
        if (!node.namespace) {
          const tp = this.lookupTypeParam(node.base);
          if (tp) return typeParam(tp.name, tp.constraint, tp.isConst);
          if (node.typeArguments.length === 1 && !this.aliasDefs.has(node.base)) {
            const intrinsic = this.applyStringIntrinsic(
              node.base,
              this.resolveType(node.typeArguments[0])
            );
            if (intrinsic) return intrinsic;
          }
          if (this.aliasDefs.has(node.base)) {
            return this.expand({
              kind: "genericRef",
              name: node.base,
              typeArguments: node.typeArguments.map((a) => this.resolveType(a))
            });
          }
          const imported = this.importedTypes.get(node.base);
          if (imported) return this.importedType(imported, node.typeArguments);
          const lib = this.options.libTypes?.[node.base];
          if (lib) return lib;
        } else if (this.importedTypes.has(name)) {
          return this.importedType(this.importedTypes.get(name), node.typeArguments);
        } else if (this.aliasDefs.has(name)) {
          return this.expand({
            kind: "genericRef",
            name,
            typeArguments: node.typeArguments.map((a) => this.resolveType(a))
          });
        }
        return {
          kind: "genericRef",
          name,
          typeArguments: node.typeArguments.map((a) => this.resolveType(a))
        };
      }
      case "TypeLiteralString":
        return literal(node.value);
      case "TypeLiteralBoolean":
        return literal(node.value);
      case "TypeLiteralNumber":
        return literal(node.value);
      case "ArrayTypeNode":
        return arrayOf(this.resolveType(node.element));
      case "TupleTypeNode":
        return tuple(node.elements.map((e) => this.resolveType(e)));
      case "UnionTypeNode":
        return union(node.types.map((t) => this.resolveType(t)));
      case "IntersectionTypeNode":
        return intersection(node.types.map((t) => this.resolveType(t)));
      case "ParenthesizedTypeNode":
        return this.resolveType(node.typeAnnotation);
      case "TableTypeNode": {
        const entries = [];
        const seen = /* @__PURE__ */ new Map();
        let indexer = void 0;
        for (const p of node.properties) {
          if (p.type === "TableTypeIndexer") {
            indexer = { key: this.resolveType(p.keyType), value: this.resolveType(p.valueType) };
            continue;
          }
          const vt = this.resolveType(p.valueType);
          const at = seen.get(p.name);
          if (at !== void 0) {
            const prev = entries[at][1];
            entries[at] = [p.name, { ...prev, type: intersection([prev.type, vt]) }];
            continue;
          }
          seen.set(p.name, entries.length);
          entries.push([p.name, { type: vt, optional: p.optional, readonly: p.readonly }]);
        }
        return objectType(entries, indexer);
      }
      case "FunctionTypeNode": {
        const names = node.generics.map((g) => g.name);
        return this.withTypeParams(node.generics, () => {
          const params = node.params.filter((p) => !p.rest).map((p) => ({
            name: p.name,
            type: p.optional ? optional(this.resolveType(p.typeAnnotation)) : this.resolveType(p.typeAnnotation),
            optional: p.optional
          }));
          const restParam = node.params.find((p) => p.rest);
          const restElement = restParam ? this.resolveType(restParam.typeAnnotation) : void 0;
          return this.withTypeParamDefaults(fn(
            params,
            this.resolveType(node.returnType),
            restParam ? restElement?.kind === "array" ? restElement.element : unknownType : node.hasVarargs ? node.varargType ? this.resolveType(node.varargType) : anyType : void 0,
            names,
            this.resolvePredicate(node.predicate, params)
          ), node.generics);
        });
      }
      case "TypeofTypeNode": {
        return this.infer(node.expression, /* @__PURE__ */ new Map());
      }
      case "TemplateLiteralTypeNode":
        return this.reduceType({
          kind: "templateLiteral",
          quasis: node.quasis,
          types: node.types.map((x) => this.resolveType(x))
        });
      case "DifferenceTypeNode":
        return this.reduceType({
          kind: "difference",
          base: this.resolveType(node.base),
          excluded: this.resolveType(node.excluded)
        });
      case "KeyofTypeNode":
        return this.reduceType({ kind: "keyof", target: this.resolveType(node.target) });
      case "IndexedAccessTypeNode":
        return this.reduceType({
          kind: "indexedAccess",
          objectType: this.resolveType(node.objectType),
          indexType: this.resolveType(node.indexType)
        });
      case "InferTypeNode":
        return { kind: "infer", name: node.name };
      case "ConditionalTypeNode": {
        const inferVars = collectInferNames(node.extendsType);
        const checkType = this.resolveType(node.checkType);
        const extendsType = this.resolveType(node.extendsType);
        const build = () => this.reduceType({
          kind: "conditional",
          checkType,
          extendsType,
          trueType: this.resolveType(node.trueType),
          falseType: this.resolveType(node.falseType),
          inferVars,
          // Distribution applies only to a *naked* type parameter.
          distributeParam: node.checkType.type === "TypeReference" && !node.checkType.namespace && this.lookupTypeParam(node.checkType.base) !== void 0 ? node.checkType.base : void 0
        });
        return inferVars.length ? this.withTypeParams(
          inferVars.map((name) => ({ type: "GenericTypeParameter", name })),
          build
        ) : build();
      }
      case "MappedTypeNode": {
        const constraint = this.resolveType(node.constraint);
        const source = node.constraint.type === "KeyofTypeNode" ? this.resolveType(node.constraint.target) : void 0;
        return this.withTypeParams(
          [{ type: "GenericTypeParameter", name: node.parameter }],
          () => this.reduceType({
            kind: "mapped",
            parameter: node.parameter,
            constraint,
            nameType: node.nameType && this.resolveType(node.nameType),
            template: this.resolveType(node.template),
            optional: node.optional,
            readonly: node.readonly,
            source
          })
        );
      }
      case "VariadicTypeNode":
        return this.resolveType(node.typeAnnotation);
      case "TypePackNode": {
        if (node.types.length === 1 && !node.hasVarargs) return this.resolveType(node.types[0]);
        if (!node.types.length && node.varargType) return this.resolveType(node.varargType);
        return tuple(node.types.map((t) => this.resolveType(t)), true);
      }
    }
  }
  // --------------------------------------------------------
  // Type-level operators
  // --------------------------------------------------------
  //
  // `keyof`, `T[K]`, `C extends E ? A : B` and `{ [K in C]: V }` are built by
  // `resolveType` as deferred nodes and collapsed here as soon as their
  // inputs stop mentioning an unresolved type parameter. Every utility type
  // (`Partial`, `ReturnType`, `Exclude`, ...) is written in `luau.d.luaut` on
  // top of these — none of them is known to the analyzer by name.
  /** Evaluate every type-level operator in `t` that is ready to be evaluated.
   *  Anything still waiting on a type parameter is returned untouched, to be
   *  reduced again after the next substitution. */
  reduceType(t) {
    if (this.reduceDepth > 24) return unknownType;
    const cached = this.reduceCache.get(t);
    if (cached !== void 0) return cached;
    this.reduceDepth++;
    try {
      const result = this.reduceTypeInner(t);
      if (result.kind !== "keyof") this.reduceCache.set(t, result);
      return result;
    } finally {
      this.reduceDepth--;
    }
  }
  reduceTypeInner(t) {
    {
      switch (t.kind) {
        case "keyof": {
          const target = this.reduceType(t.target);
          if (containsTypeParam(target)) return { kind: "keyof", target };
          if (target.kind === "genericRef" && this.resolvingAliases.has(target.name)) return t;
          return this.keysOf(target);
        }
        case "indexedAccess": {
          const objectType2 = this.reduceType(t.objectType);
          const indexType = this.reduceType(t.indexType);
          if (containsTypeParam(objectType2) || containsTypeParam(indexType)) {
            return { kind: "indexedAccess", objectType: objectType2, indexType };
          }
          return this.accessType(objectType2, indexType);
        }
        case "templateLiteral":
          return this.reduceTemplateLiteral(t);
        case "difference":
          return difference(this.reduceType(t.base), this.reduceType(t.excluded));
        case "genericRef": {
          if (t.typeArguments.length !== 1 || this.aliasDefs.has(t.name)) return t;
          return this.applyStringIntrinsic(t.name, t.typeArguments[0]) ?? t;
        }
        case "conditional":
          return this.reduceConditional(t);
        case "mapped":
          return this.reduceMapped(t);
        case "union":
          return union(t.types.map((m) => this.reduceType(m)));
        case "intersection": {
          const r = intersection(t.types.map((m) => this.reduceType(m)));
          return t.name && r.kind === "intersection" && !r.name ? { ...r, name: t.name } : r;
        }
        case "array":
          return arrayOf(this.reduceType(t.element));
        case "tuple":
          return tuple(t.elements.map((e) => this.reduceType(e)), t.isPack);
        case "function":
          return fn(
            t.params.map((p) => ({ ...p, type: this.reduceType(p.type) })),
            this.reduceType(t.returns),
            t.varargs && this.reduceType(t.varargs),
            t.typeParams,
            t.predicate
          );
        case "object": {
          if (t.class) return t;
          const entries = [];
          for (const [k, v] of t.properties) entries.push([k, { ...v, type: this.reduceType(v.type) }]);
          const reduced = objectType(entries, t.indexer && {
            key: this.reduceType(t.indexer.key),
            value: this.reduceType(t.indexer.value)
          }, t.frozen);
          if (t.name) reduced.name = t.name;
          return reduced;
        }
        default:
          return t;
      }
    }
  }
  /** `keyof T`. A union's keys are the ones every member has (an
   *  intersection), which is what TypeScript does and what keeps
   *  `keyof (A | B)` safe to index with. */
  keysOf(raw) {
    const t = this.expand(raw);
    switch (t.kind) {
      case "object": {
        const keys = [...t.properties.keys()].map((k) => literal(k));
        if (t.indexer) keys.push(t.indexer.key);
        return union(keys);
      }
      case "array":
      case "tuple":
        return numberType;
      case "union":
        return intersection(t.types.map((m) => this.keysOf(m)));
      case "intersection":
        return union(t.types.map((m) => this.keysOf(m)));
      case "any":
        return union([stringType, numberType]);
      case "difference":
        return this.keysOf(t.base);
      default:
        return neverType;
    }
  }
  /** `T[K]`, distributing over a union index (`T["a" | "b"]`). */
  accessType(obj, index) {
    if (index.kind === "union") return union(index.types.map((m) => this.accessType(obj, m)));
    if (index.kind === "literal" && typeof index.value === "string") {
      const member = this.propertyType(obj, index.value);
      if (member.kind !== "unknown") return member;
      const t = this.expand(obj);
      return t.kind === "object" && !t.class && !t.indexer ? nilType : member;
    }
    return this.indexedType(obj, index);
  }
  /** A template literal whose every interpolation is a union of string
   *  literals expands to the union of all concatenations (the cross
   *  product). Anything wider — `string`, `number` — leaves it a pattern
   *  that `isAssignable` matches literal strings against. */
  reduceTemplateLiteral(t) {
    const types = t.types.map((x) => this.reduceType(x));
    if (types.some((x) => containsTypeParam(x))) return { ...t, types };
    const literalsOf = (x) => {
      const members = x.kind === "union" ? x.types : [x];
      const out = [];
      for (const m of members) {
        if (m.kind !== "literal") return void 0;
        out.push(String(m.value));
      }
      return out;
    };
    let combos = [t.quasis[0]];
    for (let i = 0; i < types.length; i++) {
      const parts = literalsOf(types[i]);
      if (!parts) return { ...t, types };
      const next = [];
      for (const head of combos) for (const part of parts) next.push(head + part + t.quasis[i + 1]);
      if (next.length > 512) return { ...t, types };
      combos = next;
    }
    return union(combos.map((c) => literal(c)));
  }
  /** TypeScript's four string intrinsics. They cannot be written in luaut —
   *  there is no character-level type arithmetic — so the analyzer supplies
   *  them, and only them, as named type functions. */
  applyStringIntrinsic(name, arg) {
    const apply = (v) => {
      switch (name) {
        case "Uppercase":
          return v.toUpperCase();
        case "Lowercase":
          return v.toLowerCase();
        case "Capitalize":
          return v.charAt(0).toUpperCase() + v.slice(1);
        default:
          return v.charAt(0).toLowerCase() + v.slice(1);
      }
    };
    if (!["Uppercase", "Lowercase", "Capitalize", "Uncapitalize"].includes(name)) return void 0;
    const t = this.reduceType(arg);
    if (t.kind === "union") return union(t.types.map((m) => this.applyStringIntrinsic(name, m) ?? m));
    if (t.kind === "literal" && t.base === "string") return literal(apply(String(t.value)));
    return containsTypeParam(t) ? void 0 : stringType;
  }
  reduceConditional(t) {
    const checkType = this.reduceType(t.checkType);
    const extendsType = this.reduceType(t.extendsType);
    const free = new Set(t.inferVars);
    if (containsTypeParam(checkType) || containsTypeParam(extendsType, /* @__PURE__ */ new Set(), free)) {
      return { ...t, checkType, extendsType };
    }
    if (t.distributeParam && checkType.kind === "union") {
      return union(checkType.types.map((m) => this.branchOf(t, m)));
    }
    return this.branchOf(t, checkType);
  }
  /** Pick one branch of a conditional for a single (non-distributed) check
   *  type, binding any `infer` names from the `extends` clause first. */
  branchOf(t, check) {
    const bindings = /* @__PURE__ */ new Map();
    if (t.distributeParam) bindings.set(t.distributeParam, check);
    const extendsType = this.reduceType(t.extendsType);
    const matched = matchInfer(check, extendsType, bindings) && isAssignable(check, this.stripInfer(extendsType, bindings));
    if (!matched) return this.reduceType(substitute(t.falseType, bindings));
    for (const name of t.inferVars) if (!bindings.has(name)) bindings.set(name, unknownType);
    return this.reduceType(substitute(t.trueType, bindings));
  }
  /** Replace the `infer` placeholders in an `extends` clause with what they
   *  bound to, so the clause can be used as an ordinary assignability target.
   *  An unbound one becomes `unknown` — it constrains nothing. */
  stripInfer(t, bindings) {
    switch (t.kind) {
      case "infer":
        return bindings.get(t.name) ?? unknownType;
      case "array":
        return arrayOf(this.stripInfer(t.element, bindings));
      case "tuple":
        return tuple(t.elements.map((e) => this.stripInfer(e, bindings)));
      case "union":
        return union(t.types.map((m) => this.stripInfer(m, bindings)));
      case "intersection":
        return intersection(t.types.map((m) => this.stripInfer(m, bindings)));
      case "function":
        return fn(
          t.params.map((p) => ({ ...p, type: this.stripInfer(p.type, bindings) })),
          this.stripInfer(t.returns, bindings),
          t.varargs && this.stripInfer(t.varargs, bindings),
          t.typeParams
        );
      case "object": {
        if (t.class) return t;
        const entries = [];
        for (const [k, v] of t.properties) entries.push([k, { ...v, type: this.stripInfer(v.type, bindings) }]);
        return objectType(entries, t.indexer && {
          key: this.stripInfer(t.indexer.key, bindings),
          value: this.stripInfer(t.indexer.value, bindings)
        });
      }
      default:
        return t;
    }
  }
  /** `{ [K in C]: V }` — build one property per key in `C`. A key that is a
   *  bare `string` / `number` becomes an indexer instead (`Record<string, V>`
   *  is `{ [string]: V }`, not a property literally named "string"). */
  reduceMapped(t) {
    const constraint = this.reduceType(t.constraint);
    if (containsTypeParam(constraint)) return { ...t, constraint };
    const source = t.source ? this.expand(this.reduceType(t.source)) : void 0;
    const members = constraint.kind === "union" ? constraint.types : [constraint];
    const entries = [];
    let indexer;
    for (const key of members) {
      const bound = /* @__PURE__ */ new Map([[t.parameter, key]]);
      const value = this.reduceType(substitute(t.template, bound));
      if (key.kind === "primitive" && (key.name === "string" || key.name === "number")) {
        indexer = mergeIndexer(indexer, { key, value });
        continue;
      }
      if (key.kind !== "literal") continue;
      let name = String(key.value);
      if (t.nameType) {
        const remapped = this.reduceType(substitute(t.nameType, bound));
        if (remapped.kind !== "literal") continue;
        name = String(remapped.value);
      }
      const from = source?.kind === "object" ? source.properties.get(String(key.value)) : void 0;
      entries.push([name, {
        type: value,
        optional: t.optional ?? from?.optional ?? false,
        readonly: t.readonly ?? from?.readonly
      }]);
    }
    return objectType(entries, indexer);
  }
  // --------------------------------------------------------
  // Statements
  // --------------------------------------------------------
  visitBlock(block, env) {
    for (const stmt of block.statements) this.visitStatement(stmt, env);
  }
  visitStatement(stmt, env) {
    switch (stmt.type) {
      case "VariableDeclaration": {
        this.nameClassExpressions(stmt);
        stmt.names.forEach((target, i) => {
          if (target.type === "IdentifierPattern" && target.typeAnnotation && stmt.init[i]) {
            this.applyContext(stmt.init[i], this.resolveType(target.typeAnnotation));
          }
        });
        const { types: valueTypes, sources } = this.valueList(stmt.init, env, stmt.names.length);
        stmt.names.forEach((target, i) => {
          const inferred = valueTypes[i] ?? (stmt.init.length ? unknownType : nilType);
          const source = sources[i];
          if (this.emitDiagnostics && target.type === "IdentifierPattern" && target.typeAnnotation && source) {
            const declared = this.resolveType(target.typeAnnotation);
            if (declared.kind !== "any" && !this.namesNothing(declared) && !this.fitsAnnotation(source, declared, inferred, env)) {
              this.diagnostics.push({
                node: stmt,
                message: `Type '${formatType(inferred)}' is not assignable to '${formatType(declared)}'`
              });
            } else if (declared.kind !== "any") {
              this.reportExcessProperties(source, declared);
            }
          }
          const mode = this.initIsAsConst(source) ? "asconst" : !isFreshLiteralExpr(source) ? "keep" : stmt.kind === "const" ? "const" : "widen";
          this.bindPattern(target, inferred, env, mode);
          if (stmt.kind === "const") {
            this.correlateDestructuring(target, inferred, env);
            this.correlateIndexed(target, source, env);
            this.aliasReference(target, source);
          }
        });
        return;
      }
      case "ClassDeclaration": {
        const id = this.bindingIdByName(stmt.name.name, stmt.name);
        const value = this.visitClass(stmt, env);
        if (id !== void 0) {
          this.bindingType.set(id, value);
          this.setBinding(env, id, value);
        }
        return;
      }
      case "FunctionDeclaration": {
        this.checkParamOrder(stmt.func.params, stmt);
        for (const sig of stmt.signatures ?? []) this.checkParamOrder(sig.params, stmt);
        const id = this.bindingIdByName(stmt.name.name, stmt.name);
        this.paramsFromSignatures(stmt.func, stmt.signatures);
        const fnType = stmt.signatures?.length ? intersection(stmt.signatures.map((s) => this.signatureToFnType(s))) : this.inferFunctionBody(stmt.func, env);
        if (id !== void 0) {
          this.bindingType.set(id, fnType);
          this.setBinding(env, id, fnType);
        }
        this.visitFunctionBody(stmt.func, env);
        return;
      }
      case "FunctionDeclarationStatement": {
        this.checkParamOrder(stmt.func.params, stmt);
        for (const sig of stmt.signatures ?? []) this.checkParamOrder(sig.params, stmt);
        const targetId = this.bindingIdOf(stmt.target.base);
        const memberName = stmt.target.method?.name ?? (stmt.target.path.length === 1 ? stmt.target.path[0].name : void 0);
        if (memberName === void 0 && stmt.target.path.length === 0) {
          if (targetId !== void 0) {
            this.paramsFromSignatures(stmt.func, stmt.signatures);
            const fnType = stmt.signatures?.length ? intersection(stmt.signatures.map((s) => this.signatureToFnType(s))) : this.inferFunctionBody(stmt.func, env);
            this.bindingType.set(targetId, fnType);
            this.setBinding(env, targetId, fnType);
          }
          this.visitFunctionBody(stmt.func, env);
          return;
        }
        const recv = targetId === void 0 ? anyType : this.currentType(targetId, env);
        this.withSelfType(stmt.isMethod ? recv : void 0, () => {
          this.paramsFromSignatures(stmt.func, stmt.signatures);
          const fnType = stmt.signatures?.length ? intersection(stmt.signatures.map((s) => this.signatureToFnType(s))) : this.inferFunctionBody(stmt.func, env);
          if (memberName !== void 0 && targetId !== void 0) {
            const grown = intersection([
              recv,
              objectType([[memberName, { type: fnType, optional: false }]])
            ]);
            this.bindingType.set(targetId, grown);
            this.setBinding(env, targetId, grown);
          }
          this.visitFunctionBody(stmt.func, env);
        });
        return;
      }
      case "AssignmentStatement": {
        stmt.targets.forEach((target, i) => {
          const value = stmt.values[i];
          if (!value) return;
          if (target.type === "MemberExpression" || target.type === "IndexExpression") {
            this.applyContext(value, this.infer(target, env));
          } else if (target.type === "Identifier") {
            const id = this.bindingIdOf(target);
            if (id !== void 0 && this.annotated.has(id)) this.applyContext(value, this.bindingType.get(id));
          }
        });
        const { types: valueTypes, sources } = this.valueList(stmt.values, env, stmt.targets.length);
        stmt.targets.forEach((target, i) => {
          const vt = valueTypes[i] ?? unknownType;
          const source = sources[i];
          if (target.type === "Identifier") {
            const id = this.bindingIdOf(target);
            if (id !== void 0) {
              this.uncorrelate(id);
              const next = isFreshLiteralExpr(source) ? widen(vt) : vt;
              if (this.annotated.has(id)) {
                const declared = this.bindingType.get(id);
                if (this.emitDiagnostics && !isAssignable(next, declared) && declared.kind !== "any") {
                  this.diagnostics.push({
                    node: stmt,
                    message: `Type '${formatType(next)}' is not assignable to '${formatType(declared)}'`
                  });
                }
                this.setBinding(env, id, narrowTo(declared, next));
              } else {
                this.setBinding(env, id, next);
                this.bindingType.set(id, union([this.bindingType.get(id) ?? next, next]));
              }
            }
          } else if (target.type === "MemberExpression" || target.type === "IndexExpression") {
            this.infer(target, env);
            this.assignToRef(target, isFreshLiteralExpr(source) ? widen(vt) : vt, env);
          } else if (target.type === "ObjectPattern" || target.type === "ArrayPattern") {
            this.reassignPattern(target, vt, env);
          }
        });
        return;
      }
      case "CompoundAssignmentStatement":
        this.infer(stmt.target, env);
        this.infer(stmt.value, env);
        return;
      case "CallStatement":
        this.infer(stmt.expression, env);
        this.applyAssertion(stmt.expression, env);
        return;
      case "DoStatement":
        this.visitBlock(stmt.body, forkEnv(env));
        return;
      case "WhileStatement": {
        const condType = this.infer(stmt.condition, env);
        const { whenTrue, whenFalse } = this.narrowFromCondition(stmt.condition, env);
        const breaks = this.withBreakScope(() => this.visitBlock(stmt.body, whenTrue));
        const exits = isPossiblyFalsy(condType) ? [whenFalse, ...breaks] : breaks;
        this.applyLoopExits(exits, env);
        return;
      }
      case "RepeatStatement": {
        const bodyEnv = forkEnv(env);
        const breaks = this.withBreakScope(() => {
          this.visitBlock(stmt.body, bodyEnv);
          this.infer(stmt.condition, bodyEnv);
        });
        const { whenTrue } = this.narrowFromCondition(stmt.condition, bodyEnv);
        this.applyLoopExits([whenTrue, ...breaks], env);
        return;
      }
      case "IfStatement":
        this.visitIfStatement(stmt, env);
        return;
      case "NumericForStatement": {
        this.infer(stmt.start, env);
        this.infer(stmt.end, env);
        if (stmt.step) this.infer(stmt.step, env);
        const bodyEnv = forkEnv(env);
        const id = this.bindingIdByName(stmt.variable.name, stmt.variable);
        if (id !== void 0) {
          const t = stmt.variable.typeAnnotation ? this.resolveType(stmt.variable.typeAnnotation) : numberType;
          this.bindingType.set(id, t);
          this.setBinding(bodyEnv, id, t);
        }
        this.visitBlock(stmt.body, bodyEnv);
        return;
      }
      case "GenericForStatement": {
        const iterTypes = stmt.iterators.map((it) => this.infer(it, env));
        const bodyEnv = forkEnv(env);
        const rows = stmt.variables.length >= 2 ? this.iterationRows(stmt.iterators[0], iterTypes[0]) : void 0;
        if (rows) {
          const [key, value] = stmt.variables;
          this.bindPattern(key, union(rows.map((r) => r[0])), bodyEnv, "keep");
          this.bindPattern(value, union(rows.map((r) => r[1])), bodyEnv, "keep");
          stmt.variables.slice(2).forEach((v) => this.bindPattern(v, unknownType, bodyEnv, "widen"));
          const keyId = key.type === "IdentifierPattern" ? this.bindingIdByName(key.name, key) : void 0;
          const valueId = value.type === "IdentifierPattern" ? this.bindingIdByName(value.name, value) : void 0;
          if (keyId !== void 0 && valueId !== void 0) this.correlateBindings(bodyEnv, [keyId, valueId], rows);
        } else {
          const [keyT, valT] = this.iterationTypes(stmt.iterators[0], iterTypes[0], stmt.variables.length);
          stmt.variables.forEach((v, i) => {
            this.bindPattern(v, i === 0 ? keyT : i === 1 ? valT : unknownType, bodyEnv, "widen");
          });
        }
        this.visitBlock(stmt.body, bodyEnv);
        return;
      }
      case "ReturnStatement": {
        const declared = this.declaredReturns[this.declaredReturns.length - 1];
        if (declared) {
          if (stmt.arguments.length === 1) {
            this.applyContext(stmt.arguments[0], declared);
          } else if (declared.kind === "tuple" && declared.isPack) {
            stmt.arguments.forEach((a, i) => this.applyContext(a, declared.elements[i]));
          }
        }
        const want = declared?.kind === "tuple" && declared.isPack ? declared.elements.length : 0;
        const { types, sources } = this.valueList(stmt.arguments, env, want);
        this.checkReturn(stmt, declared, types, sources, env);
        if (this.returnTypes) {
          this.returnTypes.push(stmt.arguments.length === 0 ? nilType : types.length === 1 ? types[0] : tuple([...types], true));
        }
        return;
      }
      case "ExportStatement":
        this.visitStatement(stmt.declaration, env);
        return;
      case "ExportDefaultStatement":
        if (stmt.declaration.type === "ClassDeclaration") this.visitStatement(stmt.declaration, env);
        else this.infer(stmt.declaration, env);
        return;
      case "ExportNamedStatement": {
        if (stmt.source) {
          this.checkReexport(stmt.source, stmt.specifiers.map((s) => s.local));
          return;
        }
        for (const s of stmt.specifiers) {
          if (this.bindingIdOf(s.local) !== void 0) {
            this.infer(s.local, env);
          } else if (!this.aliasDefs.has(s.local.name) && !this.importedTypes.has(s.local.name)) {
            if (this.emitDiagnostics) {
              this.diagnostics.push({ node: s.local, message: `Cannot find name '${s.local.name}' to export` });
            }
          }
        }
        return;
      }
      case "ExportAllStatement":
        this.checkReexport(stmt.source, []);
        return;
      case "ImportStatement": {
        const resolving = this.options.resolveModule !== void 0;
        const exports2 = resolving ? this.moduleFor(stmt.source.value) : void 0;
        const specifier = stmt.source.value;
        const report = (node, message) => {
          if (this.emitDiagnostics) this.diagnostics.push({ node, message });
        };
        if (resolving && !exports2) report(stmt.source, `Cannot find module '${specifier}'`);
        const usable = exports2 && !exports2.partial ? exports2 : void 0;
        if (stmt.namespaceImport) {
          const id = this.bindingIdByName(stmt.namespaceImport.name, stmt.namespaceImport);
          if (id !== void 0) {
            const members = [...usable?.values ?? []].map(([name, type]) => [name, { type, optional: false, readonly: true }]);
            if (usable?.default) members.push(["default", { type: usable.default, optional: false, readonly: true }]);
            this.bindingType.set(id, usable ? objectType(members) : anyType);
          }
        }
        if (stmt.defaultImport) {
          if (usable && usable.default === void 0) {
            report(stmt.defaultImport, `Module '${specifier}' has no default export`);
          }
          const id = this.bindingIdByName(stmt.defaultImport.name, stmt.defaultImport);
          if (id !== void 0) this.bindingType.set(id, usable?.default ?? anyType);
        }
        for (const s of stmt.specifiers) {
          const value = usable?.values.get(s.imported.name);
          if (usable && !value && !usable.types.has(s.imported.name)) {
            report(s.imported, `Module '${specifier}' has no exported member '${s.imported.name}'`);
          }
          const id = this.bindingIdByName(s.local.name, s.local);
          if (id !== void 0) this.bindingType.set(id, value ?? anyType);
        }
        return;
      }
      case "BreakStatement":
        this.breakStates[this.breakStates.length - 1]?.push(forkEnv(env));
        return;
      case "DeclareClassStatement":
        this.checkClass(stmt);
        return;
      case "ContinueStatement":
      case "TypeAliasStatement":
      case "ExportTypeAliasStatement":
      case "ErrorStatement":
      case "DeclareStatement":
        return;
    }
  }
  /** Flatten an expression list into the values it actually produces.
   *
   *  Lua's adjustment rule: every expression but the last contributes one
   *  value, and the last contributes all of its values if it is a call or
   *  `...`. That is what makes `local ok, err = pcall(f)` work, and it is
   *  why `local x = f()` takes only the first value.
   *
   *  `sources` maps each produced value back to the expression it came from
   *  (undefined for the 2nd and later values of a multi-value call), so the
   *  caller can still do contextual typing against the written expression. */
  valueList(exprs, env, want = 0) {
    const types = [];
    const sources = [];
    exprs.forEach((e, i) => {
      const t = this.infer(e, env);
      const last = i === exprs.length - 1;
      if (e.type === "SpreadElement") {
        const held = this.typeOf.get(e.argument);
        const expanded = held && this.expand(held);
        if (expanded?.kind === "tuple") {
          for (const element of expanded.elements) {
            types.push(element);
            sources.push(e);
          }
          return;
        }
        do {
          types.push(t);
          sources.push(e);
        } while (last && types.length < want);
        return;
      }
      if (last && e.type === "VarargExpression") {
        do {
          types.push(t);
          sources.push(types.length - 1 === i ? e : void 0);
        } while (types.length < want);
        return;
      }
      if (last && t.kind === "tuple" && t.isPack && producesMultipleValues(e)) {
        t.elements.forEach((el, j) => {
          types.push(el);
          sources.push(j === 0 ? e : void 0);
        });
        return;
      }
      types.push(t.kind === "tuple" && t.isPack && producesMultipleValues(e) ? t.elements[0] ?? nilType : t);
      sources.push(e);
    });
    return { types, sources };
  }
  /** Run `visit` with a fresh place to collect `break` states, and return
   *  what it collected. */
  withBreakScope(visit) {
    this.breakStates.push([]);
    try {
      visit();
      return this.breakStates[this.breakStates.length - 1];
    } finally {
      this.breakStates.pop();
    }
  }
  /** Join the states a loop can be left in and write them back to `env`.
   *  No exits at all means the loop never terminates normally, so nothing
   *  after it is reachable and `env` is left alone. */
  applyLoopExits(exits, env) {
    if (!exits.length) return;
    const base = (key) => env.get(key) ?? this.declaredAtRef(key);
    const merged = exits.reduce((a, b) => mergeEnv(a, b, base));
    for (const [k, v] of merged) env.set(k, v);
  }
  /** True when control can never fall off the end of `block` — it returns,
   *  breaks, continues, calls something that never returns (`error`), or is
   *  an if/else where every branch does. Used for early-return narrowing, so
   *  it has to run *after* the block was visited: whether a call exits
   *  depends on its inferred return type. */
  blockAlwaysExits(block) {
    const last = block.statements[block.statements.length - 1];
    if (!last) return false;
    switch (last.type) {
      case "ReturnStatement":
      case "BreakStatement":
      case "ContinueStatement":
        return true;
      case "DoStatement":
        return this.blockAlwaysExits(last.body);
      case "CallStatement":
        return this.typeOf.get(last.expression)?.kind === "never";
      case "IfStatement":
        return !!last.alternate && last.clauses.every((c) => this.blockAlwaysExits(c.body)) && this.blockAlwaysExits(last.alternate);
      default:
        return false;
    }
  }
  visitIfStatement(stmt, env) {
    let elseEnv = forkEnv(env);
    const fallThrough = [];
    for (const clause of stmt.clauses) {
      this.infer(clause.condition, elseEnv);
      const { whenTrue, whenFalse } = this.narrowFromCondition(clause.condition, elseEnv);
      const branchEnv = forkEnv(whenTrue);
      this.visitBlock(clause.body, branchEnv);
      if (!this.blockAlwaysExits(clause.body)) fallThrough.push(branchEnv);
      elseEnv = whenFalse;
    }
    if (stmt.alternate) {
      const altEnv = forkEnv(elseEnv);
      this.visitBlock(stmt.alternate, altEnv);
      if (!this.blockAlwaysExits(stmt.alternate)) fallThrough.push(altEnv);
    } else {
      fallThrough.push(elseEnv);
    }
    if (fallThrough.length) {
      const base = (key) => env.get(key) ?? this.declaredAtRef(key);
      const merged = fallThrough.reduce((a, b) => mergeEnv(a, b, base));
      for (const [k, v] of merged) env.set(k, v);
    }
  }
  // --------------------------------------------------------
  // Functions
  // --------------------------------------------------------
  visitFunctionBody(func, outerEnv) {
    this.withTypeParams(func.generics, () => this.visitFunctionBodyInner(func, outerEnv));
  }
  /** A parameter's type: annotation, else a shape synthesized from a
   *  destructuring pattern, else inferred from its default, else `any`. */
  paramType(p, env) {
    const receiver = p.name === "self" || p.name === "this";
    if (!p.typeAnnotation && !p.pattern && !p.default && receiver && this.selfType) {
      return this.selfType;
    }
    if (p.typeAnnotation) {
      const t = this.resolveType(p.typeAnnotation);
      if (p.default) this.applyContext(p.default, t);
      return p.optional ? optional(t) : t;
    }
    if (p.rest) return arrayOf(unknownType);
    if (p.pattern) return this.patternToType(p.pattern, env);
    if (p.default) return widen(this.infer(p.default, env));
    return this.contextualParams.get(p) ?? anyType;
  }
  /** What a function expression's unannotated parameters are, from where
   *  it is written — see `applyContext`. */
  contextualParams = /* @__PURE__ */ new WeakMap();
  /** `expected` is the type the surroundings want for `expr`. A function
   *  expression written there takes its unannotated parameters' types from
   *  it, as in TypeScript: `signal:Connect(function(player) ... end)` knows
   *  `player` from `Connect`'s callback type. Anything else is inferred as
   *  usual. */
  applyContext(expr, expected) {
    let e = expr;
    while (e.type === "ParenthesizedExpression") e = e.expression;
    if (!expected) return;
    this.expectedTypeOf.set(expr, expected);
    this.expectedTypeOf.set(e, expected);
    if (e.type === "ArrayExpression") return this.applyArrayContext(e, expected);
    if (e.type === "TableExpression") return this.applyTableContext(e, expected);
    if (e.type === "BinaryExpression" && (e.operator === "or" || e.operator === "and")) {
      if (e.operator === "or") this.applyContext(e.left, expected);
      this.applyContext(e.right, expected);
      return;
    }
    if (e.type !== "FunctionExpression") return;
    const members = expected.kind === "union" ? expected.types : [expected];
    const signatures = members.flatMap((m) => this.overloadsOf(this.expand(m)));
    if (!signatures.length) return;
    e.func.params.forEach((p, k) => {
      if (p.typeAnnotation || p.pattern || p.default) return;
      const candidates = [];
      for (const signature of signatures) {
        const t2 = signature.params[k]?.type ?? signature.varargs;
        if (t2) candidates.push(t2);
      }
      if (!candidates.length) return;
      const t = union(candidates);
      this.contextualParams.set(p, containsTypeParam(t) ? anyType : t);
    });
  }
  /** What an array literal is expected to be: an empty one takes that type
   *  outright — `let queue: thread[] = []` is a `thread[]`, as in TypeScript
   *  — and the elements of any other get the element type as their own
   *  context. */
  contextualArrays = /* @__PURE__ */ new WeakMap();
  applyArrayContext(e, expected) {
    const target = this.expectedMembers(expected).find((m) => m.kind === "array" || m.kind === "tuple");
    if (!target) return;
    if (!e.elements.length) {
      this.contextualArrays.set(e, target);
      return;
    }
    e.elements.forEach((element, i) => {
      if (element.type === "SpreadElement") return;
      const elementType = target.kind === "array" ? target.element : target.elements[i];
      this.applyContext(element, elementType);
    });
  }
  /** `{ list: [] }` where `{ list: thread[] }` is expected: each field's
   *  value gets its property's type as context. */
  applyTableContext(e, expected) {
    const objects = this.expectedMembers(expected).filter((m) => m.kind === "object");
    if (!objects.length) return;
    for (const field of e.fields) {
      if (field.type !== "TableFieldNamed" && field.type !== "TableFieldShorthand") continue;
      const key = field.type === "TableFieldShorthand" ? field.name.name : field.key.type === "Identifier" ? field.key.name : field.key.value;
      const types = objects.flatMap((o) => {
        const property = o.properties.get(key);
        return property ? [property.type] : o.indexer ? [o.indexer.value] : [];
      });
      if (types.length) {
        this.applyContext(field.type === "TableFieldShorthand" ? field.name : field.value, union(types));
      }
    }
  }
  /** The members of an expected type worth matching a literal against:
   *  aliases seen through, `nil` left out. */
  expectedMembers(expected) {
    const t = this.expand(expected);
    const members = t.kind === "union" ? t.types : [t];
    return members.map((m) => this.expand(m)).filter((m) => !(m.kind === "primitive" && m.name === "nil"));
  }
  /** The parameter type each written argument lands on, across `fns`. */
  expectedArguments(written, fns, selfOf) {
    return written.map((_, j) => {
      const candidates = [];
      for (const f of fns) {
        const i = j + selfOf(f);
        const param = i < f.params.length ? this.boundParams(f)[i] : f.varargs;
        if (param) candidates.push(param);
      }
      return candidates.length ? union(candidates) : void 0;
    });
  }
  /** Synthesize a type from a destructuring pattern used without an
   *  annotation (`function f({ a, b = 1 })`). */
  patternToType(target, env) {
    const leaf = (v, def) => v.type !== "IdentifierPattern" ? this.patternToType(v, env) : v.typeAnnotation ? this.resolveType(v.typeAnnotation) : def ? widen(this.infer(def, env)) : anyType;
    if (target.type === "ObjectPattern") {
      const entries = [];
      for (const p of target.properties) {
        const key = !p.computed && p.key.type === "Identifier" ? p.key.name : !p.computed && p.key.type === "StringLiteral" ? p.key.value : void 0;
        if (key === void 0) continue;
        entries.push([key, { type: leaf(p.value, p.default), optional: p.default !== void 0 }]);
      }
      return objectType(entries);
    }
    return tuple(target.elements.map((el) => el ? leaf(el.value, el.default) : anyType));
  }
  /** What a vararg function's `...` holds, one value at a time.
   *
   *  Written three ways, and they mean the same call: `...` says nothing,
   *  `...: T` says each value is a `T`, and `...rest: T[]` collects them
   *  into an array the body reads by name. Only the last changes what the
   *  body sees — the signature is the same either way. */
  varargElement(func) {
    if (!func.hasVarargs) return void 0;
    const rest = func.params.find((p) => p.rest);
    if (!rest) return func.varargTypeAnnotation ? this.resolveType(func.varargTypeAnnotation) : anyType;
    const declared = rest.typeAnnotation ? this.resolveType(rest.typeAnnotation) : void 0;
    return declared?.kind === "array" ? declared.element : unknownType;
  }
  /** The type of `...` in each function body being walked. */
  varargs = [];
  /** What each function body being walked declared it returns. */
  declaredReturns = [];
  /** Run `body` with `...` and `return` as `func` declares them. */
  withVarargs(func, body) {
    this.varargs.push(this.varargElement(func));
    this.declaredReturns.push(func.predicate ? booleanType : func.returnType ? this.resolveType(func.returnType) : void 0);
    try {
      return body();
    } finally {
      this.varargs.pop();
      this.declaredReturns.pop();
    }
  }
  visitFunctionBodyInner(func, outerEnv) {
    const env = forkEnv(outerEnv);
    for (const p of func.params) {
      if (p.pattern) {
        const type = this.paramType(p, env);
        this.bindPattern(p.pattern, type, env, "widen");
        this.correlateDestructuring(p.pattern, type, env);
        continue;
      }
      const id = this.bindingIdByName(p.name, p);
      const t = this.paramType(p, env);
      if (id !== void 0) {
        this.bindingType.set(id, t);
        this.setBinding(env, id, t);
        if (p.typeAnnotation) this.annotated.add(id);
      }
    }
    this.withVarargs(func, () => this.collectReturns(void 0, () => {
      this.visitBlock(func.body, env);
      this.checkReturnsAtAll(func, this.declaredReturns[this.declaredReturns.length - 1]);
    }));
  }
  /** Return type of calling `f` with `argTypes`. For a generic function,
   *  infers the type parameters from the arguments and substitutes. */
  callReturn(f, argTypes, explicit) {
    if (!f.typeParams?.length) return f.returns;
    return this.reduceType(substitute(f.returns, this.inferTypeArgs(f, argTypes, explicit)));
  }
  /** Infer a generic call's type arguments from the argument types.
   *
   *  An argument is widened before matching — `id(1)` gives `number`, not
   *  `1` — *except* against a parameter whose constraint is made of literal
   *  types, where the literal is the whole point. That is what lets
   *  `<K extends keyof T>(name: K) -> T[K]` pick out one property. */
  /** The type arguments a call writes out, checked for count. */
  explicitTypeArguments(expr, fns) {
    const written = expr.typeArguments;
    if (!written?.length) return void 0;
    const resolved = written.map((node) => this.resolveType(node));
    const most = Math.max(0, ...fns.map((f) => f.typeParams?.length ?? 0));
    if (this.emitDiagnostics && resolved.length > most) {
      this.diagnostics.push({
        node: written[most],
        message: most === 0 ? "This call takes no type arguments" : `Expected ${most} type argument${most === 1 ? "" : "s"}, got ${resolved.length}`
      });
    }
    return resolved;
  }
  /** `<T = Instance>`: what a call falls back to for a parameter it neither
   *  is given nor can infer. */
  withTypeParamDefaults(type, generics) {
    if (type.kind !== "function") return type;
    const defaults = {};
    for (const generic of generics) {
      if (generic.default && !generic.isPack) defaults[generic.name] = this.resolveType(generic.default);
    }
    return Object.keys(defaults).length ? { ...type, typeParamDefaults: defaults } : type;
  }
  inferTypeArgs(f, argTypes, explicit) {
    const subst = /* @__PURE__ */ new Map();
    if (explicit?.length) {
      (f.typeParams ?? []).forEach((name, i) => {
        if (explicit[i]) subst.set(name, explicit[i]);
      });
    }
    const vars = new Set((f.typeParams ?? []).filter((name) => !subst.has(name)));
    f.params.forEach((p, i) => {
      const arg = argTypes[i];
      if (arg === void 0) return;
      const param = p.type.kind === "typeParam" && p.type.constraint ? { ...p.type, constraint: this.reduceType(p.type.constraint) } : p.type;
      unify(p.type, keepsLiterals(param) ? arg : widen(arg), vars, subst);
    });
    if (f.varargs) {
      const keeps = keepsLiterals(f.varargs);
      for (let i = f.params.length; i < argTypes.length; i++) {
        const arg = argTypes[i];
        if (arg !== void 0) unify(f.varargs, keeps ? arg : widen(arg), vars, subst);
      }
    }
    for (const name of f.typeParams ?? []) {
      if (!subst.has(name)) subst.set(name, f.typeParamDefaults?.[name] ?? unknownType);
    }
    return subst;
  }
  /** Re-infer the arguments that land on a `<const T>` parameter, keeping
   *  them as narrow as they were written: literals stay literal and an array
   *  literal becomes a tuple. Only the const positions are redone, and only
   *  once the overload is known — which parameter is `const` depends on it. */
  constArgs(f, written, argTypes, env, selfOffset = 0) {
    if (!f.typeParams?.length) return argTypes;
    const out = [...argTypes];
    f.params.forEach((p, i) => {
      if (p.type.kind !== "typeParam" || !p.type.isConst) return;
      const arg = written[i - selfOffset];
      if (arg) out[i - selfOffset] = this.inferAsConst(arg, env);
    });
    return out;
  }
  /** Choose the signature a call resolves to, TypeScript-style: the first
   *  one that accepts the arguments, with generic catch-alls considered only
   *  after every concrete signature has been tried. That ordering is what
   *  lets `typeof` declare `(v: number) -> "number"` alongside a trailing
   *  `<T>(v: T) -> string` and still pick the precise one. */
  pickOverload(fns, argTypes, argsFor, spread) {
    for (const generic of [false, true]) {
      for (const f of fns) {
        if ((f.typeParams?.length ?? 0) > 0 !== generic) continue;
        if (this.overloadAccepts(f, argsFor ? argsFor(f) : argTypes, spread)) return f;
      }
    }
    return void 0;
  }
  /** An overload set called with a union argument, one member at a time.
   *
   *  One signature for the whole union is often only the catch-all:
   *  `typeof(v)` with `v: Part | nil` accepts nothing more specific than
   *  `typeof<T>(value: T): string`. Each member on its own picks `"Instance"`
   *  and `"nil"`, and that union is what the call returns — whenever every
   *  member picks a signature listed ahead of the whole union's. Otherwise
   *  (a signature taking the union as it is, or a member nothing accepts)
   *  this returns `undefined` and the ordinary pick stands. */
  distributedReturn(fns, argTypes, picked, argsFor) {
    if (fns.length < 2) return void 0;
    const position = argTypes.findIndex((t) => this.expand(t).kind === "union");
    if (position < 0) return void 0;
    const members = this.expand(argTypes[position]).types;
    if (members.length > 32) return void 0;
    const rank = (f) => ((f.typeParams?.length ?? 0) > 0 ? fns.length : 0) + fns.indexOf(f);
    const limit = picked ? rank(picked) : Infinity;
    const results = [];
    for (const member of members) {
      const args = argTypes.map((t, i) => i === position ? member : t);
      const chosen = this.pickOverload(fns, args, (f) => argsFor(f, args));
      if (!chosen || rank(chosen) >= limit) return void 0;
      results.push(this.callReturn(chosen, argsFor(chosen, args)));
    }
    return union(results);
  }
  /** Can this signature be called with these argument types? The signature's
   *  own type parameters stand for what the call would infer, so each is
   *  checked only against its constraint — `<K extends keyof Services>`
   *  accepts `"Players"` but not `""`. */
  overloadAccepts(f, argTypes, spread) {
    const at = (i) => {
      if (!spread || i < spread.index) return argTypes[i];
      if (!spread.elements) return argTypes[spread.index];
      const held = spread.elements[i - spread.index];
      return held ?? argTypes[i - spread.index + 1 + spread.elements.length - 1];
    };
    const written = spread?.elements ? argTypes.length + spread.elements.length - 1 : argTypes.length;
    if (!f.varargs && (!spread || spread.elements) && written > f.params.length) return false;
    if (f.varargs && !f.typeParams?.length) {
      const last = spread && !spread.elements ? Math.max(f.params.length + 1, written) : written;
      for (let i = f.params.length; i < last; i++) {
        const arg = at(i);
        if (arg !== void 0 && !isAssignable(arg, f.varargs)) return false;
      }
    }
    const params = this.boundParams(f);
    return f.params.every((p, i) => {
      const arg = at(i);
      if (arg === void 0) return p.optional === true;
      return isAssignable(arg, params[i]);
    });
  }
  /** A signature's parameter types as a call site sees them before inference:
   *  each type parameter replaced by its constraint, or by `any` when it has
   *  none — or when the constraint mentions another type parameter, which a
   *  lone argument cannot be checked against without false errors. */
  boundParams(f) {
    if (!f.typeParams?.length) return f.params.map((p) => p.type);
    const bounds = new Map(f.typeParams.map((name) => [name, anyType]));
    const seen = /* @__PURE__ */ new WeakSet();
    const walk = (value) => {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      if (value instanceof Map) {
        value.forEach(walk);
        return;
      }
      const t = value;
      if (t.kind === "object" && t.class) return;
      if (t.kind === "typeParam" && typeof t.name === "string" && bounds.has(t.name) && t.constraint && !containsTypeParam(t.constraint)) {
        bounds.set(t.name, this.reduceType(t.constraint));
      }
      for (const child of Object.values(value)) walk(child);
    };
    for (const p of f.params) if (containsTypeParam(p.type)) walk(p.type);
    return f.params.map((p) => this.reduceType(substitute(p.type, bounds)));
  }
  /** Record what each written argument is expected to be — see
   *  `TypeAnalysis.expectedTypeOf`. */
  recordExpected(written, fns, selfOf, argsOf = () => []) {
    const paramsOf = /* @__PURE__ */ new Map();
    for (const f of fns) paramsOf.set(f, this.paramsAsCalled(f, argsOf(f)));
    written.forEach((arg, j) => {
      const candidates = [];
      for (const f of fns) {
        const i = j + selfOf(f);
        const params = paramsOf.get(f);
        const param = i < params.length ? params[i] : f.varargs;
        if (param) candidates.push(param);
      }
      if (candidates.length) this.expectedTypeOf.set(arg, union(candidates));
    });
  }
  /** The parameters as *this* call makes them read: a type argument the
   *  arguments already written pin down is substituted in, and one nothing
   *  has pinned down yet falls back to its constraint.
   *
   *  It is what makes the second argument of
   *  `get(page, skill: Extract<Rows, { Page: Page }>["Skills"][number])`
   *  worth completing — with `page` written, `skill` is the skills of that
   *  page, not of every page. */
  paramsAsCalled(f, argTypes) {
    const fallback = this.boundParams(f);
    if (!f.typeParams?.length || !argTypes.length) return fallback;
    return f.params.map((p, i) => {
      if (!containsTypeParam(p.type)) return p.type;
      const subst = this.inferTypeArgs(f, argTypes.map((t, k) => k === i ? void 0 : t));
      for (const [name, bound] of [...subst]) if (bound.kind === "unknown") subst.delete(name);
      if (!subst.size) return fallback[i];
      const applied = this.reduceType(substitute(p.type, subst));
      return containsTypeParam(applied) ? fallback[i] : applied;
    });
  }
  /** No signature accepts the call, and the argument count is not the
   *  problem: say which argument is wrong, the way TypeScript does. */
  /** Check what was written against the parameters as this call's own type
   *  arguments make them read: `pick("Bones", "C")` is wrong only once `P`
   *  is known to be `"Bones"`. Picking the overload goes by each parameter's
   *  constraint, which is deliberately looser than that. */
  checkInferredArguments(call, written, f, argTypes, self) {
    if (!this.emitDiagnostics || !f.typeParams?.length) return;
    const subst = this.inferTypeArgs(f, [...argTypes]);
    for (const bound of subst.values()) if (bound.kind === "unknown") return;
    const declaredAt = (i) => i < f.params.length ? f.params[i].type : f.varargs;
    for (let i = 0; i < Math.max(f.params.length, argTypes.length); i++) {
      const arg = argTypes[i];
      const declared = declaredAt(i);
      if (arg === void 0 || declared === void 0 || !containsTypeParam(declared)) continue;
      const expected = this.reduceType(substitute(declared, subst));
      if (containsTypeParam(expected) || expected.kind === "any" || expected.kind === "unknown") continue;
      if (isAssignable(arg, expected) || isAssignable(widen(arg), expected)) continue;
      this.diagnostics.push({
        node: written[i - self] ?? call,
        message: `Argument of type '${formatType(arg)}' is not assignable to parameter of type '${briefType(expected)}'`
      });
      return;
    }
  }
  reportArguments(call, written, fns, argsFor, selfOf) {
    if (!this.emitDiagnostics) return;
    if (fns.length > 1) {
      this.diagnostics.push({ node: call, message: "No overload matches this call" });
      return;
    }
    const f = fns[0];
    const args = argsFor(f);
    const params = this.boundParams(f);
    const self = selfOf(f);
    const spread = this.spreadOf(written, self);
    for (let i = 0; i < f.params.length; i++) {
      const arg = spread && i >= spread.index ? this.spreadValue(spread, i) : args[i];
      if (spread && i > spread.index && !spread.elements) break;
      if (arg === void 0 || arg.kind === "never" || isAssignable(arg, params[i])) continue;
      this.diagnostics.push({
        node: (spread && i >= spread.index ? written[spread.index - self] : written[i - self]) ?? call,
        message: `Argument of type '${formatType(arg)}' is not assignable to parameter of type '${briefType(params[i])}'`
      });
      return;
    }
    if (!f.varargs || f.typeParams?.length) return;
    for (let i = f.params.length; i < args.length; i++) {
      if (isAssignable(args[i], f.varargs)) continue;
      this.diagnostics.push({
        node: written[i - self] ?? call,
        message: `Argument of type '${formatType(args[i])}' is not assignable to parameter of type '${briefType(f.varargs)}'`
      });
      return;
    }
  }
  /** A required parameter may not follow an optional one — otherwise the
   *  optional one could never actually be omitted. Same rule as TypeScript,
   *  and it applies to a default (`a = 1`) as much as to a `?`. */
  checkParamOrder(params, node) {
    if (!this.emitDiagnostics) return;
    let seenOptional;
    for (const p of params) {
      if (p.rest === true) {
        this.checkRestType(p, node);
        continue;
      }
      const isOptional = p.optional === true || p.default !== void 0;
      if (isOptional) {
        if (seenOptional === void 0) seenOptional = p.name ?? "parameter";
        continue;
      }
      if (seenOptional !== void 0) {
        this.diagnostics.push({
          node,
          message: `Required parameter '${p.name ?? "?"}' cannot follow optional parameter '${seenOptional}'`
        });
        return;
      }
    }
  }
  /** How many arguments a signature requires, and the most it accepts
   *  (`undefined` when it is variadic). */
  arityOf(f) {
    let min = 0;
    for (let i = 0; i < f.params.length; i++) if (!f.params[i].optional) min = i + 1;
    return { min, max: f.varargs ? void 0 : f.params.length };
  }
  /** Report a call that passes too few or too many arguments. Only fires
   *  when *no* overload accepts the count, so an overload set still reports
   *  once, against its first signature. Returns whether the count fits, so
   *  an argument's type is only complained about when its count is right. */
  checkArity(node, fns, argCount, selfArgs, spread) {
    if (!fns.length) return true;
    if (spread && !spread.elements) return true;
    if (spread?.elements) argCount += spread.elements.length - 1;
    const fits = fns.some((f) => {
      const { min: min2, max: max2 } = this.arityOf(f);
      const n = argCount + selfArgs;
      return n >= min2 && (max2 === void 0 || n <= max2);
    });
    if (fits) return true;
    if (!this.emitDiagnostics) return false;
    const { min, max } = this.arityOf(fns[0]);
    const need = max === void 0 ? `at least ${min - selfArgs}` : min === max ? `${min - selfArgs}` : `${min - selfArgs}-${max - selfArgs}`;
    this.diagnostics.push({
      node,
      message: `Expected ${need} argument${need === "1" ? "" : "s"}, got ${argCount}`
    });
    return false;
  }
  /** An overload set's implementation handles every signature, so a bare
   *  parameter of it holds whatever those signatures allow there:
   *  `function f(Stat, ...)` under 36 `Stat: "..."` signatures is the union
   *  of all 36. TypeScript leaves such a parameter `any`; this says what it
   *  can actually be. An annotation, a pattern or a default still wins. */
  paramsFromSignatures(func, signatures) {
    if (!signatures?.length) return;
    const resolved = signatures.map((sig) => this.signatureToFnType(sig));
    func.params.forEach((param, i) => {
      if (param.typeAnnotation || param.pattern || param.default) return;
      const candidates = [];
      for (const signature of resolved) {
        if (signature.kind !== "function") continue;
        const own = signature.params[i];
        if (own) candidates.push(own.optional ? optional(own.type) : own.type);
        else if (signature.varargs) candidates.push(signature.varargs);
      }
      if (candidates.length) this.contextualParams.set(param, union(candidates));
    });
  }
  signatureToFnType(sig) {
    const names = sig.generics.map((g) => g.name);
    const record = (type) => {
      this.typeOfTypeNode.set(sig, type);
      return type;
    };
    return record(this.withTypeParams(sig.generics, () => {
      const params = sig.params.filter((p) => !p.rest).map((p) => ({
        name: p.pattern ? void 0 : p.name,
        type: this.paramType(p, /* @__PURE__ */ new Map()),
        optional: p.optional || p.default !== void 0
      }));
      return fn(
        params,
        sig.returnType ? this.resolveType(sig.returnType) : sig.predicate ? booleanType : anyType,
        this.varargElement(sig),
        names,
        this.resolvePredicate(sig.predicate, params)
      );
    }));
  }
  /** `...rest: T[]` holds every argument from its position on, so its type
   *  is an array of what each one is. */
  checkRestType(p, node) {
    if (!this.emitDiagnostics || !p.typeAnnotation) return;
    const declared = this.resolveType(p.typeAnnotation);
    if (declared.kind === "array" || declared.kind === "any" || declared.kind === "typeParam") return;
    this.diagnostics.push({
      node,
      message: `A rest parameter holds every argument from its position on, so '${p.name ?? "..."}' is an array: '${formatType(declared)}[]', not '${formatType(declared)}'`
    });
  }
  /** Turn a parsed `v is T` / `asserts v` annotation into a `TypePredicate`,
   *  resolving the named parameter to its index. A guard naming a parameter
   *  the function does not have is dropped rather than mis-narrowing an
   *  unrelated argument. */
  resolvePredicate(node, params) {
    if (!node) return void 0;
    const param = params.findIndex((p) => p.name === node.parameterName);
    if (param < 0) return void 0;
    return {
      param,
      type: node.typeAnnotation ? this.resolveType(node.typeAnnotation) : void 0,
      asserts: node.asserts
    };
  }
  inferFunctionBody(func, env) {
    const names = func.generics.map((g) => g.name);
    return this.withTypeParams(func.generics, () => {
      const params = func.params.flatMap((p) => {
        const type = this.paramType(p, env);
        if (!p.pattern) {
          const id = this.bindingIdByName(p.name, p);
          if (id !== void 0 && !this.bindingType.has(id)) this.bindingType.set(id, type);
        }
        if (p.rest) return [];
        return [{
          name: p.pattern ? void 0 : p.name,
          type,
          optional: p.optional || p.default !== void 0
        }];
      });
      const bodyEnv = forkEnv(env);
      for (const p of func.params) {
        if (p.pattern) this.bindPattern(p.pattern, this.paramType(p, bodyEnv), bodyEnv, "widen");
        else {
          const id = this.bindingIdByName(p.name, p);
          if (id !== void 0) this.setBinding(bodyEnv, id, this.paramType(p, bodyEnv));
        }
      }
      let returns;
      if (func.returnType) {
        returns = this.resolveType(func.returnType);
      } else if (func.predicate) {
        returns = booleanType;
      } else {
        const collected = [];
        returns = this.withVarargs(func, () => this.silently(() => {
          this.collectReturns(collected, () => this.preVisitBody(func.body, bodyEnv));
          return collected.length ? union(collected) : this.inferReturnType(func.body, bodyEnv);
        }));
      }
      return fn(
        params,
        returns,
        this.varargElement(func),
        names,
        this.resolvePredicate(func.predicate, params)
      );
    });
  }
  /** Where the return types of the function being walked are collected, so
   *  each is read where it is written — inside the branch that narrowed it —
   *  rather than in whatever state the body ends in. */
  returnTypes;
  collectReturns(into, body) {
    const previous = this.returnTypes;
    this.returnTypes = into;
    try {
      return body();
    } finally {
      this.returnTypes = previous;
    }
  }
  /** Run something without reporting what it finds. */
  silently(body) {
    const wasEmitting = this.emitDiagnostics;
    this.emitDiagnostics = false;
    try {
      return body();
    } finally {
      this.emitDiagnostics = wasEmitting;
    }
  }
  /** Populate binding types for a function body without reporting anything,
   *  purely so an un-annotated return type can see its own locals. Bounded:
   *  nested functions stop pre-visiting after a couple of levels, since the
   *  cost compounds and the payoff drops off fast. */
  preVisitBody(body, env) {
    if (this.preVisitDepth >= 2) return;
    this.preVisitDepth++;
    const wasEmitting = this.emitDiagnostics;
    this.emitDiagnostics = false;
    try {
      this.visitBlock(body, env);
    } finally {
      this.emitDiagnostics = wasEmitting;
      this.preVisitDepth--;
    }
  }
  /** The `[key, value]` pairs iterating a record yields, one per property —
   *  for `pairs(t)`, `next, t` and `for k, v in t` over an object type with
   *  no indexer. `undefined` for anything else (an array, a dictionary, an
   *  iterator function), whose keys have no names to list. */
  iterationRows(iterNode, iterType) {
    let source;
    if (iterNode?.type === "CallExpression" && iterNode.callee.type === "Identifier" && iterNode.arguments[0]) {
      if (iterNode.callee.name !== "pairs" && iterNode.callee.name !== "next") return void 0;
      source = this.typeOf.get(iterNode.arguments[0]);
    } else {
      source = iterType;
    }
    const t = source && this.expand(source);
    if (!t || t.kind !== "object" || t.class || t.indexer || !t.properties.size) return void 0;
    return [...t.properties].map(([name, property]) => [
      literal(name),
      property.optional ? optional(property.type) : property.type
    ]);
  }
  /** Bindings that hold parts of one value: the key and value of a `pairs`
   *  row, or the names destructured from one union member. By flow key.
   *  Which rows are still possible is itself flow state, kept in `env` under
   *  `group` as a union of tuples, so it narrows and merges like any type. */
  correlations = /* @__PURE__ */ new Map();
  correlateBindings(env, ids, rows) {
    const keys = ids.map(bindKey);
    const group = `rows(${keys.join(",")})`;
    keys.forEach((key, index) => this.correlations.set(key, { group, index, keys, rows }));
    env.set(group, union(rows.map((row) => tuple(row))));
  }
  /** `key` was just narrowed to `narrowed` in `env`: narrow that column of
   *  every row, drop the rows it rules out, and give the other bindings what
   *  the remaining rows hold. */
  correlate(env, key, narrowed) {
    const entry = this.correlations.get(key);
    if (!entry) return;
    const state = env.get(entry.group);
    const current = state && (state.kind === "union" ? state.types : [state]).every((t) => t.kind === "tuple") ? (state.kind === "union" ? state.types : [state]).map((t) => t.elements) : entry.rows;
    const kept = [];
    for (const row of current) {
      const column = narrowTo(row[entry.index], narrowed);
      if (column.kind !== "never") kept.push(row.map((t, i) => i === entry.index ? column : t));
    }
    env.set(entry.group, kept.length ? union(kept.map((row) => tuple(row))) : neverType);
    entry.keys.forEach((other, j) => {
      if (j !== entry.index) env.set(other, kept.length ? union(kept.map((row) => row[j])) : neverType);
    });
  }
  /** Stop correlating a binding once it is assigned: its value no longer
   *  comes from the row. */
  uncorrelate(id) {
    const entry = this.correlations.get(bindKey(id));
    if (entry) for (const key of entry.keys) this.correlations.delete(key);
  }
  /** `const { kind, payload } = action` over a union of objects: one row per
   *  member, so testing `kind` narrows `payload` (TypeScript's destructured
   *  discriminated unions). Only plain `name` / `key: name` properties take
   *  part. */
  /** Names that denote one and the same value: `const c = player.Character`
   *  makes `c` and `player.Character` two spellings of one reference. Kept
   *  as an undirected graph of flow keys. */
  refAliases = /* @__PURE__ */ new Map();
  /** `const c = a.b` — `c` cannot be re-bound and the path was read once, so
   *  a test of either name is a test of the same value. Only property paths
   *  take part: `const c = other` would tie `c` to a name that may itself be
   *  assigned a different value later. */
  aliasReference(target, init) {
    if (target.type !== "IdentifierPattern" || !init) return;
    const source = unwrapParens(init);
    if (source.type !== "MemberExpression" && source.type !== "IndexExpression") return;
    const path = this.refKeyOf(source);
    const id = this.bindingIdByName(target.name, target);
    if (path === void 0 || id === void 0) return;
    const name = bindKey(id);
    for (const [a, b] of [[name, path], [path, name]]) {
      const set = this.refAliases.get(a) ?? /* @__PURE__ */ new Set();
      set.add(b);
      this.refAliases.set(a, set);
    }
  }
  /** A reference was narrowed: give every other spelling of the same value
   *  the same news. Walks the alias graph, so a path with two names told by
   *  one of them reaches the other. Each alias keeps whatever it already
   *  knew — the narrowing only ever cuts the type further down. */
  propagateAliases(env, into, key, narrowed) {
    if (!this.refAliases.size) return;
    const seen = /* @__PURE__ */ new Set([key]);
    const queue = [[key, narrowed]];
    const learn = (at, t) => {
      seen.add(at);
      this.setRef(into, at, t);
      this.correlate(into, at, t);
      queue.push([at, t]);
    };
    for (let at = 0; at < queue.length; at++) {
      const [from, t] = queue[at];
      for (const other of this.refAliases.get(from) ?? []) {
        if (seen.has(other)) continue;
        const current = into.get(other) ?? env.get(other) ?? this.declaredAtRef(other);
        const next = narrowTo(current, t);
        learn(other, next.kind === "never" ? t : next);
        for (let child = other, value = into.get(other); ; ) {
          const cut = child.lastIndexOf(".");
          if (cut <= 0) break;
          const parent = child.slice(0, cut);
          if (seen.has(parent)) break;
          const had = into.get(parent) ?? env.get(parent) ?? this.declaredAtRef(parent);
          value = this.filterByProperty(had, child.slice(cut + 1), value);
          learn(parent, value);
          child = parent;
        }
      }
    }
  }
  /** `const path = paths[stat]` where `stat` is one of several keys: which
   *  value came back says which key was asked for. Testing the value then
   *  narrows the key — the `else` of `if path then` leaves exactly the keys
   *  the table does not have. */
  correlateIndexed(target, init, env) {
    if (target.type !== "IdentifierPattern" || !init) return;
    const source = unwrapParens(init);
    if (source.type !== "IndexExpression" || source.index.type !== "Identifier") return;
    const valueId = this.bindingIdByName(target.name, target);
    const keyId = this.bindingIdOf(source.index);
    if (valueId === void 0 || keyId === void 0) return;
    const key = this.expand(this.currentType(keyId, env));
    if (key.kind !== "union" || key.types.length < 2 || key.types.length > 64) return;
    if (!key.types.every((m) => m.kind === "literal")) return;
    const object = this.expand(this.typeOf.get(source.object) ?? unknownType);
    if (object.kind !== "object") return;
    this.correlateBindings(env, [keyId, valueId], key.types.map((m) => [m, this.indexedType(object, m)]));
  }
  correlateDestructuring(pattern, source, env) {
    if (pattern.type !== "ObjectPattern") return;
    const members = this.expand(source);
    if (members.kind !== "union") return;
    const objects = members.types.map((m) => this.expand(m));
    if (objects.length < 2 || objects.some((m) => m.kind !== "object")) return;
    const ids = [];
    const names = [];
    for (const property of pattern.properties) {
      if (property.computed || property.default || property.value.type !== "IdentifierPattern") return;
      const name = property.key.type === "Identifier" ? property.key.name : property.key.type === "StringLiteral" ? property.key.value : void 0;
      const id = this.bindingIdByName(property.value.name, property.value);
      if (name === void 0 || id === void 0) return;
      ids.push(id);
      names.push(name);
    }
    if (ids.length < 2) return;
    this.correlateBindings(env, ids, objects.map((member) => names.map((name) => this.propertyType(member, name))));
  }
  /** `(keyType, valueType)` yielded by a generic-for iterator. Handles
   *  `ipairs`/`pairs`/`next(t)` and Luau generalized iteration (`for … in t`).
   *  `varCount` is how many loop variables were written. */
  iterationTypes(iterNode, iterType, varCount) {
    if (iterNode?.type === "CallExpression" && iterNode.callee.type === "Identifier" && iterNode.arguments[0]) {
      const name = iterNode.callee.name;
      const src = this.expand(this.typeOf.get(iterNode.arguments[0]) ?? unknownType);
      if (name === "ipairs") return [numberType, this.elementType(src, 0)];
      if (name === "pairs" || name === "next") {
        if (src.kind === "object") {
          return [
            src.indexer?.key ?? stringType,
            src.indexer?.value ?? union([...src.properties.values()].map((p) => p.type))
          ];
        }
        if (src.kind === "array") return [numberType, src.element];
      }
    }
    const iterator = this.expand(iterType);
    if (iterator.kind === "function") {
      const returns = this.expand(iterator.returns);
      const parts = returns.kind === "tuple" ? returns.elements.map((m) => this.expand(m)) : [returns];
      const at = (i) => parts[i] ?? (parts.length === 1 ? parts[0] : unknownType);
      return [at(0), at(1)];
    }
    const t = this.expand(iterType);
    if (t.kind === "array") return varCount >= 2 ? [numberType, t.element] : [t.element, unknownType];
    if (t.kind === "object") {
      const k = t.indexer?.key ?? stringType;
      const v = t.indexer?.value ?? union([...t.properties.values()].map((p) => p.type));
      return varCount >= 2 ? [k, v] : [v, unknownType];
    }
    return [unknownType, unknownType];
  }
  inferReturnType(body, env) {
    const returns = [];
    const walk = (block) => {
      for (const s of block.statements) {
        if (s.type === "ReturnStatement") {
          if (s.arguments.length === 0) returns.push(nilType);
          else if (s.arguments.length === 1) returns.push(this.infer(s.arguments[0], env));
          else returns.push(tuple(s.arguments.map((a) => this.infer(a, env)), true));
        } else if (s.type === "IfStatement") {
          for (const c of s.clauses) walk(c.body);
          if (s.alternate) walk(s.alternate);
        } else if (s.type === "DoStatement" || s.type === "WhileStatement" || s.type === "NumericForStatement" || s.type === "GenericForStatement") {
          walk(s.body);
        } else if (s.type === "RepeatStatement") {
          walk(s.body);
        }
      }
    };
    walk(body);
    return returns.length ? union(returns) : nilType;
  }
  // --------------------------------------------------------
  // Patterns
  // --------------------------------------------------------
  /** Assignability check with a bit of contextual typing: an array literal
   *  checked against a tuple annotation is matched element-wise (a plain
   *  `infer` would have widened it to an array type). */
  fitsAnnotation(init, declared, inferred, env) {
    if (declared.kind === "tuple" && init.type === "ArrayExpression" && !init.elements.some((e) => e.type === "SpreadElement")) {
      if (init.elements.length !== declared.elements.length) return false;
      return init.elements.every((el, i) => isAssignable(widen(this.infer(el, env)), declared.elements[i]));
    }
    if (isAssignable(inferred, declared) || isAssignable(widen(inferred), declared)) return true;
    if (init.type === "TableExpression") return isAssignable(this.inferObject(init, env, true), declared);
    if (init.type === "ArrayExpression") return isAssignable(this.inferArray(init, env, true), declared);
    return false;
  }
  /** `{ a, ...rest }`: what `rest` holds — the value without the properties
   *  the pattern already took. */
  withoutKeys(raw, properties) {
    const taken = new Set(properties.flatMap((p) => !p.computed && p.key.type === "Identifier" ? [p.key.name] : !p.computed && p.key.type === "StringLiteral" ? [p.key.value] : []));
    if (!taken.size) return raw;
    const t = this.expand(raw);
    if (t.kind === "union") return union(t.types.map((m) => this.withoutKeys(m, properties)));
    if (t.kind !== "object") return raw;
    const kept = [...t.properties].filter(([name]) => !taken.has(name));
    if (kept.length === t.properties.size) return raw;
    return objectType(kept, t.indexer, t.frozen);
  }
  /** Fold a destructuring default (`{ a = 1 }`) into the property's type:
   *  the default applies when the source value is missing/`nil`. */
  withDefault(base, def, env) {
    if (!def) return base;
    const d = widen(this.infer(def, env));
    if (base.kind === "any" || base.kind === "unknown") return d;
    return union([narrowExclude(base, nilType), d]);
  }
  /** Like `bindPattern`, but the leaves are *existing* bindings (a `{a} = t`
   *  assignment). Updates their flow type; keeps a declared annotation. */
  reassignPattern(target, valueType, env) {
    switch (target.type) {
      case "IdentifierPattern": {
        const id = this.scopes.bindingOf.get(target);
        if (id === void 0) return;
        const next = widen(valueType);
        if (this.annotated.has(id)) {
          const declared = this.bindingType.get(id);
          this.setBinding(env, id, narrowTo(declared, next));
        } else {
          this.setBinding(env, id, next);
          this.bindingType.set(id, union([this.bindingType.get(id) ?? next, next]));
        }
        return;
      }
      case "ObjectPattern": {
        for (const p of target.properties) {
          const key = !p.computed && p.key.type === "Identifier" ? p.key.name : !p.computed && p.key.type === "StringLiteral" ? p.key.value : void 0;
          const pt = key !== void 0 ? this.propertyType(valueType, key) : unknownType;
          this.reassignPattern(p.value, this.withDefault(pt, p.default, env), env);
        }
        if (target.rest) this.reassignPattern(target.rest, this.withoutKeys(valueType, target.properties), env);
        return;
      }
      case "ArrayPattern": {
        target.elements.forEach((el, i) => {
          if (el) this.reassignPattern(el.value, this.withDefault(this.elementType(valueType, i), el.default, env), env);
        });
        if (target.rest) this.reassignPattern(target.rest, arrayOf(this.elementType(valueType, 0)), env);
        return;
      }
    }
  }
  bindPattern(target, valueType, env, mode) {
    switch (target.type) {
      case "IdentifierPattern": {
        const id = this.bindingIdByName(target.name, target);
        let t;
        if (target.typeAnnotation) {
          t = this.resolveType(target.typeAnnotation);
          if (id !== void 0) this.annotated.add(id);
        } else {
          t = mode === "asconst" || mode === "keep" ? valueType : mode === "const" ? valueType.kind === "literal" ? valueType : widen(valueType) : widen(valueType);
        }
        if (id !== void 0) {
          this.bindingType.set(id, t);
          this.setBinding(env, id, t);
        }
        return;
      }
      case "ObjectPattern": {
        for (const p of target.properties) {
          const key = !p.computed && p.key.type === "Identifier" ? p.key.name : !p.computed && p.key.type === "StringLiteral" ? p.key.value : void 0;
          const propType = key !== void 0 ? this.propertyType(valueType, key) : unknownType;
          this.bindPattern(p.value, this.withDefault(propType, p.default, env), env, mode);
        }
        if (target.rest) this.bindPattern(target.rest, this.withoutKeys(valueType, target.properties), env, mode);
        return;
      }
      case "ArrayPattern": {
        target.elements.forEach((el, i) => {
          if (!el) return;
          this.bindPattern(el.value, this.withDefault(this.elementType(valueType, i), el.default, env), env, mode);
        });
        if (target.rest) this.bindPattern(target.rest, arrayOf(this.elementType(valueType, 0)), env, mode);
        return;
      }
    }
  }
  /** Expand a nominal `genericRef` back to its alias's structure.
   *  Recursive aliases were left as refs during their own resolution; this
   *  resolves them on demand for member access and for structural
   *  comparison.
   *
   *  Memoised, and that is load-bearing rather than an optimisation: a class
   *  hierarchy expands to a very large type, `isAssignable` asks for the
   *  same expansions constantly, and the recursion guard in `isAssignable`
   *  works by object identity — so the same ref must yield the *same*
   *  object every time. The cache entry is seeded with the ref itself before
   *  resolving, which is what breaks re-entry on a recursive alias. */
  expand(t) {
    if (t.kind !== "genericRef") return t;
    const def = this.aliasDefs.get(t.name);
    if (!def) {
      const imported = this.importedTypes.get(t.name);
      if (!imported) return t;
      if (!imported.params.length) return imported.type;
      const subst = /* @__PURE__ */ new Map();
      imported.params.forEach((name, i) => subst.set(name, t.typeArguments[i] ?? unknownType));
      const key2 = `import ${formatType(t)}`;
      const cached2 = this.expandCache.get(key2);
      if (cached2) return cached2;
      this.expandCache.set(key2, t);
      const applied = substitute(imported.type, subst);
      this.expandCache.set(key2, applied);
      return applied;
    }
    if (this.resolvingAliases.has(t.name)) return t;
    const key = t.typeArguments.length ? formatType(t) : t.name;
    const cached = this.expandCache.get(key);
    if (cached) return cached;
    this.expandCache.set(key, t);
    this.resolvingAliases.add(t.name);
    try {
      const r = def.params.length ? this.instantiateAlias(def, t.typeArguments) : this.resolveDef(def);
      const named = def.params.length === 0 && (r.kind === "object" || r.kind === "intersection") && !r.name ? { ...r, name: t.name } : r;
      this.expandCache.set(key, named);
      return named;
    } finally {
      this.resolvingAliases.delete(t.name);
    }
  }
  /** `names:filter(f)`, `text:trim()` — the methods arrays and strings have.
   *  They are written in the prelude as `ArrayMethods<T>` and
   *  `StringMethods`, so a file (or a type library) that declares one of
   *  those names again replaces the whole set, and nothing here is a special
   *  case in the analyzer. The build lowers each call to a plain function. */
  builtInMethod(t, name) {
    const parts = (t.kind === "union" ? t.types : [t]).map((m) => this.expand(m));
    const elements = parts.map((m) => m.kind === "array" ? m.element : m.kind === "tuple" ? union(m.elements) : void 0);
    const element = elements.every((e) => e !== void 0) ? union(elements) : void 0;
    const isString = (m) => m.kind === "primitive" && m.name === "string" || m.kind === "literal" && m.base === "string" || m.kind === "templateLiteral";
    const methodTable = element !== void 0 ? "ArrayMethods" : parts.every(isString) ? "StringMethods" : void 0;
    const def = methodTable === void 0 ? void 0 : this.aliasDefs.get(methodTable);
    if (!def || def.class) return void 0;
    const table = this.expand(this.instantiateAlias(def, element !== void 0 ? [element] : []));
    const layers = table.kind === "intersection" ? table.types.map((m) => this.expand(m)) : [table];
    for (let i = layers.length - 1; i >= 0; i--) {
      const part = layers[i];
      const property = part.kind === "object" ? part.properties.get(name) : void 0;
      if (property) return property.type;
    }
    return void 0;
  }
  /** The most a deferred type could turn out to be. A conditional is one of
   *  its branches, and the true branch stands for a member of what was
   *  tested (`T` in `T extends U ? T : never`); an indexed access reads
   *  through the bound of what it indexes. Anything else has no bound worth
   *  giving — `undefined` leaves the comparison as it was. */
  deferredBound(t, depth = 0) {
    if (depth > 8) return void 0;
    switch (t.kind) {
      case "conditional": {
        const check = this.reduceType(t.checkType);
        if (containsTypeParam(check)) return void 0;
        const subst = /* @__PURE__ */ new Map();
        if (t.distributeParam) subst.set(t.distributeParam, check);
        for (const name of t.inferVars ?? []) subst.set(name, unknownType);
        const branches = [substitute(t.trueType, subst), t.falseType].map((branch) => this.reduceType(branch));
        if (branches.some((branch) => containsTypeParam(branch))) return void 0;
        return union(branches);
      }
      case "indexedAccess": {
        const object = this.deferredBound(t.objectType, depth + 1) ?? this.atConstraints(t.objectType);
        const index = this.atConstraints(this.reduceType(t.indexType));
        if (!object || !index) return void 0;
        return this.indexedType(object, index);
      }
      default:
        return void 0;
    }
  }
  /** `t` with every type parameter standing at its constraint: `Map[K]`
   *  where `K extends "a" | "b"` is at most what those two keys hold. A
   *  parameter with no constraint bounds nothing, and says so. */
  atConstraints(t) {
    if (!containsTypeParam(t)) return t;
    const bounds = /* @__PURE__ */ new Map();
    const seen = /* @__PURE__ */ new WeakSet();
    let open = false;
    const walk = (value) => {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      if (value instanceof Map) {
        value.forEach(walk);
        return;
      }
      const part = value;
      if (part.kind === "object" && part.class) return;
      if (part.kind === "typeParam" && typeof part.name === "string") {
        if (part.constraint && !containsTypeParam(part.constraint)) {
          bounds.set(part.name, this.reduceType(part.constraint));
        } else {
          open = true;
        }
      }
      for (const child of Object.values(value)) walk(child);
    };
    walk(t);
    if (open) return void 0;
    const applied = this.reduceType(substitute(t, bounds));
    return containsTypeParam(applied) ? void 0 : applied;
  }
  /** What `text["upper"]` reads: a string answers only to its methods, the
   *  way Lua's string metatable does. */
  stringMember(object, index) {
    if (index.kind !== "literal" || typeof index.value !== "string") return void 0;
    const parts = this.stringParts(object);
    if (!parts) return void 0;
    const found = parts.map((part) => this.builtInMethod(part, index.value));
    return found.every((t) => t !== void 0) ? union(found) : void 0;
  }
  /** The members of `t` when every one of them is a string — `"a" | "b"` is
   *  as much a string as `string` is. */
  stringParts(t) {
    let expanded = this.expand(t);
    if (expanded.kind === "conditional" || expanded.kind === "indexedAccess") {
      const bound = this.deferredBound(expanded);
      if (!bound) return void 0;
      expanded = this.expand(bound);
    }
    const parts = (expanded.kind === "union" ? expanded.types : [expanded]).map((m) => this.expand(m));
    const isString = (m) => m.kind === "primitive" && m.name === "string" || m.kind === "literal" && m.base === "string" || m.kind === "templateLiteral";
    return parts.length && parts.every(isString) ? parts : void 0;
  }
  /** `text.Sans` or `text["Sans"]`: a string is not a table, and the only
   *  members it has are the ones a type library gave it — so a name that is
   *  not one of them is a mistake worth reporting, rather than the nil Lua
   *  would hand back. */
  checkStringMember(node, object, key) {
    if (!this.emitDiagnostics) return;
    const parts = this.stringParts(object);
    if (!parts) return;
    const keys = (key.kind === "union" ? key.types : [key]).map((m) => this.expand(m));
    if (!keys.length || !keys.every((m) => m.kind === "literal" && typeof m.value === "string")) return;
    const names = keys.map((m) => String(m.value));
    if (names.some((name) => parts.some((part) => this.builtInMethod(part, name)))) return;
    this.diagnostics.push({
      node,
      message: names.length === 1 ? `'${names[0]}' does not exist on a string` : `'${briefType(key)}' does not name a member of a string`
    });
  }
  propertyType(raw, name) {
    const t = this.deferredAccess(this.expand(raw));
    if (t.kind === "object") {
      const p = t.properties.get(name);
      if (p) return p.optional ? optional(p.type) : p.type;
      if (t.indexer) return t.indexer.value;
    }
    const built = this.builtInMethod(t, name);
    if (built) return built;
    if (t.kind === "union") {
      const built2 = this.builtInMethod(t, name);
      if (built2) return built2;
      return union(t.types.map((m) => this.propertyType(m, name)));
    }
    if (t.kind === "intersection") {
      const parts = t.types.map((m) => this.propertyType(m, name)).filter((p) => p.kind !== "unknown");
      if (parts.length) return intersection(parts);
    }
    if (t.kind === "typeParam" && t.constraint) return this.propertyType(t.constraint, name);
    if (t.kind === "difference") return this.propertyType(t.base, name);
    if (t.kind === "any") return anyType;
    if (t.kind === "conditional" || t.kind === "indexedAccess") {
      const bound = this.deferredBound(t);
      if (bound) return this.propertyType(bound, name);
    }
    return unknownType;
  }
  /** `t[k]`. A statically known string key resolves against the declared
   *  properties first — the indexer is only the fallback, so
   *  `{ [string]: number, tag: string }["tag"]` is `string`, not `number`. */
  indexedType(raw, idx) {
    const t = this.expand(raw);
    if (t.kind === "any") return anyType;
    if (t.kind === "union") return union(t.types.map((m) => this.indexedType(m, idx)));
    const index = this.expand(idx);
    if (index.kind === "union") return union(index.types.map((m) => this.indexedType(t, m)));
    if (t.kind === "difference") return this.indexedType(t.base, index);
    if (t.kind === "typeParam" && t.constraint) return this.indexedType(t.constraint, index);
    if (t.kind === "array") return t.element;
    if (t.kind === "tuple") {
      if (index.kind === "literal" && typeof index.value === "number") {
        return t.elements[index.value - 1] ?? nilType;
      }
      return union(t.elements);
    }
    if (t.kind === "object") {
      if (index.kind === "literal" && typeof index.value === "string") {
        const property = t.properties.get(index.value);
        if (property) return property.optional ? optional(property.type) : property.type;
        if (t.indexer && isAssignable(index, t.indexer.key)) return t.indexer.value;
        return nilType;
      }
      if (containsTypeParam(index)) return this.reduceType({ kind: "indexedAccess", objectType: t, indexType: index });
      if (t.indexer) return t.indexer.value;
    }
    return unknownType;
  }
  /** What a deferred `T[K]` can be: every property its index could name.
   *  Reading a member of one, or calling it, sees that. */
  deferredAccess(t) {
    if (t.kind !== "indexedAccess") return t;
    const index = t.indexType.kind === "typeParam" && t.indexType.constraint ? t.indexType.constraint : t.indexType;
    if (containsTypeParam(index)) return unknownType;
    return this.accessType(t.objectType, index);
  }
  elementType(raw, index) {
    const t = this.expand(raw);
    if (t.kind === "array") return t.element;
    if (t.kind === "tuple") return t.elements[index] ?? unknownType;
    if (t.kind === "union") return union(t.types.map((m) => this.elementType(m, index)));
    if (t.kind === "difference") return this.elementType(t.base, index);
    if (t.kind === "typeParam" && t.constraint) return this.elementType(t.constraint, index);
    if (t.kind === "any") return anyType;
    return unknownType;
  }
  // --------------------------------------------------------
  // Expression inference
  // --------------------------------------------------------
  infer(expr, env) {
    const t = this.inferInner(expr, env);
    this.typeOf.set(expr, t);
    return t;
  }
  inferInner(expr, env) {
    switch (expr.type) {
      case "NilLiteral":
        return nilType;
      case "BooleanLiteral":
        return literal(expr.value);
      case "NumberLiteral":
        return literal(expr.value);
      case "StringLiteral":
        return literal(expr.value);
      case "InterpolatedStringExpression": {
        for (const part of expr.parts) if (part.kind === "expression") this.infer(part.expression, env);
        return stringType;
      }
      // `...` holds what the function declared it takes.
      case "VarargExpression":
        return this.varargs[this.varargs.length - 1] ?? anyType;
      // `f(a, ...rest)` — every value the array holds, one after
      // another. Each of them is an element, so that is what the
      // parameters it fills are checked against.
      case "SpreadElement": {
        const spread = this.infer(expr.argument, env);
        const element = this.spreadElement(spread);
        if (element === void 0 && this.emitDiagnostics) {
          this.diagnostics.push({
            node: expr,
            message: `Only an array can be spread, and '${formatType(spread)}' is not one`
          });
        }
        return element ?? anyType;
      }
      // Broken syntax is reported by the parser; nothing more to say.
      case "ErrorExpression":
        return anyType;
      case "Identifier": {
        const id = this.bindingIdOf(expr);
        if (id === void 0) return anyType;
        const t = this.currentType(id, env);
        this.narrowedTypeOf.set(expr, t);
        return t;
      }
      case "ArrayExpression":
        return this.inferArray(expr, env, false);
      case "TableExpression":
        return this.inferObject(expr, env, false);
      case "FunctionExpression":
        this.checkParamOrder(expr.func.params, expr);
        this.visitFunctionBody(expr.func, env);
        return this.inferFunctionBody(expr.func, env);
      case "ParenthesizedExpression": {
        const inner = this.infer(expr.expression, env);
        return inner.kind === "tuple" && inner.isPack && producesMultipleValues(expr.expression) ? inner.elements[0] ?? nilType : inner;
      }
      case "TypeAssertionExpression": {
        this.infer(expr.expression, env);
        return this.resolveType(expr.typeAnnotation);
      }
      case "SatisfiesExpression": {
        const declared = this.resolveType(expr.typeAnnotation);
        this.applyContext(expr.expression, declared);
        if (declared.kind === "any") return this.infer(expr.expression, env);
        const written = unwrapParens(expr.expression);
        const fresh = written.type === "TableExpression" || written.type === "ArrayExpression";
        const narrow = fresh ? this.inferAsConst(expr.expression, env) : this.infer(expr.expression, env);
        const actual = fresh ? this.keepContextualLiterals(narrow, declared) : narrow;
        this.typeOf.set(expr.expression, actual);
        if (!this.emitDiagnostics) return actual;
        if (!isAssignable(narrow, declared) && !isAssignable(actual, declared)) {
          this.diagnostics.push({
            node: expr,
            message: `Type '${formatType(actual)}' does not satisfy the expected type '${formatType(declared)}'`
          });
        } else {
          this.reportExcessProperties(expr.expression, declared);
        }
        return actual;
      }
      case "AsConstExpression":
        return this.inferAsConst(expr.expression, env);
      case "UnaryExpression": {
        const arg = this.infer(expr.argument, env);
        switch (expr.operator) {
          case "not":
            return booleanType;
          case "-":
            return this.operatorResult(expr, "-", arg, void 0) ?? numberType;
          case "#":
            return this.operatorResult(expr, "#", arg, void 0) ?? numberType;
        }
        return arg;
      }
      case "BinaryExpression": {
        const op = expr.operator;
        if (op === "and") {
          this.infer(expr.left, env);
          const { whenTrue } = this.narrowFromCondition(expr.left, env);
          const right = this.infer(expr.right, whenTrue);
          return union([narrowFalsy(this.typeOf.get(expr.left) ?? anyType), right]);
        }
        if (op === "or") {
          const left = this.infer(expr.left, env);
          const { whenFalse } = this.narrowFromCondition(expr.left, env);
          const right = this.infer(expr.right, whenFalse);
          return union([narrowTruthy(left), right]);
        }
        const l = this.infer(expr.left, env);
        const r = this.infer(expr.right, env);
        if (op === "==" || op === "~=") {
          if (unwrapParens(expr.right).type === "StringLiteral") this.expectedTypeOf.set(unwrapParens(expr.right), l);
          if (unwrapParens(expr.left).type === "StringLiteral") this.expectedTypeOf.set(unwrapParens(expr.left), r);
        }
        switch (op) {
          case "..":
            return this.operatorResult(expr, op, l, r) ?? stringType;
          case "==":
          case "~=":
          case "<":
          case ">":
          case "<=":
          case ">=":
            return booleanType;
          case "+":
          case "-":
          case "*":
          case "/":
          case "//":
          case "%":
          case "^":
            return this.operatorResult(expr, op, l, r) ?? numberType;
        }
        return union([l, r]);
      }
      case "MemberExpression": {
        const { type: obj, shortCircuits } = this.chainObject(expr, expr.object, env);
        const key = this.refKeyOf(expr);
        const narrowed = key === void 0 ? void 0 : env.get(key);
        this.checkStringMember(expr, obj, literal(expr.property.name));
        return this.chainResult(expr, narrowed ?? this.propertyType(obj, expr.property.name), shortCircuits);
      }
      case "IndexExpression": {
        const { type: obj, shortCircuits } = this.chainObject(expr, expr.object, env);
        const idx = this.infer(expr.index, env);
        const key = this.refKeyOf(expr);
        const narrowed = key === void 0 ? void 0 : env.get(key);
        this.checkStringMember(expr, obj, this.expand(idx));
        const member = this.stringMember(obj, this.expand(idx));
        if (member) return this.chainResult(expr, member, shortCircuits);
        return this.chainResult(expr, narrowed ?? this.indexedType(obj, idx), shortCircuits);
      }
      case "CallExpression": {
        if (expr.callee.type === "SuperExpression") return this.inferSuperCall(expr, env);
        const { type: callee, shortCircuits } = this.chainObject(expr, expr.callee, env);
        return this.chainResult(expr, this.inferCall(expr, callee, env), shortCircuits);
      }
      case "NewExpression":
        return this.inferNew(expr, env);
      case "ClassExpression":
        return this.visitClass(expr, env);
      case "SuperExpression": {
        const stmt = this.currentClass;
        if (!stmt?.superclass) {
          if (this.emitDiagnostics) {
            this.diagnostics.push({
              node: expr,
              message: "'super' is only available inside a class that extends another"
            });
          }
          return anyType;
        }
        return this.superType(stmt);
      }
      case "MethodCallExpression": {
        const { type: objType, shortCircuits } = this.chainObject(expr, expr.object, env);
        return this.chainResult(expr, this.inferMethodCall(expr, objType, env), shortCircuits);
      }
      case "IfElseExpression": {
        const branches = [];
        let elseEnv = env;
        for (const c of expr.clauses) {
          this.infer(c.condition, elseEnv);
          const { whenTrue, whenFalse } = this.narrowFromCondition(c.condition, elseEnv);
          branches.push(this.infer(c.body, whenTrue));
          elseEnv = whenFalse;
        }
        branches.push(this.infer(expr.alternate, elseEnv));
        return union(branches);
      }
    }
  }
  /** `new Name(args)` is `Name.new(args)` — the same function, and the
   *  same check. Saying so here rather than rewriting the tree keeps the
   *  error messages pointing at what was written. */
  inferNew(expr, env) {
    const calleeType = this.infer(expr.callee, env);
    const constructor = this.propertyType(calleeType, "new");
    if (!this.overloadsOf(constructor).length && calleeType.kind !== "any") {
      if (this.emitDiagnostics) {
        const label = expressionLabel(expr.callee) ?? formatType(calleeType);
        this.diagnostics.push({ node: expr.callee, message: `'${label}' is not a class; 'new' needs one` });
      }
      for (const argument of expr.arguments) this.infer(argument, env);
      return anyType;
    }
    return this.inferCall(expr, constructor, env);
  }
  /** `super(...)` — the base constructor, run on the instance being built. */
  inferSuperCall(expr, env) {
    const stmt = this.currentClass;
    const constructor = stmt ? this.baseConstructorType(stmt) : void 0;
    if (!stmt?.superclass) {
      if (this.emitDiagnostics) {
        this.diagnostics.push({
          node: expr,
          message: "'super(...)' is only available inside the constructor of a class that extends another"
        });
      }
      for (const argument of expr.arguments) this.infer(argument, env);
      return nilType;
    }
    if (!constructor) {
      for (const argument of expr.arguments) this.infer(argument, env);
      return nilType;
    }
    const callable = fn(constructor.params.filter((p) => p.name !== "this"), nilType, constructor.varargs);
    this.inferCall(expr, callable, env);
    return nilType;
  }
  inferCall(expr, callee, env) {
    this.checkAmbiguousCall(expr);
    const fns = this.overloadsOf(callee);
    const explicit = this.explicitTypeArguments(expr, fns);
    const expected = this.expectedArguments(expr.arguments, fns, () => 0);
    expr.arguments.forEach((a, i) => this.applyContext(a, expected[i]));
    const argTypes = expr.arguments.map((a) => this.infer(a, env));
    if (fns.length) {
      this.recordExpected(expr.arguments, fns, () => 0, () => argTypes);
      const spread = this.spreadOf(expr.arguments);
      const arityFits = this.checkArity(expr, fns, argTypes.length, 0, spread);
      const picked = this.pickOverload(fns, argTypes, void 0, spread);
      const distributed = this.distributedReturn(fns, argTypes, picked, (_, args) => args);
      if (distributed) return distributed;
      if (picked) {
        this.checkInferredArguments(expr, expr.arguments, picked, argTypes, 0);
        return this.callReturn(picked, this.constArgs(picked, expr.arguments, argTypes, env), explicit);
      }
      if (arityFits) this.reportArguments(expr, expr.arguments, fns, () => argTypes, () => 0);
      return union(fns.map((f) => this.callReturn(f, argTypes, explicit)));
    }
    return callee.kind === "any" ? anyType : unknownType;
  }
  /** A `(` on a line of its own continues the statement above it:
   *
   *      const value = map[key]
   *      ("text"):upper()
   *
   *  calls `map[key]`, in luaut as in Lua and in JavaScript. It is almost
   *  never what was meant, and what it does instead is invisible — so say
   *  so, and name the fix. */
  checkAmbiguousCall(expr) {
    if (!this.emitDiagnostics || !expr.argumentsOnNewLine) return;
    this.diagnostics.push({
      node: expr,
      message: "This calls the value the line above ends with \u2014 a line break does not end a statement. Write ';' before '(' if a new statement was meant."
    });
  }
  inferMethodCall(expr, objType, env) {
    const fns = this.overloadsOf(this.propertyType(objType, expr.method.name));
    const explicit = this.explicitTypeArguments(expr, fns);
    const expected = this.expectedArguments(expr.arguments, fns, (f) => this.takesSelf(f) ? 1 : 0);
    expr.arguments.forEach((a, i) => this.applyContext(a, expected[i]));
    const argTypes = expr.arguments.map((a) => this.infer(a, env));
    if (fns.length) {
      const withSelf = (f) => this.takesSelf(f) ? [objType, ...argTypes] : argTypes;
      const selfOf = (f) => this.takesSelf(f) ? 1 : 0;
      this.recordExpected(expr.arguments, fns, selfOf, withSelf);
      const self0 = this.takesSelf(fns[0]) ? 1 : 0;
      const spread = this.spreadOf(expr.arguments, self0);
      const arityFits = this.checkArity(expr, fns, argTypes.length, self0, spread);
      const picked = this.pickOverload(fns, argTypes, withSelf, spread);
      const distributed = this.distributedReturn(
        fns,
        argTypes,
        picked,
        (f, args) => this.takesSelf(f) ? [objType, ...args] : args
      );
      if (distributed) return distributed;
      if (picked) {
        const self = this.takesSelf(picked) ? 1 : 0;
        this.checkInferredArguments(expr, expr.arguments, picked, withSelf(picked), self);
        const written = this.constArgs(picked, expr.arguments, argTypes, env, self);
        return this.callReturn(picked, this.takesSelf(picked) ? [objType, ...written] : written, explicit);
      }
      if (arityFits) this.reportArguments(expr, expr.arguments, fns, withSelf, selfOf);
      return union(fns.map((f) => this.callReturn(f, withSelf(f), explicit)));
    }
    return objType.kind === "any" ? anyType : unknownType;
  }
  // --------------------------------------------------------
  // Optional chains
  // --------------------------------------------------------
  //
  // `a?.b.c`: when `a` is nil the whole chain is nil and `.c` never runs.
  // So a link reads its object without the `nil` a `?.` earlier in the chain
  // added — that nil has already left the chain — and the chain's outermost
  // link carries it again. Parentheses end a chain: `(a?.b).c` reads `.c`
  // from `B | nil`.
  /** The type of a link's non-nil object, for each link that is past a `?.`:
   *  what the chain holds when it has not short-circuited. */
  chainValue = /* @__PURE__ */ new WeakMap();
  /** The object a link reads from, and whether the chain can short-circuit
   *  by this link. */
  chainObject(link, object, env) {
    const full = this.infer(object, env);
    const inChain = this.chainValue.get(object);
    let type = inChain ?? full;
    if (link.optional) {
      type = withoutNil(type);
    } else if (this.includesNil(type)) {
      this.reportNilAccess(object, type);
      type = withoutNil(this.expand(type));
    }
    return { type, shortCircuits: inChain !== void 0 || link.optional === true };
  }
  /** Objects already reported as possibly nil: a loop body is visited more
   *  than once. */
  nilAccessReported = /* @__PURE__ */ new WeakSet();
  includesNil(raw) {
    const t = this.expand(raw);
    if (t.kind === "primitive") return t.name === "nil";
    return t.kind === "union" && t.types.some((m) => m.kind === "primitive" && m.name === "nil");
  }
  reportNilAccess(object, type) {
    if (!this.emitDiagnostics || this.nilAccessReported.has(object)) return;
    this.nilAccessReported.add(object);
    const label = expressionLabel(object);
    const t = this.expand(type);
    const nilOnly = t.kind === "primitive" && t.name === "nil";
    const subject = label === void 0 ? "Object" : `'${label}'`;
    this.diagnostics.push({
      node: object,
      message: nilOnly ? `${subject} is nil` : `${subject} is possibly nil. Check it first, or use '?.' / '?:'`
    });
  }
  chainResult(link, value, shortCircuits) {
    if (!shortCircuits) return value;
    this.chainValue.set(link, value);
    return union([value, nilType]);
  }
  /** The chain around `cond` did not short-circuit — it produced a truthy
   *  value, or any value but nil — so every object a `?.` in it tested is not
   *  nil in `env`. */
  narrowOptionalLinks(cond, env, into) {
    for (let e = cond; ; ) {
      const link = e;
      const object = e.type === "CallExpression" ? e.callee : e.type === "MemberExpression" || e.type === "IndexExpression" || e.type === "MethodCallExpression" ? e.object : void 0;
      if (!object) return;
      if (link.optional) {
        const key = this.refKeyOf(object);
        if (key !== void 0) this.setRef(into, key, withoutNil(this.typeAtRef(object, into)));
      }
      e = object;
    }
  }
  inferArray(expr, env, asConst) {
    const contextual = this.contextualArrays.get(expr);
    if (contextual && !asConst) return contextual;
    const elems = [];
    let hadSpread = false;
    for (const el of expr.elements) {
      if (el.type === "SpreadElement") {
        hadSpread = true;
        const s = this.infer(el.argument, env);
        if (s.kind === "array") elems.push(s.element);
        else if (s.kind === "tuple") elems.push(...s.elements);
        else elems.push(unknownType);
      } else {
        elems.push(asConst ? this.inferAsConst(el, env) : this.infer(el, env));
      }
    }
    if (asConst && !hadSpread) return tuple(elems);
    return arrayOf(elems.length ? union(elems.map((t, i) => {
      const element = expr.elements[i];
      return asConst || !element || element.type === "SpreadElement" ? t : this.widenUnlessAsked(t, element);
    })) : unknownType);
  }
  /** A literal written inside a fresh table or array widens — `{ n = 1 }` is
   *  `{ n: number }` — unless the surroundings said a literal belongs there.
   *  `request({ Method: "GET" })` keeps `"GET"` when `Method` is a union of
   *  string literals, exactly as TypeScript's contextual typing does, and
   *  goes on widening to `string` when the parameter only says `string`.
   *  The context was recorded by `applyContext` before the value was
   *  inferred, so this is a lookup rather than a second pass. */
  widenUnlessAsked(value, at) {
    const wanted = this.expectedTypeOf.get(at);
    return wanted === void 0 ? widen(value) : this.keepContextualLiterals(value, wanted);
  }
  inferObject(expr, env, asConst) {
    const entries = [];
    let indexer;
    for (const field of expr.fields) {
      if (field.type === "TableFieldNamed") {
        const key = field.key.type === "Identifier" ? field.key.name : field.key.value;
        const v = asConst ? this.inferAsConst(field.value, env) : this.widenUnlessAsked(this.infer(field.value, env), field.value);
        entries.push([key, { type: v, optional: false, readonly: asConst }]);
      } else if (field.type === "TableFieldShorthand") {
        const v = this.infer(field.name, env);
        entries.push([field.name.name, {
          type: asConst ? v : this.widenUnlessAsked(v, field.name),
          optional: false,
          readonly: asConst
        }]);
      } else if (field.type === "TableFieldComputed") {
        const k = this.infer(field.key, env);
        const v = this.infer(field.value, env);
        if (k.kind === "literal" && typeof k.value === "string") {
          entries.push([k.value, {
            type: asConst ? v : this.widenUnlessAsked(v, field.value),
            optional: false,
            readonly: asConst
          }]);
        } else {
          indexer = mergeIndexer(indexer, { key: widen(k), value: asConst ? v : widen(v) });
        }
      } else {
        const s = this.infer(field.argument, env);
        if (s.kind === "object") {
          for (const [k, p] of s.properties) entries.push([k, p]);
          if (s.indexer) indexer = mergeIndexer(indexer, s.indexer);
        }
      }
    }
    return objectType(entries, indexer, asConst || void 0);
  }
  /** A value inferred `as const`, widened back wherever `context` does not
   *  ask for a literal: `satisfies`' result type. A property keeps `"circle"`
   *  when the contract's property admits string literals, and becomes
   *  `string` when it is only `string`; a tuple becomes an array unless the
   *  contract is a tuple; nothing stays readonly. */
  keepContextualLiterals(value, context) {
    const ctx = context === void 0 ? void 0 : this.expand(context);
    switch (value.kind) {
      case "literal":
        return ctx && this.admitsLiteral(ctx, value.base) ? value : widen(value);
      case "object": {
        if (value.class) return value;
        const entries = [...value.properties].map(([name, property]) => [
          name,
          { ...property, readonly: false, type: this.keepContextualLiterals(property.type, ctx && this.contextProperty(ctx, name)) }
        ]);
        const indexer = value.indexer && {
          key: widen(value.indexer.key),
          value: this.keepContextualLiterals(value.indexer.value, ctx && this.contextIndexValue(ctx))
        };
        return objectType(entries, indexer);
      }
      case "tuple": {
        const tupleContext = ctx && this.membersOf(ctx).find((m) => m.kind === "tuple");
        if (tupleContext?.kind === "tuple") {
          return tuple(value.elements.map((e, i) => this.keepContextualLiterals(e, tupleContext.elements[i])), value.isPack);
        }
        const arrayContext = ctx && this.membersOf(ctx).find((m) => m.kind === "array");
        const element = arrayContext?.kind === "array" ? arrayContext.element : void 0;
        if (!value.elements.length) return arrayContext ?? arrayOf(unknownType);
        return arrayOf(union(value.elements.map((e) => this.keepContextualLiterals(e, element))));
      }
      case "array": {
        const arrayContext = ctx && this.membersOf(ctx).find((m) => m.kind === "array");
        return arrayOf(this.keepContextualLiterals(value.element, arrayContext?.kind === "array" ? arrayContext.element : void 0));
      }
      case "union":
        return union(value.types.map((t) => this.keepContextualLiterals(t, context)));
      default:
        return value;
    }
  }
  membersOf(t) {
    const x = this.expand(t);
    return x.kind === "union" ? x.types.map((m) => this.expand(m)) : [x];
  }
  /** Does a contract accept literals of `base` as such? */
  admitsLiteral(ctx, base) {
    return this.membersOf(ctx).some((m) => m.kind === "literal" && m.base === base || m.kind === "templateLiteral" && base === "string");
  }
  /** What a contract expects of property `name`, over every object it allows. */
  contextProperty(ctx, name) {
    const found = [];
    for (const m of this.membersOf(ctx)) {
      if (m.kind !== "object") continue;
      const property = m.properties.get(name);
      if (property) found.push(property.type);
      else if (m.indexer) found.push(m.indexer.value);
    }
    return found.length ? union(found) : void 0;
  }
  contextIndexValue(ctx) {
    const found = this.membersOf(ctx).flatMap((m) => m.kind === "object" && m.indexer ? [m.indexer.value] : []);
    return found.length ? union(found) : void 0;
  }
  /** Fields reported by `reportExcessProperties`, once each: a loop body is
   *  visited more than once. */
  excessReported = /* @__PURE__ */ new WeakSet();
  /** TypeScript's excess property check. An object literal written straight
   *  into a typed place — an annotation, `satisfies` — may only name
   *  properties that place knows: anything else is almost always a typo.
   *  A nested literal is checked against the property it is written for.
   *  A target with an indexer, a class, or a member whose shape is not known
   *  accepts anything. */
  /** The keys an index signature covers, when it covers a countable set of
   *  them: `[("a" | "b")]` yes, `[string]` no. */
  finiteKeys(key) {
    const t = this.expand(key);
    const parts = t.kind === "union" ? t.types : [t];
    const out = /* @__PURE__ */ new Set();
    for (const part of parts.map((m) => this.expand(m))) {
      if (part.kind !== "literal" || typeof part.value === "boolean") return void 0;
      out.add(String(part.value));
    }
    return out.size ? out : void 0;
  }
  reportExcessProperties(expression, target) {
    let literal2 = unwrapParens(expression);
    while (literal2.type === "AsConstExpression") literal2 = unwrapParens(literal2.expression);
    if (literal2.type !== "TableExpression" || !this.emitDiagnostics) return;
    const members = this.membersOf(target);
    const shapes = members.filter((m) => m.kind === "object");
    if (!shapes.length || shapes.some((o) => o.class)) return;
    const keySets = shapes.map((o) => o.indexer && this.finiteKeys(o.indexer.key));
    if (shapes.some((o, i) => o.indexer && !keySets[i])) return;
    if (members.some((m) => m.kind === "any" || m.kind === "unknown" || m.kind === "typeParam" || m.kind === "intersection")) return;
    for (const field of literal2.fields) {
      if (field.type !== "TableFieldNamed" && field.type !== "TableFieldShorthand") continue;
      const key = field.type === "TableFieldNamed" ? field.key : field.name;
      const name = key.type === "Identifier" ? key.name : key.value;
      const expected = shapes.flatMap((o, i) => {
        const property = o.properties.get(name);
        if (property) return [property.type];
        return o.indexer && keySets[i].has(name) ? [o.indexer.value] : [];
      });
      if (!expected.length) {
        if (this.excessReported.has(key)) continue;
        this.excessReported.add(key);
        this.diagnostics.push({
          node: key,
          message: `Object literal may only specify known properties, and '${name}' does not exist in type '${formatType(target)}'`
        });
        continue;
      }
      if (field.type === "TableFieldNamed") this.reportExcessProperties(field.value, union(expected));
    }
  }
  inferAsConst(expr, env) {
    switch (expr.type) {
      case "ArrayExpression":
        return this.inferArray(expr, env, true);
      case "TableExpression":
        return this.inferObject(expr, env, true);
      case "ParenthesizedExpression":
        return this.inferAsConst(expr.expression, env);
      case "AsConstExpression":
        return this.inferAsConst(expr.expression, env);
      default: {
        const t = this.inferInner(expr, env);
        this.typeOf.set(expr, t);
        return t;
      }
    }
  }
  // --------------------------------------------------------
  // Narrowing
  // --------------------------------------------------------
  narrowFromCondition(cond, env) {
    const whenTrue = forkEnv(env);
    const whenFalse = forkEnv(env);
    this.applyNarrowing(cond, env, whenTrue, whenFalse);
    return { whenTrue, whenFalse };
  }
  /** Record what `cond` being true (`t`) or false (`f`) tells us. `env` is the
   *  state the condition is evaluated in; `t` and `f` are the two successor
   *  states to write into. */
  applyNarrowing(cond, env, t, f) {
    if (cond.type === "ParenthesizedExpression") {
      this.applyNarrowing(cond.expression, env, t, f);
      return;
    }
    if (cond.type === "UnaryExpression" && cond.operator === "not") {
      this.applyNarrowing(cond.argument, env, f, t);
      return;
    }
    if (cond.type === "BinaryExpression") {
      const { operator: op, left, right } = cond;
      if (op === "and") {
        this.applyNarrowing(left, env, t, forkEnv(env));
        this.applyNarrowing(right, t, t, forkEnv(t));
        return;
      }
      if (op === "or") {
        this.applyNarrowing(left, env, forkEnv(env), f);
        this.applyNarrowing(right, f, forkEnv(f), f);
        return;
      }
      if (op === "==" || op === "~=") {
        this.narrowByComparison(left, right, op === "==", env, t, f);
      }
      return;
    }
    if (cond.type === "CallExpression" || cond.type === "MethodCallExpression") {
      this.narrowByPredicateCall(cond, env, t, f);
    } else {
      this.narrowRef(cond, env, t, f, (cur) => ({
        yes: narrowTruthy(cur),
        no: narrowFalsy(cur)
      }));
    }
    this.narrowOptionalLinks(cond, env, t);
  }
  /** `a == b` / `a ~= b`. Handles, in order: a declaration-driven
   *  `typeof(x) == "..."` test, a literal/`nil` comparison against a
   *  reference, and a reference-to-reference comparison. */
  narrowByComparison(left, right, eq, env, t, f) {
    const yes = eq ? t : f;
    const no = eq ? f : t;
    if (this.narrowByCallResult(left, right, yes, no, env)) return;
    if (this.narrowByCallResult(right, left, yes, no, env)) return;
    const litOf = (e) => {
      const v = this.asLiteral(e);
      if (v !== void 0) return literal(v);
      return e.type === "NilLiteral" ? nilType : void 0;
    };
    for (const [ref, other] of [[left, right], [right, left]]) {
      const value = litOf(other);
      if (value === void 0) continue;
      if (this.refKeyOf(ref) !== void 0) {
        this.narrowRef(ref, env, yes, no, (cur) => ({
          yes: narrowTo(cur, value),
          no: narrowExclude(cur, value)
        }));
      }
      this.narrowOptionalLinks(ref, env, value.kind === "primitive" && value.name === "nil" ? no : yes);
      return;
    }
    if (this.refKeyOf(left) !== void 0 && this.refKeyOf(right) !== void 0) {
      const lt = this.typeAtRef(left, env);
      const rt = this.typeAtRef(right, env);
      this.narrowRef(left, env, yes, no, (cur) => ({ yes: narrowTo(cur, rt), no: cur }));
      this.narrowRef(right, env, yes, no, (cur) => ({ yes: narrowTo(cur, lt), no: cur }));
    }
  }
  /** Declaration-driven `typeof(x) == "number"`.
   *
   *  `typeof` is not special-cased: it is declared in the definitions as an
   *  overload set whose members return *string-literal* types
   *  (`(value: number) -> "number"`, ...). So for `f(x) == "lit"` we keep the
   *  parameter types of the overloads that can return `"lit"`, and that union
   *  is what `x` narrows to. Any user function declared the same way gets the
   *  same treatment for free.
   *
   *  The analyzer knows nothing about the names `type` and `typeof`: with no
   *  definitions loaded there are no literal-returning overloads and this
   *  narrows nothing. Returns true if it handled the comparison. */
  narrowByCallResult(callSide, litSide, yes, no, env) {
    if (callSide.type !== "CallExpression" || callSide.arguments.length !== 1) return false;
    const name = this.asLiteral(litSide);
    if (typeof name !== "string") return false;
    const arg = callSide.arguments[0];
    if (this.refKeyOf(arg) === void 0) return false;
    const result = literal(name);
    const callee = this.typeOf.get(callSide.callee) ?? this.typeAtRef(callSide.callee, env);
    const discriminating = this.overloadsOf(callee).filter((o) => o.params.length >= 1 && o.returns.kind === "literal");
    if (!discriminating.length) return false;
    const matching = discriminating.filter((o) => isAssignable(result, o.returns));
    if (!matching.length) return false;
    const filter = union(matching.map((o) => o.params[0].type));
    this.narrowRef(arg, env, yes, no, (cur) => ({
      yes: narrowTo(cur, filter),
      no: narrowExclude(cur, filter)
    }));
    return true;
  }
  /** A call used as a condition, where the callee was declared with a type
   *  guard (`v is string`). Narrows the corresponding argument. */
  narrowByPredicateCall(cond, env, t, f) {
    const found = this.predicateCallTarget(cond, env);
    if (!found) return;
    const filter = found.predicate.type;
    this.narrowRef(found.arg, env, t, f, (cur) => filter ? { yes: narrowTo(cur, filter), no: narrowExclude(cur, filter) } : { yes: narrowTruthy(cur), no: narrowFalsy(cur) });
  }
  /** Resolve a call expression to (guarded argument, predicate), if the
   *  callee was declared with one and that argument is a narrowable
   *  reference. Shared by branch guards and `asserts` statements. */
  predicateCallTarget(cond, env) {
    let callee;
    let args;
    let selfType;
    if (cond.type === "CallExpression") {
      callee = this.chainValue.get(cond.callee) ?? this.typeOf.get(cond.callee) ?? this.typeAtRef(cond.callee, env);
      args = cond.arguments;
    } else if (cond.type === "MethodCallExpression") {
      let objType = this.chainValue.get(cond.object) ?? this.typeOf.get(cond.object) ?? this.typeAtRef(cond.object, env);
      if (cond.optional) {
        objType = withoutNil(objType);
        selfType = objType;
      }
      callee = this.propertyType(objType, cond.method.name);
      const first = this.overloadsOf(callee)[0];
      args = first && this.takesSelf(first) ? [cond.object, ...cond.arguments] : cond.arguments;
    } else {
      return void 0;
    }
    const overloads = this.overloadsOf(callee);
    const argTypes = args.map((a) => (selfType && cond.type === "MethodCallExpression" && a === cond.object ? selfType : void 0) ?? this.typeOf.get(a) ?? this.typeAtRef(a, env));
    const picked = this.pickOverload(overloads, argTypes);
    const candidates = picked ? [picked, ...overloads.filter((f) => f !== picked)] : overloads;
    for (const f of candidates) {
      if (!f.predicate) continue;
      const arg = args[f.predicate.param];
      if (!arg || this.refKeyOf(arg) === void 0) continue;
      if (f.typeParams?.length && f.predicate.type) {
        const subst = this.inferTypeArgs(f, argTypes);
        return {
          arg,
          predicate: {
            ...f.predicate,
            type: this.reduceType(substitute(f.predicate.type, subst))
          }
        };
      }
      return { arg, predicate: f.predicate };
    }
    return void 0;
  }
  /** `assert(x)` / any `asserts`-declared call in statement position: narrows
   *  the *rest of the enclosing block* rather than a branch. */
  applyAssertion(call, env) {
    const found = this.predicateCallTarget(call, env);
    if (!found || !found.predicate.asserts) return;
    const filter = found.predicate.type;
    this.narrowRef(found.arg, env, env, forkEnv(env), (cur) => filter ? { yes: narrowTo(cur, filter), no: narrowExclude(cur, filter) } : { yes: narrowTruthy(cur), no: narrowFalsy(cur) });
  }
  // --------------------------------------------------------
  // Reference paths
  // --------------------------------------------------------
  /** The flow key for a narrowable reference, or undefined if `expr` is not
   *  one (a call, an arithmetic result, a computed index, ...). */
  refKeyOf(expr) {
    switch (expr.type) {
      case "Identifier": {
        const id = this.bindingIdOf(expr);
        return id === void 0 ? void 0 : bindKey(id);
      }
      case "ParenthesizedExpression":
        return this.refKeyOf(expr.expression);
      case "MemberExpression": {
        const base = this.refKeyOf(expr.object);
        return base === void 0 ? void 0 : `${base}.${expr.property.name}`;
      }
      case "IndexExpression": {
        const base = this.refKeyOf(expr.object);
        if (base === void 0) return void 0;
        if (expr.index.type === "StringLiteral") return `${base}.${expr.index.value}`;
        if (expr.index.type === "NumberLiteral") return `${base}#${expr.index.value}`;
        return void 0;
      }
      default:
        return void 0;
    }
  }
  /** The type of a reference right now: its flow narrowing if it has one,
   *  else its declared type reached through the (possibly narrowed) parent.
   *  Never records anything in `typeOf` — narrowing must not perturb
   *  inference results. */
  typeAtRef(expr, env) {
    const key = this.refKeyOf(expr);
    if (key !== void 0) {
      const narrowed = env.get(key);
      if (narrowed) return narrowed;
    }
    switch (expr.type) {
      case "Identifier": {
        const id = this.bindingIdOf(expr);
        return id === void 0 ? anyType : this.currentType(id, env);
      }
      case "ParenthesizedExpression":
        return this.typeAtRef(expr.expression, env);
      case "MemberExpression":
        return this.propertyType(this.typeAtRef(expr.object, env), expr.property.name);
      case "IndexExpression":
        return this.indexedType(
          this.typeAtRef(expr.object, env),
          this.typeOf.get(expr.index) ?? unknownType
        );
      default:
        return this.typeOf.get(expr) ?? anyType;
    }
  }
  /** The declared (un-narrowed) type behind a flow key — what a reference
   *  falls back to when one branch narrowed it and another did not. */
  declaredAtRef(key) {
    const root = /^\$(\d+)/.exec(key);
    if (!root) return anyType;
    let t = this.bindingType.get(Number(root[1])) ?? anyType;
    for (const step of key.slice(root[0].length).matchAll(/\.([^.#]+)|#(\d+)/g)) {
      t = step[1] !== void 0 ? this.propertyType(t, step[1]) : this.indexedType(t, literal(Number(step[2])));
    }
    return t;
  }
  /** Narrow a reference in both successor states, then propagate the
   *  consequences *up* the path: if `s.kind` is now `"circle"`, the union
   *  members of `s` whose `kind` cannot be `"circle"` are gone too. That
   *  upward step is what makes discriminated unions work at any depth. */
  narrowRef(expr, env, t, f, refine) {
    const key = this.refKeyOf(expr);
    if (key === void 0) return;
    const cur = this.typeAtRef(expr, env);
    const { yes, no } = refine(cur);
    this.setRef(t, key, yes);
    this.setRef(f, key, no);
    this.correlate(t, key, yes);
    this.correlate(f, key, no);
    this.propagateAliases(env, t, key, yes);
    this.propagateAliases(env, f, key, no);
    const inner = expr.type === "ParenthesizedExpression" ? expr.expression : expr;
    if (inner.type !== "MemberExpression" && inner.type !== "IndexExpression") return;
    const parentKey = this.refKeyOf(inner.object);
    if (parentKey === void 0) return;
    const step = key.slice(parentKey.length);
    if (!step.startsWith(".")) return;
    const prop = step.slice(1);
    const optional2 = inner.type === "MemberExpression" && inner.optional === true;
    this.narrowRef(inner.object, env, t, f, (parentType) => ({
      yes: this.filterByProperty(parentType, prop, yes, optional2),
      no: this.filterByProperty(parentType, prop, no, optional2)
    }));
  }
  /** Keep the union members of `parent` whose `prop` can still hold `want`.
   *  Leaves a non-union (or a union nothing matches) alone: over-narrowing a
   *  plain object to `never` because of a property test would be worse than
   *  learning nothing. */
  filterByProperty(parent, prop, want, optional2 = false) {
    if (parent.kind !== "union" || want.kind === "never") return parent;
    const kept = parent.types.filter((m) => m.kind === "primitive" && m.name === "nil" ? optional2 && overlaps(nilType, want) : overlaps(this.propertyType(m, prop), want));
    return kept.length ? union(kept) : parent;
  }
  /** Record a narrowing. Deliberately does *not* discard what is known about
   *  paths beneath `key`: narrowing only ever shrinks a type, and the child
   *  facts were derived from the same test — `narrowRef` sets the leaf first
   *  and then walks up, so wiping descendants here would erase the very
   *  narrowing that triggered the walk. Assignment is the operation that
   *  invalidates (`assignToRef`). */
  setRef(env, key, t) {
    env.set(key, t);
  }
  /** An assignment to a path (or to anything it hangs off) means the name
   *  that copied it no longer holds that value: forget the alias. */
  unalias(key) {
    for (const k of [...this.refAliases.keys()]) {
      if (k !== key && !k.startsWith(`${key}.`) && !k.startsWith(`${key}#`)) continue;
      for (const other of this.refAliases.get(k) ?? []) this.refAliases.get(other)?.delete(k);
      this.refAliases.delete(k);
    }
  }
  /** Drop every narrowing recorded for a path strictly under `key`. */
  invalidateBelow(env, key) {
    for (const k of [...env.keys()]) {
      if (k.startsWith(`${key}.`) || k.startsWith(`${key}#`)) env.delete(k);
    }
  }
  /** An assignment through a reference invalidates it and everything under
   *  it, then records the assigned type. */
  assignToRef(expr, value, env) {
    const key = this.refKeyOf(expr);
    if (key === void 0) return;
    this.invalidateBelow(env, key);
    this.unalias(key);
    env.set(key, value);
  }
  // --------------------------------------------------------
  // Small helpers
  // --------------------------------------------------------
  /** Type of the `self` parameter for the method currently being analysed. */
  selfType;
  withSelfType(t, fn2) {
    const saved = this.selfType;
    this.selfType = t;
    try {
      fn2();
    } finally {
      this.selfType = saved;
    }
  }
  /** What an operator on a value with metamethods gives: `a + b` calls
   *  `__add` on `a`, or failing that on `b` with the operands swapped — the
   *  order Luau tries them in. That is how `Vector3 + Vector3`, `CFrame *
   *  Vector3` and `2 * vector` get their types from the declarations.
   *  `undefined` when neither operand declares the metamethod; an operand
   *  that declares it but accepts neither argument is reported. */
  operatorResult(node, op, left, right) {
    const name = right === void 0 ? op === "-" ? "__unm" : "__len" : METAMETHODS[op];
    if (!name) return void 0;
    const candidates = right === void 0 ? [[left, void 0]] : [[left, right], [right, left]];
    let declared;
    for (const [receiver, other] of candidates) {
      const t = this.expand(receiver);
      const method = t.kind === "object" ? t.properties.get(name) : void 0;
      if (!method) continue;
      declared ??= receiver;
      const args = other === void 0 ? [receiver] : [receiver, other];
      const picked = this.pickOverload(this.overloadsOf(method.type), args);
      if (picked) return this.callReturn(picked, args);
    }
    if (declared && this.emitDiagnostics) {
      this.diagnostics.push({
        node,
        message: right === void 0 ? `Operator '${op}' cannot be applied to type '${formatType(left)}'` : `Operator '${op}' cannot be applied to types '${formatType(left)}' and '${formatType(right)}'`
      });
      return anyType;
    }
    return void 0;
  }
  /** Does this signature take the receiver as its first parameter?
   *
   *  Luau's `:` is sugar both ways: `function T:m(a)` declares
   *  `(self: T, a)`, and `o:m(x)` calls it as `m(o, x)`. The convention that
   *  marks it is the first parameter being named `self` — which is what the
   *  parser injects for `function T:m` and what the definitions files spell
   *  out. Every place that has to line arguments up with parameters goes
   *  through here so the two sides cannot drift apart. */
  takesSelf(f) {
    const first = f.params[0]?.name;
    return first === "self" || first === "this";
  }
  /** What one value of a spread array is, or `undefined` when the thing
   *  spread is not a list of values at all. */
  spreadElement(t) {
    const spread = this.expand(t);
    if (spread.kind === "array") return spread.element;
    if (spread.kind === "tuple") return union(spread.elements);
    if (spread.kind === "any") return anyType;
    return void 0;
  }
  /** Where a call's arguments stop being one each, and what fills the rest.
   *  From a spread on, every remaining parameter is filled by one of the
   *  array's values — however many that turns out to be, so neither the
   *  count nor the positions after it are known. A *tuple* is the exception:
   *  it holds a known value at each position, and `elements` says which. */
  spreadOf(args, self = 0) {
    const index = args.findIndex((a) => a.type === "SpreadElement");
    if (index < 0) return void 0;
    const spread = args[index];
    const held = this.typeOf.get(spread.argument);
    const expanded = held && this.expand(held);
    return {
      index: index + self,
      element: this.typeOf.get(spread) ?? unknownType,
      elements: expanded?.kind === "tuple" ? expanded.elements : void 0
    };
  }
  /** One of `spread`'s values, at the position `i` of a call's arguments. */
  spreadValue(spread, i) {
    if (!spread.elements) return spread.element;
    return spread.elements[i - spread.index] ?? neverType;
  }
  /** A function type as a list of call signatures: a lone function is a
   *  one-element list, an intersection is the overload set in source order. */
  overloadsOf(t) {
    if (t.kind === "function") return [t];
    if (t.kind === "intersection") {
      return t.types.filter((m) => m.kind === "function");
    }
    return [];
  }
  asLiteral(e) {
    if (e.type === "StringLiteral") return e.value;
    if (e.type === "NumberLiteral") return e.value;
    if (e.type === "BooleanLiteral") return e.value;
    return void 0;
  }
  asNarrowable(e) {
    return e.type === "Identifier" || e.type === "MemberExpression" && e.object.type === "Identifier";
  }
  initIsAsConst(e) {
    return e?.type === "AsConstExpression";
  }
  /** The type a binding has *here*: its flow-narrowed type if the current
   *  environment has one, else its declared/inferred type. */
  currentType(id, env) {
    return env.get(bindKey(id)) ?? this.bindingType.get(id) ?? this.declaredAhead(id) ?? anyType;
  }
  // --------------------------------------------------------
  // Hoisting
  // --------------------------------------------------------
  //
  // Scope analysis lets code see a function declared later in its block,
  // and a module's top-level names from function bodies and `typeof` written
  // above them. The walk has not reached those declarations yet when such a
  // reference is met, so their type is worked out from the declaration on
  // the spot — its annotation, or its body or initializer — as TypeScript
  // does. The walk reaching the declaration later types it for real.
  /** Declarations a reference may meet before the walk does. */
  aheadDeclarations;
  computingAhead = /* @__PURE__ */ new Set();
  declaredAhead(id) {
    this.aheadDeclarations ??= this.indexAheadDeclarations();
    const found = this.aheadDeclarations.get(id);
    if (!found || this.computingAhead.has(id)) return void 0;
    this.computingAhead.add(id);
    const wasEmitting = this.emitDiagnostics;
    this.emitDiagnostics = false;
    try {
      const { statement, index } = found;
      let type;
      if (statement.type === "DeclareStatement") {
        type = this.resolveType(statement.valueType);
      } else if (statement.type === "FunctionDeclaration") {
        type = statement.signatures?.length ? intersection(statement.signatures.map((sig) => this.signatureToFnType(sig))) : this.inferFunctionBody(statement.func, /* @__PURE__ */ new Map());
      } else if (statement.type === "ClassDeclaration") {
        type = this.classValueType(statement);
      } else if (statement.type === "VariableDeclaration") {
        const target = statement.names[index];
        if (target.type === "IdentifierPattern" && target.typeAnnotation) {
          type = this.resolveType(target.typeAnnotation);
        } else if (statement.init[index]) {
          const value = this.infer(statement.init[index], /* @__PURE__ */ new Map());
          type = statement.kind === "const" ? value : widen(value);
        }
      }
      if (type) this.bindingType.set(id, type);
      return type;
    } finally {
      this.emitDiagnostics = wasEmitting;
      this.computingAhead.delete(id);
    }
  }
  /** Every function declaration, and every plain name the module declares
   *  at its top level. */
  indexAheadDeclarations() {
    const out = /* @__PURE__ */ new Map();
    for (const statement of this.program.body.statements) {
      const declaration = statement.type === "ExportStatement" ? statement.declaration : statement;
      if (declaration.type !== "VariableDeclaration") continue;
      declaration.names.forEach((target, index) => {
        if (target.type !== "IdentifierPattern") return;
        const id = this.bindingIdByName(target.name, target);
        if (id !== void 0) out.set(id, { statement: declaration, index });
      });
    }
    const visit = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      const record = node;
      if (record.type === "ClassDeclaration" && record.name) {
        const id = this.bindingIdByName(record.name.name, record.name);
        if (id !== void 0) out.set(id, { statement: node, index: 0 });
      }
      if (record.type === "FunctionDeclaration" && record.name) {
        const id = this.bindingIdByName(record.name.name, record.name);
        if (id !== void 0) out.set(id, { statement: node, index: 0 });
      }
      for (const [key, value] of Object.entries(node)) {
        if (key !== "line" && key !== "column" && value && typeof value === "object") visit(value);
      }
    };
    visit(this.program.body);
    for (const [name, statement] of this.deferredDeclares) {
      const id = this.scopes.globalsByName.get(name);
      if (id !== void 0) out.set(id, { statement, index: 0 });
    }
    return out;
  }
  /** Bind or rebind a whole variable: any narrowing recorded for a path
   *  *under* it (`x.a`, `x[1]`) described the old value and must go. */
  setBinding(env, id, t) {
    this.invalidateBelow(env, bindKey(id));
    env.set(bindKey(id), t);
  }
  bindingIdOf(id) {
    return this.scopes.bindingOf.get(id);
  }
  /** Declaration nodes aren't in `bindingOf` (that map is usages only), so
   *  index every binding's declaration site up front. */
  indexDeclarations() {
    for (const b of this.scopes.bindings.values()) {
      const d = b.declarationNode;
      if (!d) continue;
      this.bindingByDecl.set(d, b.id);
      if (d.line && d.column) {
        this.bindingByPos.set(posKey(d.name ?? b.name, d.line.start, d.column.start), b.id);
      }
    }
  }
  bindingIdByName(name, node) {
    return this.bindingByDecl.get(node) ?? this.bindingByPos.get(posKey(name, node.line.start, node.column.start));
  }
};
function referencedTypeNames(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) referencedTypeNames(item, out);
    return out;
  }
  const record = node;
  if (record.type === "TypeReference" && typeof record.base === "string") {
    out.push(typeof record.namespace === "string" ? `${record.namespace}.${record.base}` : record.base);
  }
  for (const [key, value] of Object.entries(node)) {
    if (key !== "line" && key !== "column" && value && typeof value === "object") referencedTypeNames(value, out);
  }
  return out;
}
function containsTypeQuery(node) {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some(containsTypeQuery);
  if (node.type === "TypeofTypeNode") return true;
  return Object.values(node).some(containsTypeQuery);
}
var STRING_INTRINSICS = /* @__PURE__ */ new Set(["Uppercase", "Lowercase", "Capitalize", "Uncapitalize"]);
function briefType(t) {
  if (t.kind === "union" && t.types.length > 8) {
    const shown = t.types.slice(0, 6).map(formatType).join(" | ");
    return `${shown} | ... ${t.types.length - 6} more`;
  }
  return formatType(t);
}

// src/project/host.ts
var import_node_fs = require("fs");
var nodeHost = {
  readFile(path) {
    try {
      return (0, import_node_fs.statSync)(path).isFile() ? (0, import_node_fs.readFileSync)(path, "utf8") : void 0;
    } catch {
      return void 0;
    }
  }
};

// src/project/config.ts
var import_node_path = require("path");
var CONFIG_FILE_NAMES = ["luaut.config.json", "luaut.config.jsonc"];
function findConfig(file, host = nodeHost) {
  const searched = [];
  let directory = (0, import_node_path.dirname)((0, import_node_path.resolve)(file));
  for (; ; ) {
    const found = [];
    for (const name of CONFIG_FILE_NAMES) {
      const path = (0, import_node_path.join)(directory, name);
      searched.push(path);
      if (host.readFile(path) !== void 0) found.push(path);
    }
    if (found.length > 1) {
      const message = `Only one luaut config may be in a folder, but both ${CONFIG_FILE_NAMES.join(" and ")} are in ${directory}`;
      return { searched, problems: found.map((path) => ({ file: path, message, line: 1, column: 1 })) };
    }
    if (found.length === 1) {
      const { config, problems } = loadConfig(found[0], host);
      return { config, problems, searched };
    }
    const parent = (0, import_node_path.dirname)(directory);
    if (parent === directory) return { searched, problems: [] };
    directory = parent;
  }
}
var OPTIONS = ["types", "paths", "baseUrl", "sourceMap"];
function loadConfig(path, host = nodeHost) {
  const file = (0, import_node_path.resolve)(path);
  const source = host.readFile(file);
  if (source === void 0) return { problems: [{ file, message: "Cannot read the config file" }] };
  let raw;
  try {
    raw = JSON.parse(stripJsonComments(source));
  } catch (error) {
    const message = error.message;
    return { problems: [{ file, message: `Invalid JSON: ${message}`, ...jsonErrorPosition(source, message) }] };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { problems: [{ file, message: "The config must be a JSON object", line: 1, column: 1 }] };
  }
  const directory = (0, import_node_path.dirname)(file);
  const options = raw;
  const problems = [];
  const at = (key) => keyPosition(source, key);
  const problem = (key, message) => {
    problems.push({ file, message, ...at(key) });
  };
  for (const key of Object.keys(options)) {
    if (!OPTIONS.includes(key)) {
      problem(key, `Unknown option '${key}'. Options are: ${OPTIONS.join(", ")}`);
    }
  }
  let types = [];
  if (options.types !== void 0) {
    if (Array.isArray(options.types) && options.types.every((t) => typeof t === "string")) types = options.types;
    else problem("types", `'types' must be an array of strings, such as ["luau"]`);
  }
  const paths = {};
  if (options.paths !== void 0) {
    const value = options.paths;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [pattern, targets] of Object.entries(value)) {
        if (Array.isArray(targets) && targets.every((t) => typeof t === "string")) paths[pattern] = targets;
        else problem(pattern, `'paths' entry '${pattern}' must be an array of strings`);
        if (pattern.split("*").length > 2) problem(pattern, `'paths' pattern '${pattern}' may contain at most one '*'`);
      }
    } else {
      problem("paths", `'paths' must be an object, such as { "@shared/*": ["src/shared/*"] }`);
    }
  }
  let baseUrl = directory;
  if (options.baseUrl !== void 0) {
    if (typeof options.baseUrl === "string") baseUrl = (0, import_node_path.resolve)(directory, options.baseUrl);
    else problem("baseUrl", "'baseUrl' must be a string");
  }
  let sourceMap = null;
  if (options.sourceMap !== void 0 && options.sourceMap !== null) {
    if (typeof options.sourceMap === "string") sourceMap = (0, import_node_path.resolve)(directory, options.sourceMap);
    else problem("sourceMap", "'sourceMap' must be a path string, or null for none");
  }
  return { config: { path: file, directory, source, types, paths, baseUrl, sourceMap }, problems };
}
function stripJsonComments(text) {
  const out = text.split("");
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i += 2;
      else {
        if (ch === '"') inString = false;
        i++;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      i++;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") out[i++] = " ";
    } else if (ch === "/" && text[i + 1] === "*") {
      out[i++] = " ";
      out[i++] = " ";
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] !== "\n") out[i] = " ";
        i++;
      }
      if (i < text.length) {
        out[i++] = " ";
        out[i++] = " ";
      }
    } else if (ch === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") out[i] = " ";
      i++;
    } else {
      i++;
    }
  }
  return out.join("");
}
function jsonErrorPosition(source, message) {
  const lineColumn = /line (\d+) column (\d+)/.exec(message);
  if (lineColumn) return { line: Number(lineColumn[1]), column: Number(lineColumn[2]) };
  const position = /position (\d+)/.exec(message);
  return position ? offsetPosition(source, Number(position[1])) : { line: 1, column: 1 };
}
function keyPosition(source, key) {
  const offset = source.indexOf(JSON.stringify(key));
  return offset < 0 ? { line: 1, column: 1 } : offsetPosition(source, offset);
}
function offsetPosition(source, offset) {
  const before = source.slice(0, offset);
  const line = before.split("\n").length;
  return { line, column: offset - before.lastIndexOf("\n") };
}

// src/project/libraries.ts
var import_node_path2 = require("path");
function resolveTypeLibraries(config, host = nodeHost) {
  const files = [];
  const lowerings = [];
  const problems = [];
  const loaded = /* @__PURE__ */ new Set();
  const addFile = (file) => {
    const key = pathKey(file);
    if (loaded.has(key)) return;
    loaded.add(key);
    files.push(file);
  };
  const addPackage = (directory, entryFile, visiting) => {
    const key = pathKey(directory);
    if (visiting.has(key)) return;
    visiting.add(key);
    for (const dependency of dependencyNames(directory, host)) {
      const found = findPackage(dependency, directory, host);
      if (found) addPackage(found.directory, found.file, visiting);
    }
    addFile(entryFile);
    const lowering = loweringModule(directory, host, problems, config);
    if (lowering) lowerings.push(lowering);
  };
  for (const entry of config.types) {
    const relative = entry.startsWith("./") || entry.startsWith("../") || entry.startsWith("/") || /^[A-Za-z]:[\\/]/.test(entry);
    if (relative) {
      const target = (0, import_node_path2.resolve)(config.directory, entry);
      if (entry.endsWith(".luaut")) {
        if (host.readFile(target) !== void 0) addFile(target);
        else problems.push({ file: config.path, message: `Cannot find type library file '${entry}'`, ...entryPosition(config, entry) });
        continue;
      }
      const file = packageEntry(target, host);
      if (file) addPackage(target, file, /* @__PURE__ */ new Set());
      else problems.push({ file: config.path, message: `'${entry}' has no ${ENTRY_FILE} (or 'luaut.types' in its package.json)`, ...entryPosition(config, entry) });
      continue;
    }
    const name = entry.startsWith("@luaut/") ? entry : `@luaut/${entry}`;
    const found = findPackage(name, config.directory, host);
    if (found) addPackage(found.directory, found.file, /* @__PURE__ */ new Set());
    else {
      problems.push({
        file: config.path,
        message: `Cannot find type library '${name}'. Install it with: npm i -D ${name}`,
        ...entryPosition(config, entry)
      });
    }
  }
  return { files, lowerings, problems };
}
function loweringModule(directory, host, problems, config) {
  const manifest = readJson((0, import_node_path2.join)(directory, "package.json"), host);
  const declared = manifest?.luaut?.lowering;
  if (typeof declared !== "string") return void 0;
  const from = typeof manifest?.name === "string" ? manifest.name : directory;
  const file = (0, import_node_path2.resolve)(directory, declared);
  if (host.readFile(file) === void 0) {
    problems.push({ file: config.path, message: `'${from}' names a lowering module '${declared}', which is not there` });
    return void 0;
  }
  return { file, from };
}
var ENTRY_FILE = "index.d.luaut";
function packageEntry(directory, host) {
  const manifest = readJson((0, import_node_path2.join)(directory, "package.json"), host);
  const declared = manifest?.luaut?.types;
  const file = (0, import_node_path2.resolve)(directory, typeof declared === "string" ? declared : ENTRY_FILE);
  return host.readFile(file) !== void 0 ? file : void 0;
}
function findPackage(name, from, host) {
  let directory = (0, import_node_path2.resolve)(from);
  for (; ; ) {
    const candidate = (0, import_node_path2.join)(directory, "node_modules", ...name.split("/"));
    const file = packageEntry(candidate, host);
    if (file) return { directory: candidate, file };
    const parent = (0, import_node_path2.dirname)(directory);
    if (parent === directory) return void 0;
    directory = parent;
  }
}
function dependencyNames(directory, host) {
  const manifest = readJson((0, import_node_path2.join)(directory, "package.json"), host);
  const names = /* @__PURE__ */ new Set();
  for (const field of ["dependencies", "peerDependencies"]) {
    const deps = manifest?.[field];
    if (deps && typeof deps === "object") for (const name of Object.keys(deps)) names.add(name);
  }
  return [...names];
}
function readJson(path, host) {
  const text = host.readFile(path);
  if (text === void 0) return void 0;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : void 0;
  } catch {
    return void 0;
  }
}
function entryPosition(config, entry) {
  return keyPosition(config.source, entry);
}
function pathKey(path) {
  const normalized = (0, import_node_path2.resolve)(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

// src/project/modules.ts
var import_node_path3 = require("path");
function moduleCandidates(fromFile, specifier, config) {
  const bases = specifier.startsWith("./") || specifier.startsWith("../") ? [(0, import_node_path3.resolve)((0, import_node_path3.dirname)(fromFile), specifier)] : config ? aliasTargets(config, specifier) : [];
  return bases.flatMap((base) => base.endsWith(".luaut") ? [base] : [`${base}.luaut`, `${base}.d.luaut`, (0, import_node_path3.join)(base, "index.luaut")]);
}
function resolveModulePath(fromFile, specifier, config, host = nodeHost) {
  return moduleCandidates(fromFile, specifier, config).find((path) => host.readFile(path) !== void 0);
}
function aliasTargets(config, specifier) {
  let match;
  let prefixLength = -1;
  for (const pattern2 of Object.keys(config.paths)) {
    const star = pattern2.indexOf("*");
    if (star < 0) {
      if (pattern2 === specifier) {
        match = { pattern: pattern2, wildcard: "" };
        break;
      }
      continue;
    }
    const prefix = pattern2.slice(0, star);
    const suffix = pattern2.slice(star + 1);
    const fits = specifier.length >= prefix.length + suffix.length && specifier.startsWith(prefix) && specifier.endsWith(suffix);
    if (fits && prefix.length > prefixLength) {
      prefixLength = prefix.length;
      match = { pattern: pattern2, wildcard: specifier.slice(prefix.length, specifier.length - suffix.length) };
    }
  }
  if (!match) return [];
  const { pattern, wildcard } = match;
  return config.paths[pattern].map((target) => (0, import_node_path3.resolve)(config.baseUrl, target.replace("*", wildcard)));
}

// src/project/sourcemap.ts
var import_node_path4 = require("path");
var IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
var INSTANCE_MEMBERS = /* @__PURE__ */ new Set(["Name", "ClassName", "Parent", "Archivable"]);
var SCRIPT_EXTENSIONS = /* @__PURE__ */ new Set([".luaut", ".luau", ".lua"]);
function sourceMapTypes(text, path, options) {
  let root;
  try {
    root = JSON.parse(text);
  } catch (error) {
    return { problem: `Invalid sourcemap: ${error.message}` };
  }
  if (!isNode(root)) return { problem: "Invalid sourcemap: the root must be an object with 'name' and 'className'" };
  const directory = (0, import_node_path4.dirname)((0, import_node_path4.resolve)(path));
  const lines = [];
  const aliasOfFile = /* @__PURE__ */ new Map();
  const used = /* @__PURE__ */ new Set();
  const aliasOfNode = /* @__PURE__ */ new Map();
  const aliasFor = (segments) => {
    const base = `SourceMap_${segments.map((s) => s.replace(/[^A-Za-z0-9_]/g, "_")).join("_")}`;
    let alias = base;
    for (let n = 2; used.has(alias); n++) alias = `${base}_${n}`;
    used.add(alias);
    return alias;
  };
  const visit = (node, segments, parent) => {
    const alias = aliasFor(segments);
    aliasOfNode.set(node, alias);
    for (const filePath of node.filePaths ?? []) aliasOfFile.set(fileKey((0, import_node_path4.resolve)(directory, filePath)), alias);
    const className = IDENTIFIER.test(node.className) && options.classes.has(node.className) ? node.className : "Instance";
    const taken = options.membersOf?.(className) ?? INSTANCE_MEMBERS;
    const members = [];
    if (parent) members.push(`Parent: ${parent}`);
    const named = /* @__PURE__ */ new Set();
    for (const child of node.children ?? []) {
      if (!isNode(child)) continue;
      const childAlias = visit(child, [...segments, child.name], alias);
      if (!IDENTIFIER.test(child.name) || taken.has(child.name) || named.has(child.name)) continue;
      named.add(child.name);
      members.push(`${child.name}: ${childAlias}`);
    }
    lines.push(`declare class ${alias} extends ${className} { ${members.join(", ")} }`);
    return alias;
  };
  const rootAlias = visit(root, [root.name], void 0);
  if (root.className === "DataModel") {
    lines.push(`declare game: ${rootAlias}`);
    const workspace = (root.children ?? []).find((child) => isNode(child) && child.className === "Workspace");
    const workspaceAlias = workspace && aliasOfNode.get(workspace);
    if (workspaceAlias) lines.push(`declare workspace: ${workspaceAlias}`);
  }
  let program;
  try {
    program = parse(lines.join("\n"));
  } catch (error) {
    return { problem: `Could not turn the sourcemap into types: ${error.message}` };
  }
  return {
    types: {
      program,
      scriptFor(file) {
        const alias = aliasOfFile.get(fileKey(file));
        return alias ? parse(`declare script: ${alias}`) : void 0;
      }
    }
  };
}
function isNode(value) {
  if (!value || typeof value !== "object") return false;
  const node = value;
  return typeof node.name === "string" && typeof node.className === "string";
}
function fileKey(path) {
  const extension = (0, import_node_path4.extname)(path);
  const bare = SCRIPT_EXTENSIONS.has(extension) ? path.slice(0, -extension.length) : path;
  const normalized = (0, import_node_path4.resolve)(bare);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

// src/index.ts
var luautparser = {
  tokenize,
  parseTokens,
  parse,
  parseExpressionFromSource,
  parseWithRecovery,
  analyzeScopes,
  getBinding,
  isGlobal,
  isUnassignedGlobal,
  analyzeTypes
};
var index_default = luautparser;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BinaryOperators,
  CONFIG_FILE_NAMES,
  Keywords,
  LexError,
  Operators,
  PRELUDE_SOURCE,
  ParseError,
  Punctuators,
  UNUSED_EXPECT_ERROR,
  UnaryOperators,
  analyzeScopes,
  analyzeTypes,
  anyType,
  applyDirectives,
  arrayOf,
  booleanType,
  bufferType,
  containsTypeParam,
  difference,
  directivesOf,
  equalTypes,
  falsyType,
  findConfig,
  fn,
  formatType,
  getBinding,
  intersection,
  isAssignable,
  isClassType,
  isGlobal,
  isPossiblyFalsy,
  isPossiblyTruthy,
  isUnassignedGlobal,
  literal,
  loadConfig,
  luautparser,
  matchInfer,
  moduleCandidates,
  moduleExports,
  narrowExclude,
  narrowFalsy,
  narrowTo,
  narrowTruthy,
  neverType,
  nilType,
  nodeHost,
  numberType,
  objectType,
  optional,
  overlaps,
  parse,
  parseExpressionFromSource,
  parseTokens,
  parseWithRecovery,
  primitive,
  readDirectives,
  resolveModulePath,
  resolveTypeLibraries,
  setAliasExpander,
  setDeferredBound,
  sourceMapTypes,
  stringType,
  stripJsonComments,
  substitute,
  templateMatches,
  threadType,
  tokenize,
  tuple,
  typeParam,
  unify,
  union,
  unknownType,
  widen
});

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
function tokenize(source) {
  const tokens = [];
  let cursor = 0;
  let line = 1;
  let column = 1;
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
        throw new LexError("Unterminated long bracket", line, column);
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
        advance();
        advance();
        if (peek() === "[") {
          const level = tryLongBracketOpen();
          if (level !== null) {
            readLongBracketContent(level);
            continue;
          }
        }
        skipLineComment();
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
      if (isAtEnd()) {
        throw new LexError("Unterminated string", line, column);
      }
      const ch = peek();
      if (ch === quote) {
        advance();
        break;
      }
      if (ch === "\n") {
        throw new LexError("Unterminated string", line, column);
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
        throw new LexError("Unterminated interpolated string", line, column);
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
        let depth = 1;
        while (depth > 0) {
          if (isAtEnd()) {
            throw new LexError("Unterminated interpolation expression", line, column);
          }
          if (peek() === "{") depth++;
          if (peek() === "}") {
            depth--;
            if (depth === 0) break;
          }
          advance();
        }
        const exprRaw = source.slice(exprStart, cursor);
        advance();
        parts.push({ kind: "expression", raw: exprRaw });
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
    throw new LexError(`Unexpected character '${peek()}'`, line, column);
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
    tokens.push(readOperatorOrPunctuator());
  }
  tokens.push({
    type: "EOF",
    line: { start: line, end: line },
    column: { start: column, end: column }
  });
  return tokens;
}

// src/ast/builders.ts
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
var Parser = class {
  tokens;
  cursor = 0;
  recover;
  /** Populated in recovery mode. */
  errors = [];
  constructor(tokens, options = {}) {
    this.tokens = tokens;
    this.recover = options.recover ?? false;
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
      this.errors.push(err);
      throw new ParseRecover(err.message);
    }
    throw err;
  }
  /** Recovery: skip tokens until the start of a plausible next statement (a
   *  leading keyword / `@` attribute / just past a `;`) or a block
   *  terminator. Forward progress past a zero-width failure is guaranteed by
   *  the caller (`parseBlock`). */
  synchronize() {
    while (!this.isAtEnd()) {
      const t = this.current();
      if (t.type === "Punctuator" && t.value === "@") return;
      if (t.type === "Keyword") {
        switch (t.value) {
          case "const":
          case "let":
          case "function":
          case "if":
          case "while":
          case "for":
          case "return":
          case "do":
          case "repeat":
          case "break":
          case "continue":
          case "import":
          case "export":
          case "end":
          case "else":
          case "elseif":
          case "until":
            return;
        }
      }
      this.advance();
      const prev = this.previous();
      if (prev.type === "Punctuator" && prev.value === ";") return;
    }
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
      if (this.recover) {
        const t = this.current();
        this.errors.push(new ParseError(
          `Expected end of file, got '${this.describeToken(t)}'`,
          t.line.start,
          t.column.start
        ));
      } else {
        this.error("Expected end of file");
      }
    }
    return { type: "Program", body, ...spanFrom(start, this.previous() ?? start) };
  }
  // ============================================================
  // Block / Statement
  // ============================================================
  isBlockEnd() {
    return this.isAtEnd() || this.checkKeyword("end") || this.checkKeyword("else") || this.checkKeyword("elseif") || this.checkKeyword("until");
  }
  parseBlock() {
    const start = this.current();
    const statements = [];
    while (!this.isBlockEnd()) {
      if (this.matchPunctuator(";")) continue;
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
            this.errors.push(e);
          } else {
            throw e;
          }
          this.synchronize();
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
      if (next.type === "Keyword" && (next.value === "const" || next.value === "let")) {
        const stmt = this.parseVariableDeclaration();
        if (stmt.type === "FunctionDeclaration") {
          stmt.attributes = attributes;
          stmt.line.start = start.line.start;
          stmt.column.start = start.column.start;
        }
        return stmt;
      }
      if (next.type === "Keyword" && next.value === "function") {
        const stmt = this.parseFunctionDeclarationStatement();
        stmt.attributes = attributes;
        stmt.line.start = start.line.start;
        stmt.column.start = start.column.start;
        return stmt;
      }
      throw new ParseError("Expected 'function', 'const', or 'let' after attribute", next.line.start, next.column.start);
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
          return this.parseFunctionDeclarationStatement();
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
    if (t.type === "Identifier" && t.value === "type" && this.peek(1).type === "Identifier") {
      return this.parseTypeAliasStatement();
    }
    if (t.type === "Identifier" && t.value === "declare") {
      const p1 = this.peek(1);
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
        optional: p.optional,
        typeAnnotation: p.typeAnnotation ?? { type: "TypeReference", base: "any", typeArguments: [], ...spanFrom(start, start) },
        ...spanFrom(start, this.previous())
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
      return { type: "DeclareStatement", name: nameTok2.value, valueType: valueType2, ...spanFrom(start, this.previous()) };
    }
    const nameTok = this.expectIdentifier();
    this.expectPunctuator(":");
    const valueType = this.parseType();
    return { type: "DeclareStatement", name: nameTok.value, valueType, ...spanFrom(start, this.previous()) };
  }
  // `import { a, b as c } from '...'` / `import Default from '...'` /
  // `import Default, { a } from '...'`. Compiled away entirely by the
  // bundler — never survives into emitted Luau.
  parseImportStatement() {
    const start = this.current();
    this.advance();
    let defaultImport;
    const specifiers = [];
    if (this.checkType("Identifier")) {
      const nameTok = this.expectIdentifier();
      defaultImport = { type: "Identifier", name: nameTok.value, ...spanFrom(nameTok, nameTok) };
      if (this.matchPunctuator(",")) {
        this.expectPunctuator("{");
        this.parseImportSpecifierList(specifiers);
        this.expectPunctuator("}");
      }
    } else {
      this.expectPunctuator("{");
      this.parseImportSpecifierList(specifiers);
      this.expectPunctuator("}");
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
    return { type: "ImportStatement", defaultImport, specifiers, source, ...spanFrom(start, this.previous()) };
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
  // `export const ...` / `export let ...` / `export const function ...` /
  // `export type ...` / `export default <expr>`
  parseExportStatement() {
    const start = this.current();
    this.advance();
    if (this.checkIdentifierValue("default")) {
      this.advance();
      const declaration = this.parseExpression(0);
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
    this.error("Expected 'const', 'let', 'type', or 'default' after 'export'");
  }
  // `const x = ...` / `let x, y = ...` / `const function f() ... end`.
  // luaut has no `local` — `const` bindings are immutable, `let` mutable.
  parseVariableDeclaration() {
    const start = this.current();
    const kind = this.advance().value;
    if (this.matchKeyword("function")) {
      return this.parseFunctionDeclarationRest(start, kind);
    }
    const names = [this.parseBindingTarget(true)];
    while (this.matchPunctuator(",")) {
      names.push(this.parseBindingTarget(true));
    }
    let init = [];
    if (this.matchOperator("=")) {
      init = this.parseExpressionList();
    } else if (kind === "const") {
      this.error("'const' declaration requires an initializer");
    }
    return { type: "VariableDeclaration", kind, names, init, ...spanFrom(start, this.previous()) };
  }
  /** `const/let function` — `function` already consumed. Collects TS-style
   *  overload signatures. */
  parseFunctionDeclarationRest(start, kind) {
    const name = this.parseIdentifier();
    const signatures = [];
    while (true) {
      const head = this.parseFunctionHead();
      if (this.isOverloadContinuation(name.name, kind)) {
        signatures.push(this.headToSignature(head));
        this.advance();
        this.expectKeyword("function");
        this.parseIdentifier();
        continue;
      }
      const func = this.headToBody(head);
      return {
        type: "FunctionDeclaration",
        kind,
        name,
        func,
        signatures: signatures.length ? signatures : void 0,
        ...spanFrom(start, this.previous())
      };
    }
  }
  parseIfStatement() {
    const start = this.current();
    this.expectKeyword("if");
    const clauses = [];
    const cond = this.parseExpression();
    this.expectKeyword("then");
    const body = this.parseBlock();
    clauses.push({ type: "IfClause", condition: cond, body, ...spanFrom(cond, this.previous()) });
    while (this.checkKeyword("elseif")) {
      const clauseStart = this.current();
      this.advance();
      const c = this.parseExpression();
      this.expectKeyword("then");
      const b = this.parseBlock();
      clauses.push({ type: "IfClause", condition: c, body: b, ...spanFrom(clauseStart, this.previous()) });
    }
    let alternate;
    if (this.matchKeyword("else")) {
      alternate = this.parseBlock();
    }
    this.expectKeyword("end");
    return { type: "IfStatement", clauses, alternate, ...spanFrom(start, this.previous()) };
  }
  parseWhileStatement() {
    const start = this.current();
    this.expectKeyword("while");
    const condition = this.parseExpression();
    this.expectKeyword("do");
    const body = this.parseBlock();
    this.expectKeyword("end");
    return { type: "WhileStatement", condition, body, ...spanFrom(start, this.previous()) };
  }
  parseRepeatStatement() {
    const start = this.current();
    this.expectKeyword("repeat");
    const body = this.parseBlock();
    this.expectKeyword("until");
    const condition = this.parseExpression();
    return { type: "RepeatStatement", body, condition, ...spanFrom(start, this.previous()) };
  }
  parseDoStatement() {
    const start = this.current();
    this.expectKeyword("do");
    const body = this.parseBlock();
    this.expectKeyword("end");
    return { type: "DoStatement", body, ...spanFrom(start, this.previous()) };
  }
  parseForStatement() {
    const start = this.current();
    this.expectKeyword("for");
    const first = this.parseBindingTarget(true);
    if (first.type === "IdentifierPattern" && this.matchOperator("=")) {
      const from = this.parseExpression();
      this.expectPunctuator(",");
      const to = this.parseExpression();
      let step;
      if (this.matchPunctuator(",")) {
        step = this.parseExpression();
      }
      this.expectKeyword("do");
      const body2 = this.parseBlock();
      this.expectKeyword("end");
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
    const iterators = this.parseExpressionList();
    this.expectKeyword("do");
    const body = this.parseBlock();
    this.expectKeyword("end");
    return {
      type: "GenericForStatement",
      variables,
      iterators,
      body,
      ...spanFrom(start, this.previous())
    };
  }
  parseFunctionDeclarationStatement() {
    const start = this.current();
    this.expectKeyword("function");
    const target = this.parseFunctionName();
    const isMethod = target.method !== void 0;
    const simpleName = !isMethod && target.path.length === 0 ? target.base.name : void 0;
    const signatures = [];
    while (true) {
      const head = this.parseFunctionHead();
      if (simpleName !== void 0 && this.isOverloadContinuation(simpleName)) {
        signatures.push(this.headToSignature(head));
        this.expectKeyword("function");
        this.parseFunctionName();
        continue;
      }
      const func = this.headToBody(head);
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
   *  signature rather than an implementation)? `kind` is set for a
   *  `const/let function` group, undefined for a bare `function` group. */
  isOverloadContinuation(name, kind) {
    if (kind) {
      return this.checkKeyword(kind) && this.peek(1).type === "Keyword" && this.peek(1).value === "function" && this.peek(2).type === "Identifier" && this.peek(2).value === name;
    }
    return this.checkKeyword("function") && this.peek(1).type === "Identifier" && this.peek(1).value === name;
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
      args = this.parseExpressionList();
    }
    return { type: "ReturnStatement", arguments: args, ...spanFrom(start, this.previous()) };
  }
  parseTypeAliasStatement() {
    const start = this.current();
    this.advance();
    const nameTok = this.expectIdentifier();
    const name = { type: "Identifier", name: nameTok.value, ...spanFrom(nameTok, nameTok) };
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
      const values = this.parseExpressionList();
      return { type: "AssignmentStatement", targets, values, ...spanFrom(start, this.previous()) };
    }
    const first = this.parsePrefixExpression();
    if (this.checkOperator("=") || this.checkPunctuator(",")) {
      const targets = [first];
      while (this.matchPunctuator(",")) {
        targets.push(this.parseAssignTarget());
      }
      this.expectOperator("=");
      const values = this.parseExpressionList();
      return { type: "AssignmentStatement", targets, values, ...spanFrom(start, this.previous()) };
    }
    const t = this.current();
    if (t.type === "Operator" && COMPOUND_ASSIGN_OPS.has(t.value)) {
      const op = this.advance().value;
      const value = this.parseExpression();
      return {
        type: "CompoundAssignmentStatement",
        operator: op,
        target: first,
        value,
        ...spanFrom(start, this.previous())
      };
    }
    if (first.type === "CallExpression" || first.type === "MethodCallExpression") {
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
  startsMethodCall() {
    if (this.peek(1).type !== "Identifier") return false;
    const after = this.peek(2);
    if (after.type === "Punctuator") {
      const v = String(after.value);
      return v === "(" || v === "{";
    }
    if (after.type === "InterpolatedString") return true;
    return after.type === "Literal" && after.kind === "string";
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
      const func = this.parseFunctionBody();
      return { type: "FunctionExpression", func, ...spanFrom(t, this.previous()) };
    }
    if (t.type === "Keyword" && t.value === "if") {
      return this.parseIfElseExpression();
    }
    if (t.type === "Punctuator" && t.value === "{") {
      return this.parseTableExpression();
    }
    if (t.type === "Punctuator" && t.value === "[") {
      return this.parseArrayExpression();
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
        const expression = parseExpressionFromSource(p.raw);
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
    if (this.checkType("Identifier")) {
      base = this.parseIdentifier();
    } else if (this.matchPunctuator("(")) {
      const inner = this.parseExpression();
      this.expectPunctuator(")");
      base = { type: "ParenthesizedExpression", expression: inner, ...spanFrom(start, this.previous()) };
    } else {
      this.error("Expected identifier or '('");
    }
    while (true) {
      if (this.matchPunctuator(".")) {
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
        const args = this.parseCallArguments();
        base = {
          type: "MethodCallExpression",
          object: base,
          method,
          arguments: args,
          ...spanFrom(base, this.previous())
        };
        continue;
      }
      if (this.checkPunctuator("(") || this.checkType("Literal") && this.current().kind === "string" || this.checkType("InterpolatedString") || this.checkPunctuator("{")) {
        const args = this.parseCallArguments();
        base = {
          type: "CallExpression",
          callee: base,
          arguments: args,
          ...spanFrom(base, this.previous())
        };
        continue;
      }
      break;
    }
    return base;
  }
  /** An assignment target after the first: a prefix expression (`a.b`,
   *  `a[i]`, `a`) or a nested destructuring pattern. */
  parseAssignTarget() {
    if (this.checkPunctuator("{")) return this.parseObjectPattern();
    if (this.checkPunctuator("[")) return this.parseArrayPattern();
    return this.parsePrefixExpression();
  }
  parseCallArguments() {
    if (this.matchPunctuator("(")) {
      if (this.checkPunctuator(")")) {
        this.advance();
        return [];
      }
      const list = this.parseExpressionList();
      this.expectPunctuator(")");
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
    while (!this.checkPunctuator("}")) {
      if (this.checkOperator("...")) {
        this.advance();
        const argument = this.parseExpression();
        fields.push({ type: "TableFieldSpread", argument });
      } else if (this.matchPunctuator("[")) {
        const key = this.parseExpression();
        this.expectPunctuator("]");
        this.expectPunctuator(":");
        const value = this.parseExpression();
        fields.push({ type: "TableFieldComputed", key, value });
      } else if (this.checkType("Literal") && this.current().kind === "string") {
        const t = this.advance();
        const key = { type: "StringLiteral", value: t.value, raw: t.raw, ...spanFrom(t, t) };
        this.expectPunctuator(":");
        const value = this.parseExpression();
        fields.push({ type: "TableFieldNamed", key, value });
      } else if (this.checkType("Identifier") && this.peek(1).type === "Punctuator" && this.peek(1).value === ":") {
        const key = this.parseIdentifier();
        this.expectPunctuator(":");
        const value = this.parseExpression();
        fields.push({ type: "TableFieldNamed", key, value });
      } else if (this.checkType("Identifier")) {
        const name = this.parseIdentifier();
        fields.push({ type: "TableFieldShorthand", name });
      } else {
        this.error("Expected object field ('key: value', '[expr]: value', shorthand, or '...spread'); use '[...]' for arrays");
      }
      if (this.matchPunctuator(",") || this.matchPunctuator(";")) continue;
      break;
    }
    this.expectPunctuator("}");
    return { type: "TableExpression", fields, ...spanFrom(start, this.previous()) };
  }
  // `[1, 2, 3]` — array literal (trailing comma allowed).
  parseArrayExpression() {
    const start = this.current();
    this.expectPunctuator("[");
    const elements = [];
    while (!this.checkPunctuator("]")) {
      if (this.checkOperator("...")) {
        const dots = this.advance();
        const argument = this.parseExpression();
        elements.push({ type: "SpreadElement", argument, ...spanFrom(dots, argument) });
      } else {
        elements.push(this.parseExpression());
      }
      if (this.matchPunctuator(",")) continue;
      break;
    }
    this.expectPunctuator("]");
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
      target.typeAnnotation = this.parseType();
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
          this.advance();
          hasVarargs = true;
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
        if (this.matchPunctuator(":")) {
          typeAnnotation = this.parseType();
        }
        let def;
        if (this.matchOperator("=")) {
          def = this.parseExpression();
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
        if (this.matchPunctuator(",")) continue;
        break;
      }
    }
    this.expectPunctuator(")");
    let returnType;
    let predicate;
    if (this.matchPunctuator(":")) {
      predicate = this.tryParseTypePredicate();
      if (!predicate) returnType = this.parseTypeOrTypePackReference();
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
  parseFunctionBody() {
    const head = this.parseFunctionHead();
    const body = this.parseBlock();
    this.expectKeyword("end");
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
  headToBody(head) {
    const body = this.parseBlock();
    this.expectKeyword("end");
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
      const name = this.expectIdentifier().value;
      return { type: "InferTypeNode", name, ...spanFrom(t, this.previous()) };
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
          while (this.matchPunctuator(",")) {
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
          this.advance();
          hasVarargs = true;
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
        if (named) {
          name = this.expectIdentifier().value;
          optional2 = this.matchPunctuator("?");
          this.advance();
        }
        const paramStart = this.current();
        const typeAnnotation = this.parseType();
        params.push({
          type: "FunctionTypeParameter",
          name,
          typeAnnotation,
          optional: optional2 || void 0,
          ...spanFrom(paramStart, this.previous())
        });
        if (this.matchPunctuator(",")) continue;
        break;
      }
    }
    this.expectPunctuator(")");
    if (this.matchPunctuator("->")) {
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
    const parameter = this.expectIdentifier().value;
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
      if (this.checkPunctuator("[")) {
        this.advance();
        const keyType = this.parseType();
        this.expectPunctuator("]");
        this.expectPunctuator(":");
        const valueType = this.parseType();
        properties.push({ type: "TableTypeIndexer", keyType, valueType });
      } else if (this.checkIdentifierValue("readonly") && this.peek(1).type === "Identifier") {
        this.advance();
        const name = this.expectIdentifier().value;
        const optional2 = this.matchPunctuator("?");
        this.expectPunctuator(":");
        const valueType = this.parseType();
        properties.push({ type: "TableTypeProperty", name, valueType, optional: optional2, readonly: true });
      } else if (this.checkType("Identifier") && (this.peek(1).type === "Punctuator" && this.peek(1).value === ":" || this.peek(1).type === "Punctuator" && this.peek(1).value === "?" && this.peek(2).type === "Punctuator" && this.peek(2).value === ":")) {
        const name = this.expectIdentifier().value;
        const optional2 = this.matchPunctuator("?");
        this.expectPunctuator(":");
        const valueType = this.parseType();
        properties.push({
          type: "TableTypeProperty",
          name,
          valueType,
          optional: optional2
        });
      } else {
        this.error("Expected object type property ('name: T' or '[K]: V'); use 'T[]' for arrays and '[T, U]' for tuples");
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
        isPack,
        isConst: isConst || void 0,
        constraint,
        default: def,
        ...spanFrom(nameTok, this.previous())
      });
      if (this.matchPunctuator(",")) continue;
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
function parseExpressionFromSource(raw) {
  const tokens = tokenize(raw);
  const parser = new Parser(tokens);
  const expr = parser.parseExpression();
  return expr;
}
function parseWithRecovery(source) {
  let tokens;
  try {
    tokens = tokenize(source);
  } catch (e) {
    const le = e;
    const err = new ParseError(le.message ?? "Lex error", le.line ?? 1, le.column ?? 1);
    const empty = {
      type: "Program",
      body: { type: "Block", statements: [], line: { start: 1, end: 1 }, column: { start: 1, end: 1 } },
      line: { start: 1, end: 1 },
      column: { start: 1, end: 1 }
    };
    return { program: empty, errors: [err] };
  }
  const parser = new Parser(tokens, { recover: true });
  const program = parser.parseProgram();
  return { program, errors: parser.errors };
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
  nextId = 0;
  bindingOf = /* @__PURE__ */ new Map();
  bindings = /* @__PURE__ */ new Map();
  diagnostics = [];
  globalScope = { parent: null, declarations: /* @__PURE__ */ new Map() };
  constructor(options) {
    for (const name of options.builtinGlobals ?? []) {
      const id = this.getOrCreateGlobalBinding(name);
      this.bindings.get(id).isBuiltin = true;
    }
  }
  run(program) {
    this.visitBlock(program.body, childScope(this.globalScope));
    return {
      bindingOf: this.bindingOf,
      bindings: this.bindings,
      diagnostics: this.diagnostics,
      globalsByName: this.globalScope.declarations
    };
  }
  // ---------------- declaration / resolution primitives ----------------
  declare(scope, name, kind, node, isConst = false) {
    if (scope.declarations.has(name) && scope !== this.globalScope) {
      this.diagnostics.push({
        node,
        message: `Cannot redeclare '${name}' in the same scope`,
        kind: "redeclare"
      });
    }
    const id = this.nextId++;
    this.bindings.set(id, { id, name, kind, declarationNode: node, references: [], isConst });
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
    this.checkConstAssign(id, identifier);
  }
  checkConstAssign(id, node) {
    const b = this.bindings.get(id);
    if (b.isConst) {
      this.diagnostics.push({
        node,
        message: `Cannot assign to '${b.name}' \u2014 it is a const`,
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
        const isConst = stmt.kind === "const";
        for (const name of stmt.names) this.declarePattern(scope, name, "local", scope, isConst);
        return;
      }
      case "FunctionDeclaration": {
        this.declare(scope, stmt.name.name, "local", stmt.name, stmt.kind === "const");
        this.visitFunctionBody(stmt.func, scope);
        return;
      }
      case "FunctionDeclarationStatement": {
        if (stmt.target.path.length === 0 && !stmt.target.method) {
          this.referenceAsAssignmentTarget(scope, stmt.target.base);
        } else {
          this.reference(scope, stmt.target.base);
        }
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
      case "DeclareStatement":
        return;
      case "TypeAliasStatement":
      case "ExportTypeAliasStatement":
        return;
      case "ImportStatement": {
        if (stmt.defaultImport) {
          this.declare(scope, stmt.defaultImport.name, "local", stmt.defaultImport);
        }
        for (const spec of stmt.specifiers) {
          this.declare(scope, spec.local.name, "local", spec.local);
        }
        return;
      }
      case "ExportStatement":
        this.visitStatement(stmt.declaration, scope);
        return;
      case "ExportDefaultStatement":
        this.visitExpression(stmt.declaration, scope);
        return;
    }
  }
  // ---------------- functions ----------------
  visitFunctionBody(func, outerScope, isMethod = false) {
    const fnScope = childScope(outerScope);
    func.params.forEach((param, i) => {
      const kind = isMethod && i === 0 ? "self" : "param";
      if (param.default) this.visitExpression(param.default, fnScope);
      if (param.pattern) {
        this.declarePattern(fnScope, param.pattern, kind, fnScope);
      } else {
        this.declare(fnScope, param.name, kind, param);
      }
    });
    this.visitBlock(func.body, fnScope);
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
      case "MethodCallExpression":
        this.visitExpression(expr.object, scope);
        for (const arg of expr.arguments) this.visitExpression(arg, scope);
        return;
      case "ParenthesizedExpression":
        this.visitExpression(expr.expression, scope);
        return;
      case "TypeAssertionExpression":
        this.visitExpression(expr.expression, scope);
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

// src/ast/typeModel.ts
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
      return objectType(
        entries,
        t.indexer && { key: substitute(t.indexer.key, subst), value: substitute(t.indexer.value, subst) },
        t.frozen
      );
    }
    case "function": {
      const inner = t.typeParams ? new Map([...subst].filter(([k]) => !t.typeParams.includes(k))) : subst;
      return {
        kind: "function",
        params: t.params.map((p) => ({ ...p, type: substitute(p.type, inner) })),
        varargs: t.varargs && substitute(t.varargs, inner),
        returns: substitute(t.returns, inner),
        typeParams: t.typeParams,
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
      if (arg.kind === "object") {
        for (const [k, pv] of param.properties) {
          const av = arg.properties.get(k);
          if (av) unify(pv.type, av.type, vars, out);
        }
        if (param.indexer && arg.indexer) unify(param.indexer.value, arg.indexer.value, vars, out);
      }
      return;
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
      if (t.frozen) return t;
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
var comparing = [];
function isAssignable(rawA, rawB) {
  let a = isNoValue(rawA) ? nilType : rawA;
  let b = isNoValue(rawB) ? nilType : rawB;
  if (a === b) return true;
  if (expandAlias) {
    if (a.kind === "genericRef" && b.kind !== "genericRef") a = expandAlias(a);
    else if (b.kind === "genericRef" && a.kind !== "genericRef") b = expandAlias(b);
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
  if (b.kind === "difference") {
    return isAssignable(a, b.base) && !overlaps(a, b.excluded);
  }
  if (a.kind === "difference") return isAssignable(a.base, b);
  if (a.kind === "union") return a.types.every((t) => isAssignable(t, b));
  if (b.kind === "union") return b.types.some((t) => isAssignable(a, t));
  if (b.kind === "intersection") return b.types.every((t) => isAssignable(a, t));
  if (a.kind === "intersection") return a.types.some((t) => isAssignable(t, b));
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
    for (const [name, bp] of b.properties) {
      const ap = a.properties.get(name);
      if (!ap) {
        if (bp.optional) continue;
        if (a.indexer && isAssignable(a.indexer.value, bp.type)) continue;
        return false;
      }
      if (!isAssignable(ap.type, bp.type)) return false;
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
  if (a.kind === "typeParam") {
    if (b.kind === "typeParam" && a.name === b.name) return true;
    return a.constraint ? isAssignable(a.constraint, b) : false;
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
    case "conditional":
      return containsTypeParam(t.checkType, seen, bound);
    case "mapped":
      return containsTypeParam(t.constraint, seen, bound);
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
  return isAssignable(a, b) || isAssignable(b, a);
}
var formatCache = /* @__PURE__ */ new WeakMap();
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
      if (t.name) return t.name;
      const props = [...t.properties.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${v.readonly ? "readonly " : ""}${formatKey(k)}${v.optional ? "?" : ""}: ${formatType(v.type)}`);
      if (t.indexer) props.push(`[${formatType(t.indexer.key)}]: ${formatType(t.indexer.value)}`);
      return props.length ? `{ ${props.join(", ")} }` : "{}";
    }
    case "function": {
      const consts = new Set(
        t.params.filter((p) => p.type.kind === "typeParam" && p.type.isConst).map((p) => p.type.name)
      );
      const gen = t.typeParams?.length ? `<${t.typeParams.map((n) => consts.has(n) ? `const ${n}` : n).join(", ")}>` : "";
      const ps = t.params.map((p) => `${p.name ? p.name + ": " : ""}${formatType(p.type)}`);
      if (t.varargs) ps.push(`...${formatType(t.varargs)}`);
      return `${gen}(${ps.join(", ")}) -> ${formatPredicate(t) ?? formatType(t.returns)}`;
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
  if (t.kind === "union" || t.kind === "intersection" || t.kind === "function" || t.kind === "difference") {
    return `(${formatType(t)})`;
  }
  return formatType(t);
}
var IDENT_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
function formatKey(k) {
  return IDENT_KEY.test(k) ? k : JSON.stringify(k);
}

// src/ast/analyzeTypes.ts
function analyzeTypes(program, scopes, options = {}) {
  return new TypeAnalyzer(program, scopes, options).run();
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
  /** Public: each alias resolved once (generic aliases keep their params as
   *  `typeParam` nodes in the body). */
  aliases = /* @__PURE__ */ new Map();
  /** Uninstantiated alias definitions, for `Name<Args>` instantiation. */
  aliasDefs = /* @__PURE__ */ new Map();
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
  emitDiagnostics;
  /** Recursion guard for `preVisitBody`. */
  preVisitDepth = 0;
  run() {
    for (const lib of this.options.libs ?? []) this.registerAliasDefs(lib.body);
    this.registerAliasDefs(this.program.body);
    for (const lib of this.options.libs ?? []) this.harvestDeclares(lib.body);
    this.harvestDeclares(this.program.body);
    this.resolveAllAliases();
    this.indexDeclarations();
    for (const [name, id] of this.scopes.globalsByName) {
      const t = this.options.globalTypes?.[name] ?? this.libGlobalTypes.get(name) ?? anyType;
      this.bindingType.set(id, t);
    }
    setAliasExpander((t) => this.expand(t));
    try {
      const env = /* @__PURE__ */ new Map();
      this.visitBlock(this.program.body, env);
    } finally {
      setAliasExpander(void 0);
    }
    return {
      typeOf: this.typeOf,
      bindingType: this.bindingType,
      narrowedTypeOf: this.narrowedTypeOf,
      aliases: this.aliases,
      diagnostics: this.diagnostics
    };
  }
  // --------------------------------------------------------
  // Aliases
  // --------------------------------------------------------
  registerAliasDefs(block) {
    for (const stmt of block.statements) {
      const alias = stmt.type === "TypeAliasStatement" ? stmt : stmt.type === "ExportTypeAliasStatement" ? stmt.alias : void 0;
      if (alias) this.aliasDefs.set(alias.name.name, { params: alias.generics, node: alias.definition });
    }
  }
  /** Seed global types from `declare` statements. Repeating a name builds an
   *  *overload set* (an intersection, in declaration order) rather than
   *  replacing — which is how `typeof` gets one signature per result string. */
  harvestDeclares(block) {
    for (const stmt of block.statements) {
      if (stmt.type !== "DeclareStatement") continue;
      const t = this.resolveType(stmt.valueType);
      const prev = this.libGlobalTypes.get(stmt.name);
      this.libGlobalTypes.set(stmt.name, prev ? intersection([prev, t]) : t);
    }
  }
  resolveAllAliases() {
    for (const [name, def] of this.aliasDefs) {
      this.withTypeParams(def.params, () => {
        this.aliases.set(name, this.resolveType(def.node));
      });
    }
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
    const subst = /* @__PURE__ */ new Map();
    def.params.forEach((p, i) => {
      subst.set(p.name, args[i] ?? (p.default ? this.resolveType(p.default) : unknownType));
    });
    this.instantiationDepth++;
    try {
      const body = this.withTypeParams(def.params, () => this.resolveType(def.node));
      return this.reduceType(substitute(body, subst));
    } finally {
      this.instantiationDepth--;
    }
  }
  // --------------------------------------------------------
  // TypeNode -> Type
  // --------------------------------------------------------
  resolveType(node) {
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
          const lib = this.options.libTypes?.[node.base];
          if (lib) return lib;
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
          const params = node.params.map((p) => ({
            name: p.name,
            type: p.optional ? optional(this.resolveType(p.typeAnnotation)) : this.resolveType(p.typeAnnotation),
            optional: p.optional
          }));
          return fn(
            params,
            this.resolveType(node.returnType),
            node.hasVarargs ? node.varargType ? this.resolveType(node.varargType) : anyType : void 0,
            names,
            this.resolvePredicate(node.predicate, params)
          );
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
      this.reduceCache.set(t, result);
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
      return this.propertyType(obj, index.value);
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
    if (containsTypeParam(checkType)) return { ...t, checkType };
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
        const { types: valueTypes, sources } = this.valueList(stmt.init, env);
        stmt.names.forEach((target, i) => {
          const inferred = valueTypes[i] ?? (stmt.init.length ? unknownType : nilType);
          const source = sources[i];
          if (this.emitDiagnostics && target.type === "IdentifierPattern" && target.typeAnnotation && source) {
            const declared = this.resolveType(target.typeAnnotation);
            if (declared.kind !== "any" && !this.fitsAnnotation(source, declared, inferred, env)) {
              this.diagnostics.push({
                node: stmt,
                message: `Type '${formatType(inferred)}' is not assignable to '${formatType(declared)}'`
              });
            }
          }
          const mode = this.initIsAsConst(source) ? "asconst" : !isFreshLiteralExpr(source) ? "keep" : stmt.kind === "const" ? "const" : "widen";
          this.bindPattern(target, inferred, env, mode);
        });
        return;
      }
      case "FunctionDeclaration": {
        this.checkParamOrder(stmt.func.params, stmt);
        for (const sig of stmt.signatures ?? []) this.checkParamOrder(sig.params, stmt);
        const id = this.bindingIdByName(stmt.name.name, stmt.name);
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
            const fnType = stmt.signatures?.length ? intersection(stmt.signatures.map((s) => this.signatureToFnType(s))) : this.inferFunctionBody(stmt.func, env);
            this.bindingType.set(targetId, fnType);
            this.setBinding(env, targetId, fnType);
          }
          this.visitFunctionBody(stmt.func, env);
          return;
        }
        const recv = targetId === void 0 ? anyType : this.currentType(targetId, env);
        this.withSelfType(stmt.isMethod ? recv : void 0, () => {
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
        const { types: valueTypes, sources } = this.valueList(stmt.values, env);
        stmt.targets.forEach((target, i) => {
          const vt = valueTypes[i] ?? unknownType;
          const source = sources[i];
          if (target.type === "Identifier") {
            const id = this.bindingIdOf(target);
            if (id !== void 0) {
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
        const [keyT, valT] = this.iterationTypes(stmt.iterators[0], iterTypes[0], stmt.variables.length);
        stmt.variables.forEach((v, i) => {
          this.bindPattern(v, i === 0 ? keyT : i === 1 ? valT : unknownType, bodyEnv, "widen");
        });
        this.visitBlock(stmt.body, bodyEnv);
        return;
      }
      case "ReturnStatement":
        for (const arg of stmt.arguments) this.infer(arg, env);
        return;
      case "ExportStatement":
        this.visitStatement(stmt.declaration, env);
        return;
      case "ExportDefaultStatement":
        this.infer(stmt.declaration, env);
        return;
      case "ImportStatement": {
        const ids = [];
        if (stmt.defaultImport) ids.push(this.bindingIdOf(stmt.defaultImport));
        for (const s of stmt.specifiers) ids.push(this.bindingIdOf(s.local));
        for (const id of ids) if (id !== void 0) this.bindingType.set(id, anyType);
        return;
      }
      case "BreakStatement":
        this.breakStates[this.breakStates.length - 1]?.push(forkEnv(env));
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
  valueList(exprs, env) {
    const types = [];
    const sources = [];
    exprs.forEach((e, i) => {
      const t = this.infer(e, env);
      const last = i === exprs.length - 1;
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
    if (!p.typeAnnotation && !p.pattern && !p.default && p.name === "self" && this.selfType) {
      return this.selfType;
    }
    if (p.typeAnnotation) {
      const t = this.resolveType(p.typeAnnotation);
      return p.optional ? optional(t) : t;
    }
    if (p.pattern) return this.patternToType(p.pattern, env);
    if (p.default) return widen(this.infer(p.default, env));
    return anyType;
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
  visitFunctionBodyInner(func, outerEnv) {
    const env = forkEnv(outerEnv);
    for (const p of func.params) {
      if (p.pattern) {
        this.bindPattern(p.pattern, this.paramType(p, env), env, "widen");
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
    this.visitBlock(func.body, env);
  }
  /** Return type of calling `f` with `argTypes`. For a generic function,
   *  infers the type parameters from the arguments and substitutes. */
  callReturn(f, argTypes) {
    if (!f.typeParams?.length) return f.returns;
    return this.reduceType(substitute(f.returns, this.inferTypeArgs(f, argTypes)));
  }
  /** Infer a generic call's type arguments from the argument types.
   *
   *  An argument is widened before matching — `id(1)` gives `number`, not
   *  `1` — *except* against a parameter whose constraint is made of literal
   *  types, where the literal is the whole point. That is what lets
   *  `<K extends keyof T>(name: K) -> T[K]` pick out one property. */
  inferTypeArgs(f, argTypes) {
    const vars = new Set(f.typeParams ?? []);
    const subst = /* @__PURE__ */ new Map();
    f.params.forEach((p, i) => {
      const arg = argTypes[i];
      if (arg === void 0) return;
      unify(p.type, keepsLiterals(p.type) ? arg : widen(arg), vars, subst);
    });
    for (const name of f.typeParams ?? []) if (!subst.has(name)) subst.set(name, unknownType);
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
  pickOverload(fns, argTypes, argsFor) {
    for (const generic of [false, true]) {
      for (const f of fns) {
        if ((f.typeParams?.length ?? 0) > 0 !== generic) continue;
        if (this.overloadAccepts(f, argsFor ? argsFor(f) : argTypes)) return f;
      }
    }
    return void 0;
  }
  /** Can this signature be called with these argument types? The signature's
   *  own generic parameters act as wildcards — they are what the call would
   *  infer, so they must not make the match fail. */
  overloadAccepts(f, argTypes) {
    if (!f.varargs && argTypes.length > f.params.length) return false;
    const wildcards = new Map((f.typeParams ?? []).map((n) => [n, anyType]));
    return f.params.every((p, i) => {
      if (argTypes[i] === void 0) return p.optional === true;
      return isAssignable(argTypes[i], substitute(p.type, wildcards));
    });
  }
  /** A required parameter may not follow an optional one — otherwise the
   *  optional one could never actually be omitted. Same rule as TypeScript,
   *  and it applies to a default (`a = 1`) as much as to a `?`. */
  checkParamOrder(params, node) {
    if (!this.emitDiagnostics) return;
    let seenOptional;
    for (const p of params) {
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
   *  when *no* overload accepts the call, so an overload set still reports
   *  once, against its first signature. */
  checkArity(node, fns, argCount, selfArgs) {
    if (!this.emitDiagnostics || !fns.length) return;
    const fits = fns.some((f) => {
      const { min: min2, max: max2 } = this.arityOf(f);
      const n = argCount + selfArgs;
      return n >= min2 && (max2 === void 0 || n <= max2);
    });
    if (fits) return;
    const { min, max } = this.arityOf(fns[0]);
    const need = max === void 0 ? `at least ${min - selfArgs}` : min === max ? `${min - selfArgs}` : `${min - selfArgs}-${max - selfArgs}`;
    this.diagnostics.push({
      node,
      message: `Expected ${need} argument${need === "1" ? "" : "s"}, got ${argCount}`
    });
  }
  signatureToFnType(sig) {
    const names = sig.generics.map((g) => g.name);
    return this.withTypeParams(sig.generics, () => {
      const params = sig.params.map((p) => ({
        name: p.pattern ? void 0 : p.name,
        type: this.paramType(p, /* @__PURE__ */ new Map()),
        optional: p.optional || p.default !== void 0
      }));
      return fn(
        params,
        sig.returnType ? this.resolveType(sig.returnType) : sig.predicate ? booleanType : anyType,
        sig.hasVarargs ? sig.varargTypeAnnotation ? this.resolveType(sig.varargTypeAnnotation) : anyType : void 0,
        names,
        this.resolvePredicate(sig.predicate, params)
      );
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
      const params = func.params.map((p) => ({
        name: p.pattern ? void 0 : p.name,
        type: this.paramType(p, env),
        optional: p.optional || p.default !== void 0
      }));
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
        this.preVisitBody(func.body, bodyEnv);
        returns = this.inferReturnType(func.body, bodyEnv);
      }
      return fn(
        params,
        returns,
        func.hasVarargs ? func.varargTypeAnnotation ? this.resolveType(func.varargTypeAnnotation) : anyType : void 0,
        names,
        this.resolvePredicate(func.predicate, params)
      );
    });
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
        if (target.rest) this.reassignPattern(target.rest, valueType, env);
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
        if (target.rest) this.bindPattern(target.rest, valueType, env, mode);
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
    if (!def || this.resolvingAliases.has(t.name)) return t;
    const key = t.typeArguments.length ? formatType(t) : t.name;
    const cached = this.expandCache.get(key);
    if (cached) return cached;
    this.expandCache.set(key, t);
    this.resolvingAliases.add(t.name);
    try {
      const r = def.params.length ? this.instantiateAlias(def, t.typeArguments) : this.resolveType(def.node);
      const named = def.params.length === 0 && (r.kind === "object" || r.kind === "intersection") && !r.name ? { ...r, name: t.name } : r;
      this.expandCache.set(key, named);
      return named;
    } finally {
      this.resolvingAliases.delete(t.name);
    }
  }
  propertyType(raw, name) {
    const t = this.expand(raw);
    if (t.kind === "object") {
      const p = t.properties.get(name);
      if (p) return p.optional ? optional(p.type) : p.type;
      if (t.indexer) return t.indexer.value;
    }
    if (t.kind === "union") return union(t.types.map((m) => this.propertyType(m, name)));
    if (t.kind === "intersection") {
      const parts = t.types.map((m) => this.propertyType(m, name)).filter((p) => p.kind !== "unknown");
      if (parts.length) return intersection(parts);
    }
    if (t.kind === "typeParam" && t.constraint) return this.propertyType(t.constraint, name);
    if (t.kind === "difference") return this.propertyType(t.base, name);
    if (t.kind === "any") return anyType;
    return unknownType;
  }
  /** `t[k]`. A statically known string key resolves against the declared
   *  properties first — the indexer is only the fallback, so
   *  `{ [string]: number, tag: string }["tag"]` is `string`, not `number`. */
  indexedType(raw, idx) {
    const t = this.expand(raw);
    if (t.kind === "any") return anyType;
    if (t.kind === "union") return union(t.types.map((m) => this.indexedType(m, idx)));
    if (t.kind === "difference") return this.indexedType(t.base, idx);
    if (t.kind === "typeParam" && t.constraint) return this.indexedType(t.constraint, idx);
    if (t.kind === "array") return t.element;
    if (t.kind === "tuple") {
      if (idx.kind === "literal" && typeof idx.value === "number") {
        return t.elements[idx.value - 1] ?? unknownType;
      }
      return union(t.elements);
    }
    if (t.kind === "object") {
      if (idx.kind === "literal" && typeof idx.value === "string") return this.propertyType(t, idx.value);
      if (t.indexer) return t.indexer.value;
    }
    return unknownType;
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
      case "VarargExpression":
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
        const actual = this.infer(expr.expression, env);
        const declared = this.resolveType(expr.typeAnnotation);
        if (this.emitDiagnostics && declared.kind !== "any" && !this.fitsAnnotation(expr.expression, declared, actual, env)) {
          this.diagnostics.push({
            node: expr,
            message: `Type '${formatType(actual)}' does not satisfy '${formatType(declared)}'`
          });
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
            return numberType;
          case "#":
            return numberType;
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
        switch (op) {
          case "..":
            return stringType;
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
            return numberType;
        }
        return union([l, r]);
      }
      case "MemberExpression": {
        const obj = this.infer(expr.object, env);
        const key = this.refKeyOf(expr);
        const narrowed = key === void 0 ? void 0 : env.get(key);
        return narrowed ?? this.propertyType(obj, expr.property.name);
      }
      case "IndexExpression": {
        const obj = this.infer(expr.object, env);
        const idx = this.infer(expr.index, env);
        const key = this.refKeyOf(expr);
        const narrowed = key === void 0 ? void 0 : env.get(key);
        return narrowed ?? this.indexedType(obj, idx);
      }
      case "CallExpression": {
        const callee = this.infer(expr.callee, env);
        const argTypes = expr.arguments.map((a) => this.infer(a, env));
        const fns = this.overloadsOf(callee);
        if (fns.length) {
          this.checkArity(expr, fns, argTypes.length, 0);
          const picked = this.pickOverload(fns, argTypes);
          if (picked) {
            return this.callReturn(picked, this.constArgs(picked, expr.arguments, argTypes, env));
          }
          return union(fns.map((f) => this.callReturn(f, argTypes)));
        }
        return callee.kind === "any" ? anyType : unknownType;
      }
      case "MethodCallExpression": {
        const objType = this.infer(expr.object, env);
        const argTypes = expr.arguments.map((a) => this.infer(a, env));
        const fns = this.overloadsOf(this.propertyType(objType, expr.method.name));
        if (fns.length) {
          const withSelf = (f) => this.takesSelf(f) ? [objType, ...argTypes] : argTypes;
          this.checkArity(expr, fns, argTypes.length, this.takesSelf(fns[0]) ? 1 : 0);
          const picked = this.pickOverload(fns, argTypes, withSelf);
          if (picked) {
            const self = this.takesSelf(picked) ? 1 : 0;
            const written = this.constArgs(picked, expr.arguments, argTypes, env, self);
            return this.callReturn(picked, this.takesSelf(picked) ? [objType, ...written] : written);
          }
          return union(fns.map((f) => this.callReturn(f, withSelf(f))));
        }
        return objType.kind === "any" ? anyType : unknownType;
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
  inferArray(expr, env, asConst) {
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
    return arrayOf(elems.length ? union(elems.map((t) => asConst ? t : widen(t))) : unknownType);
  }
  inferObject(expr, env, asConst) {
    const entries = [];
    let indexer;
    for (const field of expr.fields) {
      if (field.type === "TableFieldNamed") {
        const key = field.key.type === "Identifier" ? field.key.name : field.key.value;
        const v = asConst ? this.inferAsConst(field.value, env) : widen(this.infer(field.value, env));
        entries.push([key, { type: v, optional: false, readonly: asConst }]);
      } else if (field.type === "TableFieldShorthand") {
        const v = this.infer(field.name, env);
        entries.push([field.name.name, { type: asConst ? v : widen(v), optional: false, readonly: asConst }]);
      } else if (field.type === "TableFieldComputed") {
        const k = this.infer(field.key, env);
        const v = this.infer(field.value, env);
        if (k.kind === "literal" && typeof k.value === "string") {
          entries.push([k.value, { type: asConst ? v : widen(v), optional: false, readonly: asConst }]);
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
      return;
    }
    this.narrowRef(cond, env, t, f, (cur) => ({
      yes: narrowTruthy(cur),
      no: narrowFalsy(cur)
    }));
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
      if (value === void 0 || this.refKeyOf(ref) === void 0) continue;
      this.narrowRef(ref, env, yes, no, (cur) => ({
        yes: narrowTo(cur, value),
        no: narrowExclude(cur, value)
      }));
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
    if (cond.type === "CallExpression") {
      callee = this.typeOf.get(cond.callee) ?? this.typeAtRef(cond.callee, env);
      args = cond.arguments;
    } else if (cond.type === "MethodCallExpression") {
      const objType = this.typeOf.get(cond.object) ?? this.typeAtRef(cond.object, env);
      callee = this.propertyType(objType, cond.method.name);
      const first = this.overloadsOf(callee)[0];
      args = first && this.takesSelf(first) ? [cond.object, ...cond.arguments] : cond.arguments;
    } else {
      return void 0;
    }
    const overloads = this.overloadsOf(callee);
    const argTypes = args.map((a) => this.typeOf.get(a) ?? this.typeAtRef(a, env));
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
    const inner = expr.type === "ParenthesizedExpression" ? expr.expression : expr;
    if (inner.type !== "MemberExpression" && inner.type !== "IndexExpression") return;
    const parentKey = this.refKeyOf(inner.object);
    if (parentKey === void 0) return;
    const step = key.slice(parentKey.length);
    if (!step.startsWith(".")) return;
    const prop = step.slice(1);
    this.narrowRef(inner.object, env, t, f, (parentType) => ({
      yes: this.filterByProperty(parentType, prop, yes),
      no: this.filterByProperty(parentType, prop, no)
    }));
  }
  /** Keep the union members of `parent` whose `prop` can still hold `want`.
   *  Leaves a non-union (or a union nothing matches) alone: over-narrowing a
   *  plain object to `never` because of a property test would be worse than
   *  learning nothing. */
  filterByProperty(parent, prop, want) {
    if (parent.kind !== "union" || want.kind === "never") return parent;
    const kept = parent.types.filter((m) => overlaps(this.propertyType(m, prop), want));
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
  /** Does this signature take the receiver as its first parameter?
   *
   *  Luau's `:` is sugar both ways: `function T:m(a)` declares
   *  `(self: T, a)`, and `o:m(x)` calls it as `m(o, x)`. The convention that
   *  marks it is the first parameter being named `self` — which is what the
   *  parser injects for `function T:m` and what the definitions files spell
   *  out. Every place that has to line arguments up with parameters goes
   *  through here so the two sides cannot drift apart. */
  takesSelf(f) {
    return f.params[0]?.name === "self";
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
    return env.get(bindKey(id)) ?? this.bindingType.get(id) ?? anyType;
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

// src/lib/luau.ts
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
var luauDefsPath = fileURLToPath(new URL("./luau.d.luaut", import.meta.url));
var luauDefs = readFileSync(luauDefsPath, "utf8");
var luauLib = parse(luauDefs);

// src/lib/roblox.ts
import { readFileSync as readFileSync2 } from "fs";
import { fileURLToPath as fileURLToPath2 } from "url";
var robloxDefsPath = fileURLToPath2(new URL("./roblox.d.luaut", import.meta.url));
var robloxDefs = readFileSync2(robloxDefsPath, "utf8");
var robloxLib = parse(robloxDefs);

// src/index.ts
var defaultLibs = [luauLib, robloxLib];
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
export {
  BinaryOperators,
  Keywords,
  LexError,
  Operators,
  ParseError,
  Punctuators,
  UnaryOperators,
  analyzeScopes,
  analyzeTypes,
  anyType,
  arrayOf,
  booleanType,
  bufferType,
  containsTypeParam,
  index_default as default,
  defaultLibs,
  difference,
  equalTypes,
  falsyType,
  fn,
  formatType,
  getBinding,
  intersection,
  isAssignable,
  isGlobal,
  isPossiblyFalsy,
  isPossiblyTruthy,
  isUnassignedGlobal,
  literal,
  luauDefs,
  luauDefsPath,
  luauLib,
  luautparser,
  matchInfer,
  narrowExclude,
  narrowFalsy,
  narrowTo,
  narrowTruthy,
  neverType,
  nilType,
  numberType,
  objectType,
  optional,
  overlaps,
  parse,
  parseExpressionFromSource,
  parseTokens,
  parseWithRecovery,
  primitive,
  robloxDefs,
  robloxDefsPath,
  robloxLib,
  setAliasExpander,
  stringType,
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
};

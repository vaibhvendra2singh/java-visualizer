import type {
  JavaType,
  ProgramNode,
  ClassDeclarationNode,
  FieldDeclarationNode,
  ConstructorDeclarationNode,
  MethodDeclarationNode,
  ParameterNode,
  StatementNode,
  BlockStatementNode,
  VariableDeclarationStatementNode,
  AssignmentStatementNode,
  IfStatementNode,
  WhileStatementNode,
  ForStatementNode,
  ReturnStatementNode,
  ExpressionStatementNode,
  ExpressionNode,
  MethodCallExpressionNode,
  FieldAccessExpressionNode
} from './types';

export type TokenType =
  | 'Keyword'
  | 'Identifier'
  | 'Number'
  | 'String'
  | 'Char'
  | 'Boolean'
  | 'Null'
  | 'Operator'
  | 'Punctuation'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

// Custom Syntax Error class for compilation issues
export class JavaSyntaxError extends Error {
  line: number;
  col: number;
  constructor(message: string, line: number, col: number) {
    super(`Compilation Error (Line ${line}, Col ${col}): ${message}`);
    this.name = 'JavaSyntaxError';
    this.line = line;
    this.col = col;
  }
}

export class Tokenizer {
  private code: string;
  private pos = 0;
  private line = 1;
  private col = 1;

  private keywords = new Set([
    'class', 'public', 'private', 'static', 'void', 'int', 'double',
    'boolean', 'char', 'String', 'if', 'else', 'for', 'while', 'new',
    'return', 'this'
  ]);

  constructor(code: string) {
    this.code = code;
  }

  private peek(): string {
    return this.code[this.pos] || '';
  }

  private consume(): string {
    const char = this.peek();
    this.pos++;
    if (char === '\n') {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return char;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.pos < this.code.length) {
      const char = this.peek();

      // Skip whitespace
      if (/\s/.test(char)) {
        this.consume();
        continue;
      }

      // Skip comments
      if (char === '/' && this.code[this.pos + 1] === '/') {
        // Line comment
        while (this.peek() !== '\n' && this.pos < this.code.length) {
          this.consume();
        }
        continue;
      }
      if (char === '/' && this.code[this.pos + 1] === '*') {
        // Block comment
        const startLine = this.line;
        const startCol = this.col;
        this.consume(); // '/'
        this.consume(); // '*'
        while (this.pos < this.code.length) {
          if (this.peek() === '*' && this.code[this.pos + 1] === '/') {
            this.consume(); // '*'
            this.consume(); // '/'
            break;
          }
          this.consume();
        }
        if (this.pos >= this.code.length) {
          throw new JavaSyntaxError('Unterminated block comment', startLine, startCol);
        }
        continue;
      }

      // Numbers
      if (/\d/.test(char)) {
        tokens.push(this.readNumber());
        continue;
      }

      // Strings
      if (char === '"') {
        tokens.push(this.readString());
        continue;
      }

      // Chars
      if (char === '\'') {
        tokens.push(this.readChar());
        continue;
      }

      // Identifiers / Keywords
      if (/[a-zA-Z_]/.test(char)) {
        tokens.push(this.readIdentifier());
        continue;
      }

      // Operators & Punctuation
      const currentLine = this.line;
      const currentCol = this.col;

      // Multi-character operators
      const nextChar = this.code[this.pos + 1] || '';
      const twoChars = char + nextChar;

      // Check operators
      const ops2 = ['==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/='];
      if (ops2.includes(twoChars)) {
        this.consume();
        this.consume();
        tokens.push({ type: 'Operator', value: twoChars, line: currentLine, col: currentCol });
        continue;
      }

      const ops1 = ['+', '-', '*', '/', '%', '=', '<', '>', '!'];
      if (ops1.includes(char)) {
        this.consume();
        tokens.push({ type: 'Operator', value: char, line: currentLine, col: currentCol });
        continue;
      }

      const puncs = [';', ',', '.', '(', ')', '{', '}', '[', ']'];
      if (puncs.includes(char)) {
        this.consume();
        tokens.push({ type: 'Punctuation', value: char, line: currentLine, col: currentCol });
        continue;
      }

      // Invalid character
      throw new JavaSyntaxError(`Unexpected character: '${char}'`, currentLine, currentCol);
    }

    tokens.push({ type: 'EOF', value: '', line: this.line, col: this.col });
    return tokens;
  }

  private readNumber(): Token {
    const startLine = this.line;
    const startCol = this.col;
    let value = '';
    while (/\d/.test(this.peek())) {
      value += this.consume();
    }
    if (this.peek() === '.') {
      value += this.consume();
      while (/\d/.test(this.peek())) {
        value += this.consume();
      }
    }
    return { type: 'Number', value, line: startLine, col: startCol };
  }

  private readString(): Token {
    const startLine = this.line;
    const startCol = this.col;
    this.consume(); // consume opening quote
    let value = '';
    while (this.peek() !== '"' && this.pos < this.code.length) {
      if (this.peek() === '\\') {
        this.consume(); // consume escape backslash
        const escaped = this.consume();
        if (escaped === 'n') value += '\n';
        else if (escaped === 't') value += '\t';
        else value += escaped;
      } else {
        value += this.consume();
      }
    }
    if (this.peek() !== '"') {
      throw new JavaSyntaxError('Unterminated string literal', startLine, startCol);
    }
    this.consume(); // consume closing quote
    return { type: 'String', value, line: startLine, col: startCol };
  }

  private readChar(): Token {
    const startLine = this.line;
    const startCol = this.col;
    this.consume(); // opening '
    let value = '';
    if (this.peek() === '\\') {
      this.consume();
      value += '\\' + this.consume();
    } else {
      value += this.consume();
    }
    if (this.peek() !== '\'') {
      throw new JavaSyntaxError('Unterminated char literal', startLine, startCol);
    }
    this.consume(); // closing '
    return { type: 'Char', value, line: startLine, col: startCol };
  }

  private readIdentifier(): Token {
    const startLine = this.line;
    const startCol = this.col;
    let value = '';
    while (/[a-zA-Z0-9_]/.test(this.peek())) {
      value += this.consume();
    }

    if (value === 'true' || value === 'false') {
      return { type: 'Boolean', value, line: startLine, col: startCol };
    }
    if (value === 'null') {
      return { type: 'Null', value, line: startLine, col: startCol };
    }
    if (this.keywords.has(value)) {
      return { type: 'Keyword', value, line: startLine, col: startCol };
    }
    return { type: 'Identifier', value, line: startLine, col: startCol };
  }
}

export class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private peekNext(): Token {
    return this.tokens[this.pos + 1] || this.tokens[this.pos];
  }

  private consume(type?: TokenType, value?: string): Token {
    const token = this.peek();
    if (type && token.type !== type) {
      throw new JavaSyntaxError(`Expected token type ${type}, got ${token.type}`, token.line, token.col);
    }
    if (value && token.value !== value) {
      throw new JavaSyntaxError(`Expected token value '${value}', got '${token.value}'`, token.line, token.col);
    }
    this.pos++;
    return token;
  }

  private match(type: TokenType, value?: string): boolean {
    const token = this.peek();
    if (token.type === type && (!value || token.value === value)) {
      this.pos++;
      return true;
    }
    return false;
  }

  private check(type: TokenType, value?: string): boolean {
    const token = this.peek();
    return token.type === type && (!value || token.value === value);
  }

  parse(): ProgramNode {
    const classes: ClassDeclarationNode[] = [];
    const firstToken = this.peek();
    while (!this.check('EOF')) {
      classes.push(this.parseClassDeclaration());
    }
    return {
      type: 'Program',
      classes,
      line: firstToken.line
    };
  }

  private parseClassDeclaration(): ClassDeclarationNode {
    const startToken = this.peek();
    if (this.match('Keyword', 'public')) {
      // Ignored
    }
    this.consume('Keyword', 'class');
    const className = this.consume('Identifier').value;
    this.consume('Punctuation', '{');

    const fields: FieldDeclarationNode[] = [];
    const constructors: ConstructorDeclarationNode[] = [];
    const methods: MethodDeclarationNode[] = [];

    while (!this.check('Punctuation', '}')) {
      // Check static, access modifiers
      let isStatic = false;
      if (this.match('Keyword', 'public') || this.match('Keyword', 'private')) {
        // Skip for simplicity, but we matched it
      }
      if (this.match('Keyword', 'static')) {
        isStatic = true;
      }

      const next = this.peek();
      // If it is the class name followed by a '(' it is a constructor
      if (next.type === 'Identifier' && next.value === className && this.peekNext().value === '(') {
        constructors.push(this.parseConstructorDeclaration(className));
      } else {
        // It's a field or method
        // Format: DataType name...
        const dataType = this.parseType();
        let isArray = false;
        if (this.match('Punctuation', '[')) {
          this.consume('Punctuation', ']');
          isArray = true;
        }

        const name = this.consume('Identifier').value;

        if (this.check('Punctuation', '(')) {
          // It's a method!
          methods.push(this.parseMethodDeclaration(isStatic, dataType, name, isArray));
        } else {
          // It's a field!
          fields.push(this.parseFieldDeclaration(dataType, name, isArray, next.line));
        }
      }
    }

    this.consume('Punctuation', '}');
    return {
      type: 'ClassDeclaration',
      name: className,
      fields,
      constructors,
      methods,
      line: startToken.line
    };
  }

  private parseType(): JavaType {
    const token = this.peek();
    if (token.type === 'Keyword') {
      const types = ['int', 'double', 'boolean', 'char', 'String', 'void'];
      if (types.includes(token.value)) {
        this.consume();
        return token.value as JavaType;
      }
    } else if (token.type === 'Identifier') {
      // Class type references are represented as reference types
      this.consume();
      return 'reference';
    }
    throw new JavaSyntaxError(`Expected valid Java type, got '${token.value}'`, token.line, token.col);
  }

  private parseConstructorDeclaration(className: string): ConstructorDeclarationNode {
    const startToken = this.consume('Identifier', className);
    this.consume('Punctuation', '(');
    const parameters = this.parseParameters();
    this.consume('Punctuation', ')');
    const body = this.parseBlockStatement();
    return {
      type: 'ConstructorDeclaration',
      name: className,
      parameters,
      body,
      line: startToken.line
    };
  }

  private parseMethodDeclaration(isStatic: boolean, returnType: JavaType, name: string, isArray: boolean): MethodDeclarationNode {
    this.consume('Punctuation', '(');
    const parameters = this.parseParameters();
    this.consume('Punctuation', ')');
    const body = this.parseBlockStatement();
    return {
      type: 'MethodDeclaration',
      isStatic,
      returnType: isArray ? 'reference' : returnType, // Array return type is reference
      name,
      parameters,
      body,
      line: body.line
    };
  }

  private parseFieldDeclaration(dataType: JavaType, name: string, isArray: boolean, line: number): FieldDeclarationNode {
    let initializer: ExpressionNode | undefined;
    if (this.match('Operator', '=')) {
      initializer = this.parseExpression();
    }
    this.consume('Punctuation', ';');
    return {
      type: 'FieldDeclaration',
      dataType: isArray ? 'reference' : dataType,
      name,
      initializer,
      line
    };
  }

  private parseParameters(): ParameterNode[] {
    const parameters: ParameterNode[] = [];
    if (this.check('Punctuation', ')')) {
      return parameters;
    }
    do {
      const typeToken = this.peek();
      const dataType = this.parseType();
      let isArray = false;
      if (this.match('Punctuation', '[')) {
        this.consume('Punctuation', ']');
        isArray = true;
      }
      const name = this.consume('Identifier').value;
      parameters.push({
        type: 'Parameter',
        dataType: isArray ? 'reference' : dataType,
        name,
        line: typeToken.line
      });
    } while (this.match('Punctuation', ','));
    return parameters;
  }

  private parseBlockStatement(): BlockStatementNode {
    const startToken = this.consume('Punctuation', '{');
    const statements: StatementNode[] = [];
    while (!this.check('Punctuation', '}')) {
      statements.push(this.parseStatement());
    }
    this.consume('Punctuation', '}');
    return {
      type: 'BlockStatement',
      statements,
      line: startToken.line
    };
  }

  private parseStatement(): StatementNode {
    const token = this.peek();

    if (this.check('Punctuation', '{')) {
      return this.parseBlockStatement();
    }

    if (this.check('Keyword', 'if')) {
      return this.parseIfStatement();
    }

    if (this.check('Keyword', 'while')) {
      return this.parseWhileStatement();
    }

    if (this.check('Keyword', 'for')) {
      return this.parseForStatement();
    }

    if (this.check('Keyword', 'return')) {
      return this.parseReturnStatement();
    }

    // It could be variable declaration or expression statement
    // Variable declaration starts with a primitive type, class name, or array type
    const isVarDecl = this.checkTypeWord(token);
    if (isVarDecl) {
      return this.parseVariableDeclarationStatement();
    }

    // Otherwise, expression statement (like assignment or method call)
    return this.parseExpressionStatement();
  }

  private checkTypeWord(token: Token): boolean {
    if (token.type === 'Keyword') {
      return ['int', 'double', 'boolean', 'char', 'String'].includes(token.value);
    }
    if (token.type === 'Identifier') {
      // A class name followed by another identifier or array brackets indicates a var declaration.
      // E.g. "Point p" or "Point[] arr"
      const next1 = this.peekNext();
      if (next1.type === 'Identifier') return true;
      if (next1.type === 'Punctuation' && next1.value === '[') {
        const next2 = this.tokens[this.pos + 2];
        if (next2 && next2.type === 'Punctuation' && next2.value === ']') {
          const next3 = this.tokens[this.pos + 3];
          if (next3 && next3.type === 'Identifier') {
            return true;
          }
        }
      }
    }
    return false;
  }

  private parseVariableDeclarationStatement(): VariableDeclarationStatementNode {
    const startToken = this.peek();
    const dataType = this.parseType();
    let isArray = false;
    if (this.match('Punctuation', '[')) {
      this.consume('Punctuation', ']');
      isArray = true;
    }
    const name = this.consume('Identifier').value;
    let initializer: ExpressionNode | undefined;
    if (this.match('Operator', '=')) {
      initializer = this.parseExpression();
    }
    this.consume('Punctuation', ';');
    return {
      type: 'VariableDeclarationStatement',
      dataType: isArray ? 'reference' : dataType,
      isArray,
      name,
      initializer,
      line: startToken.line
    };
  }

  private parseIfStatement(): IfStatementNode {
    const startToken = this.consume('Keyword', 'if');
    this.consume('Punctuation', '(');
    const condition = this.parseExpression();
    this.consume('Punctuation', ')');
    const thenBranch = this.parseStatement();
    let elseBranch: StatementNode | undefined;
    if (this.match('Keyword', 'else')) {
      elseBranch = this.parseStatement();
    }
    return {
      type: 'IfStatement',
      condition,
      thenBranch,
      elseBranch,
      line: startToken.line
    };
  }

  private parseWhileStatement(): WhileStatementNode {
    const startToken = this.consume('Keyword', 'while');
    this.consume('Punctuation', '(');
    const condition = this.parseExpression();
    this.consume('Punctuation', ')');
    const body = this.parseStatement();
    return {
      type: 'WhileStatement',
      condition,
      body,
      line: startToken.line
    };
  }

  private parseForStatement(): ForStatementNode {
    const startToken = this.consume('Keyword', 'for');
    this.consume('Punctuation', '(');

    let initializer: VariableDeclarationStatementNode | AssignmentStatementNode | null = null;
    if (!this.check('Punctuation', ';')) {
      const nextToken = this.peek();
      if (this.checkTypeWord(nextToken)) {
        // Var declaration: E.g., int i = 0
        const dataType = this.parseType();
        let isArray = false;
        if (this.match('Punctuation', '[')) {
          this.consume('Punctuation', ']');
          isArray = true;
        }
        const name = this.consume('Identifier').value;
        this.consume('Operator', '=');
        const initExpr = this.parseExpression();
        // Do NOT consume semicolon here, the structure handles it as "initializer"
        initializer = {
          type: 'VariableDeclarationStatement',
          dataType: isArray ? 'reference' : dataType,
          isArray,
          name,
          initializer: initExpr,
          line: nextToken.line
        };
      } else {
        // Assignment
        initializer = this.parseAssignmentExpression();
      }
    }
    this.consume('Punctuation', ';');

    let condition: ExpressionNode | null = null;
    if (!this.check('Punctuation', ';')) {
      condition = this.parseExpression();
    }
    this.consume('Punctuation', ';');

    let update: ExpressionNode | null = null;
    if (!this.check('Punctuation', ')')) {
      update = this.parseExpression();
    }
    this.consume('Punctuation', ')');

    const body = this.parseStatement();
    return {
      type: 'ForStatement',
      initializer,
      condition,
      update,
      body,
      line: startToken.line
    };
  }

  private parseReturnStatement(): ReturnStatementNode {
    const startToken = this.consume('Keyword', 'return');
    let expression: ExpressionNode | undefined;
    if (!this.check('Punctuation', ';')) {
      expression = this.parseExpression();
    }
    this.consume('Punctuation', ';');
    return {
      type: 'ReturnStatement',
      expression,
      line: startToken.line
    };
  }

  private parseExpressionStatement(): ExpressionStatementNode {
    const startToken = this.peek();
    let expression: ExpressionNode;

    // Check if it's an assignment statement
    if (this.isNextAssignment()) {
      expression = this.parseAssignmentExpression() as any; // Cast for simplified AST wrapping
    } else {
      expression = this.parseExpression();
    }
    this.consume('Punctuation', ';');
    return {
      type: 'ExpressionStatement',
      expression,
      line: startToken.line
    };
  }

  private isNextAssignment(): boolean {
    // Scan ahead to see if there is an assignment operator at the top level
    // This is simple: walk through tokens until ';'.
    // If we find '=', '+=', etc. not nested in '(' or '[', it is an assignment.
    let index = this.pos;
    let parenDepth = 0;
    let bracketDepth = 0;
    while (index < this.tokens.length) {
      const token = this.tokens[index];
      if (token.value === ';') break;
      if (token.value === '(') parenDepth++;
      if (token.value === ')') parenDepth--;
      if (token.value === '[') bracketDepth++;
      if (token.value === ']') bracketDepth--;

      if (parenDepth === 0 && bracketDepth === 0) {
        if (token.type === 'Operator' && ['=', '+=', '-=', '*=', '/='].includes(token.value)) {
          return true;
        }
      }
      index++;
    }
    return false;
  }

  private parseAssignmentExpression(): AssignmentStatementNode {
    const target = this.parseExpression(1); // parse target (higher than assignment precedence)
    const opToken = this.consume('Operator');
    if (!['=', '+=', '-=', '*=', '/='].includes(opToken.value)) {
      throw new JavaSyntaxError(`Expected assignment operator, got '${opToken.value}'`, opToken.line, opToken.col);
    }
    const val = this.parseExpression();
    return {
      type: 'AssignmentStatement',
      target,
      operator: opToken.value as any,
      value: val,
      line: target.line
    };
  }

  // Expression Parsing with Precedence (Pratt Parser simplified)
  parseExpression(precedence = 0): ExpressionNode {
    let left = this.parsePrimary();

    while (true) {
      // Check suffix operators like MethodCall, FieldAccess, ArrayAccess, Postfix
      const token = this.peek();
      if (token.type === 'Punctuation' && token.value === '.') {
        this.consume();
        const fieldName = this.consume('Identifier').value;
        left = {
          type: 'FieldAccessExpression',
          object: left,
          fieldName,
          line: left.line
        } as FieldAccessExpressionNode;

        // If next is '(' then this is a method call!
        if (this.check('Punctuation', '(')) {
          this.consume();
          const args = this.parseArguments();
          this.consume('Punctuation', ')');
          left = {
            type: 'MethodCallExpression',
            object: (left as FieldAccessExpressionNode).object,
            methodName: (left as FieldAccessExpressionNode).fieldName,
            arguments: args,
            line: left.line
          } as MethodCallExpressionNode;
        }
      } else if (token.type === 'Punctuation' && token.value === '[') {
        this.consume();
        const index = this.parseExpression();
        this.consume('Punctuation', ']');
        left = {
          type: 'ArrayAccessExpression',
          array: left,
          index,
          line: left.line
        };
      } else if (token.type === 'Operator' && ['++', '--'].includes(token.value)) {
        this.consume();
        left = {
          type: 'PostfixExpression',
          operator: token.value as '++' | '--',
          expression: left,
          line: left.line
        };
      } else {
        break;
      }
    }

    // Binary expressions
    while (true) {
      const token = this.peek();
      if (token.type !== 'Operator') break;

      const opPrecedence = this.getOperatorPrecedence(token.value);
      if (opPrecedence < precedence) break;

      this.consume(); // consume operator
      const right = this.parseExpression(opPrecedence + 1);
      left = {
        type: 'BinaryExpression',
        operator: token.value as any,
        left,
        right,
        line: left.line
      };
    }

    return left;
  }

  private parsePrimary(): ExpressionNode {
    const token = this.peek();

    if (token.type === 'Number') {
      this.consume();
      const hasDot = token.value.includes('.');
      return {
        type: 'Literal',
        valueType: hasDot ? 'double' : 'int',
        value: Number(token.value),
        line: token.line
      };
    }

    if (token.type === 'String') {
      this.consume();
      return {
        type: 'Literal',
        valueType: 'String',
        value: token.value,
        line: token.line
      };
    }

    if (token.type === 'Char') {
      this.consume();
      return {
        type: 'Literal',
        valueType: 'char',
        value: token.value,
        line: token.line
      };
    }

    if (token.type === 'Boolean') {
      this.consume();
      return {
        type: 'Literal',
        valueType: 'boolean',
        value: token.value === 'true',
        line: token.line
      };
    }

    if (token.type === 'Null') {
      this.consume();
      return {
        type: 'Literal',
        valueType: 'reference',
        value: null,
        line: token.line
      };
    }

    if (token.type === 'Keyword' && token.value === 'this') {
      this.consume();
      return {
        type: 'ThisExpression',
        line: token.line
      };
    }

    if (token.type === 'Keyword' && token.value === 'new') {
      return this.parseNewExpression();
    }

    if (token.type === 'Identifier') {
      this.consume();
      // Method call on current object: e.g. foo(10)
      if (this.check('Punctuation', '(')) {
        this.consume('Punctuation', '(');
        const args = this.parseArguments();
        this.consume('Punctuation', ')');
        return {
          type: 'MethodCallExpression',
          methodName: token.value,
          arguments: args,
          line: token.line
        };
      }
      return {
        type: 'Identifier',
        name: token.value,
        line: token.line
      };
    }

    if (token.type === 'Punctuation' && token.value === '(') {
      this.consume();
      const expr = this.parseExpression();
      this.consume('Punctuation', ')');
      return expr;
    }

    // Unary prefix operators
    if (token.type === 'Operator' && ['!', '-', '++', '--'].includes(token.value)) {
      this.consume();
      const expr = this.parseExpression(10); // high precedence for unary
      return {
        type: 'UnaryExpression',
        operator: token.value as any,
        expression: expr,
        line: token.line
      };
    }

    // Special case: direct array literal initializer E.g. {1, 2, 3} inside var init
    if (token.type === 'Punctuation' && token.value === '{') {
      this.consume();
      const elements: ExpressionNode[] = [];
      if (!this.check('Punctuation', '}')) {
        do {
          elements.push(this.parseExpression());
        } while (this.match('Punctuation', ','));
      }
      this.consume('Punctuation', '}');
      // Treat this as a NewArrayExpression without explicit size, and with initializers
      return {
        type: 'NewArrayExpression',
        elementType: 'int', // We will infer it during evaluation
        initializers: elements,
        line: token.line
      };
    }

    throw new JavaSyntaxError(`Unexpected primary token '${token.value}'`, token.line, token.col);
  }

  private parseNewExpression(): ExpressionNode {
    const startToken = this.consume('Keyword', 'new');
    const typeToken = this.peek();

    // Check if it's an array creation: E.g., new int[5] or new int[]{1, 2}
    const isPrimitiveType = typeToken.type === 'Keyword' && ['int', 'double', 'boolean', 'char', 'String'].includes(typeToken.value);
    const isClassType = typeToken.type === 'Identifier';

    if (isPrimitiveType || (isClassType && this.peekNext().value === '[')) {
      // It's an array creation! E.g. new int[5] or new Point[10]
      const elementType = this.parseType();
      this.consume('Punctuation', '[');

      let sizeExpr: ExpressionNode | undefined;
      if (!this.check('Punctuation', ']')) {
        sizeExpr = this.parseExpression();
      }
      this.consume('Punctuation', ']');

      let initializers: ExpressionNode[] | undefined;
      if (this.match('Punctuation', '{')) {
        initializers = [];
        if (!this.check('Punctuation', '}')) {
          do {
            initializers.push(this.parseExpression());
          } while (this.match('Punctuation', ','));
        }
        this.consume('Punctuation', '}');
      }

      return {
        type: 'NewArrayExpression',
        elementType,
        size: sizeExpr,
        initializers,
        line: startToken.line
      };
    }

    // Otherwise, it's new Object(...)
    const className = this.consume('Identifier').value;
    this.consume('Punctuation', '(');
    const args = this.parseArguments();
    this.consume('Punctuation', ')');

    return {
      type: 'NewObjectExpression',
      className,
      arguments: args,
      line: startToken.line
    };
  }

  private parseArguments(): ExpressionNode[] {
    const args: ExpressionNode[] = [];
    if (this.check('Punctuation', ')')) {
      return args;
    }
    do {
      args.push(this.parseExpression());
    } while (this.match('Punctuation', ','));
    return args;
  }

  private getOperatorPrecedence(op: string): number {
    switch (op) {
      case '||':
        return 1;
      case '&&':
        return 2;
      case '==':
      case '!=':
        return 3;
      case '<':
      case '<=':
      case '>':
      case '>=':
        return 4;
      case '+':
      case '-':
        return 5;
      case '*':
      case '/':
      case '%':
        return 6;
      default:
        return 0;
    }
  }
}

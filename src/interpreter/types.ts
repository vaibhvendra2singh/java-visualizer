export type JavaType = 'int' | 'double' | 'boolean' | 'char' | 'String' | 'reference' | 'void'
  | 'long' | 'float' | 'short' | 'byte';

export type VariableValue =
  | { type: 'primitive'; value: number | boolean | string | null }
  | { type: 'reference'; refId: number | null };

export interface VariableState {
  name: string;
  type: JavaType;
  value: VariableValue;
}

export interface StackFrame {
  id: string; // "frame-0", "frame-1", etc.
  methodName: string;
  variables: Record<string, VariableState>;
  thisRef: number | null;
}

export type HeapObject =
  | {
      type: 'object';
      className: string;
      fields: Record<string, VariableState>;
    }
  | {
      type: 'array';
      elementType: JavaType;
      values: VariableState[];
    }
  | {
      // Dynamic list (ArrayList, LinkedList, Stack, ArrayDeque, etc.)
      type: 'list';
      className: string;
      elements: VariableValue[];
    }
  | {
      // HashMap / LinkedHashMap
      type: 'map';
      className: string;
      entries: Array<{ key: VariableValue; value: VariableValue }>;
    }
  | {
      // HashSet / LinkedHashSet / TreeSet
      type: 'set';
      className: string;
      elements: VariableValue[];
    };

export interface ChangeHighlight {
  type: 'stack' | 'heap';
  frameId?: string;
  varName?: string;
  refId?: number;
  field?: string | number; // Field name for object, index for array
}

export interface TraceStep {
  stepId: number;
  line: number;
  stack: StackFrame[];
  heap: Record<number, HeapObject>;
  output: string;
  explanation: string;
  changedElement?: ChangeHighlight;
}

// AST Nodes
export interface ASTBase {
  line: number;
}

export type ASTNode =
  | ProgramNode
  | ClassDeclarationNode
  | FieldDeclarationNode
  | ConstructorDeclarationNode
  | MethodDeclarationNode
  | ParameterNode
  | StatementNode
  | ExpressionNode;

export interface ProgramNode extends ASTBase {
  type: 'Program';
  classes: ClassDeclarationNode[];
}

export interface ClassDeclarationNode extends ASTBase {
  type: 'ClassDeclaration';
  name: string;
  fields: FieldDeclarationNode[];
  constructors: ConstructorDeclarationNode[];
  methods: MethodDeclarationNode[];
}

export interface FieldDeclarationNode extends ASTBase {
  type: 'FieldDeclaration';
  dataType: JavaType;
  name: string;
  initializer?: ExpressionNode;
}

export interface ConstructorDeclarationNode extends ASTBase {
  type: 'ConstructorDeclaration';
  name: string;
  parameters: ParameterNode[];
  body: BlockStatementNode;
}

export interface MethodDeclarationNode extends ASTBase {
  type: 'MethodDeclaration';
  isStatic: boolean;
  returnType: JavaType;
  name: string;
  parameters: ParameterNode[];
  body: BlockStatementNode;
}

export interface ParameterNode extends ASTBase {
  type: 'Parameter';
  dataType: JavaType;
  name: string;
}

export type StatementNode =
  | BlockStatementNode
  | VariableDeclarationStatementNode
  | AssignmentStatementNode
  | IfStatementNode
  | WhileStatementNode
  | ForStatementNode
  | ForEachStatementNode
  | DoWhileStatementNode
  | SwitchStatementNode
  | ReturnStatementNode
  | BreakStatementNode
  | ContinueStatementNode
  | ExpressionStatementNode;

export interface BlockStatementNode extends ASTBase {
  type: 'BlockStatement';
  statements: StatementNode[];
}

export interface VariableDeclarationStatementNode extends ASTBase {
  type: 'VariableDeclarationStatement';
  dataType: JavaType;
  isArray: boolean;
  name: string;
  initializer?: ExpressionNode;
}

export interface AssignmentStatementNode extends ASTBase {
  type: 'AssignmentStatement';
  target: ExpressionNode; // IdentifierNode, FieldAccessNode, or ArrayAccessNode
  operator: '=' | '+=' | '-=' | '*=' | '/=' | '%=' | '&=' | '|=' | '^=' | '<<=' | '>>=' | '>>>=';
  value: ExpressionNode;
}

export interface IfStatementNode extends ASTBase {
  type: 'IfStatement';
  condition: ExpressionNode;
  thenBranch: StatementNode;
  elseBranch?: StatementNode;
}

export interface WhileStatementNode extends ASTBase {
  type: 'WhileStatement';
  condition: ExpressionNode;
  body: StatementNode;
}

export interface DoWhileStatementNode extends ASTBase {
  type: 'DoWhileStatement';
  condition: ExpressionNode;
  body: StatementNode;
}

export interface ForStatementNode extends ASTBase {
  type: 'ForStatement';
  initializer: VariableDeclarationStatementNode | AssignmentStatementNode | null;
  condition: ExpressionNode | null;
  update: ExpressionNode | null;
  body: StatementNode;
}

export interface ForEachStatementNode extends ASTBase {
  type: 'ForEachStatement';
  variableType: JavaType;
  variableName: string;
  iterable: ExpressionNode;
  body: StatementNode;
}

export interface SwitchCaseNode {
  /** null = default case */
  value: ExpressionNode | null;
  statements: StatementNode[];
}

export interface SwitchStatementNode extends ASTBase {
  type: 'SwitchStatement';
  expression: ExpressionNode;
  cases: SwitchCaseNode[];
}

export interface ReturnStatementNode extends ASTBase {
  type: 'ReturnStatement';
  expression?: ExpressionNode;
}

export interface BreakStatementNode extends ASTBase {
  type: 'BreakStatement';
}

export interface ContinueStatementNode extends ASTBase {
  type: 'ContinueStatement';
}

export interface ExpressionStatementNode extends ASTBase {
  type: 'ExpressionStatement';
  expression: ExpressionNode;
}

export type ExpressionNode =
  | LiteralNode
  | IdentifierNode
  | BinaryExpressionNode
  | UnaryExpressionNode
  | PostfixExpressionNode
  | TernaryExpressionNode
  | CastExpressionNode
  | InstanceofExpressionNode
  | MethodCallExpressionNode
  | NewObjectExpressionNode
  | NewArrayExpressionNode
  | FieldAccessExpressionNode
  | ArrayAccessExpressionNode
  | ThisExpressionNode
  | AssignmentStatementNode;  // assignments used as expressions

export interface LiteralNode extends ASTBase {
  type: 'Literal';
  valueType: JavaType;
  value: number | boolean | string | null;
}

export interface IdentifierNode extends ASTBase {
  type: 'Identifier';
  name: string;
}

export interface BinaryExpressionNode extends ASTBase {
  type: 'BinaryExpression';
  operator: '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>='
    | '&&' | '||' | '&' | '|' | '^' | '<<' | '>>' | '>>>';
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface UnaryExpressionNode extends ASTBase {
  type: 'UnaryExpression';
  operator: '-' | '!' | '~' | '++' | '--'; // prefix ++/--
  expression: ExpressionNode;
}

export interface PostfixExpressionNode extends ASTBase {
  type: 'PostfixExpression';
  operator: '++' | '--';
  expression: ExpressionNode;
}

export interface TernaryExpressionNode extends ASTBase {
  type: 'TernaryExpression';
  condition: ExpressionNode;
  thenExpr: ExpressionNode;
  elseExpr: ExpressionNode;
}

export interface CastExpressionNode extends ASTBase {
  type: 'CastExpression';
  castType: JavaType;
  expression: ExpressionNode;
}

export interface InstanceofExpressionNode extends ASTBase {
  type: 'InstanceofExpression';
  expression: ExpressionNode;
  checkType: string;
}

export interface MethodCallExpressionNode extends ASTBase {
  type: 'MethodCallExpression';
  object?: ExpressionNode; // e.g., obj in obj.method() or System.out
  methodName: string;
  arguments: ExpressionNode[];
}

export interface NewObjectExpressionNode extends ASTBase {
  type: 'NewObjectExpression';
  className: string;
  arguments: ExpressionNode[];
}

export interface NewArrayExpressionNode extends ASTBase {
  type: 'NewArrayExpression';
  elementType: JavaType;
  size?: ExpressionNode;
  initializers?: ExpressionNode[];
}

export interface FieldAccessExpressionNode extends ASTBase {
  type: 'FieldAccessExpression';
  object: ExpressionNode;
  fieldName: string;
}

export interface ArrayAccessExpressionNode extends ASTBase {
  type: 'ArrayAccessExpression';
  array: ExpressionNode;
  index: ExpressionNode;
}

export interface ThisExpressionNode extends ASTBase {
  type: 'ThisExpression';
}

import { Tokenizer, Parser } from './parser';
import type {
  ProgramNode,
  ClassDeclarationNode,
  MethodDeclarationNode,
  StatementNode,
  ExpressionNode,
  VariableState,
  StackFrame,
  HeapObject,
  TraceStep,
  JavaType,
  VariableValue,
  WhileStatementNode,
  ForStatementNode,
  ReturnStatementNode,
  BinaryExpressionNode,
  UnaryExpressionNode,
  PostfixExpressionNode,
  AssignmentStatementNode,
  BlockStatementNode,
  VariableDeclarationStatementNode,
  IfStatementNode
} from './types';

// Custom Runtime Error
export class JavaRuntimeError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(`Runtime Error (Line ${line}): ${message}`);
    this.name = 'JavaRuntimeError';
    this.line = line;
  }
}

class Interpreter {
  private program: ProgramNode;
  private classes: Record<string, ClassDeclarationNode> = {};
  
  // Runtime State
  private stack: StackFrame[] = [];
  private heap: Record<number, HeapObject> = {};
  private output = '';
  private nextRefId = 1;
  private nextFrameId = 0;
  
  // Trace output
  private trace: TraceStep[] = [];
  private stepCount = 0;
  private maxSteps = 1000;

  // User-supplied input values (one per parameter line)
  private inputValues: string[] = [];

  constructor(program: ProgramNode, inputValues: string[] = []) {
    this.program = program;
    this.inputValues = inputValues;
    for (const cls of program.classes) {
      this.classes[cls.name] = cls;
    }
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  private addStep(line: number, explanation: string, changedElement?: any) {
    if (this.stepCount >= this.maxSteps) {
      throw new JavaRuntimeError(
        'Execution limit exceeded (possible infinite loop or deep recursion). Playback capped at 1000 steps.',
        line
      );
    }

    this.trace.push({
      stepId: this.stepCount++,
      line,
      stack: this.deepClone(this.stack),
      heap: this.deepClone(this.heap),
      output: this.output,
      explanation,
      changedElement
    });
  }

  private getActiveFrame(): StackFrame {
    if (this.stack.length === 0) {
      throw new Error('Call stack is empty.');
    }
    return this.stack[this.stack.length - 1];
  }

  private allocateHeap(obj: HeapObject): number {
    const refId = this.nextRefId++;
    this.heap[refId] = obj;
    return refId;
  }

  // Lookup variable value from stack or fields of 'this'
  private lookupVariable(name: string, line: number): VariableState {
    const frame = this.getActiveFrame();
    
    // Check local variables
    if (frame.variables[name] !== undefined) {
      return frame.variables[name];
    }
    
    // Check fields of 'this'
    if (frame.thisRef !== null) {
      const thisObj = this.heap[frame.thisRef];
      if (thisObj && thisObj.type === 'object') {
        const field = thisObj.fields[name];
        if (field !== undefined) {
          return field;
        }
      }
    }
    
    throw new JavaRuntimeError(`Variable or field '${name}' is not defined in this scope.`, line);
  }

  // Set variable value in stack or fields of 'this'
  private setVariable(name: string, value: VariableValue, type: JavaType, _line: number): any {
    const frame = this.getActiveFrame();
    
    // Check local variables
    if (frame.variables[name] !== undefined) {
      frame.variables[name].value = value;
      return { type: 'stack', frameId: frame.id, varName: name };
    }
    
    // Check fields of 'this'
    if (frame.thisRef !== null) {
      const thisObj = this.heap[frame.thisRef];
      if (thisObj && thisObj.type === 'object') {
        if (thisObj.fields[name] !== undefined) {
          thisObj.fields[name].value = value;
          return { type: 'heap', refId: frame.thisRef, field: name };
        }
      }
    }

    // If not found, declare it as local variable (fallback, although parser should handle declaration)
    frame.variables[name] = { name, type, value };
    return { type: 'stack', frameId: frame.id, varName: name };
  }

  getTrace(): TraceStep[] {
    return this.trace;
  }

  // Build a default VariableValue for a given type
  private defaultValue(dataType: string): VariableValue {
    if (dataType === 'int' || dataType === 'double') return { type: 'primitive', value: 0 };
    if (dataType === 'boolean') return { type: 'primitive', value: false };
    if (dataType === 'char') return { type: 'primitive', value: '\0' };
    return { type: 'reference', refId: null };
  }

  // Run interpreter
  run(): TraceStep[] {
    // 1. Locate the main method
    let mainMethod: MethodDeclarationNode | null = null;
    let mainClassName = '';

    for (const cls of this.program.classes) {
      for (const m of cls.methods) {
        if (m.name === 'main') {
          mainMethod = m;
          mainClassName = cls.name;
          break;
        }
      }
      if (mainMethod) break;
    }

    // 2. If no main found, auto-select the first available method and run it
    if (!mainMethod) {
      let targetMethod: MethodDeclarationNode | null = null;
      let targetClassName = '';

      // Prefer static methods, then any method
      for (const cls of this.program.classes) {
        for (const m of cls.methods) {
          if (!targetMethod) { targetMethod = m; targetClassName = cls.name; }
          // prefer static-like (no 'this' references in name is our heuristic)
        }
        if (targetMethod) break;
      }

      if (!targetMethod) {
        throw new JavaRuntimeError('No executable method found in the provided code.', 1);
      }

      // Build arguments for parameters using user-supplied input values
      const frameVariables: Record<string, VariableState> = {};
      for (let i = 0; i < targetMethod.parameters.length; i++) {
        const param = targetMethod.parameters[i];
        const rawInput = (this.inputValues[i] || '').trim();
        let val: VariableValue;

        if (param.dataType === 'reference') {
          // Try to parse as comma-separated array
          if (rawInput !== '') {
            const items = rawInput.split(',').map(s => s.trim()).filter(s => s !== '');
            const values: VariableState[] = items.map((s, idx) => {
              const n = Number(s);
              const v: VariableValue = isNaN(n)
                ? (s === 'true' || s === 'false' ? { type: 'primitive', value: s === 'true' } : { type: 'primitive', value: s })
                : { type: 'primitive', value: n };
              return { name: `[${idx}]`, type: 'int', value: v };
            });
            const refId = this.allocateHeap({ type: 'array', elementType: 'int', values });
            val = { type: 'reference', refId };
          } else {
            const refId = this.allocateHeap({ type: 'array', elementType: 'int', values: [] });
            val = { type: 'reference', refId };
          }
        } else if (param.dataType === 'boolean') {
          val = { type: 'primitive', value: rawInput === 'true' };
        } else if (param.dataType === 'int' || param.dataType === 'double') {
          val = { type: 'primitive', value: rawInput !== '' ? Number(rawInput) : 0 };
        } else if (param.dataType === 'String') {
          val = { type: 'primitive', value: rawInput };
        } else {
          val = this.defaultValue(param.dataType);
        }
        frameVariables[param.name] = { name: param.name, type: param.dataType, value: val };
      }

      const syntheticFrame: StackFrame = {
        id: `frame-${this.nextFrameId++}`,
        methodName: `${targetClassName}.${targetMethod.name}`,
        variables: frameVariables,
        thisRef: null
      };
      this.stack.push(syntheticFrame);

      const paramDesc = targetMethod.parameters.length > 0
        ? ` with default args (${targetMethod.parameters.map(p => `${p.dataType} ${p.name} = ${p.dataType === 'int' || p.dataType === 'double' ? '0' : p.dataType === 'boolean' ? 'false' : 'ref@empty'}`).join(', ')})`
        : '';
      this.addStep(targetMethod.line, `Start ${targetMethod.name}()`);

      try {
        this.executeBlock(targetMethod.body);
        if (this.stack.length > 0) this.stack.pop();
        this.addStep(targetMethod.line + 1, `End ${targetMethod.name}()`);
      } catch (e: any) {
        if (e instanceof ReturnException) {
          if (this.stack.length > 0) this.stack.pop();
          const displayVal = e.value.type === 'primitive' ? String(e.value.value) : `ref@${e.value.refId}`;
          this.addStep(targetMethod.line, `Returned ${displayVal}`);
        } else {
          const errLine = e instanceof JavaRuntimeError ? e.line : targetMethod.line;
          const errMsg = e instanceof Error ? e.message : String(e);
          this.addStep(errLine, `Crashed: ${errMsg}`);
          throw e;
        }
      }

      return this.trace;
    }

    // 3. Set up initial stack frame for main
    const initialFrame: StackFrame = {
      id: `frame-${this.nextFrameId++}`,
      methodName: `${mainClassName}.main`,
      variables: {
        args: {
          name: 'args',
          type: 'reference',
          value: { type: 'reference', refId: null }
        }
      },
      thisRef: null
    };
    this.stack.push(initialFrame);
    
    this.addStep(mainMethod.line, 'Start');

    try {
      this.executeBlock(mainMethod.body);
      
      if (this.stack.length > 0) {
        this.stack.pop();
      }
      this.addStep(mainMethod.line + 1, 'Finished');
    } catch (e: any) {
      const errLine = e instanceof JavaRuntimeError ? e.line : mainMethod.line;
      const errMsg = e instanceof Error ? e.message : String(e);
      this.addStep(errLine, `Crashed: ${errMsg}`);
      throw e;
    }

    return this.trace;
  }

  // Statements
  private executeStatement(stmt: StatementNode) {
    switch (stmt.type) {
      case 'BlockStatement':
        this.executeBlock(stmt);
        break;
      case 'VariableDeclarationStatement':
        this.executeVariableDeclaration(stmt);
        break;
      case 'AssignmentStatement':
        this.evaluateAssignment(stmt);
        break;
      case 'IfStatement':
        this.executeIf(stmt);
        break;
      case 'WhileStatement':
        this.executeWhile(stmt);
        break;
      case 'ForStatement':
        this.executeFor(stmt);
        break;
      case 'ReturnStatement':
        this.executeReturn(stmt);
        break;
      case 'ExpressionStatement':
        this.evaluateExpression(stmt.expression);
        break;
      default:
        throw new JavaRuntimeError(`Unsupported statement type: ${(stmt as any).type}`, (stmt as any).line);
    }
  }

  private executeBlock(block: BlockStatementNode) {
    for (const stmt of block.statements) {
      this.executeStatement(stmt);
    }
  }

  private executeVariableDeclaration(stmt: VariableDeclarationStatementNode) {
    const frame = this.getActiveFrame();
    
    // Evaluate initializer if present
    let val: VariableValue = { type: 'primitive', value: null };
    if (stmt.initializer) {
      val = this.evaluateExpression(stmt.initializer);
    } else {
      // Default values
      if (stmt.dataType === 'int' || stmt.dataType === 'double') {
        val = { type: 'primitive', value: 0 };
      } else if (stmt.dataType === 'boolean') {
        val = { type: 'primitive', value: false };
      } else if (stmt.dataType === 'char') {
        val = { type: 'primitive', value: '\0' };
      } else {
        val = { type: 'reference', refId: null };
      }
    }

    frame.variables[stmt.name] = {
      name: stmt.name,
      type: stmt.dataType,
      value: val
    };

    const displayVal = val.type === 'primitive' ? String(val.value) : `ref@${val.refId}`;
    let explanation = `Declare ${stmt.name} = ${displayVal}`;
    if (stmt.initializer && this.hasMathOperations(stmt.initializer)) {
      const initStr = this.stringifyExpression(stmt.initializer);
      const valStr = this.stringifyExpressionWithValues(stmt.initializer);
      explanation += ` (via ${initStr} = ${valStr})`;
    }
    this.addStep(
      stmt.line,
      explanation,
      { type: 'stack', frameId: frame.id, varName: stmt.name }
    );
  }

  private evaluateAssignment(stmt: AssignmentStatementNode): VariableValue {
    const rightVal = this.evaluateExpression(stmt.value);
    
    // Target can be an Identifier, FieldAccess, or ArrayAccess
    const target = stmt.target;
    let changeHighlight: any;
    let finalVal = rightVal;

    if (target.type === 'Identifier') {
      const current = this.lookupVariable(target.name, stmt.line);
      const prevValStr = current.value.type === 'primitive' ? String(current.value.value) : (current.value.refId === null ? 'null' : `ref@${current.value.refId}`);

      if (stmt.operator !== '=') {
        finalVal = this.applyCompoundOperator(current.value, rightVal, stmt.operator, current.type, stmt.line);
      }

      changeHighlight = this.setVariable(target.name, finalVal, current.type, stmt.line);
      const displayVal = finalVal.type === 'primitive' ? String(finalVal.value) : `ref@${finalVal.refId}`;
      let explanation = `Set ${target.name} = ${displayVal}`;
      if (stmt.operator !== '=') {
        const opChar = stmt.operator.slice(0, -1);
        const initStr = this.stringifyExpression(stmt.value);
        const valStr = this.stringifyExpressionWithValues(stmt.value);
        explanation += ` (via ${target.name} ${opChar} ${initStr} = ${prevValStr} ${opChar} ${valStr})`;
      } else if (this.hasMathOperations(stmt.value)) {
        const initStr = this.stringifyExpression(stmt.value);
        const valStr = this.stringifyExpressionWithValues(stmt.value);
        explanation += ` (via ${initStr} = ${valStr})`;
      }
      this.addStep(stmt.line, explanation, changeHighlight);

    } else if (target.type === 'FieldAccessExpression') {
      const objRef = this.evaluateExpression(target.object);
      if (objRef.type !== 'reference' || objRef.refId === null) {
        throw new JavaRuntimeError('NullPointerException: Attempted to access field on a null reference.', stmt.line);
      }
      
      const heapObj = this.heap[objRef.refId];
      if (!heapObj || heapObj.type !== 'object') {
        throw new JavaRuntimeError('RuntimeError: Target of field access is not a valid object.', stmt.line);
      }

      const fieldState = heapObj.fields[target.fieldName];
      if (fieldState === undefined) {
        throw new JavaRuntimeError(`NoSuchFieldException: Class ${heapObj.className} has no field '${target.fieldName}'.`, stmt.line);
      }

      const prevValStr = fieldState.value.type === 'primitive' ? String(fieldState.value.value) : (fieldState.value.refId === null ? 'null' : `ref@${fieldState.value.refId}`);

      if (stmt.operator !== '=') {
        finalVal = this.applyCompoundOperator(fieldState.value, rightVal, stmt.operator, fieldState.type, stmt.line);
      }

      fieldState.value = finalVal;
      changeHighlight = { type: 'heap', refId: objRef.refId, field: target.fieldName };
      const displayVal = finalVal.type === 'primitive' ? String(finalVal.value) : `ref@${finalVal.refId}`;
      let explanation = `Set field ${target.fieldName} = ${displayVal}`;
      if (stmt.operator !== '=') {
        const opChar = stmt.operator.slice(0, -1);
        const initStr = this.stringifyExpression(stmt.value);
        const valStr = this.stringifyExpressionWithValues(stmt.value);
        explanation += ` (via ${target.fieldName} ${opChar} ${initStr} = ${prevValStr} ${opChar} ${valStr})`;
      } else if (this.hasMathOperations(stmt.value)) {
        const initStr = this.stringifyExpression(stmt.value);
        const valStr = this.stringifyExpressionWithValues(stmt.value);
        explanation += ` (via ${initStr} = ${valStr})`;
      }
      this.addStep(stmt.line, explanation, changeHighlight);

    } else if (target.type === 'ArrayAccessExpression') {
      const arrRef = this.evaluateExpression(target.array);
      if (arrRef.type !== 'reference' || arrRef.refId === null) {
        throw new JavaRuntimeError('NullPointerException: Attempted to access array on a null reference.', stmt.line);
      }

      const heapObj = this.heap[arrRef.refId];
      if (!heapObj || heapObj.type !== 'array') {
        throw new JavaRuntimeError('RuntimeError: Target of array access is not an array.', stmt.line);
      }

      const indexVal = this.evaluateExpression(target.index);
      if (indexVal.type !== 'primitive' || typeof indexVal.value !== 'number') {
        throw new JavaRuntimeError('RuntimeError: Array index must be an integer.', stmt.line);
      }

      const idx = Math.floor(indexVal.value);
      if (idx < 0 || idx >= heapObj.values.length) {
        throw new JavaRuntimeError(`ArrayIndexOutOfBoundsException: Index ${idx} out of bounds for length ${heapObj.values.length}.`, stmt.line);
      }

      const elementState = heapObj.values[idx];
      const prevValStr = elementState.value.type === 'primitive' ? String(elementState.value.value) : (elementState.value.refId === null ? 'null' : `ref@${elementState.value.refId}`);

      if (stmt.operator !== '=') {
        finalVal = this.applyCompoundOperator(elementState.value, rightVal, stmt.operator, heapObj.elementType, stmt.line);
      }

      elementState.value = finalVal;
      changeHighlight = { type: 'heap', refId: arrRef.refId, field: idx };
      const displayVal = finalVal.type === 'primitive' ? String(finalVal.value) : `ref@${finalVal.refId}`;
      const targetName = this.stringifyExpression(target);
      let arrayExplanation = `Set ${targetName} = ${displayVal}`;
      if (stmt.operator !== '=') {
        const opChar = stmt.operator.slice(0, -1);
        const initStr = this.stringifyExpression(stmt.value);
        const valStr = this.stringifyExpressionWithValues(stmt.value);
        arrayExplanation += ` (via ${targetName} ${opChar} ${initStr} = ${prevValStr} ${opChar} ${valStr})`;
      } else if (this.hasMathOperations(stmt.value)) {
        const initStr = this.stringifyExpression(stmt.value);
        const valStr = this.stringifyExpressionWithValues(stmt.value);
        arrayExplanation += ` (via ${initStr} = ${valStr})`;
      }
      this.addStep(stmt.line, arrayExplanation, changeHighlight);

    } else {
      throw new JavaRuntimeError('RuntimeError: Invalid assignment target.', stmt.line);
    }
    return finalVal;
  }

  private applyCompoundOperator(current: VariableValue, right: VariableValue, op: string, targetType: JavaType, line: number): VariableValue {
    if (current.type !== 'primitive' || right.type !== 'primitive') {
      throw new JavaRuntimeError('RuntimeError: Compound operator can only be applied to primitive types.', line);
    }

    const cur = current.value;
    const r = right.value;
    if (typeof cur !== 'number' || typeof r !== 'number') {
      throw new JavaRuntimeError('RuntimeError: Arithmetic compound assignment requires numeric values.', line);
    }

    let result = 0;
    switch (op) {
      case '+=': result = cur + r; break;
      case '-=': result = cur - r; break;
      case '*=': result = cur * r; break;
      case '/=':
        if (r === 0) throw new JavaRuntimeError('ArithmeticException: / by zero', line);
        result = cur / r;
        if (targetType === 'int') {
          result = Math.trunc(result);
        }
        break;
    }
    return { type: 'primitive', value: result };
  }

  private executeIf(stmt: IfStatementNode) {
    const condStr = this.stringifyExpression(stmt.condition);
    const valStr = this.stringifyExpressionWithValues(stmt.condition);
    const cond = this.evaluateExpression(stmt.condition);
    if (cond.type !== 'primitive' || typeof cond.value !== 'boolean') {
      throw new JavaRuntimeError('RuntimeError: If condition must evaluate to a boolean.', stmt.line);
    }
    const outcome = cond.value ? 'true' : 'false';

    this.addStep(stmt.line, `Check condition: ${condStr} (${valStr}) -> ${outcome}`);

    if (cond.value) {
      this.addStep(stmt.line, 'Condition is true -> entering if block');
      this.executeStatement(stmt.thenBranch);
    } else if (stmt.elseBranch) {
      this.addStep(stmt.line, 'Condition is false -> entering else block');
      this.executeStatement(stmt.elseBranch);
    } else {
      this.addStep(stmt.line, 'Condition is false -> skipping if block');
    }
  }

  private executeWhile(stmt: WhileStatementNode) {
    let iteration = 1;
    while (true) {
      const condStr = this.stringifyExpression(stmt.condition);
      const valStr = this.stringifyExpressionWithValues(stmt.condition);
      const cond = this.evaluateExpression(stmt.condition);
      if (cond.type !== 'primitive' || typeof cond.value !== 'boolean') {
        throw new JavaRuntimeError('RuntimeError: Loop condition must evaluate to a boolean.', stmt.line);
      }
      const outcome = cond.value ? 'true' : 'false';

      this.addStep(stmt.line, `Check loop condition: ${condStr} (${valStr}) -> ${outcome}`);

      if (!cond.value) {
        this.addStep(stmt.line, 'Loop condition is false -> exit loop');
        break;
      }

      this.addStep(stmt.line, 'Loop condition is true -> run loop body');
      this.executeStatement(stmt.body);
      iteration++;
    }
  }

  private executeFor(stmt: ForStatementNode) {
    if (stmt.initializer) {
      if (stmt.initializer.type === 'VariableDeclarationStatement') {
        this.executeVariableDeclaration(stmt.initializer);
      } else {
        this.evaluateAssignment(stmt.initializer);
      }
    }

    let iteration = 1;
    while (true) {
      if (stmt.condition) {
        const condStr = this.stringifyExpression(stmt.condition);
        const valStr = this.stringifyExpressionWithValues(stmt.condition);
        const cond = this.evaluateExpression(stmt.condition);
        if (cond.type !== 'primitive' || typeof cond.value !== 'boolean') {
          throw new JavaRuntimeError('RuntimeError: Loop condition must evaluate to a boolean.', stmt.line);
        }
        const outcome = cond.value ? 'true' : 'false';

        this.addStep(stmt.line, `Check loop condition: ${condStr} (${valStr}) -> ${outcome}`);

        if (!cond.value) {
          this.addStep(stmt.line, 'Loop condition is false -> exit loop');
          break;
        }
        this.addStep(stmt.line, 'Loop condition is true -> run loop body');
      } else {
        this.addStep(stmt.line, 'Run loop');
      }

      // Execute body
      this.executeStatement(stmt.body);

      // Execute update
      if (stmt.update) {
        this.addStep(stmt.update.line, 'Update loop var');
        this.evaluateExpression(stmt.update);
      }

      iteration++;
    }
  }

  private executeReturn(stmt: ReturnStatementNode) {
    let retVal: VariableValue = { type: 'primitive', value: null };
    if (stmt.expression) {
      retVal = this.evaluateExpression(stmt.expression);
    }
    
    // In our interpreter, we can throw a special "ReturnException" containing the return value,
    // which we catch in the method caller! This makes call execution return control immediately.
    throw new ReturnException(retVal, stmt.line);
  }

  private isDoubleExpression(expr: ExpressionNode): boolean {
    if (!expr) return false;
    switch (expr.type) {
      case 'Literal':
        return (expr as any).valueType === 'double';
      case 'Identifier': {
        try {
          const v = this.lookupVariable((expr as any).name, expr.line);
          return v.type === 'double';
        } catch {
          return false;
        }
      }
      case 'BinaryExpression': {
        const bin = expr as BinaryExpressionNode;
        return this.isDoubleExpression(bin.left) || this.isDoubleExpression(bin.right);
      }
      case 'UnaryExpression': {
        const un = expr as UnaryExpressionNode;
        return this.isDoubleExpression(un.expression);
      }
      case 'PostfixExpression': {
        const post = expr as PostfixExpressionNode;
        return this.isDoubleExpression(post.expression);
      }
      case 'ArrayAccessExpression': {
        try {
          const arrRef = this.evaluateExpression((expr as any).array);
          if (arrRef.type === 'reference' && arrRef.refId !== null) {
            const arr = this.heap[arrRef.refId];
            if (arr && arr.type === 'array') {
              return arr.elementType === 'double';
            }
          }
        } catch {}
        return false;
      }
      default:
        return false;
    }
  }

  // Expressions
  private evaluateExpression(expr: ExpressionNode): VariableValue {
    switch (expr.type as string) {
      case 'Literal':
        return { type: (expr as any).valueType === 'reference' ? 'reference' : 'primitive', value: (expr as any).value } as any;
      case 'Identifier':
        return this.lookupVariable((expr as any).name, expr.line).value;
      case 'BinaryExpression':
        return this.evaluateBinary(expr as any);
      case 'UnaryExpression':
        return this.evaluateUnary(expr as any);
      case 'PostfixExpression':
        return this.evaluatePostfix(expr as any);
      case 'MethodCallExpression':
        return this.evaluateMethodCall(expr as any);
      case 'NewObjectExpression':
        return this.evaluateNewObject(expr as any);
      case 'NewArrayExpression':
        return this.evaluateNewArray(expr as any);
      case 'FieldAccessExpression':
        return this.evaluateFieldAccess(expr as any);
      case 'ArrayAccessExpression':
        return this.evaluateArrayAccess(expr as any);
      case 'ThisExpression': {
        const frame = this.getActiveFrame();
        if (frame.thisRef === null) {
          throw new JavaRuntimeError("RuntimeError: Cannot reference 'this' in a static context.", expr.line);
        }
        return { type: 'reference', refId: frame.thisRef };
      }
      case 'AssignmentStatement':
        return this.evaluateAssignment(expr as any);
      default:
        throw new JavaRuntimeError(`Unsupported expression type: ${(expr as any).type}`, (expr as any).line);
    }
  }

  private evaluateBinary(expr: BinaryExpressionNode): VariableValue {
    const left = this.evaluateExpression(expr.left);
    const right = this.evaluateExpression(expr.right);

    const leftVal = left.type === 'primitive' ? left.value : null;
    const rightVal = right.type === 'primitive' ? right.value : null;

    // If string concatenation
    if (expr.operator === '+' && (leftVal === 'String' || rightVal === 'String' || typeof leftVal === 'string' || typeof rightVal === 'string')) {
      const getStr = (v: VariableValue) => {
        if (v.type === 'reference') return `ref@${v.refId}`;
        return String((v as any).value);
      };
      return { type: 'primitive', value: getStr(left) + getStr(right) };
    }

    if (left.type !== 'primitive' || right.type !== 'primitive') {
      // Reference equality comparison is allowed
      if (expr.operator === '==') {
        const lRef = left.type === 'reference' ? left.refId : null;
        const rRef = right.type === 'reference' ? right.refId : null;
        return { type: 'primitive', value: lRef === rRef };
      }
      if (expr.operator === '!=') {
        const lRef = left.type === 'reference' ? left.refId : null;
        const rRef = right.type === 'reference' ? right.refId : null;
        return { type: 'primitive', value: lRef !== rRef };
      }
      throw new JavaRuntimeError(`RuntimeError: Operator '${expr.operator}' cannot be applied to reference types.`, expr.line);
    }

    const l = (left as any).value;
    const r = (right as any).value;

    switch (expr.operator) {
      case '+': return { type: 'primitive', value: (l as any) + (r as any) };
      case '-': return { type: 'primitive', value: (l as any) - (r as any) };
      case '*': return { type: 'primitive', value: (l as any) * (r as any) };
      case '/':
        if (r === 0) throw new JavaRuntimeError('ArithmeticException: / by zero', expr.line);
        if (this.isDoubleExpression(expr.left) || this.isDoubleExpression(expr.right)) {
          return { type: 'primitive', value: (l as any) / (r as any) };
        }
        return { type: 'primitive', value: Math.trunc((l as any) / (r as any)) };
      case '%': return { type: 'primitive', value: (l as any) % (r as any) };
      case '==': return { type: 'primitive', value: l === r };
      case '!=': return { type: 'primitive', value: l !== r };
      case '<': return { type: 'primitive', value: (l as any) < (r as any) };
      case '<=': return { type: 'primitive', value: (l as any) <= (r as any) };
      case '>': return { type: 'primitive', value: (l as any) > (r as any) };
      case '>=': return { type: 'primitive', value: (l as any) >= (r as any) };
      case '&&': return { type: 'primitive', value: Boolean(l) && Boolean(r) };
      case '||': return { type: 'primitive', value: Boolean(l) || Boolean(r) };
      default:
        throw new JavaRuntimeError(`Unsupported binary operator '${expr.operator}'`, expr.line);
    }
  }

  private evaluateUnary(expr: UnaryExpressionNode): VariableValue {
    if (expr.operator === '++' || expr.operator === '--') {
      // Prefix increment / decrement
      // Requires target variable
      const target = expr.expression;
      if (target.type !== 'Identifier') {
        throw new JavaRuntimeError('RuntimeError: Prefix increment requires variable target.', expr.line);
      }
      const curState = this.lookupVariable(target.name, expr.line);
      if (curState.value.type !== 'primitive' || typeof curState.value.value !== 'number') {
        throw new JavaRuntimeError('RuntimeError: Arithmetic increment applies to numeric types only.', expr.line);
      }
      
      const oldVal = curState.value.value;
      const newVal = oldVal + (expr.operator === '++' ? 1 : -1);
      const valState: VariableValue = { type: 'primitive', value: newVal };
      const changeHighlight = this.setVariable(target.name, valState, curState.type, expr.line);
      const opText = expr.operator === '++' ? '+' : '-';
      const explanation = `Set ${target.name} = ${newVal} (via ${target.name} ${opText} 1 = ${oldVal} ${opText} 1)`;
      this.addStep(expr.line, explanation, changeHighlight);
      return valState;
    }

    const val = this.evaluateExpression(expr.expression);
    if (val.type !== 'primitive') {
      throw new JavaRuntimeError(`RuntimeError: Operator '${expr.operator}' cannot be applied to references.`, expr.line);
    }

    if (expr.operator === '!') {
      return { type: 'primitive', value: !val.value };
    }
    if (expr.operator === '-') {
      return { type: 'primitive', value: -(val.value as any) };
    }
    throw new JavaRuntimeError(`RuntimeError: Unsupported unary operator '${expr.operator}'`, expr.line);
  }

  private evaluatePostfix(expr: PostfixExpressionNode): VariableValue {
    const target = expr.expression;
    if (target.type !== 'Identifier') {
      throw new JavaRuntimeError('RuntimeError: Postfix increment requires variable target.', expr.line);
    }
    
    const curState = this.lookupVariable(target.name, expr.line);
    if (curState.value.type !== 'primitive' || typeof curState.value.value !== 'number') {
      throw new JavaRuntimeError('RuntimeError: Arithmetic postfix applies to numeric types only.', expr.line);
    }
    
    const oldVal = curState.value.value;
    const newVal = oldVal + (expr.operator === '++' ? 1 : -1);
    const valState: VariableValue = { type: 'primitive', value: newVal };
    const changeHighlight = this.setVariable(target.name, valState, curState.type, expr.line);
    const opText = expr.operator === '++' ? '+' : '-';
    const explanation = `Set ${target.name} = ${newVal} (via ${target.name} ${opText} 1 = ${oldVal} ${opText} 1)`;
    this.addStep(expr.line, explanation, changeHighlight);
    return { type: 'primitive', value: oldVal };
  }

  private evaluateFieldAccess(expr: any): VariableValue {
    // --- Static constants: Integer.MAX_VALUE, Integer.MIN_VALUE, Double.MAX_VALUE, etc. ---
    if (expr.object && expr.object.type === 'Identifier') {
      const className = expr.object.name;
      const field = expr.fieldName;
      if (className === 'Integer') {
        if (field === 'MAX_VALUE') return { type: 'primitive', value: 2147483647 };
        if (field === 'MIN_VALUE') return { type: 'primitive', value: -2147483648 };
      }
      if (className === 'Double') {
        if (field === 'MAX_VALUE') return { type: 'primitive', value: Number.MAX_VALUE };
        if (field === 'MIN_VALUE') return { type: 'primitive', value: Number.MIN_VALUE };
        if (field === 'POSITIVE_INFINITY') return { type: 'primitive', value: Infinity };
        if (field === 'NEGATIVE_INFINITY') return { type: 'primitive', value: -Infinity };
      }
      if (className === 'Long') {
        if (field === 'MAX_VALUE') return { type: 'primitive', value: Number.MAX_SAFE_INTEGER };
        if (field === 'MIN_VALUE') return { type: 'primitive', value: Number.MIN_SAFE_INTEGER };
      }
    }

    const objRef = this.evaluateExpression(expr.object);
    if (objRef.type !== 'reference' || objRef.refId === null) {
      throw new JavaRuntimeError('NullPointerException: Attempted to access field on a null reference.', expr.line);
    }

    const heapObj = this.heap[objRef.refId];
    if (!heapObj) {
      throw new JavaRuntimeError('RuntimeError: Target of field access is not a valid object.', expr.line);
    }

    // --- array.length ---
    if (heapObj.type === 'array') {
      if (expr.fieldName === 'length') {
        return { type: 'primitive', value: heapObj.values.length };
      }
      throw new JavaRuntimeError(`RuntimeError: Arrays have no field '${expr.fieldName}' (did you mean .length?).`, expr.line);
    }

    if (heapObj.type !== 'object') {
      throw new JavaRuntimeError('RuntimeError: Target of field access is not a valid object.', expr.line);
    }

    const fieldState = heapObj.fields[expr.fieldName];
    if (fieldState === undefined) {
      throw new JavaRuntimeError(`NoSuchFieldException: Class ${heapObj.className} has no field '${expr.fieldName}'.`, expr.line);
    }

    return fieldState.value;
  }

  private evaluateArrayAccess(expr: any): VariableValue {
    const arrRef = this.evaluateExpression(expr.array);
    if (arrRef.type !== 'reference' || arrRef.refId === null) {
      throw new JavaRuntimeError('NullPointerException: Attempted to access array on a null reference.', expr.line);
    }

    const heapObj = this.heap[arrRef.refId];
    if (!heapObj || heapObj.type !== 'array') {
      throw new JavaRuntimeError('RuntimeError: Target of array access is not an array.', expr.line);
    }

    const indexVal = this.evaluateExpression(expr.index);
    if (indexVal.type !== 'primitive' || typeof indexVal.value !== 'number') {
      throw new JavaRuntimeError('RuntimeError: Array index must be an integer.', expr.line);
    }

    const idx = Math.floor(indexVal.value);
    if (idx < 0 || idx >= heapObj.values.length) {
      throw new JavaRuntimeError(`ArrayIndexOutOfBoundsException: Index ${idx} out of bounds for length ${heapObj.values.length}.`, expr.line);
    }

    return heapObj.values[idx].value;
  }

  private evaluateNewObject(expr: any): VariableValue {
    // 1. Locate class
    const cls = this.classes[expr.className];
    if (!cls) {
      throw new JavaRuntimeError(`ClassNotFoundException: Class ${expr.className} is not defined.`, expr.line);
    }

    // 2. Evaluate arguments
    const args = expr.arguments.map((arg: any) => this.evaluateExpression(arg));

    // 3. Allocate object on heap
    const fields: Record<string, VariableState> = {};
    for (const f of cls.fields) {
      // Default values
      let defVal: VariableValue = { type: 'primitive', value: null };
      if (f.dataType === 'int' || f.dataType === 'double') defVal = { type: 'primitive', value: 0 };
      else if (f.dataType === 'boolean') defVal = { type: 'primitive', value: false };
      else if (f.dataType === 'char') defVal = { type: 'primitive', value: '\0' };
      else defVal = { type: 'reference', refId: null };

      // Initialize with field's initializer if exists (simplified, evaluated in constructor context or statically)
      fields[f.name] = {
        name: f.name,
        type: f.dataType,
        value: defVal
      };
    }

    const refId = this.allocateHeap({
      type: 'object',
      className: expr.className,
      fields
    });

    this.addStep(expr.line, `New object ${expr.className} (ref@${refId})`);

    // Evaluate field initializers in the context of this new object
    for (const f of cls.fields) {
      if (f.initializer) {
        // Push temporary frame representing object field setup
        const setupFrame: StackFrame = {
          id: `frame-${this.nextFrameId++}`,
          methodName: `<init>`,
          variables: {},
          thisRef: refId
        };
        this.stack.push(setupFrame);
        const fieldVal = this.evaluateExpression(f.initializer);
        this.stack.pop();
        
        fields[f.name].value = fieldVal;
      }
    }

    // 4. Run constructor if matches arguments
    const constructor = cls.constructors.find((c) => c.parameters.length === args.length);
    if (constructor) {
      const frameVariables: Record<string, VariableState> = {};
      for (let i = 0; i < constructor.parameters.length; i++) {
        const param = constructor.parameters[i];
        frameVariables[param.name] = {
          name: param.name,
          type: param.dataType,
          value: args[i]
        };
      }

      const frame: StackFrame = {
        id: `frame-${this.nextFrameId++}`,
        methodName: `${expr.className} (constructor)`,
        variables: frameVariables,
        thisRef: refId
      };
      this.stack.push(frame);
      this.addStep(constructor.line, `Run constructor`);

      try {
        this.executeBlock(constructor.body);
        this.stack.pop();
        this.addStep(expr.line, 'Constructor done');
      } catch (e) {
        if (e instanceof ReturnException) {
          this.stack.pop();
          this.addStep(expr.line, 'Constructor done');
        } else {
          throw e;
        }
      }
    } else if (args.length > 0) {
      throw new JavaRuntimeError(`NoSuchMethodException: No constructor found for ${expr.className} matching ${args.length} parameters.`, expr.line);
    }

    return { type: 'reference', refId };
  }

  private evaluateNewArray(expr: any): VariableValue {
    let length = 0;
    
    if (expr.size) {
      const szVal = this.evaluateExpression(expr.size);
      if (szVal.type !== 'primitive' || typeof szVal.value !== 'number') {
        throw new JavaRuntimeError('RuntimeError: Array size must be an integer.', expr.line);
      }
      length = Math.floor(szVal.value);
    } else if (expr.initializers) {
      length = expr.initializers.length;
    }

    if (length < 0) {
      throw new JavaRuntimeError('NegativeArraySizeException', expr.line);
    }

    // Initialize elements
    const values: VariableState[] = [];
    for (let i = 0; i < length; i++) {
      let elementVal: VariableValue = { type: 'primitive', value: null };
      if (expr.initializers) {
        elementVal = this.evaluateExpression(expr.initializers[i]);
      } else {
        // Default values
        if (expr.elementType === 'int' || expr.elementType === 'double') {
          elementVal = { type: 'primitive', value: 0 };
        } else if (expr.elementType === 'boolean') {
          elementVal = { type: 'primitive', value: false };
        } else if (expr.elementType === 'char') {
          elementVal = { type: 'primitive', value: '\0' };
        } else {
          elementVal = { type: 'reference', refId: null };
        }
      }

      values.push({
        name: `[${i}]`,
        type: expr.elementType,
        value: elementVal
      });
    }

    const refId = this.allocateHeap({
      type: 'array',
      elementType: expr.elementType,
      values
    });

    this.addStep(expr.line, `New array length ${length} (ref@${refId})`);
    return { type: 'reference', refId };
  }

  private evaluateMethodCall(expr: any): VariableValue {
    // 1. Console print (System.out.print / println)
    const isStdout = this.isStdoutCall(expr);
    if (isStdout) {
      const args = expr.arguments.map((arg: any) => this.evaluateExpression(arg));
      const textToPrint = args.map((a: any) => {
        if (a.type === 'reference') {
          if (a.refId === null) return 'null';
          const ho = this.heap[a.refId];
          if (ho && ho.type === 'array') return `[${ho.values.map((v: any) => v.value.type === 'primitive' ? v.value.value : 'ref').join(', ')}]`;
          return `ref@${a.refId}`;
        }
        return String(a.value);
      }).join('');

      this.output += textToPrint;
      if (expr.methodName === 'println') {
        this.output += '\n';
      }

      const cleanPrint = textToPrint.replace(/\n/g, '\\n');
      this.addStep(expr.line, `Print "${cleanPrint}"`);
      return { type: 'primitive', value: null };
    }

    // 2. Built-in static Math methods
    if (this.isMathCall(expr)) {
      return this.evaluateMathCall(expr);
    }

    // 3. General Method Call
    let targetRefId: number | null = null;
    let className = '';

    if (expr.object) {
      // May be a static call on a user-defined class identifier
      if (expr.object.type === 'Identifier' && this.classes[expr.object.name]) {
        className = expr.object.name;
      } else {
        // Instance method call
        const objRef = this.evaluateExpression(expr.object);
        if (objRef.type !== 'reference' || objRef.refId === null) {
          throw new JavaRuntimeError(`NullPointerException: Attempted to call method '${expr.methodName}' on a null reference.`, expr.line);
        }
        targetRefId = objRef.refId;
        const heapObj = this.heap[targetRefId];
        if (!heapObj || heapObj.type !== 'object') {
          throw new JavaRuntimeError('RuntimeError: Target of method call is not a valid object.', expr.line);
        }
        className = heapObj.className;
      }
    } else {
      // Local/Static method call on current class (or search class hierarchy)
      const frame = this.getActiveFrame();
      if (frame.thisRef !== null) {
        targetRefId = frame.thisRef;
        const thisObj = this.heap[targetRefId];
        if (thisObj && thisObj.type === 'object') {
          className = thisObj.className;
        }
      } else {
        // Static context: extract className from methodName (e.g. "Main.foo" or infer from current frame)
        const activeMethod = frame.methodName; // e.g. "Main.main"
        className = activeMethod.split('.')[0];
      }
    }

    const cls = this.classes[className];
    if (!cls) {
      throw new JavaRuntimeError(`ClassNotFoundException: Class ${className} is not defined.`, expr.line);
    }

    // Evaluate arguments
    const argsVal = expr.arguments.map((arg: any) => this.evaluateExpression(arg));

    // Find the method
    const method = cls.methods.find((m) => m.name === expr.methodName && m.parameters.length === argsVal.length);
    if (!method) {
      throw new JavaRuntimeError(`NoSuchMethodException: Class ${className} has no method '${expr.methodName}' matching ${argsVal.length} parameters.`, expr.line);
    }

    // Create parameters mapping
    const frameVariables: Record<string, VariableState> = {};
    for (let i = 0; i < method.parameters.length; i++) {
      const p = method.parameters[i];
      frameVariables[p.name] = {
        name: p.name,
        type: p.dataType,
        value: argsVal[i]
      };
    }

    const newFrame: StackFrame = {
      id: `frame-${this.nextFrameId++}`,
      methodName: `${className}.${expr.methodName}`,
      variables: frameVariables,
      thisRef: targetRefId
    };

    this.stack.push(newFrame);
    this.addStep(method.line, `Call ${expr.methodName}()`);

    let retVal: VariableValue = { type: 'primitive', value: null };

    try {
      this.executeBlock(method.body);
      // If method returns without explicit return statement (void)
      this.stack.pop();
      this.addStep(expr.line, `Returned`);
    } catch (e) {
      if (e instanceof ReturnException) {
        retVal = e.value;
        this.stack.pop();
        const displayVal = retVal.type === 'primitive' ? String(retVal.value) : `ref@${retVal.refId}`;
        this.addStep(expr.line, `Returned ${displayVal}`);
      } else {
        throw e;
      }
    }

    return retVal;
  }

  private isStdoutCall(expr: any): boolean {
    if (!expr.object) return false;
    const obj = expr.object;
    if (obj.type === 'FieldAccessExpression') {
      if (obj.fieldName === 'out' && obj.object && obj.object.type === 'Identifier' && obj.object.name === 'System') {
        return true;
      }
    }
    return false;
  }

  private isMathCall(expr: any): boolean {
    if (!expr.object) return false;
    const obj = expr.object;
    return obj.type === 'Identifier' && obj.name === 'Math';
  }

  private evaluateMathCall(expr: any): VariableValue {
    const args = expr.arguments.map((arg: any) => this.evaluateExpression(arg));
    const nums = args.map((a: any) => (a.type === 'primitive' ? Number(a.value) : 0));
    let result: number;
    switch (expr.methodName) {
      case 'min':    result = Math.min(...nums); break;
      case 'max':    result = Math.max(...nums); break;
      case 'abs':    result = Math.abs(nums[0]); break;
      case 'sqrt':   result = Math.sqrt(nums[0]); break;
      case 'pow':    result = Math.pow(nums[0], nums[1]); break;
      case 'floor':  result = Math.floor(nums[0]); break;
      case 'ceil':   result = Math.ceil(nums[0]); break;
      case 'round':  result = Math.round(nums[0]); break;
      case 'log':    result = Math.log(nums[0]); break;
      case 'log10':  result = Math.log10(nums[0]); break;
      case 'random': result = Math.random(); break;
      default:
        throw new JavaRuntimeError(`NoSuchMethodException: Math.${expr.methodName} is not supported.`, expr.line);
    }
    this.addStep(expr.line, `Math.${expr.methodName}() = ${result}`);
    return { type: 'primitive', value: result };
  }

  private stringifyValue(val: VariableValue): string {
    if (val.type === 'primitive') {
      return val.value === null ? 'null' : String(val.value);
    } else {
      return val.refId === null ? 'null' : `ref@${val.refId}`;
    }
  }

  private stringifyExpression(expr: any): string {
    if (!expr) return '';
    switch (expr.type) {
      case 'Literal':
        return expr.value === null ? 'null' : typeof expr.value === 'string' ? `"${expr.value}"` : String(expr.value);
      case 'Identifier':
        return expr.name;
      case 'BinaryExpression': {
        const parentPrec = this.getOperatorPrecedence(expr.operator);
        
        let leftStr = this.stringifyExpression(expr.left);
        if (expr.left.type === 'BinaryExpression') {
          const leftPrec = this.getOperatorPrecedence(expr.left.operator);
          if (leftPrec < parentPrec) leftStr = `(${leftStr})`;
        }
        
        let rightStr = this.stringifyExpression(expr.right);
        if (expr.right.type === 'BinaryExpression') {
          const rightPrec = this.getOperatorPrecedence(expr.right.operator);
          if (rightPrec <= parentPrec) rightStr = `(${rightStr})`;
        }
        
        return `${leftStr} ${expr.operator} ${rightStr}`;
      }
      case 'UnaryExpression':
        return `${expr.operator}${this.stringifyExpression(expr.expression)}`;
      case 'PostfixExpression':
        return `${this.stringifyExpression(expr.expression)}${expr.operator}`;
      case 'FieldAccessExpression':
        return `${this.stringifyExpression(expr.object)}.${expr.fieldName}`;
      case 'ArrayAccessExpression':
        return `${this.stringifyExpression(expr.array)}[${this.stringifyExpression(expr.index)}]`;
      case 'ThisExpression':
        return 'this';
      case 'MethodCallExpression': {
        const objStr = expr.object ? `${this.stringifyExpression(expr.object)}.` : '';
        const argsStr = expr.arguments.map((arg: any) => this.stringifyExpression(arg)).join(', ');
        return `${objStr}${expr.methodName}(${argsStr})`;
      }
      case 'NewObjectExpression': {
        const argsStr = expr.arguments.map((arg: any) => this.stringifyExpression(arg)).join(', ');
        return `new ${expr.className}(${argsStr})`;
      }
      case 'NewArrayExpression': {
        if (expr.size) {
          return `new ${expr.elementType}[${this.stringifyExpression(expr.size)}]`;
        }
        const initStr = expr.initializers ? expr.initializers.map((init: any) => this.stringifyExpression(init)).join(', ') : '';
        return `new ${expr.elementType}[] { ${initStr} }`;
      }
      default:
        return '';
    }
  }

  private stringifyExpressionWithValues(expr: any): string {
    try {
      if (expr.type === 'BinaryExpression') {
        const parentPrec = this.getOperatorPrecedence(expr.operator);
        
        let leftStr = this.stringifyExpressionWithValues(expr.left);
        if (expr.left.type === 'BinaryExpression') {
          const leftPrec = this.getOperatorPrecedence(expr.left.operator);
          if (leftPrec < parentPrec) leftStr = `(${leftStr})`;
        }
        
        let rightStr = this.stringifyExpressionWithValues(expr.right);
        if (expr.right.type === 'BinaryExpression') {
          const rightPrec = this.getOperatorPrecedence(expr.right.operator);
          if (rightPrec <= parentPrec) rightStr = `(${rightStr})`;
        }
        
        return `${leftStr} ${expr.operator} ${rightStr}`;
      }
      const val = this.evaluateExpression(expr);
      return this.stringifyValue(val);
    } catch {
      return this.stringifyExpression(expr);
    }
  }

  private getOperatorPrecedence(op: string): number {
    switch (op) {
      case '||': return 1;
      case '&&': return 2;
      case '==': case '!=': return 3;
      case '<': case '<=': case '>': case '>=': return 4;
      case '+': case '-': return 5;
      case '*': case '/': case '%': return 6;
      default: return 0;
    }
  }

  private hasMathOperations(expr: any): boolean {
    if (!expr) return false;
    if (expr.type === 'BinaryExpression') return true;
    if (expr.type === 'UnaryExpression') return true;
    if (expr.type === 'PostfixExpression') return true;
    if (expr.type === 'ArrayAccessExpression') return true;
    if (expr.type === 'MethodCallExpression') return true;
    return false;
  }
}

// Special exception to wind back stack frames during return statement execution
class ReturnException {
  value: VariableValue;
  line: number;
  constructor(value: VariableValue, line: number) {
    this.value = value;
    this.line = line;
  }
}

export interface TraceResult {
  trace: TraceStep[];
  error: string | null;
  errorType: 'compile' | 'runtime' | null;
}

// Parse user input text into per-parameter value lines.
// Each line = one parameter. For arrays, values are comma-separated on one line.
function parseInputValues(inputText: string): string[] {
  return inputText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '');
}

export function generateTrace(code: string, inputText = ''): TraceResult {
  try {
    const tokenizer = new Tokenizer(code);
    const tokens = tokenizer.tokenize();
    
    const parser = new Parser(tokens);
    const ast = parser.parse();
    
    const inputValues = parseInputValues(inputText);
    const interpreter = new Interpreter(ast, inputValues);
    try {
      const trace = interpreter.run();
      return { trace, error: null, errorType: null };
    } catch (e: any) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return {
        trace: interpreter.getTrace(),
        error: errMsg,
        errorType: 'runtime'
      };
    }
  } catch (e: any) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return {
      trace: [],
      error: errMsg,
      errorType: 'compile'
    };
  }
}

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
  BreakStatementNode,
  ContinueStatementNode,
  BinaryExpressionNode,
  UnaryExpressionNode,
  PostfixExpressionNode,
  AssignmentStatementNode,
  BlockStatementNode,
  VariableDeclarationStatementNode,
  IfStatementNode,
  ForEachStatementNode,
  DoWhileStatementNode,
  SwitchStatementNode,
  TernaryExpressionNode,
  CastExpressionNode,
  InstanceofExpressionNode,
  ChangeHighlight
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
      this.addStep(targetMethod.line, `Start ${targetMethod.name}()${paramDesc}`);

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
      case 'DoWhileStatement':
        this.executeDoWhile(stmt as any);
        break;
      case 'ForEachStatement':
        this.executeForEach(stmt as any);
        break;
      case 'SwitchStatement':
        this.executeSwitch(stmt as any);
        break;
      case 'ForStatement':
        this.executeFor(stmt);
        break;
      case 'ReturnStatement':
        this.executeReturn(stmt);
        break;
      case 'BreakStatement':
        this.addStep((stmt as BreakStatementNode).line, 'break — exit loop');
        throw new BreakException((stmt as BreakStatementNode).line);
      case 'ContinueStatement':
        this.addStep((stmt as ContinueStatementNode).line, 'continue — next iteration');
        throw new ContinueException((stmt as ContinueStatementNode).line);
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

    if (typeof cur === 'boolean' && typeof r === 'boolean') {
      let result = false;
      switch (op) {
        case '&=': result = cur && r; break;
        case '|=': result = cur || r; break;
        case '^=': result = (cur !== r); break;
        default:
          throw new JavaRuntimeError(`RuntimeError: Operator '${op}' cannot be applied to booleans.`, line);
      }
      return { type: 'primitive', value: result };
    }

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
      case '%=': result = cur % r; break;
      case '&=': result = cur & r; break;
      case '|=': result = cur | r; break;
      case '^=': result = cur ^ r; break;
      case '<<=': result = cur << r; break;
      case '>>=': result = cur >> r; break;
      case '>>>=': result = cur >>> r; break;
      default:
        throw new JavaRuntimeError(`RuntimeError: Unsupported compound operator '${op}'`, line);
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
      try {
        this.executeStatement(stmt.body);
      } catch (e) {
        if (e instanceof BreakException) break;
        if (e instanceof ContinueException) { iteration++; continue; }
        throw e;
      }
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
      try {
        this.executeStatement(stmt.body);
      } catch (e) {
        if (e instanceof BreakException) break;
        if (e instanceof ContinueException) {
          // still run the update before next condition check
          if (stmt.update) {
            this.addStep(stmt.update.line, 'Update loop var');
            this.evaluateExpression(stmt.update);
          }
          iteration++;
          continue;
        }
        throw e;
      }

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

  private executeDoWhile(stmt: DoWhileStatementNode) {
    let iteration = 1;
    while (true) {
      this.addStep(stmt.line, `Do-while iteration ${iteration} -> run loop body`);
      try {
        this.executeStatement(stmt.body);
      } catch (e) {
        if (e instanceof BreakException) break;
        if (e instanceof ContinueException) {
          // fall through to condition
        } else {
          throw e;
        }
      }

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
      iteration++;
    }
  }

  private executeSwitch(stmt: SwitchStatementNode) {
    const val = this.evaluateExpression(stmt.expression);
    const valPrimitive = val.type === 'primitive' ? val.value : null;

    const exprStr = this.stringifyExpression(stmt.expression);
    const displayVal = val.type === 'primitive' ? String(val.value) : `ref@${val.refId}`;
    this.addStep(stmt.line, `Evaluate switch expression: ${exprStr} -> ${displayVal}`);

    let matchIdx = -1;
    let defaultIdx = -1;

    for (let i = 0; i < stmt.cases.length; i++) {
      const c = stmt.cases[i];
      if (c.value === null) {
        defaultIdx = i;
      } else {
        const caseVal = this.evaluateExpression(c.value);
        if (caseVal.type === 'primitive' && caseVal.value === valPrimitive) {
          matchIdx = i;
          break;
        }
      }
    }

    const startIndex = matchIdx !== -1 ? matchIdx : defaultIdx;
    if (startIndex === -1) {
      this.addStep(stmt.line, 'No matching case found and no default case -> exit switch');
      return;
    }

    const startCaseName = matchIdx !== -1 ? `case ${valPrimitive}` : 'default';
    this.addStep(stmt.line, `Match found: entering ${startCaseName}`);

    try {
      for (let i = startIndex; i < stmt.cases.length; i++) {
        for (const caseStmt of stmt.cases[i].statements) {
          this.executeStatement(caseStmt);
        }
      }
    } catch (e) {
      if (e instanceof BreakException) {
        this.addStep(e.line, 'break — exit switch');
        return;
      }
      throw e;
    }
  }

  private executeForEach(stmt: ForEachStatementNode) {
    const iterableVal = this.evaluateExpression(stmt.iterable);
    const frame = this.getActiveFrame();

    if (iterableVal.type !== 'reference' || iterableVal.refId === null) {
      throw new JavaRuntimeError('NullPointerException', stmt.line);
    }

    const heapObj = this.heap[iterableVal.refId];
    if (!heapObj) {
      throw new JavaRuntimeError('NullPointerException', stmt.line);
    }

    let elements: VariableValue[] = [];
    let elemType: JavaType = stmt.variableType;

    if (heapObj.type === 'array') {
      elements = heapObj.values.map(v => v.value);
      elemType = heapObj.elementType;
    } else if (heapObj.type === 'list') {
      elements = heapObj.elements;
    } else if (heapObj.type === 'set') {
      elements = heapObj.elements;
    } else {
      throw new JavaRuntimeError('RuntimeError: For-each loop target must be an array or Iterable.', stmt.line);
    }

    const iterStr = this.stringifyExpression(stmt.iterable);
    this.addStep(stmt.line, `For-each loop over ${iterStr} (${elements.length} elements)`);

    for (let i = 0; i < elements.length; i++) {
      const elem = elements[i];
      frame.variables[stmt.variableName] = {
        name: stmt.variableName,
        type: elemType,
        value: elem
      };

      const displayVal = elem.type === 'primitive' ? String(elem.value) : `ref@${elem.refId}`;
      const changeHighlight: ChangeHighlight = { type: 'stack', frameId: frame.id, varName: stmt.variableName };
      this.addStep(stmt.line, `Iteration ${i + 1}: set ${stmt.variableName} = ${displayVal}`, changeHighlight);

      try {
        this.executeStatement(stmt.body);
      } catch (e) {
        if (e instanceof BreakException) break;
        if (e instanceof ContinueException) continue;
        throw e;
      }
    }
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
      case 'TernaryExpression':
        return this.evaluateTernary(expr as any);
      case 'CastExpression':
        return this.evaluateCast(expr as any);
      case 'InstanceofExpression':
        return this.evaluateInstanceof(expr as any);
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
      case '&':
        if (typeof l === 'boolean' && typeof r === 'boolean') return { type: 'primitive', value: l && r };
        return { type: 'primitive', value: (l as any) & (r as any) };
      case '|':
        if (typeof l === 'boolean' && typeof r === 'boolean') return { type: 'primitive', value: l || r };
        return { type: 'primitive', value: (l as any) | (r as any) };
      case '^':
        if (typeof l === 'boolean' && typeof r === 'boolean') return { type: 'primitive', value: l !== r };
        return { type: 'primitive', value: (l as any) ^ (r as any) };
      case '<<': return { type: 'primitive', value: (l as any) << (r as any) };
      case '>>': return { type: 'primitive', value: (l as any) >> (r as any) };
      case '>>>': return { type: 'primitive', value: (l as any) >>> (r as any) };
      default:
        throw new JavaRuntimeError(`Unsupported binary operator '${expr.operator}'`, expr.line);
    }
  }

  private modifyTargetValue(target: ExpressionNode, diff: number, isPostfix: boolean, opText: string, line: number): VariableValue {
    let curVal: VariableValue;
    let type: JavaType = 'int';
    let setter: (val: VariableValue) => ChangeHighlight;

    if (target.type === 'Identifier') {
      const curState = this.lookupVariable(target.name, line);
      curVal = curState.value;
      type = curState.type;
      setter = (val) => this.setVariable(target.name, val, type, line);
    } else if (target.type === 'ArrayAccessExpression') {
      const arrVal = this.evaluateExpression(target.array);
      if (arrVal.type !== 'reference' || arrVal.refId === null) {
        throw new JavaRuntimeError('NullPointerException', line);
      }
      const heapObj = this.heap[arrVal.refId];
      if (!heapObj || heapObj.type !== 'array') {
        throw new JavaRuntimeError('RuntimeError: Target is not an array.', line);
      }
      const idxVal = this.evaluateExpression(target.index);
      if (idxVal.type !== 'primitive' || typeof idxVal.value !== 'number') {
        throw new JavaRuntimeError('RuntimeError: Array index must be numeric.', line);
      }
      const idx = idxVal.value;
      if (idx < 0 || idx >= heapObj.values.length) {
        throw new JavaRuntimeError(`ArrayIndexOutOfBoundsException: Index ${idx} out of bounds for length ${heapObj.values.length}`, line);
      }
      const elementState = heapObj.values[idx];
      curVal = elementState.value;
      type = elementState.type;
      setter = (val) => {
        elementState.value = val;
        return { type: 'heap', refId: arrVal.refId!, field: idx };
      };
    } else if (target.type === 'FieldAccessExpression') {
      const objVal = this.evaluateExpression(target.object);
      if (objVal.type !== 'reference' || objVal.refId === null) {
        throw new JavaRuntimeError('NullPointerException', line);
      }
      const heapObj = this.heap[objVal.refId];
      if (!heapObj || heapObj.type !== 'object') {
        throw new JavaRuntimeError('RuntimeError: Target is not an object.', line);
      }
      const fieldState = heapObj.fields[target.fieldName];
      if (!fieldState) {
        throw new JavaRuntimeError(`RuntimeError: Field '${target.fieldName}' not found.`, line);
      }
      curVal = fieldState.value;
      type = fieldState.type;
      setter = (val) => {
        fieldState.value = val;
        return { type: 'heap', refId: objVal.refId!, field: target.fieldName };
      };
    } else {
      throw new JavaRuntimeError(`RuntimeError: Target of increment/decrement is not assignable.`, line);
    }

    if (curVal.type !== 'primitive' || typeof curVal.value !== 'number') {
      throw new JavaRuntimeError('RuntimeError: Arithmetic operations apply to numeric types only.', line);
    }

    const oldVal = curVal.value;
    const newVal = oldVal + diff;
    const valState: VariableValue = { type: 'primitive', value: newVal };
    const changeHighlight = setter(valState);

    const explanation = `Set target = ${newVal} (via target ${opText} 1 = ${oldVal} ${opText} 1)`;
    this.addStep(line, explanation, changeHighlight);

    return isPostfix ? { type: 'primitive', value: oldVal } : valState;
  }

  private evaluateUnary(expr: UnaryExpressionNode): VariableValue {
    if (expr.operator === '++' || expr.operator === '--') {
      return this.modifyTargetValue(expr.expression, expr.operator === '++' ? 1 : -1, false, expr.operator === '++' ? '+' : '-', expr.line);
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
    if (expr.operator === '~') {
      return { type: 'primitive', value: ~(val.value as any) };
    }
    throw new JavaRuntimeError(`RuntimeError: Unsupported unary operator '${expr.operator}'`, expr.line);
  }

  private evaluatePostfix(expr: PostfixExpressionNode): VariableValue {
    return this.modifyTargetValue(expr.expression, expr.operator === '++' ? 1 : -1, true, expr.operator === '++' ? '+' : '-', expr.line);
  }

  private evaluateTernary(expr: TernaryExpressionNode): VariableValue {
    const cond = this.evaluateExpression(expr.condition);
    if (cond.type !== 'primitive' || typeof cond.value !== 'boolean') {
      throw new JavaRuntimeError('RuntimeError: Ternary condition must be a boolean.', expr.line);
    }
    const targetExpr = cond.value ? expr.thenExpr : expr.elseExpr;
    const condStr = this.stringifyExpression(expr.condition);
    const valStr = this.stringifyExpressionWithValues(expr.condition);
    this.addStep(expr.line, `Evaluate ternary condition: ${condStr} (${valStr}) -> ${cond.value}`);
    return this.evaluateExpression(targetExpr);
  }

  private evaluateCast(expr: CastExpressionNode): VariableValue {
    const val = this.evaluateExpression(expr.expression);
    if (val.type === 'primitive') {
      const v = val.value;
      if (v === null) return val;

      if (expr.castType === 'int' || expr.castType === 'long' || expr.castType === 'short' || expr.castType === 'byte') {
        if (typeof v === 'number') {
          return { type: 'primitive', value: Math.trunc(v) };
        } else if (typeof v === 'string' && v.length === 1) {
          return { type: 'primitive', value: v.charCodeAt(0) };
        } else if (typeof v === 'boolean') {
          return { type: 'primitive', value: v ? 1 : 0 };
        }
      } else if (expr.castType === 'double' || expr.castType === 'float') {
        if (typeof v === 'number') {
          return { type: 'primitive', value: v };
        } else if (typeof v === 'string' && v.length === 1) {
          return { type: 'primitive', value: v.charCodeAt(0) };
        } else if (typeof v === 'boolean') {
          return { type: 'primitive', value: v ? 1.0 : 0.0 };
        }
      } else if (expr.castType === 'char') {
        if (typeof v === 'number') {
          return { type: 'primitive', value: String.fromCharCode(v) };
        }
      } else if (expr.castType === 'String') {
        return { type: 'primitive', value: String(v) };
      }
    }
    return val;
  }

  private evaluateInstanceof(expr: InstanceofExpressionNode): VariableValue {
    const val = this.evaluateExpression(expr.expression);
    if (val.type !== 'reference' || val.refId === null) {
      return { type: 'primitive', value: false };
    }
    const heapObj = this.heap[val.refId];
    if (!heapObj) {
      return { type: 'primitive', value: false };
    }
    let matched = false;
    if (heapObj.type === 'object') {
      matched = heapObj.className === expr.checkType;
    } else if (heapObj.type === 'list') {
      matched = expr.checkType === 'List' || expr.checkType === 'ArrayList' || expr.checkType === 'LinkedList' || expr.checkType === 'Stack' || expr.checkType === 'Queue' || expr.checkType === 'ArrayDeque' || heapObj.className === expr.checkType;
    } else if (heapObj.type === 'map') {
      matched = expr.checkType === 'Map' || expr.checkType === 'HashMap' || expr.checkType === 'LinkedHashMap' || heapObj.className === expr.checkType;
    } else if (heapObj.type === 'set') {
      matched = expr.checkType === 'Set' || expr.checkType === 'HashSet' || expr.checkType === 'LinkedHashSet' || heapObj.className === expr.checkType;
    } else if (heapObj.type === 'array') {
      matched = expr.checkType.endsWith('[]') && (expr.checkType.slice(0, -2) === heapObj.elementType || (expr.checkType === 'Object[]'));
    }
    return { type: 'primitive', value: matched };
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
      if (className === 'Math') {
        if (field === 'PI') return { type: 'primitive', value: Math.PI };
        if (field === 'E') return { type: 'primitive', value: Math.E };
        if (field === 'TAU') return { type: 'primitive', value: Math.PI * 2 };
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
    const collectionLists = ['ArrayList', 'LinkedList', 'Stack', 'ArrayDeque', 'Queue'];
    const collectionMaps = ['HashMap', 'LinkedHashMap'];
    const collectionSets = ['HashSet', 'LinkedHashSet', 'TreeSet'];

    if (collectionLists.includes(expr.className)) {
      const refId = this.allocateHeap({
        type: 'list',
        className: expr.className,
        elements: []
      });
      this.addStep(expr.line, `New collection ${expr.className} (ref@${refId})`);
      return { type: 'reference', refId };
    }

    if (collectionMaps.includes(expr.className)) {
      const refId = this.allocateHeap({
        type: 'map',
        className: expr.className,
        entries: []
      });
      this.addStep(expr.line, `New collection ${expr.className} (ref@${refId})`);
      return { type: 'reference', refId };
    }

    if (collectionSets.includes(expr.className)) {
      const refId = this.allocateHeap({
        type: 'set',
        className: expr.className,
        elements: []
      });
      this.addStep(expr.line, `New collection ${expr.className} (ref@${refId})`);
      return { type: 'reference', refId };
    }

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

  private isLibraryStaticCall(expr: any): boolean {
    if (expr.object && expr.object.type === 'Identifier') {
      const name = expr.object.name;
      return ['Integer', 'Character', 'Arrays', 'Collections', 'String', 'Math', 'System'].includes(name);
    }
    return false;
  }

  private evaluateLibraryStaticCall(expr: any): VariableValue {
    const className = expr.object.name;
    const methodName = expr.methodName;
    const args = expr.arguments.map((arg: any) => this.evaluateExpression(arg));
    const argValues = args.map((a: any) => a.type === 'primitive' ? a.value : null);

    if (className === 'System' && methodName === 'exit') {
      const exitCode = argValues[0] ?? 0;
      this.addStep(expr.line, `System.exit(${exitCode}) called -> terminate program`);
      throw new ExitException(exitCode, expr.line);
    }

    if (className === 'Integer') {
      switch (methodName) {
        case 'parseInt': {
          const val = parseInt(String(argValues[0]), 10);
          return { type: 'primitive', value: isNaN(val) ? 0 : val };
        }
        case 'toString': {
          const radix = argValues[1] !== undefined ? Number(argValues[1]) : 10;
          return { type: 'primitive', value: Number(argValues[0]).toString(radix) };
        }
        case 'valueOf': {
          if (typeof argValues[0] === 'string') {
            const val = parseInt(argValues[0], 10);
            return { type: 'primitive', value: isNaN(val) ? 0 : val };
          }
          return { type: 'primitive', value: Number(argValues[0]) };
        }
        case 'toBinaryString':
          return { type: 'primitive', value: Number(argValues[0]).toString(2) };
        case 'toHexString':
          return { type: 'primitive', value: Number(argValues[0]).toString(16) };
      }
    }

    if (className === 'Character') {
      const charStr = String(argValues[0] ?? '');
      switch (methodName) {
        case 'isLetter': return { type: 'primitive', value: /^[a-zA-Z]$/.test(charStr) };
        case 'isDigit': return { type: 'primitive', value: /^\d$/.test(charStr) };
        case 'isUpperCase': return { type: 'primitive', value: charStr === charStr.toUpperCase() && charStr !== charStr.toLowerCase() };
        case 'isLowerCase': return { type: 'primitive', value: charStr === charStr.toLowerCase() && charStr !== charStr.toUpperCase() };
        case 'isAlphabetic': return { type: 'primitive', value: /^[a-zA-Z]$/.test(charStr) };
        case 'toLowerCase': return { type: 'primitive', value: charStr.toLowerCase() };
        case 'toUpperCase': return { type: 'primitive', value: charStr.toUpperCase() };
      }
    }

    if (className === 'Arrays') {
      switch (methodName) {
        case 'sort': {
          const arrRef = args[0];
          if (arrRef.type !== 'reference' || arrRef.refId === null) throw new JavaRuntimeError('NullPointerException', expr.line);
          const heapObj = this.heap[arrRef.refId];
          if (heapObj && heapObj.type === 'array') {
            const fromIdx = argValues[1] !== undefined ? Number(argValues[1]) : 0;
            const toIdx = argValues[2] !== undefined ? Number(argValues[2]) : heapObj.values.length;
            const slice = heapObj.values.slice(fromIdx, toIdx);
            slice.sort((a, b) => {
              if (a.value.value === null) return 1;
              if (b.value.value === null) return -1;
              if (a.value.value < b.value.value) return -1;
              if (a.value.value > b.value.value) return 1;
              return 0;
            });
            heapObj.values.splice(fromIdx, slice.length, ...slice);
            this.addStep(expr.line, `Arrays.sort(ref@${arrRef.refId}${argValues[1] !== undefined ? `, ${fromIdx}, ${toIdx}` : ''})`);
            return { type: 'primitive', value: null };
          }
          break;
        }
        case 'fill': {
          const arrRef = args[0];
          if (arrRef.type !== 'reference' || arrRef.refId === null) throw new JavaRuntimeError('NullPointerException', expr.line);
          const heapObj = this.heap[arrRef.refId];
          if (heapObj && heapObj.type === 'array') {
            const fillVal = args[1];
            if (args.length === 2) {
              for (const element of heapObj.values) {
                element.value = fillVal;
              }
              this.addStep(expr.line, `Arrays.fill(ref@${arrRef.refId}, ${fillVal.value})`);
            } else {
              const fromIdx = Number(argValues[1]);
              const toIdx = Number(argValues[2]);
              const val = args[3];
              for (let i = fromIdx; i < toIdx; i++) {
                heapObj.values[i].value = val;
              }
              this.addStep(expr.line, `Arrays.fill(ref@${arrRef.refId}, ${fromIdx}, ${toIdx}, ${val.value})`);
            }
            return { type: 'primitive', value: null };
          }
          break;
        }
        case 'copyOf': {
          const arrRef = args[0];
          if (arrRef.type !== 'reference' || arrRef.refId === null) throw new JavaRuntimeError('NullPointerException', expr.line);
          const heapObj = this.heap[arrRef.refId];
          if (heapObj && heapObj.type === 'array') {
            const newLength = Number(argValues[1]);
            const newValues: VariableState[] = [];
            for (let i = 0; i < newLength; i++) {
              if (i < heapObj.values.length) {
                newValues.push({ ...heapObj.values[i] });
              } else {
                newValues.push({
                  name: `[${i}]`,
                  type: heapObj.elementType,
                  value: heapObj.elementType === 'int' || heapObj.elementType === 'double' ? { type: 'primitive', value: 0 } : (heapObj.elementType === 'boolean' ? { type: 'primitive', value: false } : { type: 'reference', refId: null })
                });
              }
            }
            const refId = this.allocateHeap({
              type: 'array',
              elementType: heapObj.elementType,
              values: newValues
            });
            this.addStep(expr.line, `Arrays.copyOf(ref@${arrRef.refId}, ${newLength}) -> ref@${refId}`);
            return { type: 'reference', refId };
          }
          break;
        }
        case 'copyOfRange': {
          const arrRef = args[0];
          if (arrRef.type !== 'reference' || arrRef.refId === null) throw new JavaRuntimeError('NullPointerException', expr.line);
          const heapObj = this.heap[arrRef.refId];
          if (heapObj && heapObj.type === 'array') {
            const fromIdx = Number(argValues[1]);
            const toIdx = Number(argValues[2]);
            const newValues: VariableState[] = [];
            for (let i = fromIdx; i < toIdx; i++) {
              if (i < heapObj.values.length) {
                newValues.push({ ...heapObj.values[i] });
              } else {
                newValues.push({
                  name: `[${i - fromIdx}]`,
                  type: heapObj.elementType,
                  value: heapObj.elementType === 'int' || heapObj.elementType === 'double' ? { type: 'primitive', value: 0 } : (heapObj.elementType === 'boolean' ? { type: 'primitive', value: false } : { type: 'reference', refId: null })
                });
              }
            }
            const refId = this.allocateHeap({
              type: 'array',
              elementType: heapObj.elementType,
              values: newValues
            });
            this.addStep(expr.line, `Arrays.copyOfRange(ref@${arrRef.refId}, ${fromIdx}, ${toIdx}) -> ref@${refId}`);
            return { type: 'reference', refId };
          }
          break;
        }
        case 'toString': {
          const arrRef = args[0];
          if (arrRef.type !== 'reference' || arrRef.refId === null) return { type: 'primitive', value: 'null' };
          const heapObj = this.heap[arrRef.refId];
          if (heapObj && heapObj.type === 'array') {
            const str = `[${heapObj.values.map(v => v.value.type === 'primitive' ? v.value.value : `ref@${v.value.refId}`).join(', ')}]`;
            return { type: 'primitive', value: str };
          }
          break;
        }
      }
    }

    if (className === 'Collections') {
      switch (methodName) {
        case 'sort': {
          const listRef = args[0];
          if (listRef.type !== 'reference' || listRef.refId === null) throw new JavaRuntimeError('NullPointerException', expr.line);
          const heapObj = this.heap[listRef.refId];
          if (heapObj && heapObj.type === 'list') {
            heapObj.elements.sort((a, b) => {
              if (a.type === 'primitive' && b.type === 'primitive') {
                if (a.value === null) return 1;
                if (b.value === null) return -1;
                if (a.value < b.value) return -1;
                if (a.value > b.value) return 1;
              }
              return 0;
            });
            this.addStep(expr.line, `Collections.sort(ref@${listRef.refId})`);
            return { type: 'primitive', value: null };
          }
          break;
        }
        case 'reverse': {
          const listRef = args[0];
          if (listRef.type !== 'reference' || listRef.refId === null) throw new JavaRuntimeError('NullPointerException', expr.line);
          const heapObj = this.heap[listRef.refId];
          if (heapObj && heapObj.type === 'list') {
            heapObj.elements.reverse();
            this.addStep(expr.line, `Collections.reverse(ref@${listRef.refId})`);
            return { type: 'primitive', value: null };
          }
          break;
        }
        case 'min':
        case 'max': {
          const listRef = args[0];
          if (listRef.type !== 'reference' || listRef.refId === null) throw new JavaRuntimeError('NullPointerException', expr.line);
          const heapObj = this.heap[listRef.refId];
          if (heapObj && heapObj.type === 'list') {
            if (heapObj.elements.length === 0) throw new JavaRuntimeError('NoSuchElementException', expr.line);
            const nums = heapObj.elements.map(e => e.type === 'primitive' && typeof e.value === 'number' ? e.value : 0);
            const res = methodName === 'min' ? Math.min(...nums) : Math.max(...nums);
            return { type: 'primitive', value: res };
          }
          break;
        }
        case 'shuffle': {
          const listRef = args[0];
          if (listRef.type !== 'reference' || listRef.refId === null) throw new JavaRuntimeError('NullPointerException', expr.line);
          const heapObj = this.heap[listRef.refId];
          if (heapObj && heapObj.type === 'list') {
            for (let i = heapObj.elements.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [heapObj.elements[i], heapObj.elements[j]] = [heapObj.elements[j], heapObj.elements[i]];
            }
            this.addStep(expr.line, `Collections.shuffle(ref@${listRef.refId})`);
            return { type: 'primitive', value: null };
          }
          break;
        }
        case 'frequency': {
          const listRef = args[0];
          const targetVal = args[1];
          if (listRef.type !== 'reference' || listRef.refId === null) throw new JavaRuntimeError('NullPointerException', expr.line);
          const heapObj = this.heap[listRef.refId];
          if (heapObj && (heapObj.type === 'list' || heapObj.type === 'set')) {
            let count = 0;
            const elements = heapObj.elements;
            for (const elem of elements) {
              if (elem.type === targetVal.type && (elem.type === 'primitive' ? elem.value === targetVal.value : elem.refId === targetVal.refId)) {
                count++;
              }
            }
            return { type: 'primitive', value: count };
          }
          break;
        }
      }
    }

    if (className === 'String') {
      if (methodName === 'valueOf') {
        const v = argValues[0];
        return { type: 'primitive', value: v === null ? 'null' : String(v) };
      }
      if (methodName === 'format') {
        const formatStr = String(argValues[0]);
        let formatted = formatStr;
        for (let i = 1; i < argValues.length; i++) {
          formatted = formatted.replace(/%[sddf]/, String(argValues[i]));
        }
        return { type: 'primitive', value: formatted };
      }
    }

    throw new JavaRuntimeError(`NoSuchMethodException: Static method ${className}.${methodName} is not implemented.`, expr.line);
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

    // 2. Built-in static library class methods
    if (this.isLibraryStaticCall(expr)) {
      if (expr.object.name === 'Math') {
        return this.evaluateMathCall(expr);
      }
      return this.evaluateLibraryStaticCall(expr);
    }

    // 3. String instance methods and simulated collections instance methods
    if (expr.object) {
      const objVal = this.evaluateExpression(expr.object);
      
      // String instance methods
      if (objVal.type === 'primitive' && typeof objVal.value === 'string') {
        const s = objVal.value;
        const argsVal = expr.arguments.map((arg: any) => this.evaluateExpression(arg));
        const argValues = argsVal.map((a: any) => a.type === 'primitive' ? a.value : null);
        
        switch (expr.methodName) {
          case 'length': return { type: 'primitive', value: s.length };
          case 'charAt': return { type: 'primitive', value: s.charAt(Number(argValues[0])) };
          case 'substring':
            return { type: 'primitive', value: s.substring(Number(argValues[0]), argValues[1] !== undefined ? Number(argValues[1]) : undefined) };
          case 'equals': return { type: 'primitive', value: s === String(argValues[0]) };
          case 'contains': return { type: 'primitive', value: s.includes(String(argValues[0])) };
          case 'indexOf': return { type: 'primitive', value: s.indexOf(String(argValues[0]), argValues[1] !== undefined ? Number(argValues[1]) : undefined) };
          case 'replace': return { type: 'primitive', value: s.replace(new RegExp(String(argValues[0]).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), String(argValues[1])) };
          case 'toUpperCase': return { type: 'primitive', value: s.toUpperCase() };
          case 'toLowerCase': return { type: 'primitive', value: s.toLowerCase() };
          case 'trim': return { type: 'primitive', value: s.trim() };
          case 'isEmpty': return { type: 'primitive', value: s.length === 0 };
          case 'startsWith': return { type: 'primitive', value: s.startsWith(String(argValues[0])) };
          case 'endsWith': return { type: 'primitive', value: s.endsWith(String(argValues[0])) };
          case 'compareTo': return { type: 'primitive', value: s.localeCompare(String(argValues[0])) };
          case 'toCharArray': {
            const charValues: VariableState[] = s.split('').map((c, i) => ({
              name: `[${i}]`,
              type: 'char',
              value: { type: 'primitive', value: c }
            }));
            const refId = this.allocateHeap({
              type: 'array',
              elementType: 'char',
              values: charValues
            });
            return { type: 'reference', refId };
          }
          case 'split': {
            const parts = s.split(new RegExp(String(argValues[0])));
            const stringValues: VariableState[] = parts.map((part, i) => ({
              name: `[${i}]`,
              type: 'String',
              value: { type: 'primitive', value: part }
            }));
            const refId = this.allocateHeap({
              type: 'array',
              elementType: 'String',
              values: stringValues
            });
            return { type: 'reference', refId };
          }
        }
      }

      // Simulated collections instance methods
      if (objVal.type === 'reference' && objVal.refId !== null) {
        const heapObj = this.heap[objVal.refId];
        if (heapObj && ['list', 'map', 'set'].includes(heapObj.type)) {
          const argsVal = expr.arguments.map((arg: any) => this.evaluateExpression(arg));
          const argValues = argsVal.map((a: any) => a.type === 'primitive' ? a.value : null);

          if (heapObj.type === 'list') {
            switch (expr.methodName) {
              case 'add': {
                if (argsVal.length === 1) {
                  heapObj.elements.push(argsVal[0]);
                  this.addStep(expr.line, `list.add(${argsVal[0].type === 'primitive' ? argsVal[0].value : `ref@${argsVal[0].refId}`})`);
                  return { type: 'primitive', value: true };
                } else {
                  const idx = Number(argValues[0]);
                  heapObj.elements.splice(idx, 0, argsVal[1]);
                  this.addStep(expr.line, `list.add(${idx}, ${argsVal[1].type === 'primitive' ? argsVal[1].value : `ref@${argsVal[1].refId}`})`);
                  return { type: 'primitive', value: null };
                }
              }
              case 'get': return heapObj.elements[Number(argValues[0])];
              case 'set': {
                const idx = Number(argValues[0]);
                const old = heapObj.elements[idx];
                heapObj.elements[idx] = argsVal[1];
                this.addStep(expr.line, `list.set(${idx}, ${argsVal[1].type === 'primitive' ? argsVal[1].value : `ref@${argsVal[1].refId}`})`);
                return old;
              }
              case 'size': return { type: 'primitive', value: heapObj.elements.length };
              case 'remove': {
                const arg = argsVal[0];
                if (arg.type === 'primitive' && typeof arg.value === 'number') {
                  const idx = arg.value;
                  const removed = heapObj.elements.splice(idx, 1)[0];
                  this.addStep(expr.line, `list.remove(${idx})`);
                  return removed;
                } else {
                  const idx = heapObj.elements.findIndex(e => e.type === arg.type && (e.type === 'primitive' ? e.value === arg.value : e.refId === arg.refId));
                  if (idx !== -1) {
                    heapObj.elements.splice(idx, 1);
                    this.addStep(expr.line, `list.remove(object) -> success`);
                    return { type: 'primitive', value: true };
                  }
                  return { type: 'primitive', value: false };
                }
              }
              case 'contains': {
                const arg = argsVal[0];
                const exists = heapObj.elements.some(e => e.type === arg.type && (e.type === 'primitive' ? e.value === arg.value : e.refId === arg.refId));
                return { type: 'primitive', value: exists };
              }
              case 'isEmpty': return { type: 'primitive', value: heapObj.elements.length === 0 };
              case 'clear':
                heapObj.elements = [];
                this.addStep(expr.line, `list.clear()`);
                return { type: 'primitive', value: null };
            }
          }

          if (heapObj.type === 'map') {
            switch (expr.methodName) {
              case 'put': {
                const key = argsVal[0];
                const val = argsVal[1];
                const idx = heapObj.entries.findIndex(e => e.key.type === key.type && (e.key.type === 'primitive' ? e.key.value === key.value : e.key.refId === key.refId));
                let old: VariableValue = { type: 'primitive', value: null };
                if (idx !== -1) {
                  old = heapObj.entries[idx].value;
                  heapObj.entries[idx].value = val;
                } else {
                  heapObj.entries.push({ key, value: val });
                }
                this.addStep(expr.line, `map.put(${key.type === 'primitive' ? key.value : `ref@${key.refId}`}, ${val.type === 'primitive' ? val.value : `ref@${val.refId}`})`);
                return old;
              }
              case 'get': {
                const key = argsVal[0];
                const entry = heapObj.entries.find(e => e.key.type === key.type && (e.key.type === 'primitive' ? e.key.value === key.value : e.key.refId === key.refId));
                return entry ? entry.value : { type: 'primitive', value: null };
              }
              case 'containsKey': {
                const key = argsVal[0];
                const exists = heapObj.entries.some(e => e.key.type === key.type && (e.key.type === 'primitive' ? e.key.value === key.value : e.key.refId === key.refId));
                return { type: 'primitive', value: exists };
              }
              case 'containsValue': {
                const val = argsVal[0];
                const exists = heapObj.entries.some(e => e.value.type === val.type && (e.value.type === 'primitive' ? e.value.value === val.value : e.value.refId === val.refId));
                return { type: 'primitive', value: exists };
              }
              case 'remove': {
                const key = argsVal[0];
                const idx = heapObj.entries.findIndex(e => e.key.type === key.type && (e.key.type === 'primitive' ? e.key.value === key.value : e.key.refId === key.refId));
                if (idx !== -1) {
                  const old = heapObj.entries[idx].value;
                  heapObj.entries.splice(idx, 1);
                  this.addStep(expr.line, `map.remove(${key.type === 'primitive' ? key.value : `ref@${key.refId}`})`);
                  return old;
                }
                return { type: 'primitive', value: null };
              }
              case 'size': return { type: 'primitive', value: heapObj.entries.length };
              case 'isEmpty': return { type: 'primitive', value: heapObj.entries.length === 0 };
              case 'clear':
                heapObj.entries = [];
                this.addStep(expr.line, `map.clear()`);
                return { type: 'primitive', value: null };
              case 'keySet': {
                const keys = heapObj.entries.map(e => e.key);
                const refId = this.allocateHeap({
                  type: 'set',
                  className: 'HashSet',
                  elements: keys
                });
                return { type: 'reference', refId };
              }
              case 'values': {
                const vals = heapObj.entries.map(e => e.value);
                const refId = this.allocateHeap({
                  type: 'list',
                  className: 'ArrayList',
                  elements: vals
                });
                return { type: 'reference', refId };
              }
            }
          }

          if (heapObj.type === 'set') {
            switch (expr.methodName) {
              case 'add': {
                const val = argsVal[0];
                const idx = heapObj.elements.findIndex(e => e.type === val.type && (e.type === 'primitive' ? e.value === val.value : e.refId === val.refId));
                if (idx === -1) {
                  heapObj.elements.push(val);
                  this.addStep(expr.line, `set.add(${val.type === 'primitive' ? val.value : `ref@${val.refId}`})`);
                  return { type: 'primitive', value: true };
                }
                return { type: 'primitive', value: false };
              }
              case 'contains': {
                const val = argsVal[0];
                const exists = heapObj.elements.some(e => e.type === val.type && (e.type === 'primitive' ? e.value === val.value : e.refId === val.refId));
                return { type: 'primitive', value: exists };
              }
              case 'remove': {
                const val = argsVal[0];
                const idx = heapObj.elements.findIndex(e => e.type === val.type && (e.type === 'primitive' ? e.value === val.value : e.refId === val.refId));
                if (idx !== -1) {
                  heapObj.elements.splice(idx, 1);
                  this.addStep(expr.line, `set.remove(${val.type === 'primitive' ? val.value : `ref@${val.refId}`})`);
                  return { type: 'primitive', value: true };
                }
                return { type: 'primitive', value: false };
              }
              case 'size': return { type: 'primitive', value: heapObj.elements.length };
              case 'isEmpty': return { type: 'primitive', value: heapObj.elements.length === 0 };
              case 'clear':
                heapObj.elements = [];
                this.addStep(expr.line, `set.clear()`);
                return { type: 'primitive', value: null };
            }
          }
        }
      }
    }

    // 4. General Method Call
    let targetRefId: number | null = null;
    let className = '';

    if (expr.object) {
      if (expr.object.type === 'Identifier' && this.classes[expr.object.name]) {
        className = expr.object.name;
      } else {
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
      const frame = this.getActiveFrame();
      if (frame.thisRef !== null) {
        targetRefId = frame.thisRef;
        const thisObj = this.heap[targetRefId];
        if (thisObj && thisObj.type === 'object') {
          className = thisObj.className;
        }
      } else {
        const activeMethod = frame.methodName;
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
      case '?':
        return 1;
      case '||':
        return 2;
      case '&&':
        return 3;
      case '==':
      case '!=':
        return 4;
      case '<':
      case '<=':
      case '>':
      case '>=':
      case 'instanceof':
        return 5;
      case '|':
        return 6;
      case '^':
        return 7;
      case '&':
        return 8;
      case '<<':
      case '>>':
      case '>>>':
        return 9;
      case '+':
      case '-':
        return 10;
      case '*':
      case '/':
      case '%':
        return 11;
      default:
        return 0;
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

// Thrown when a `break` statement is hit inside a loop
class BreakException {
  line: number;
  constructor(line: number) { this.line = line; }
}

// Thrown when a `continue` statement is hit inside a loop
class ContinueException {
  line: number;
  constructor(line: number) { this.line = line; }
}

class ExitException {
  code: number;
  line: number;
  constructor(code: number, line: number) {
    this.code = code;
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
      if (e instanceof ExitException) {
        return {
          trace: interpreter.getTrace(),
          error: e.code === 0 ? null : `Program exited with code ${e.code}`,
          errorType: e.code === 0 ? null : 'runtime'
        };
      }
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

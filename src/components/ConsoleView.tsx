import React, { useEffect, useRef, useState } from 'react';
import { usePlayback } from '../state/PlaybackContext';
import { Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface EvalLog {
  stepId: number;
  expr: string;
  result: string;
}

export const ConsoleView: React.FC = () => {
  const { activeStep } = usePlayback();
  const output = activeStep?.output || '';
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [evalLogs, setEvalLogs] = useState<EvalLog[]>([]);
  const [evalInput, setEvalInput] = useState('');

  // Auto-scroll to bottom when output or logs change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output, evalLogs]);

  const lines = output.split('\n').filter(Boolean);

  const evaluateExpression = (expr: string, step: any): string => {
    if (!step || !step.stack || step.stack.length === 0) {
      return 'Error: No active execution state';
    }
    const topFrame = step.stack[step.stack.length - 1];
    const variables = topFrame.variables || {};
    const heap = step.heap || {};

    // Helper to recursively resolve stack reference/primitive values to standard JS types
    function resolveValue(val: any): any {
      if (!val) return null;
      if (val.type === 'primitive') {
        return val.value;
      }
      if (val.type === 'reference') {
        if (val.refId === null) return null;
        const heapObj = heap[val.refId];
        if (!heapObj) return `ref@${val.refId}`;
        if (heapObj.type === 'array') {
          return heapObj.values.map((cell: any) => resolveValue(cell.value));
        }
        if (heapObj.type === 'object') {
          const resolvedObj: any = {};
          Object.entries(heapObj.fields).forEach(([fieldName, fieldState]: [string, any]) => {
            resolvedObj[fieldName] = resolveValue(fieldState.value);
          });
          return resolvedObj;
        }
      }
      return val;
    }

    // Build context object
    const context: any = {};
    Object.entries(variables).forEach(([name, varState]: [string, any]) => {
      context[name] = resolveValue(varState.value);
    });

    try {
      // Sanitize input expression: restrict characters to letters, numbers, operators, brackets, dots, space
      const sanitizedExpr = expr.replace(/[^a-zA-Z0-9+\-*/%()\[\]\s.?:=!&|<>]/g, '');
      if (!sanitizedExpr.trim()) {
        return 'Error: Invalid characters in expression';
      }

      // Safe JS evaluation wrapper
      const varNames = Object.keys(context);
      const varValues = Object.values(context);
      
      const evaluator = new Function(...varNames, `return (${sanitizedExpr});`);
      const result = evaluator(...varValues);

      if (result === undefined) return 'undefined';
      if (result === null) return 'null';
      if (typeof result === 'object') return JSON.stringify(result);
      return String(result);
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  };

  const handleEvalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!evalInput.trim() || !activeStep) return;

    const res = evaluateExpression(evalInput, activeStep);
    setEvalLogs((prev) => [
      ...prev,
      {
        stepId: activeStep.stepId,
        expr: evalInput.trim(),
        result: res
      }
    ]);
    setEvalInput('');
  };

  // Get active step's custom interactive evaluations
  const activeStepLogs = evalLogs.filter((log) => log.stepId === activeStep?.stepId);

  return (
    <div className="flex flex-col h-full frosted-glass-card rounded-2xl overflow-hidden">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4.5 py-3 bg-zinc-900/60 border-b border-zinc-750 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-bold font-mono text-zinc-300 tracking-wider uppercase">
            Console Output
          </span>
        </div>
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700/60"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-600/60"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-500/60"></span>
        </div>
      </div>

      {/* Terminal Body */}
      <div ref={scrollRef} className="flex-1 p-4 bg-black text-[11px] font-mono overflow-auto leading-relaxed select-text">
        {output === '' && activeStepLogs.length === 0 ? (
          <div className="text-zinc-650 italic select-none flex items-center gap-2">
            <span className="text-zinc-700">$</span>
            No stdout output yet. Run print statements or type expressions below.
          </div>
        ) : (
          <div className="space-y-0.5">
            <AnimatePresence initial={false}>
              {/* Stdout Lines */}
              {lines.map((line, i) => (
                <motion.div
                  key={`stdout-${i}-${line}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-start gap-2"
                >
                  <span className="text-zinc-700 select-none shrink-0">{i === lines.length - 1 ? '>' : ' '}</span>
                  <span className="text-white whitespace-pre-wrap">{line}</span>
                </motion.div>
              ))}

              {/* REPL Expression Logs */}
              {activeStepLogs.map((log, i) => (
                <motion.div
                  key={`eval-${i}-${log.expr}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col gap-0.5 mt-1.5 border-l-2 border-white/20 pl-2 bg-white/[0.02] py-1 rounded"
                >
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <span className="text-zinc-500 font-bold select-none text-[9px] uppercase tracking-wider">EXPR:</span>
                    <span className="text-zinc-350">{log.expr}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-white">
                    <span className="text-zinc-600 font-bold select-none text-[9px] uppercase tracking-wider">EVAL:</span>
                    <span className="text-white font-extrabold">{log.result}</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <span className="inline-block w-1.5 h-3.5 bg-white animate-cursor ml-4 align-middle"></span>
          </div>
        )}
      </div>

      {/* Interactive REPL Input Footer */}
      <form onSubmit={handleEvalSubmit} className="flex items-center gap-2 px-4.5 py-2.5 bg-zinc-950 border-t border-zinc-900 shrink-0">
        <span className="text-white font-mono text-[10px] font-black select-none tracking-wider uppercase">expr $</span>
        <input
          type="text"
          value={evalInput}
          onChange={(e) => setEvalInput(e.target.value)}
          placeholder={activeStep ? "Type Java expression to evaluate (e.g. nums[mid] or low < high)" : "Visualize code to evaluate expressions"}
          disabled={!activeStep}
          className="flex-1 bg-transparent text-white text-[11px] font-mono outline-none placeholder-zinc-800"
        />
      </form>
    </div>
  );
};

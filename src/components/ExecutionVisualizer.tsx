import React, { useEffect, useRef } from 'react';
import { usePlayback } from '../state/PlaybackContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, ArrowRight, GitBranch, Code2, Zap, Box, Terminal, ArrowUpRight, ArrowDownRight, Hash, Layers } from 'lucide-react';
import { AINarrator } from './AINarrator';

// Grayscale classifications for step explanations
function getStepMeta(explanation: string): {
  icon: React.ReactNode;
  label: string;
  color: string; // subtle accent for the icon background
} {
  const e = explanation.toLowerCase();
  
  if (e.includes('start') || e.includes('finished')) {
    return { icon: <Zap className="w-3.5 h-3.5" />, label: e.includes('finished') || e.includes('end') ? 'END' : 'START', color: 'border-zinc-500' };
  }
  if (e.includes('end ')) {
    return { icon: <Zap className="w-3.5 h-3.5" />, label: 'END', color: 'border-zinc-500' };
  }
  if (e.includes('loop')) {
    return { icon: <GitBranch className="w-3.5 h-3.5" />, label: 'LOOP', color: 'border-zinc-600' };
  }
  if (e.includes('if ') || e.includes('condition')) {
    return { icon: <GitBranch className="w-3.5 h-3.5" />, label: 'BRANCH', color: 'border-zinc-600' };
  }
  if (e.includes('declare') || e.includes('new ')) {
    return { icon: <Box className="w-3.5 h-3.5" />, label: 'CREATE', color: 'border-zinc-600' };
  }
  if (e.includes('set ') || e.includes('=')) {
    return { icon: <Box className="w-3.5 h-3.5" />, label: 'UPDATE', color: 'border-zinc-600' };
  }
  if (e.includes('call ') || e.includes('run ')) {
    return { icon: <Code2 className="w-3.5 h-3.5" />, label: 'CALL', color: 'border-zinc-600' };
  }
  if (e.includes('returned') || e.includes('done')) {
    return { icon: <Code2 className="w-3.5 h-3.5" />, label: 'RETURN', color: 'border-zinc-600' };
  }
  if (e.includes('print')) {
    return { icon: <Terminal className="w-3.5 h-3.5" />, label: 'PRINT', color: 'border-zinc-600' };
  }
  return { icon: <ArrowRight className="w-3.5 h-3.5" />, label: 'STEP', color: 'border-zinc-700' };
}

// Extract changed variable info from a step
function getChangedVar(step: any): string | null {
  if (!step.changedElement) return null;
  const ch = step.changedElement;
  if (ch.type === 'stack' && ch.varName) {
    const frame = step.stack?.find((f: any) => f.id === ch.frameId);
    if (frame && frame.variables[ch.varName]) {
      const v = frame.variables[ch.varName].value;
      const val = v.type === 'primitive' ? String(v.value) : `ref@${v.refId}`;
      return `${ch.varName} = ${val}`;
    }
    return ch.varName;
  }
  if (ch.type === 'heap') {
    return `heap[${ch.refId}]${ch.field !== undefined ? `.${ch.field}` : ''}`;
  }
  return null;
}

function formatVarValue(v: any): string {
  if (!v) return 'null';
  if (v.type === 'primitive') {
    return v.value === null ? 'null' : String(v.value);
  } else {
    return v.refId === null ? 'null' : `ref@${v.refId}`;
  }
}

function getVarDiff(
  activeStep: any,
  prevStep: any | null
): { name: string; prevVal: string; newVal: string } | null {
  if (!activeStep.changedElement) return null;
  const ch = activeStep.changedElement;

  if (ch.type === 'stack' && ch.varName) {
    const activeFrame = activeStep.stack?.find((f: any) => f.id === ch.frameId);
    const activeVar = activeFrame?.variables[ch.varName];
    if (!activeVar) return null;

    const newVal = formatVarValue(activeVar.value);

    let prevVal = 'NEW';
    if (prevStep) {
      const prevFrame = prevStep.stack?.find((f: any) => f.id === ch.frameId);
      const prevVar = prevFrame?.variables[ch.varName];
      if (prevVar) {
        prevVal = formatVarValue(prevVar.value);
      }
    }

    return {
      name: ch.varName,
      prevVal,
      newVal
    };
  }

  if (ch.type === 'heap') {
    const refId = ch.refId;
    const field = ch.field;

    const activeObj = activeStep.heap?.[refId];
    if (!activeObj) return null;

    // Try to resolve variable name in the stack frame referencing this heap refId
    const activeFrame = activeStep.stack?.[activeStep.stack.length - 1];
    let parentName = `heap[${refId}]`;
    if (activeFrame) {
      const refVar = Object.values(activeFrame.variables).find(
        (v: any) => v.value.type === 'reference' && v.value.refId === refId
      );
      if (refVar) {
        parentName = (refVar as any).name;
      }
    }

    let name = `${parentName}`;
    let newVal = 'undefined';
    let prevVal = 'NEW';

    if (activeObj.type === 'object') {
      name = field !== undefined ? `${parentName}.${field}` : `object@${refId}`;
      const activeField = activeObj.fields?.[field];
      if (activeField) {
        newVal = formatVarValue(activeField.value);
      }

      if (prevStep) {
        const prevObj = prevStep.heap?.[refId];
        const prevField = prevObj?.fields?.[field];
        if (prevField) {
          prevVal = formatVarValue(prevField.value);
        }
      }
    } else if (activeObj.type === 'array') {
      name = field !== undefined ? `${parentName}[${field}]` : `array@${refId}`;
      const activeIdx = activeObj.values?.[field];
      if (activeIdx) {
        newVal = formatVarValue(activeIdx.value);
      }

      if (prevStep) {
        const prevObj = prevStep.heap?.[refId];
        const prevIdx = prevObj?.values?.[field];
        if (prevIdx) {
          prevVal = formatVarValue(prevIdx.value);
        }
      }
    }

    return {
      name,
      prevVal,
      newVal
    };
  }

  return null;
}

interface ParsedVisualStep {
  type: 'condition' | 'calculation' | 'print' | 'call' | 'return' | 'status';
  title: string;
  expression: string;
  values?: string;
  result?: string;
  isTrue?: boolean;
}

function parseVisualStep(explanation: string): ParsedVisualStep {
  const e = explanation.toLowerCase();

  // 1. Condition check pattern
  const condMatch = explanation.match(/(Check condition|Check loop condition):\s*(.+?)\s*\((.+?)\)\s*->\s*(true|false)/i);
  if (condMatch) {
    const isLoop = condMatch[1].toLowerCase().includes('loop');
    return {
      type: 'condition',
      title: isLoop ? 'Loop Condition' : 'Branch Condition',
      expression: condMatch[2],
      values: condMatch[3],
      result: condMatch[4].toUpperCase(),
      isTrue: condMatch[4] === 'true'
    };
  }

  // 2. Calculation (assignment/declaration) pattern
  const calcMatch = explanation.match(/(Declare|Set|Set field|Set\s*\[.+?\])\s+(.+?)\s*=\s*(.+?)\s*\(via\s+(.+?)\s*=\s*(.+?)\)/i);
  if (calcMatch) {
    const action = calcMatch[1];
    const varName = calcMatch[2];
    const outcome = calcMatch[3];
    const expr = calcMatch[4];
    const valExpr = calcMatch[5];
    return {
      type: 'calculation',
      title: action.startsWith('Declare') ? 'Variable Declaration' : 'Variable Assignment',
      expression: `${varName} = ${expr}`,
      values: `${varName} = ${valExpr}`,
      result: outcome
    };
  }

  // 3. Print
  if (explanation.startsWith('Print "') && explanation.endsWith('"')) {
    const content = explanation.substring(7, explanation.length - 1);
    return {
      type: 'print',
      title: 'Console Print',
      expression: content
    };
  }

  // 4. Call
  if (explanation.startsWith('Call ')) {
    return {
      type: 'call',
      title: 'Method Call',
      expression: explanation.substring(5)
    };
  }

  // 5. Return
  if (explanation.startsWith('Returned')) {
    return {
      type: 'return',
      title: 'Method Return',
      expression: explanation
    };
  }

  // 6. Fallback Status / Action
  let title = 'Step Detail';
  if (e.includes('start')) title = 'Execution Start';
  else if (e.includes('finished')) title = 'Execution Finished';
  else if (e.includes('loop')) title = 'Loop State';
  else if (e.includes('condition') || e.includes('if ')) title = 'Branch State';
  else if (e.includes('declare')) title = 'Variable Declaration';
  else if (e.includes('set ')) title = 'Variable Assignment';

  return {
    type: 'status',
    title,
    expression: explanation
  };
}

// Get a mini icon for the diff box based on change direction
function getDiffIcon(prevVal: string, newVal: string) {
  if (prevVal === 'NEW') return <Layers className="w-3 h-3 text-zinc-500" />;
  const pNum = parseFloat(prevVal);
  const nNum = parseFloat(newVal);
  if (!isNaN(pNum) && !isNaN(nNum)) {
    if (nNum > pNum) return <ArrowUpRight className="w-3 h-3 text-zinc-400" />;
    if (nNum < pNum) return <ArrowDownRight className="w-3 h-3 text-zinc-400" />;
  }
  return <Hash className="w-3 h-3 text-zinc-500" />;
}


export const ExecutionVisualizer: React.FC = () => {
  const { trace, currentStepIndex, activeStep, goToStep } = usePlayback();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTimelineRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the timeline to the active index
  useEffect(() => {
    if (activeTimelineRef.current) {
      activeTimelineRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentStepIndex]);

  const hasTrace = trace.length > 0;
  const progress = hasTrace ? ((currentStepIndex + 1) / trace.length) * 100 : 0;

  return (
    <div className="flex flex-col h-full frosted-glass-card rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/60 border-b border-zinc-750 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-white animate-pulse" />
          <span className="text-xs font-bold font-mono text-zinc-300 tracking-wider uppercase">
            Execution Flow
          </span>
        </div>
      </div>

      {/* Trace Progress Bar */}
      {hasTrace && (
        <div className="h-0.5 bg-zinc-900 shrink-0 relative overflow-hidden">
          <motion.div
            className="h-full bg-white shadow-[0_0_8px_#ffffff]"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
          {/* Shimmer overlay on the progress bar */}
          <motion.div
            className="absolute top-0 h-full w-12 bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none"
            animate={{ left: ['-48px', '100%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear', repeatDelay: 1 }}
          />
        </div>
      )}

      {/* Main visualizer area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {!hasTrace ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
              className="p-4 rounded-full border border-dashed border-zinc-800 text-zinc-700"
            >
              <Activity className="w-8 h-8" />
            </motion.div>
            <div className="space-y-1">
              <h4 className="text-xs font-mono font-bold text-zinc-400 uppercase">Engine Inactive</h4>
              <p className="text-[11px] text-zinc-650 font-mono leading-relaxed max-w-[200px]">
                Click the <span className="text-white font-bold">Visualize</span> button to parse and trace code execution.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* 1. STAGE: Active step details with impressive transitions */}
            <div className="p-4 border-b border-zinc-800 bg-black/40 relative overflow-hidden shrink-0">
              <AnimatePresence mode="wait">
                {activeStep && (
                  <motion.div
                    key={activeStep.stepId}
                    initial={{ opacity: 0, y: 15, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -15, scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                    className="relative p-4 rounded-xl border border-zinc-750 bg-zinc-900 shadow-md min-h-[115px] h-auto flex flex-col justify-between overflow-hidden"
                  >
                    {/* Scanner Sweep Line Animation */}
                    <motion.div
                      initial={{ top: '0%' }}
                      animate={{ top: '100%' }}
                      transition={{ duration: 0.7, ease: 'easeInOut' }}
                      className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none z-10"
                    />

                    {/* Corner glow */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0.15, 0] }}
                      transition={{ duration: 1.5, ease: 'easeOut' }}
                      className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-white/20 blur-2xl pointer-events-none"
                    />

                    {/* Step Type & Line */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 text-zinc-400">
                        <motion.span
                          initial={{ rotate: -90, scale: 0 }}
                          animate={{ rotate: 0, scale: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 15, delay: 0.1 }}
                          className="text-zinc-400"
                        >
                          {getStepMeta(activeStep.explanation).icon}
                        </motion.span>
                        <motion.span
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.15 }}
                          className="text-[10px] font-mono font-bold tracking-wider"
                        >
                          {getStepMeta(activeStep.explanation).label}
                        </motion.span>
                      </div>
                      <motion.span
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1, type: 'spring', stiffness: 400 }}
                        className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-wider"
                      >
                        Line {activeStep.line}
                      </motion.span>
                    </div>

                    {/* Explanation Content */}
                    {(() => {
                      const parsed = parseVisualStep(activeStep.explanation);
                      return (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.12 }}
                          className="flex flex-col gap-1.5 w-full py-1"
                        >
                          {/* Title Label */}
                          <span className="text-[9px] font-bold text-zinc-550 uppercase tracking-wider font-mono">
                            {parsed.title}
                          </span>
                          
                          {/* Inner Card Block */}
                          <div className="flex items-center justify-between bg-zinc-950/80 border border-zinc-850 p-2.5 rounded-lg w-full gap-3">
                            {parsed.type === 'condition' && (
                              <>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-mono font-semibold text-zinc-200 truncate">
                                    {parsed.expression}
                                  </span>
                                  <span className="text-[10px] font-mono text-zinc-500 mt-0.5 truncate">
                                    {parsed.values}
                                  </span>
                                </div>
                                <motion.span
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{ type: 'spring', stiffness: 600, damping: 15, delay: 0.2 }}
                                  className={`text-[10px] font-mono font-extrabold shrink-0 ${
                                    parsed.isTrue 
                                      ? 'text-white' 
                                      : 'text-zinc-500'
                                  }`}
                                >
                                  {parsed.result}
                                </motion.span>
                              </>
                            )}

                            {parsed.type === 'calculation' && (
                              <>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-mono font-semibold text-zinc-200 truncate">
                                    {parsed.expression}
                                  </span>
                                  <span className="text-[10px] font-mono text-zinc-500 mt-0.5 truncate">
                                    {parsed.values}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 font-mono text-[10px]">
                                  <span className="text-zinc-650 font-bold">=</span>
                                  <motion.span
                                    initial={{ scale: 0, rotate: -10 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 15, delay: 0.2 }}
                                    className="font-mono font-extrabold text-white text-xs"
                                  >
                                    {parsed.result}
                                  </motion.span>
                                </div>
                              </>
                            )}

                            {parsed.type === 'print' && (
                              <div className="flex items-center gap-2 text-zinc-200 font-mono text-xs py-0.5">
                                <motion.span
                                  animate={{ opacity: [1, 0.4, 1] }}
                                  transition={{ duration: 1.5, repeat: Infinity }}
                                  className="text-zinc-500 font-bold"
                                >$</motion.span>
                                <span className="text-white font-semibold">{parsed.expression}</span>
                              </div>
                            )}

                            {(parsed.type === 'call' || parsed.type === 'return' || parsed.type === 'status') && (
                              <p className="text-xs font-mono font-semibold text-zinc-200 leading-relaxed py-0.5">
                                {parsed.expression}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      );
                    })()}

                    {/* State Changes Diff Box */}
                    {(() => {
                      const prevStep = currentStepIndex > 0 ? trace[currentStepIndex - 1] : null;
                      const diff = getVarDiff(activeStep, prevStep);
                      if (!diff) return null;
                      const isNew = diff.prevVal === 'NEW';
                      return (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.18, type: 'spring', stiffness: 300, damping: 20 }}
                          className="flex flex-col gap-1.5 w-full py-1 mt-2 border-t border-zinc-900/60"
                        >
                          <div className="flex items-center gap-1.5">
                            {getDiffIcon(diff.prevVal, diff.newVal)}
                            <span className="text-[9px] font-bold text-zinc-550 uppercase tracking-wider font-mono">
                              {isNew ? 'Variable Created' : 'State Mutation'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between bg-zinc-950/80 border border-zinc-850 p-2.5 rounded-lg w-full gap-3">
                            <span className="text-xs font-mono font-semibold text-zinc-200 truncate">
                              {diff.name}
                            </span>
                            <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
                              <span className="text-zinc-450 italic">{diff.prevVal}</span>
                              <span className="text-zinc-650 font-bold">➔</span>
                              <span className="text-white font-extrabold">{diff.newVal}</span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })()}
                  </motion.div>
                )}
              </AnimatePresence>
              <AINarrator />
            </div>

            {/* 2. TIMELINE: Complete trace logs with positions sliding */}
            <div 
              ref={containerRef} 
              className="flex-1 overflow-y-auto p-4 space-y-2.5 scroll-smooth"
            >
              <div className="text-[9px] font-mono font-bold tracking-wider text-zinc-600 uppercase mb-3">
                Execution Timeline
              </div>
              <div className="relative border-l border-zinc-800 pl-4 ml-2.5 space-y-3 pb-8">
                {trace.map((step, idx) => {
                  const isActive = idx === currentStepIndex;
                  const isPast = idx < currentStepIndex;
                  const changed = getChangedVar(step);

                  return (
                    <div
                      key={step.stepId}
                      ref={isActive ? activeTimelineRef : undefined}
                      onClick={() => goToStep(idx)}
                      className={`
                        group relative flex items-start gap-3 p-2.5 rounded-xl border text-left cursor-pointer transition-all duration-300
                        ${isActive
                          ? 'bg-zinc-900 border-zinc-700 text-white shadow-md scale-[1.01]'
                          : isPast
                          ? 'bg-zinc-900/10 border-zinc-900/30 text-zinc-350 opacity-80 hover:opacity-100 hover:border-zinc-700'
                          : 'bg-zinc-950/5 border-transparent text-zinc-500 opacity-55 hover:opacity-80'}
                      `}
                    >
                      {/* Timeline dot connector */}
                      <span className={`
                        absolute -left-[21.5px] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border transition-all duration-300
                        ${isActive 
                          ? 'bg-white border-white scale-125 shadow-[0_0_8px_#ffffff]' 
                          : 'bg-zinc-950 border-zinc-750'}
                      `} />
                      {/* Pulse ring behind active dot */}
                      {isActive && (
                        <motion.span
                          animate={{ scale: [1, 2.5], opacity: [0.4, 0] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                          className="absolute -left-[23.5px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white/30 pointer-events-none"
                        />
                      )}

                      {/* Step index */}
                      <div className="text-[10px] font-mono font-bold text-zinc-550 select-none shrink-0 pt-0.5">
                        #{step.stepId + 1}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[10px] font-mono font-bold ${isActive ? 'text-white' : 'text-zinc-500'}`}>
                            Line {step.line}
                          </span>
                        </div>
                        
                        <p className="text-[11px] font-mono leading-relaxed break-words">
                          {step.explanation}
                        </p>

                        {isActive && changed && (
                          <motion.div
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="mt-1 text-[10px] font-mono text-zinc-350 flex items-center gap-1"
                          >
                            <span className="text-zinc-600">→</span> {changed}
                          </motion.div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Removed footer stats bar */}
    </div>
  );
};

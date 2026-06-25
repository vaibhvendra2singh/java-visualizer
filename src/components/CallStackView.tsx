import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayback } from '../state/PlaybackContext';
import type { StackFrame, VariableState } from '../interpreter/types';

export const CallStackView: React.FC = () => {
  const { activeStep } = usePlayback();
  const stack = activeStep?.stack || [];

  return (
    <div className="flex flex-col h-full frosted-glass-card p-4 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-zinc-750 pb-2 shrink-0">
        <h3 className="text-xs font-bold text-zinc-300 tracking-wider uppercase font-mono">
          Call Stack
        </h3>
      </div>

      {/* Stack Frames */}
      <div id="call-stack-frame-list" className="flex flex-col gap-4 relative flex-1 overflow-y-auto pr-1">
        {stack.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 font-mono text-xs text-center p-6">
            <motion.span
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="opacity-40 text-3xl mb-2"
            >📥</motion.span>
            Stack is empty. Click "Visualize" to execute.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {[...stack].reverse().map((frame, idx) => {
              const originalIndex = stack.length - 1 - idx;
              return (
                <StackFrameCard
                  key={frame.id}
                  frame={frame}
                  depth={originalIndex}
                  isTop={originalIndex === stack.length - 1}
                  index={idx}
                />
              );
            })}
          </AnimatePresence>
        )}
      </div>

    </div>
  );
};

const StackFrameCard: React.FC<{
  frame: StackFrame;
  depth: number;
  isTop: boolean;
  index: number;
}> = ({ frame, depth, isTop, index }) => {
  const { activeStep } = usePlayback();
  const variables = Object.values(frame.variables);

  const getLeftBorderColor = (d: number) => {
    const colors = [
      'border-l-zinc-700',
      'border-l-zinc-550',
      'border-l-zinc-400',
      'border-l-zinc-250',
      'border-l-white'
    ];
    if (isTop) return 'border-l-white';
    return colors[Math.min(d, colors.length - 1)];
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 50, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 450, damping: 22, delay: index * 0.04 }}
      className={`border border-l-4 ${getLeftBorderColor(depth)} rounded-xl overflow-hidden shadow-md transition-all duration-200 shrink-0 ${
        isTop
          ? 'border-zinc-700 bg-zinc-900/60 shadow-sm'
          : 'border-zinc-850 bg-zinc-950/40'
      }`}
    >
      {/* Header bar */}
      <div
        className={`px-3.5 py-2 font-mono text-xs font-semibold flex items-center justify-between border-b ${
          isTop
            ? 'bg-zinc-800/50 text-white border-zinc-700'
            : 'bg-zinc-950/40 text-zinc-400 border-zinc-850'
        }`}
      >
        <div className="flex items-center gap-1.5">
          {isTop && (
            <motion.span
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-white inline-block"
            />
          )}
          <span className="truncate">{frame.methodName}()</span>
        </div>
        <span className="text-[9px] opacity-50 font-normal">depth: {depth}</span>
      </div>

      {/* Frame content */}
      <div className="p-3">
        {variables.length === 0 && !frame.thisRef ? (
          <div className="text-[10px] text-zinc-500 font-mono italic py-1">
            No local variables
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Render "this" */}
            {frame.thisRef !== null && (
              <VariableRow
                varState={{
                  name: 'this',
                  type: 'reference',
                  value: { type: 'reference', refId: frame.thisRef }
                }}
                frameId={frame.id}
                isChanged={
                  activeStep?.changedElement?.type === 'stack' &&
                  activeStep?.changedElement?.frameId === frame.id &&
                  activeStep?.changedElement?.varName === 'this'
                }
              />
            )}

            {/* Render other local variables */}
            {variables.map((v, vi) => (
              <motion.div
                key={v.name}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: vi * 0.03 }}
              >
                <VariableRow
                  varState={v}
                  frameId={frame.id}
                  isChanged={
                    activeStep?.changedElement?.type === 'stack' &&
                    activeStep?.changedElement?.frameId === frame.id &&
                    activeStep?.changedElement?.varName === v.name
                  }
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const VariableRow: React.FC<{
  varState: VariableState;
  frameId: string;
  isChanged?: boolean;
}> = ({ varState, frameId, isChanged }) => {
  const { currentStepIndex, hoveredRefId, setHoveredRefId } = usePlayback();
  const { name, type, value } = varState;
  const elementId = `stack-var-${frameId}-${name}`;

  const isRef = value.type === 'reference';
  const isHovered = isRef && value.refId !== null && value.refId === hoveredRefId;

  const getValueStr = () => {
    if (value.type === 'primitive') {
      return value.value === null
        ? 'null'
        : typeof value.value === 'string'
        ? `"${value.value}"`
        : String(value.value);
    } else {
      return value.refId === null ? 'null' : `ref@${value.refId}`;
    }
  };

  return (
    <div 
      onMouseEnter={() => {
        if (isRef && value.refId !== null) {
          setHoveredRefId(value.refId);
        }
      }}
      onMouseLeave={() => {
        if (isRef) {
          setHoveredRefId(null);
        }
      }}
      className={`flex items-center justify-between text-xs font-mono py-1.5 border-b border-zinc-800/30 last:border-b-0 relative rounded-md transition-all duration-300 ${
        isChanged ? 'bg-white/[0.03]' : ''
      } ${
        isHovered ? 'bg-white/[0.08] px-1 border-white/20' : ''
      }`}
    >
      <div className="flex flex-col min-w-0 pr-2">
        <span className={`font-semibold truncate text-[11px] transition-colors duration-250 ${isHovered ? 'text-white' : 'text-zinc-250'}`}>
          {name}
        </span>
        <span className="text-[9px] text-zinc-400 opacity-80">
          {type}
        </span>
      </div>

      <motion.div
        id={elementId}
        animate={isChanged ? {
          backgroundColor: ['rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0)'],
          scale: [1, 1.05, 1, 1.05, 1],
          transition: { duration: 0.8 }
        } : {}}
        className={`flex items-center justify-end px-2 py-0.5 rounded border min-w-[70px] text-right transition-all duration-300 ${
          isHovered
            ? 'bg-white text-black border-white shadow-[0_0_12px_rgba(255,255,255,0.45)] scale-[1.03]'
            : isChanged
            ? 'bg-zinc-900 border-zinc-600'
            : 'bg-zinc-950 border-zinc-850'
        }`}
      >
        {value.type === 'primitive' ? (
          <span className="text-white font-bold truncate text-[11px]">
            {value.value === null
              ? 'null'
              : typeof value.value === 'string'
              ? `"${value.value}"`
              : typeof value.value === 'boolean'
              ? String(value.value)
              : String(value.value)}
          </span>
        ) : (
          <div className="flex items-center gap-1.5 justify-end">
            {value.refId === null ? (
              <span className="text-zinc-650 text-[11px]">null</span>
            ) : (
              <>
                <span className={`text-[10px] font-bold transition-colors duration-300 ${isHovered ? 'text-black' : 'text-white'}`}>
                  ref@{value.refId}
                </span>
                <span className={`w-2 h-2 rounded-full border inline-block transition-all duration-300 ${
                  isHovered 
                    ? 'bg-black border-black shadow-[0_0_8px_rgba(0,0,0,0.6)]' 
                    : 'bg-white border-zinc-400 shadow-[0_0_8px_rgba(255,255,255,0.4)]'
                }`}></span>
              </>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};

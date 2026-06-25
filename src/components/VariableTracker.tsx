import React from 'react';
import { motion } from 'framer-motion';
import { usePlayback } from '../state/PlaybackContext';
import { Eye, Hash } from 'lucide-react';

export const VariableTracker: React.FC = () => {
  const { activeStep, hoveredRefId, setHoveredRefId } = usePlayback();
  
  // Get variables from the active (topmost) frame
  const stack = activeStep?.stack || [];
  const activeFrame = stack[stack.length - 1];
  const variables = activeFrame ? Object.values(activeFrame.variables) : [];
  const changedVarName = activeStep?.changedElement?.type === 'stack' ? activeStep.changedElement.varName : null;

  return (
    <div className="flex flex-col h-full frosted-glass-card p-4 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-zinc-750 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <Eye className="w-3.5 h-3.5 text-zinc-400" />
          <h3 className="text-xs font-bold text-zinc-300 tracking-wider uppercase font-mono">
            Variable Watch
          </h3>
        </div>
      </div>

      {/* Variables List */}
      <div className="flex-1 overflow-y-auto pr-1">
        {variables.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-650 font-mono text-[11px] text-center p-4">
            <Hash className="w-6 h-6 mb-1.5 opacity-30 text-zinc-600" />
            No primitive/local variables active.
          </div>
        ) : (
          <div className="space-y-2">
            {variables.map((v, i) => {
              const isChanged = changedVarName === v.name;
              const isHovered = v.value.type === 'reference' && v.value.refId !== null && v.value.refId === hoveredRefId;
              const valStr = v.value.type === 'primitive'
                ? v.value.value === null ? 'null' : String(v.value.value)
                : v.value.refId === null ? 'null' : `ref@${v.value.refId}`;

              return (
                <motion.div
                  key={v.name}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onMouseEnter={() => {
                    if (v.value.type === 'reference' && v.value.refId !== null) {
                      setHoveredRefId(v.value.refId);
                    }
                  }}
                  onMouseLeave={() => {
                    if (v.value.type === 'reference') {
                      setHoveredRefId(null);
                    }
                  }}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all duration-300 ${
                    isHovered
                      ? 'bg-white/[0.08] border-white shadow-[0_0_12px_rgba(255,255,255,0.15)] scale-[1.01]'
                      : isChanged
                      ? 'bg-white/[0.04] border-zinc-600 shadow-[0_0_10px_rgba(255,255,255,0.03)]'
                      : 'bg-zinc-900/30 border-zinc-850 hover:border-zinc-800'
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className={`text-xs font-mono font-semibold truncate transition-colors duration-250 ${isHovered ? 'text-white' : 'text-zinc-200'}`}>
                      {v.name}
                    </span>
                    <span className="text-[9px] font-mono text-zinc-500 uppercase mt-0.5">
                      {v.type}
                    </span>
                  </div>

                  <motion.div
                    animate={isChanged ? {
                      scale: [1, 1.04, 1],
                      transition: { duration: 0.4 }
                    } : {}}
                    className={`px-2.5 py-1 rounded-lg border font-mono text-xs font-bold transition-all duration-300 ${
                      isHovered
                        ? 'bg-white text-black border-white shadow-[0_0_12px_rgba(255,255,255,0.45)]'
                        : isChanged
                        ? 'bg-white text-black border-white shadow-[0_0_8px_rgba(255,255,255,0.15)]'
                        : 'bg-zinc-950 border-zinc-850 text-zinc-300'
                    }`}
                  >
                    {valStr}
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

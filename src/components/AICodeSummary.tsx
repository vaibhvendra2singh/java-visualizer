import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, Eye } from 'lucide-react';
import { useAI } from '../state/AIContext';

export const AICodeSummary: React.FC = () => {
  const { codeAnalysis, isAnalyzing, aiEnabled } = useAI();

  if (!aiEnabled) return null;

  return (
    <AnimatePresence>
      {isAnalyzing && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-900/40 border-b border-zinc-800/50 text-[10px] font-mono text-zinc-500 overflow-hidden"
        >
          <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />
          <span>AI analyzing code...</span>
        </motion.div>
      )}

      {codeAnalysis && !isAnalyzing && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="border-b border-zinc-800/50 overflow-hidden"
        >
          <div className="px-3.5 py-3 bg-gradient-to-r from-zinc-950/80 via-zinc-900/40 to-zinc-950/80 space-y-2.5">
            {/* Summary line */}
            <div className="flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
              <p className="text-[11px] font-mono text-zinc-200 leading-relaxed font-medium">
                {codeAnalysis.summary}
              </p>
            </div>

            {/* What to watch */}
            {codeAnalysis.whatToWatch && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="flex items-start gap-2"
              >
                <Eye className="w-3.5 h-3.5 text-zinc-450 shrink-0 mt-0.5" />
                <p className="text-[10px] font-mono text-zinc-400 leading-relaxed italic">
                  {codeAnalysis.whatToWatch}
                </p>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

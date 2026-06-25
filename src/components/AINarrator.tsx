import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2 } from 'lucide-react';
import { useAI } from '../state/AIContext';
import { usePlayback } from '../state/PlaybackContext';

export const AINarrator: React.FC = () => {
  const { code, trace, currentStepIndex, activeStep } = usePlayback();
  const { getNarration, fetchNarrations, isNarrating, aiEnabled } = useAI();

  // Fetch narrations when stepping near uncached territory
  useEffect(() => {
    if (!aiEnabled || trace.length === 0) return;
    fetchNarrations(code, trace, currentStepIndex);
  }, [currentStepIndex, aiEnabled, trace, code, fetchNarrations]);

  if (!aiEnabled || !activeStep) return null;

  const narration = getNarration(activeStep.stepId);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`narration-${activeStep.stepId}`}
        initial={{ opacity: 0, y: 6, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -4, height: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="mt-3 overflow-hidden"
      >
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-gradient-to-r from-zinc-900/80 via-zinc-900/60 to-zinc-950/40 border border-zinc-800/60">
          {/* AI Icon */}
          <div className="shrink-0 mt-0.5">
            {isNarrating && !narration ? (
              <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
            ) : (
              <motion.div
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
              </motion.div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <span className="text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
              AI Tutor
            </span>
            {narration ? (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-[11px] text-zinc-200 font-mono leading-relaxed mt-0.5"
              >
                {narration}
              </motion.p>
            ) : isNarrating ? (
              <p className="text-[11px] text-zinc-450 font-mono italic mt-0.5">
                Thinking...
              </p>
            ) : (
              <p className="text-[11px] text-zinc-450 font-mono italic mt-0.5">
                Waiting for AI...
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

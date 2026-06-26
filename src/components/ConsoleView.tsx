import React, { useEffect, useRef } from 'react';
import { usePlayback } from '../state/PlaybackContext';
import { Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';



export const ConsoleView: React.FC = () => {
  const { activeStep } = usePlayback();
  const output = activeStep?.output || '';
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  const lines = output.split('\n').filter(Boolean);

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
        {output === '' ? (
          <div className="text-zinc-650 italic select-none flex items-center gap-2">
            <span className="text-zinc-700">#</span>
            No stdout output yet. Run print statements to see output here.
          </div>
        ) : (
          <div className="space-y-0.5">
            <AnimatePresence initial={false}>
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
            </AnimatePresence>
            <span className="inline-block w-1.5 h-3.5 bg-white animate-cursor ml-4 align-middle"></span>
          </div>
        )}
      </div>


    </div>
  );
};

import React, { useState } from 'react';
import { usePlayback } from '../state/PlaybackContext';
import { Keyboard } from 'lucide-react';

export const InputPanel: React.FC = () => {
  const { inputText, setInputText, isRunning } = usePlayback();
  const [localInput, setLocalInput] = useState(inputText);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalInput(e.target.value);
    setInputText(e.target.value);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950/40 border border-zinc-900 rounded-2xl overflow-hidden shadow-lg backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/60 border-b border-zinc-800/80 shrink-0">
        <div className="flex items-center gap-2">
          <Keyboard className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-bold font-mono text-zinc-300 tracking-wider uppercase">
            Input / Arguments
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-500 select-none">
          arrays: comma-separated · multi-param: one per line
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 relative bg-black">
        <textarea
          value={localInput}
          onChange={handleChange}
          disabled={isRunning}
          spellCheck={false}
          placeholder={`e.g.\n4, 2, 8, 1, 5\nor\n3\ntrue`}
          className={`w-full h-full resize-none p-4 bg-transparent text-[11px] font-mono leading-relaxed outline-none select-text
            ${isRunning ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-100 placeholder-zinc-700'}
          `}
        />
        {!isRunning && localInput === '' && (
          <div className="absolute bottom-3 right-3 text-[10px] font-mono text-zinc-700 pointer-events-none select-none">
            values used when Visualizing
          </div>
        )}
      </div>
    </div>
  );
};

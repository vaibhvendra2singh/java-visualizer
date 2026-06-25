import React from 'react';
import { usePlayback } from '../state/PlaybackContext';
import { motion } from 'framer-motion';
import {
  Play,
  Pause,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  SkipForward,
  SkipBack,
  Info,
  Gauge
} from 'lucide-react';

export const PlaybackControls: React.FC = () => {
  const {
    trace,
    currentStepIndex,
    isPlaying,
    playbackSpeed,
    activeStep,
    stepForward,
    stepBackward,
    goToStep,
    togglePlay,
    setPlaybackSpeed,
    reset
  } = usePlayback();

  const totalSteps = trace.length;
  const hasTrace = totalSteps > 0;

  const getSpeedLabel = (ms: number) => {
    if (ms <= 300) return 'Fast';
    if (ms <= 800) return 'Medium';
    if (ms <= 1500) return 'Slow';
    return 'Very Slow';
  };

  return (
    <div className="flex flex-col gap-3 w-full frosted-glass-card p-4 rounded-2xl">
      {/* Explanation Banner */}
      {hasTrace && activeStep && (
        <motion.div
          key={activeStep.stepId}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-2.5 px-3.5 py-2.5 bg-zinc-900/60 border border-zinc-750 rounded-xl text-xs text-zinc-300 font-mono relative overflow-hidden"
        >
          <Info className="w-4 h-4 text-zinc-400 shrink-0" />
          <span className="truncate leading-relaxed">{activeStep.explanation}</span>
          {/* Subtle gradient accent on the left */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-white/20 via-white/10 to-transparent rounded-l-xl" />
        </motion.div>
      )}
      {/* Main Playback Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Navigation Controls */}
        <div className="flex items-center gap-3">
          {/* Step Count Text */}
          <div className="font-mono text-xs text-zinc-400 select-none mr-1 font-bold">
            Step {hasTrace ? currentStepIndex + 1 : 0} / {totalSteps}
          </div>

          {/* Quick Nav Controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => goToStep(0)}
              disabled={!hasTrace || currentStepIndex === 0}
              title="First step"
              className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 hover:border-zinc-700 disabled:opacity-20 disabled:pointer-events-none transition-all duration-200 cursor-pointer"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={stepBackward}
              disabled={!hasTrace || currentStepIndex === 0}
              title="Step back"
              className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 hover:border-zinc-700 disabled:opacity-20 disabled:pointer-events-none transition-all duration-200 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <motion.button
              onClick={togglePlay}
              disabled={!hasTrace}
              title={isPlaying ? 'Pause auto-play' : 'Start auto-play'}
              whileTap={{ scale: 0.92 }}
              className={`p-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                isPlaying
                  ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white shadow-sm'
                  : 'bg-white border-zinc-200 hover:bg-zinc-200 text-black shadow-[0_0_12px_rgba(255,255,255,0.1)]'
              } disabled:opacity-20 disabled:pointer-events-none`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            </motion.button>
            <button
              onClick={stepForward}
              disabled={!hasTrace || currentStepIndex === totalSteps - 1}
              title="Step forward"
              className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 hover:border-zinc-700 disabled:opacity-20 disabled:pointer-events-none transition-all duration-200 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => goToStep(totalSteps - 1)}
              disabled={!hasTrace || currentStepIndex === totalSteps - 1}
              title="Last step"
              className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 hover:border-zinc-700 disabled:opacity-20 disabled:pointer-events-none transition-all duration-200 cursor-pointer"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={reset}
              disabled={!hasTrace}
              title="Reset visualizer"
              className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 hover:border-zinc-700 disabled:opacity-20 disabled:pointer-events-none transition-all duration-200 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Scrubber Slider */}
        <div className="flex-1 w-full md:mx-6 flex items-center gap-3 relative">
          <input
            type="range"
            min="0"
            max={hasTrace ? totalSteps - 1 : 0}
            value={currentStepIndex}
            onChange={(e) => goToStep(Number(e.target.value))}
            disabled={!hasTrace}
            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white disabled:opacity-30"
          />
        </div>

        {/* Speed Slider */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex flex-col items-end shrink-0 select-none">
            <div className="flex items-center gap-1">
              <Gauge className="w-3 h-3 text-zinc-600" />
              <span className="text-[9px] text-zinc-500 font-mono font-semibold uppercase tracking-wider">Delay</span>
            </div>
            <span className="text-xs font-mono font-semibold text-zinc-350">
              {playbackSpeed}ms ({getSpeedLabel(playbackSpeed)})
            </span>
          </div>
          <input
            type="range"
            min="200"
            max="2000"
            step="100"
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            className="w-20 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
          />
        </div>
      </div>
    </div>
  );
};

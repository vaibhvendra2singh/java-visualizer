import React, { useEffect } from 'react';
import { PlaybackProvider, usePlayback } from './state/PlaybackContext';
import { AIProvider } from './state/AIContext';
import { CodeEditor } from './components/CodeEditor';
import { ExecutionVisualizer } from './components/ExecutionVisualizer';
import { CallStackView } from './components/CallStackView';
import { HeapView } from './components/HeapView';
import { ConsoleView } from './components/ConsoleView';
import { PlaybackControls } from './components/PlaybackControls';
import { SvgArrows } from './components/SvgArrows';
import { Sun, Moon } from 'lucide-react';
import { VariableTracker } from './components/VariableTracker';
import { FloatingModules } from './components/FloatingModules';

const AppContent: React.FC = () => {
  const { theme, toggleTheme } = usePlayback();

  // Apply light-mode class to HTML root element
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  }, [theme]);
  

  return (
    <div className="flex flex-col h-screen w-screen ambient-bg text-zinc-100 overflow-hidden font-sans select-none transition-colors duration-300">
      {/* Top Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-zinc-950/15 border-b border-white/5 backdrop-blur-xl shrink-0 z-50 relative">
        {/* Subtle horizontal gradient accent */}
        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        
        {/* Centered Title */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <h1 className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-zinc-400 tracking-[0.35em] font-mono uppercase text-center relative select-none">
            JAVA CODE VISUALIZER
            {/* Subtle centering glow marker */}
            <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-10 h-[1.5px] bg-gradient-to-r from-transparent via-white/50 to-transparent shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
          </h1>
        </div>

        {/* Right Actions: Theme Toggle */}
        <div className="ml-auto z-10">
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="p-2 rounded-xl bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all duration-200 cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Split Layout */}
      <main className="flex-1 flex flex-row p-6 gap-6 overflow-hidden min-h-0">
        {/* Left 30%: Code Editor */}
        <div className="w-[30%] h-full overflow-hidden flex flex-col min-w-0">
          <CodeEditor />
        </div>

        {/* Middle 30%: Execution Trace Visualizer */}
        <div className="w-[30%] h-full overflow-hidden flex flex-col min-w-0">
          <ExecutionVisualizer />
        </div>

        {/* Right 40%: Memory Canvas + Console Output */}
        <div className="w-[40%] flex flex-col gap-6 h-full overflow-hidden min-w-0">
          {/* Top 80%: Call Stack & Heap Visualizer Space */}
          <div 
            id="visualizer-canvas"
            className="flex-[80] flex flex-col gap-4 relative overflow-hidden min-h-0"
          >
            {/* Dynamic SVG arrows layer */}
            <SvgArrows />

            {/* Top Row: Call Stack & Variable Watch (side-by-side) */}
            <div className="h-[50%] w-full flex flex-row gap-4 overflow-hidden">
              <div className="flex-[65] h-full overflow-hidden">
                <CallStackView />
              </div>
              <div className="flex-[35] h-full overflow-hidden">
                <VariableTracker />
              </div>
            </div>

            {/* Bottom Row: Heap Space (full width) */}
            <div className="h-[50%] w-full overflow-hidden">
              <HeapView />
            </div>
          </div>

          {/* Bottom 20%: Console Output */}
          <div className="flex-[20] overflow-hidden min-h-0">
            <ConsoleView />
          </div>
        </div>
      </main>

      {/* Playback Control Bar */}
      <footer className="px-6 pb-6 shrink-0">
        <PlaybackControls />
      </footer>

      {/* Floating agency-aesthetic glass chips & modules */}
      <FloatingModules />
    </div>
  );
};

export default function App() {
  return (
    <PlaybackProvider>
      <AIProvider>
        <AppContent />
      </AIProvider>
    </PlaybackProvider>
  );
}

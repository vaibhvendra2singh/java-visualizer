import React, { useEffect } from 'react';
import { PlaybackProvider, usePlayback } from './state/PlaybackContext';
import { AIProvider } from './state/AIContext';
import { runInterpreterTests } from './interpreter/runTests';
import { CodeEditor } from './components/CodeEditor';
import { ExecutionVisualizer } from './components/ExecutionVisualizer';
import { CallStackView } from './components/CallStackView';
import { HeapView } from './components/HeapView';
import { ConsoleView } from './components/ConsoleView';
import { PlaybackControls } from './components/PlaybackControls';
import { SvgArrows } from './components/SvgArrows';
import { Sun, Moon, Download } from 'lucide-react';
import { VariableTracker } from './components/VariableTracker';
import { FloatingModules } from './components/FloatingModules';

const AppContent: React.FC = () => {
  const { theme, toggleTheme } = usePlayback();
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = React.useState(false);
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);
  const [diagnosticResults, setDiagnosticResults] = React.useState<any[]>([]);

  // Run interpreter compatibility tests on mount
  useEffect(() => {
    const res = runInterpreterTests();
    setDiagnosticResults(res);
  }, []);

  // Apply light-mode class to HTML root element
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  }, [theme]);

  // Handle PWA installation prompt
  useEffect(() => {
    const handler = (e: Event) => {
      // Prevent the browser's default install prompt from showing
      e.preventDefault();
      // Save the event so it can be triggered later.
      setDeferredPrompt(e);
      // Show the install button in the UI
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Detect if already installed/running in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    if (isStandalone) {
      setShowInstallBtn(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    // Clear the deferred prompt (it can only be used once)
    setDeferredPrompt(null);
    setShowInstallBtn(false);
  };
  

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

        {/* Right Actions: Install App & Theme Toggle */}
        <div className="ml-auto z-10 flex items-center gap-3">
          {showInstallBtn && (
            <button
              onClick={handleInstallClick}
              title="Install Java Code Visualizer as a PWA"
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs font-semibold text-zinc-400 hover:text-white hover:border-zinc-700 transition-all duration-200 cursor-pointer animate-pulse"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install App</span>
            </button>
          )}
          <button
            onClick={() => setShowDiagnostics(true)}
            title="Run Diagnostics & Verify Java 17 Compatibility"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs font-semibold text-zinc-400 hover:text-white hover:border-zinc-700 transition-all duration-200 cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Diagnostics</span>
          </button>
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
            <div className="h-[38%] w-full flex flex-row gap-4 overflow-hidden">
              <div className="flex-[65] h-full overflow-hidden">
                <CallStackView />
              </div>
              <div className="flex-[35] h-full overflow-hidden">
                <VariableTracker />
              </div>
            </div>

            {/* Bottom Row: Heap Space (full width) */}
            <div className="h-[62%] w-full overflow-hidden">
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

      {/* Diagnostics Overlay Modal */}
      {showDiagnostics && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-md z-[9999] flex items-center justify-center p-6 transition-all duration-300">
          <div className="w-full max-w-2xl bg-zinc-950/90 border border-white/10 rounded-2xl p-6 flex flex-col max-h-[85vh] shadow-[0_0_50px_rgba(0,0,0,0.85)] relative">
            <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/5">
              <div>
                <h3 className="text-xs font-bold text-white font-mono tracking-widest uppercase">System Diagnostics</h3>
                <p className="text-[9px] text-zinc-500 font-mono mt-1">Java 17 Compatibility Verification Suite</p>
              </div>
              <button 
                onClick={() => setShowDiagnostics(false)}
                className="text-zinc-400 hover:text-white text-[10px] font-mono uppercase tracking-widest cursor-pointer bg-zinc-900/80 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-all"
              >
                Close
              </button>
            </div>
            
            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-3 pr-1 scrollbar-thin">
              {diagnosticResults.map((r, idx) => (
                <div key={idx} className="bg-zinc-900/30 border border-white/5 rounded-xl p-4 flex flex-col gap-2 transition-all hover:border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-zinc-200 font-mono">{r.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono tracking-widest uppercase ${r.passed ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                      {r.passed ? 'PASSED' : 'FAILED'}
                    </span>
                  </div>
                  {r.error && (
                    <div className="text-[9px] font-mono text-rose-400 bg-rose-500/5 p-2 rounded border border-rose-500/10">
                      Error: {r.error}
                    </div>
                  )}
                  <div className="flex flex-col gap-1 text-[9px] font-mono text-zinc-500 bg-zinc-950/40 p-2.5 rounded border border-white/5">
                    <div><span className="text-zinc-600">Expected:</span> {r.expected}</div>
                    <div><span className="text-zinc-600">Actual:</span> {r.actual}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer Summary */}
            <div className="pt-4 border-t border-white/5 flex items-center justify-between text-[10px] font-mono">
              <span className="text-zinc-400">Status: {diagnosticResults.every(r => r.passed) ? 'All systems nominal' : 'Compatibility gap detected'}</span>
              <span className="text-emerald-400 font-bold">
                {diagnosticResults.filter(r => r.passed).length} / {diagnosticResults.length} Tests Passed
              </span>
            </div>
          </div>
        </div>
      )}
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

import React, { useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { java } from '@codemirror/lang-java';
import { usePlayback } from '../state/PlaybackContext';
import { useAI } from '../state/AIContext';
import { lineHighlightExtension, setHighlightLine, EditorView } from './EditorExtensions';
import { AICodeSummary } from './AICodeSummary';
import { Play, Edit2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export const CodeEditor: React.FC = () => {
  const {
    code,
    activeStep,
    error,
    errorType,
    runCode,
    reset,
    theme
  } = usePlayback();

  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const [localCode, setLocalCode] = useState(code);
  const [isEditable, setIsEditable] = useState(true);
  const [highlightRect, setHighlightRect] = useState<{ top: number; right: number; height: number } | null>(null);

  useEffect(() => {
    setLocalCode(code);
  }, [code]);

  useEffect(() => {
    const view = editorRef.current?.view;
    if (!view) return;

    if (activeStep && !isEditable) {
      view.dispatch({
        effects: setHighlightLine.of(activeStep.line)
      });
      
      try {
        const line = view.state.doc.line(activeStep.line);
        view.dispatch({
          effects: EditorView.scrollIntoView(line.from, { y: 'center' })
        });
      } catch (e) {
        // Ignored
      }
    } else {
      view.dispatch({
        effects: setHighlightLine.of(0)
      });
    }
  }, [activeStep, isEditable]);

  // Track the bounding rect of the highlighted line in the editor
  useEffect(() => {
    if (!activeStep || isEditable) {
      setHighlightRect(null);
      return;
    }

    let active = true;
    const updatePosition = () => {
      if (!active) return;
      const lineEl = document.querySelector('.cm-highlight-line');
      const editorEl = lineEl?.closest('.cm-editor');
      if (lineEl && editorEl) {
        const lineRect = lineEl.getBoundingClientRect();
        const editorRect = editorEl.getBoundingClientRect();
        // Check if the line is currently within the visible editor bounds
        const isVisible = lineRect.bottom > editorRect.top && lineRect.top < editorRect.bottom;
        if (isVisible) {
          setHighlightRect({
            top: lineRect.top - editorRect.top,
            right: editorRect.right - lineRect.right,
            height: lineRect.height
          });
        } else {
          setHighlightRect(null);
        }
      } else {
        setHighlightRect(null);
      }
    };

    const tick = () => {
      updatePosition();
      if (active) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);

    return () => {
      active = false;
    };
  }, [activeStep, isEditable]);

  const parseExplanation = (explanation: string) => {
    // 1. Check if it's a condition check
    const condMatch = explanation.match(/(Check condition|Check loop condition):\s*(.+?)\s*\((.+?)\)\s*->\s*(true|false)/i);
    if (condMatch) {
      return {
        type: 'condition',
        expression: condMatch[2],
        values: condMatch[3],
        outcome: condMatch[4].toUpperCase()
      };
    }

    // 2. Check if it's a calculation (assignment or declaration with 'via')
    const calcMatch = explanation.match(/(Declare|Set|Set field|Set\s*\[.+?\])\s+(.+?)\s*=\s*(.+?)\s*\(via\s+(.+?)\s*=\s*(.+?)\)/i);
    if (calcMatch) {
      return {
        type: 'calculation',
        expression: calcMatch[4],
        values: calcMatch[5],
        outcome: calcMatch[3]
      };
    }

    return null;
  };

  const { runAnalysis, clearAI } = useAI();

  const handleVisualize = () => {
    setIsEditable(false);
    runCode(localCode);
    // Trigger AI analysis in parallel
    runAnalysis(localCode);
  };

  const handleEdit = () => {
    setIsEditable(true);
    reset();
    clearAI();
  };


  return (
    <div className="flex flex-col h-full frosted-glass-card rounded-2xl overflow-hidden">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/60 border-b border-zinc-750 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-700"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-600"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-500"></span>
          </div>
          <span className="ml-2 font-semibold text-xs text-zinc-450 font-mono">
            code
          </span>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-3">

          {isEditable ? (
            <button
              onClick={handleVisualize}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-zinc-200 text-black rounded-lg text-xs font-semibold shadow-sm transition duration-200 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Visualize
            </button>
          ) : (
            <button
              onClick={handleEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-850 hover:bg-zinc-750 text-white rounded-lg text-xs font-semibold border border-zinc-700 shadow-sm transition duration-200 cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit Code
            </button>
          )}
        </div>
      </div>

      {/* AI Code Summary */}
      {!isEditable && <AICodeSummary />}

      {/* Editor Body */}
      <div className="flex-1 overflow-auto relative font-mono text-xs bg-black">
        <CodeMirror
          ref={editorRef}
          value={localCode}
          height="100%"
          theme={theme === 'dark' ? 'dark' : 'light'}
          extensions={[java(), lineHighlightExtension]}
          onChange={(val) => {
            if (isEditable) {
              setLocalCode(val);
            }
          }}
          editable={isEditable}
          className="h-full text-xs"
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLineGutter: false,
            highlightActiveLine: false
          }}
        />

        {/* Removed outcome badge and Locked banner */}
      </div>

      {/* Compile/Runtime Error banner */}
      {error && (
        <div className="flex items-start gap-3 p-3.5 text-xs border-t bg-zinc-900/90 text-zinc-200 border-zinc-750 shrink-0">
          <AlertCircle className="w-4.5 h-4.5 mt-0.5 shrink-0 text-zinc-400" />
          <div className="flex-1 min-w-0">
            <span className="font-bold block uppercase mb-1 tracking-wide font-mono text-white">
              {errorType === 'compile' ? 'Compilation Failed' : 'Runtime Exception'}
            </span>
            <pre className="font-mono whitespace-pre-wrap leading-relaxed select-text overflow-auto max-h-[120px] text-zinc-300">{error}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

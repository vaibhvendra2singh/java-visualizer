import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { analyzeCode, narrateSteps, type CodeAnalysis } from '../services/groq';
import type { TraceStep } from '../interpreter/types';

export interface AIContextType {
  // Code analysis
  codeAnalysis: CodeAnalysis | null;
  isAnalyzing: boolean;
  analyzeError: string | null;

  // Step narrations
  narrations: Map<number, string>;
  isNarrating: boolean;

  // AI enabled toggle
  aiEnabled: boolean;
  setAIEnabled: (enabled: boolean) => void;

  // Actions
  runAnalysis: (code: string) => Promise<void>;
  fetchNarrations: (code: string, trace: TraceStep[], aroundIndex: number) => Promise<void>;
  getNarration: (stepId: number) => string | null;
  clearAI: () => void;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

const NARRATION_BATCH_SIZE = 10;

export const AIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [codeAnalysis, setCodeAnalysis] = useState<CodeAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [narrations, setNarrations] = useState<Map<number, string>>(new Map());
  const [isNarrating, setIsNarrating] = useState(false);
  const [aiEnabled, setAIEnabled] = useState(true);

  // Track which step ranges have already been fetched
  const fetchedRanges = useRef<Set<string>>(new Set());

  const runAnalysis = useCallback(async (code: string) => {
    if (!aiEnabled) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setCodeAnalysis(null);
    // Clear old narrations
    setNarrations(new Map());
    fetchedRanges.current = new Set();

    try {
      const analysis = await analyzeCode(code);
      setCodeAnalysis(analysis);
    } catch (err: any) {
      setAnalyzeError(err.message || 'AI analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [aiEnabled]);

  const fetchNarrations = useCallback(async (code: string, trace: TraceStep[], aroundIndex: number) => {
    if (!aiEnabled) return;

    // Calculate the batch range centered around the current index
    const start = Math.max(0, aroundIndex - 2);
    const rangeKey = `${start}-${start + NARRATION_BATCH_SIZE}`;

    // Skip if already fetched or currently fetching
    if (fetchedRanges.current.has(rangeKey)) return;
    fetchedRanges.current.add(rangeKey);

    setIsNarrating(true);
    try {
      const steps = trace.map((s) => ({
        stepId: s.stepId,
        line: s.line,
        explanation: s.explanation
      }));

      const newNarrations = await narrateSteps(code, steps, start, NARRATION_BATCH_SIZE);

      setNarrations((prev) => {
        const merged = new Map(prev);
        newNarrations.forEach((val, key) => merged.set(key, val));
        return merged;
      });
    } catch (err) {
      console.error('[AI] Failed to fetch narrations:', err);
    } finally {
      setIsNarrating(false);
    }
  }, [aiEnabled]);

  const getNarration = useCallback((stepId: number): string | null => {
    return narrations.get(stepId) || null;
  }, [narrations]);

  const clearAI = useCallback(() => {
    setCodeAnalysis(null);
    setAnalyzeError(null);
    setNarrations(new Map());
    fetchedRanges.current = new Set();
  }, []);

  const value: AIContextType = {
    codeAnalysis,
    isAnalyzing,
    analyzeError,
    narrations,
    isNarrating,
    aiEnabled,
    setAIEnabled,
    runAnalysis,
    fetchNarrations,
    getNarration,
    clearAI
  };

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
};

export const useAI = () => {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
};

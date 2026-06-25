import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { generateTrace } from '../interpreter/interpreter';
import type { TraceStep } from '../interpreter/types';

export interface PlaybackContextType {
  code: string;
  trace: TraceStep[];
  currentStepIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
  theme: 'dark' | 'light';
  error: string | null;
  errorType: 'compile' | 'runtime' | null;
  activeStep: TraceStep | null;
  inputText: string;
  isRunning: boolean;
  runCode: (sourceCode: string) => void;
  stepForward: () => void;
  stepBackward: () => void;
  goToStep: (index: number) => void;
  togglePlay: () => void;
  setPlaybackSpeed: (speed: number) => void;
  toggleTheme: () => void;
  setInputText: (text: string) => void;
  hoveredRefId: number | null;
  setHoveredRefId: (refId: number | null) => void;
}

const PlaybackContext = createContext<PlaybackContextType | undefined>(undefined);

export const PRESET_CODES = {
  loops: `class LoopTest {
    public static void main(String[] args) {
        int sum = 0;
        for (int i = 1; i <= 3; i++) {
            sum += i;
            System.out.println("i=" + i + ", sum=" + sum);
        }
    }
}`,
  arrays: `class ArrayTest {
    public static void main(String[] args) {
        int[] nums = {4, 2, 8};
        int temp = nums[0];
        nums[0] = nums[1];
        nums[1] = temp;
        System.out.println("nums[0]=" + nums[0] + ", nums[1]=" + nums[1]);
    }
}`,
  objects: `class Point {
    int x;
    int y;
    Point(int x, int y) {
        this.x = x;
        this.y = y;
    }
}

class ObjectTest {
    public static void main(String[] args) {
        Point p = new Point(10, 20);
        System.out.println("x = " + p.x);
    }
}`,
  recursion: `class RecursionTest {
    public static void main(String[] args) {
        int result = fact(3);
        System.out.println("3! = " + result);
    }

    static int fact(int n) {
        if (n <= 1) {
            return 1;
        }
        return n * fact(n - 1);
    }
}`
};

export const PlaybackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [code, setCode] = useState(PRESET_CODES.loops);
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeedState] = useState(1000);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'compile' | 'runtime' | null>(null);
  const [inputText, setInputTextState] = useState('');
  const [hoveredRefId, setHoveredRefId] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);


  // Compile and run the code to get trace
  const runCode = useCallback((sourceCode: string) => {
    setCode(sourceCode);
    setIsPlaying(false);
    setIsRunning(true);
    const result = generateTrace(sourceCode, inputText);
    setTrace(result.trace);
    setCurrentStepIndex(0);
    setError(result.error);
    setErrorType(result.errorType);
    setIsRunning(false);
  }, [inputText]);

  // Initialize with default preset
  useEffect(() => {
    runCode(PRESET_CODES.loops);
  }, [runCode]);

  const stepForward = useCallback(() => {
    if (currentStepIndex < trace.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      setIsPlaying(false);
    }
  }, [currentStepIndex, trace.length]);

  const stepBackward = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [currentStepIndex]);

  const goToStep = useCallback((index: number) => {
    if (index >= 0 && index < trace.length) {
      setCurrentStepIndex(index);
    }
  }, [trace.length]);

  const togglePlay = useCallback(() => {
    if (currentStepIndex >= trace.length - 1) {
      // Loop or restart if at end
      setCurrentStepIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying((prev) => !prev);
    }
  }, [currentStepIndex, trace.length]);

  const setPlaybackSpeed = useCallback((speed: number) => {
    setPlaybackSpeedState(speed);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const setInputText = useCallback((text: string) => {
    setInputTextState(text);
  }, []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
  }, []);

  // Auto-play interval
  useEffect(() => {
    if (!isPlaying) return;
    const intervalId = setInterval(() => {
      setCurrentStepIndex((prev) => {
        if (prev < trace.length - 1) {
          return prev + 1;
        } else {
          setIsPlaying(false);
          return prev;
        }
      });
    }, playbackSpeed);
    return () => clearInterval(intervalId);
  }, [isPlaying, playbackSpeed, trace.length]);

  const activeStep = useMemo(() => {
    if (trace.length === 0 || currentStepIndex < 0 || currentStepIndex >= trace.length) {
      return null;
    }
    return trace[currentStepIndex];
  }, [trace, currentStepIndex]);

  const value = useMemo(() => ({
    code,
    trace,
    currentStepIndex,
    isPlaying,
    playbackSpeed,
    theme,
    error,
    errorType,
    activeStep,
    inputText,
    isRunning,
    runCode,
    stepForward,
    stepBackward,
    goToStep,
    togglePlay,
    setPlaybackSpeed,
    toggleTheme,
    setInputText,
    reset,
    hoveredRefId,
    setHoveredRefId
  }), [
    code,
    trace,
    currentStepIndex,
    isPlaying,
    playbackSpeed,
    theme,
    error,
    errorType,
    activeStep,
    inputText,
    isRunning,
    runCode,
    stepForward,
    stepBackward,
    goToStep,
    togglePlay,
    setPlaybackSpeed,
    toggleTheme,
    setInputText,
    reset,
    hoveredRefId
  ]);

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
};

export const usePlayback = () => {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error('usePlayback must be used within a PlaybackProvider');
  }
  return context;
};

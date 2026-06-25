import type { TraceStep } from './types';

export interface FlowNode {
  id: string;
  type: 'start' | 'end' | 'statement' | 'condition' | 'methodCall' | 'return';
  label: string;
  line: number; // Primary source line
  // Fixed grid layout properties for D3
  x: number;
  y: number;
}

export interface FlowLink {
  source: string;
  target: string;
  type: 'normal' | 'true' | 'false' | 'loop-back' | 'call' | 'return';
}

export interface FlowchartGraph {
  nodes: FlowNode[];
  links: FlowLink[];
}

// Static Flowchart Definitions for the 4 presets
export const FLOWCHARTS: Record<string, FlowchartGraph> = {
  loops: {
    nodes: [
      { id: 'start', type: 'start', label: 'Start (main)', line: 3, x: 200, y: 40 },
      { id: 'init_sum', type: 'statement', label: 'sum = 0', line: 3, x: 200, y: 110 },
      { id: 'init_i', type: 'statement', label: 'i = 1', line: 5, x: 200, y: 180 },
      { id: 'loop_check', type: 'condition', label: 'i <= 3', line: 5, x: 200, y: 260 },
      { id: 'body_accum', type: 'statement', label: 'sum += i', line: 6, x: 200, y: 350 },
      { id: 'body_print', type: 'methodCall', label: 'println(...)', line: 7, x: 200, y: 420 },
      { id: 'loop_update', type: 'statement', label: 'i++', line: 5, x: 340, y: 350 },
      { id: 'end', type: 'end', label: 'End', line: 9, x: 200, y: 500 }
    ],
    links: [
      { source: 'start', target: 'init_sum', type: 'normal' },
      { source: 'init_sum', target: 'init_i', type: 'normal' },
      { source: 'init_i', target: 'loop_check', type: 'normal' },
      { source: 'loop_check', target: 'body_accum', type: 'true' },
      { source: 'body_accum', target: 'body_print', type: 'normal' },
      { source: 'body_print', target: 'loop_update', type: 'normal' },
      { source: 'loop_update', target: 'loop_check', type: 'loop-back' },
      { source: 'loop_check', target: 'end', type: 'false' }
    ]
  },
  arrays: {
    nodes: [
      { id: 'start', type: 'start', label: 'Start (main)', line: 3, x: 200, y: 40 },
      { id: 'init_arr', type: 'statement', label: 'nums = {4, 2, 8}', line: 4, x: 200, y: 110 },
      { id: 'init_temp', type: 'statement', label: 'temp = nums[0]', line: 5, x: 200, y: 180 },
      { id: 'swap_1', type: 'statement', label: 'nums[0] = nums[1]', line: 6, x: 200, y: 250 },
      { id: 'swap_2', type: 'statement', label: 'nums[1] = temp', line: 7, x: 200, y: 320 },
      { id: 'print', type: 'methodCall', label: 'println(...)', line: 8, x: 200, y: 390 },
      { id: 'end', type: 'end', label: 'End', line: 10, x: 200, y: 460 }
    ],
    links: [
      { source: 'start', target: 'init_arr', type: 'normal' },
      { source: 'init_arr', target: 'init_temp', type: 'normal' },
      { source: 'init_temp', target: 'swap_1', type: 'normal' },
      { source: 'swap_1', target: 'swap_2', type: 'normal' },
      { source: 'swap_2', target: 'print', type: 'normal' },
      { source: 'print', target: 'end', type: 'normal' }
    ]
  },
  objects: {
    nodes: [
      { id: 'start', type: 'start', label: 'Start (main)', line: 12, x: 200, y: 40 },
      { id: 'new_point', type: 'methodCall', label: 'new Point(10, 20)', line: 13, x: 200, y: 110 },
      { id: 'ctor_start', type: 'start', label: 'Point(...)', line: 4, x: 340, y: 180 },
      { id: 'assign_x', type: 'statement', label: 'this.x = x', line: 5, x: 340, y: 250 },
      { id: 'assign_y', type: 'statement', label: 'this.y = y', line: 6, x: 340, y: 320 },
      { id: 'ctor_end', type: 'return', label: 'Ctor End', line: 7, x: 340, y: 390 },
      { id: 'print', type: 'methodCall', label: 'println(...)', line: 14, x: 200, y: 460 },
      { id: 'end', type: 'end', label: 'End', line: 15, x: 200, y: 530 }
    ],
    links: [
      { source: 'start', target: 'new_point', type: 'normal' },
      { source: 'new_point', target: 'ctor_start', type: 'call' },
      { source: 'ctor_start', target: 'assign_x', type: 'normal' },
      { source: 'assign_x', target: 'assign_y', type: 'normal' },
      { source: 'assign_y', target: 'ctor_end', type: 'normal' },
      { source: 'ctor_end', target: 'print', type: 'return' },
      { source: 'print', target: 'end', type: 'normal' }
    ]
  },
  recursion: {
    nodes: [
      { id: 'start', type: 'start', label: 'Start (main)', line: 3, x: 200, y: 40 },
      { id: 'call_fact', type: 'methodCall', label: 'result = fact(3)', line: 3, x: 200, y: 110 },
      { id: 'fact_start', type: 'start', label: 'fact(n)', line: 7, x: 340, y: 180 },
      { id: 'check_n', type: 'condition', label: 'n <= 1', line: 8, x: 340, y: 260 },
      { id: 'ret_base', type: 'return', label: 'return 1', line: 9, x: 260, y: 350 },
      { id: 'ret_rec', type: 'return', label: 'return n * fact(n-1)', line: 11, x: 420, y: 350 },
      { id: 'print', type: 'methodCall', label: 'println(...)', line: 4, x: 200, y: 440 },
      { id: 'end', type: 'end', label: 'End', line: 5, x: 200, y: 510 }
    ],
    links: [
      { source: 'start', target: 'call_fact', type: 'normal' },
      { source: 'call_fact', target: 'fact_start', type: 'call' },
      { source: 'fact_start', target: 'check_n', type: 'normal' },
      { source: 'check_n', target: 'ret_base', type: 'true' },
      { source: 'check_n', target: 'ret_rec', type: 'false' },
      { source: 'ret_base', target: 'print', type: 'return' },
      { source: 'ret_rec', target: 'fact_start', type: 'call' }, // Recursive call back to start
      { source: 'ret_rec', target: 'print', type: 'return' },
      { source: 'print', target: 'end', type: 'normal' }
    ]
  }
};

// Maps the current execution step to the active FlowNode ID
export function getActiveFlowNodeId(presetName: string, step: TraceStep, stepIndex: number): string {
  const line = step.line;
  const expl = step.explanation.toLowerCase();

  if (stepIndex === 0) return 'start';

  if (presetName === 'loops') {
    if (line === 3) return 'init_sum';
    if (line === 4 || line === 5) {
      if (expl.includes('loop condition') || expl.includes('evaluating for loop')) {
        return 'loop_check';
      }
      if (expl.includes('update') || expl.includes('incremented') || expl.includes('postfix updated')) {
        return 'loop_update';
      }
      if (expl.includes('declared variable \'i\'')) {
        return 'init_i';
      }
      return 'loop_check';
    }
    if (line === 6) return 'body_accum';
    if (line === 7) return 'body_print';
    if (expl.includes('finished')) return 'end';
  }

  if (presetName === 'arrays') {
    if (line === 4) return 'init_arr';
    if (line === 5) return 'init_temp';
    if (line === 6) return 'swap_1';
    if (line === 7) return 'swap_2';
    if (line === 8) return 'print';
    if (expl.includes('finished')) return 'end';
  }

  if (presetName === 'objects') {
    if (line === 12 || line === 13) {
      if (expl.includes('created new object') || expl.includes('calling constructor')) {
        return 'new_point';
      }
      return 'new_point';
    }
    if (line === 4) return 'ctor_start';
    if (line === 5) return 'assign_x';
    if (line === 6) return 'assign_y';
    if (line === 7) return 'ctor_end';
    if (line === 14) return 'print';
    if (expl.includes('finished')) return 'end';
  }

  if (presetName === 'recursion') {
    if (line === 3) return 'call_fact';
    if (line === 7) return 'fact_start';
    if (line === 8) return 'check_n';
    if (line === 9) return 'ret_base';
    if (line === 11) {
      if (expl.includes('calling method')) return 'fact_start';
      return 'ret_rec';
    }
    if (line === 4) return 'print';
    if (expl.includes('finished')) return 'end';
  }

  // Fallback to finding node by exact line match
  const flowchart = FLOWCHARTS[presetName];
  if (flowchart) {
    const matched = flowchart.nodes.find((n) => n.line === line);
    if (matched) return matched.id;
  }

  return 'start';
}

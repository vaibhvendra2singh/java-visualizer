import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayback } from '../state/PlaybackContext';

interface ArrowData {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export const SvgArrows: React.FC = () => {
  const { activeStep } = usePlayback();
  const [arrows, setArrows] = useState<ArrowData[]>([]);
  const [changeArrow, setChangeArrow] = useState<ArrowData | null>(null);
  const [showChangeArrow, setShowChangeArrow] = useState(false);
  const containerRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!activeStep) {
      setArrows([]);
      setChangeArrow(null);
      setShowChangeArrow(false);
      return;
    }

    let active = true;

    // Show temporary pointer arrow for 1.2 seconds when stepping to a new state
    setShowChangeArrow(true);
    const timer = setTimeout(() => {
      setShowChangeArrow(false);
    }, 1200);

    const updateCoordinates = () => {
      if (!active || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newArrows: ArrowData[] = [];
      const inlinedRefs = new Set<number>();
      const heap = activeStep.heap || {};

      // Identify inlined 2D array structures to avoid drawing arrows to them
      Object.entries(heap).forEach(([rawRefId, obj]) => {
        const refId = Number(rawRefId);
        if (obj.type === 'object') {
          Object.values(obj.fields).forEach((field) => {
            if (field.value.type === 'reference' && field.value.refId !== null) {
              const targetRefId = field.value.refId;
              const targetObj = heap[targetRefId];
              if (targetObj && targetObj.type === 'array') {
                const is2D = targetObj.values.every((val: any) => {
                  if (val.value.type !== 'reference' || val.value.refId === null) return false;
                  const row = heap[val.value.refId];
                  return row && row.type === 'array';
                });
                if (is2D) {
                  inlinedRefs.add(targetRefId);
                  targetObj.values.forEach((val: any) => inlinedRefs.add(val.value.refId));
                }
              }
            }
          });
        }
        if (obj.type === 'array') {
          const is2D = obj.values.length > 0 && obj.values.every((val: any) => {
            if (val.value.type !== 'reference' || val.value.refId === null) return false;
            const row = heap[val.value.refId];
            return row && row.type === 'array';
          });
          if (is2D) {
            obj.values.forEach((val: any) => inlinedRefs.add(val.value.refId));
          }
        }
      });

      // 1. Gather reference sources on Stack
      const stack = activeStep.stack || [];
      stack.forEach((frame) => {
        // Handle "this" pointer
        if (frame.thisRef !== null && !inlinedRefs.has(frame.thisRef)) {
          const sourceId = `stack-var-${frame.id}-this`;
          const targetId = `heap-object-${frame.thisRef}`;
          const arrow = calculateArrowCoords(sourceId, targetId, containerRect, '#ffffff'); // White for this/objects
          if (arrow) newArrows.push(arrow);
        }

        // Handle other local vars
        Object.entries(frame.variables).forEach(([varName, varState]) => {
          if (varState.value.type === 'reference' && varState.value.refId !== null && !inlinedRefs.has(varState.value.refId)) {
            const sourceId = `stack-var-${frame.id}-${varName}`;
            const targetId = `heap-object-${varState.value.refId}`;
            const arrow = calculateArrowCoords(sourceId, targetId, containerRect, '#d4d4d8'); // Light gray for general references
            if (arrow) newArrows.push(arrow);
          }
        });
      });

      // 2. Gather reference sources on Heap (Object fields and Array cells)
      Object.entries(heap).forEach(([rawRefId, heapObj]) => {
        const refId = Number(rawRefId);
        
        if (heapObj.type === 'object') {
          Object.entries(heapObj.fields).forEach(([fieldName, fieldState]) => {
            if (fieldState.value.type === 'reference' && fieldState.value.refId !== null && !inlinedRefs.has(fieldState.value.refId)) {
              const sourceId = `heap-field-${refId}-${fieldName}`;
              const targetId = `heap-object-${fieldState.value.refId}`;
              const arrow = calculateArrowCoords(sourceId, targetId, containerRect, '#a1a1aa'); // Medium gray for nested references
              if (arrow) newArrows.push(arrow);
            }
          });
        } else if (heapObj.type === 'array' && !inlinedRefs.has(refId)) {
          heapObj.values.forEach((cell, idx) => {
            if (cell.value.type === 'reference' && cell.value.refId !== null && !inlinedRefs.has(cell.value.refId)) {
              const sourceId = `heap-array-cell-${refId}-${idx}`;
              const targetId = `heap-object-${cell.value.refId}`;
              const arrow = calculateArrowCoords(sourceId, targetId, containerRect, '#71717a'); // Dark gray for array elements
              if (arrow) newArrows.push(arrow);
            }
          });
        }
      });

      // 3. Compute code-to-variable pointer arrow if changedElement is present
      if (activeStep.changedElement) {
        const ch = activeStep.changedElement;
        let targetId = '';
        if (ch.type === 'stack' && ch.frameId && ch.varName) {
          targetId = `stack-var-${ch.frameId}-${ch.varName}`;
        } else if (ch.type === 'heap' && ch.refId !== undefined && ch.field !== undefined) {
          if (typeof ch.field === 'string') {
            targetId = `heap-field-${ch.refId}-${ch.field}`;
          } else if (typeof ch.field === 'number') {
            targetId = `heap-array-cell-${ch.refId}-${ch.field}`;
          }
        }

        const lineEl = document.querySelector('.cm-highlight-line');
        const targetEl = targetId ? document.getElementById(targetId) : null;

        if (lineEl && targetEl) {
          const lineRect = lineEl.getBoundingClientRect();
          const targetRect = targetEl.getBoundingClientRect();

          setChangeArrow({
            id: `line->${targetId}`,
            x1: lineRect.right - containerRect.left,
            y1: lineRect.top + lineRect.height / 2 - containerRect.top,
            x2: targetRect.left - containerRect.left - 6,
            y2: targetRect.top + targetRect.height / 2 - containerRect.top,
            color: '#ffffff' // White for write pointers
          });
        } else {
          setChangeArrow(null);
        }
      } else {
        setChangeArrow(null);
      }

      setArrows(newArrows);
    };

    // Run animation frame loop to update positions in sync with Framer Motion sliding
    const tick = () => {
      updateCoordinates();
      if (active) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);

    window.addEventListener('resize', updateCoordinates);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('resize', updateCoordinates);
    };
  }, [activeStep]);

  const isElementVisible = (el: HTMLElement): boolean => {
    const elRect = el.getBoundingClientRect();
    if (elRect.width === 0 || elRect.height === 0) return false;

    // Check specific visualizer scroll containers first for efficiency
    const callStackList = document.getElementById('call-stack-frame-list');
    if (callStackList && callStackList.contains(el)) {
      const parentRect = callStackList.getBoundingClientRect();
      const elCenterY = (elRect.top + elRect.bottom) / 2;
      return elCenterY >= parentRect.top && elCenterY <= parentRect.bottom;
    }

    const heapObjectList = document.getElementById('heap-object-list');
    if (heapObjectList && heapObjectList.contains(el)) {
      const parentRect = heapObjectList.getBoundingClientRect();
      const elCenterY = (elRect.top + elRect.bottom) / 2;
      const elCenterX = (elRect.left + elRect.right) / 2;
      return (
        elCenterY >= parentRect.top &&
        elCenterY <= parentRect.bottom &&
        elCenterX >= parentRect.left &&
        elCenterX <= parentRect.right
      );
    }

    // Fallback: Check general overflow container hierarchy (e.g. for editor line)
    let parent = el.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;

      if (
        overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden' ||
        overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden'
      ) {
        const parentRect = parent.getBoundingClientRect();
        if (parentRect.width === 0 || parentRect.height === 0) return false;

        const elCenterY = (elRect.top + elRect.bottom) / 2;
        const elCenterX = (elRect.left + elRect.right) / 2;

        if (
          elCenterY < parentRect.top ||
          elCenterY > parentRect.bottom ||
          elCenterX < parentRect.left ||
          elCenterX > parentRect.right
        ) {
          return false;
        }
      }
      parent = parent.parentElement;
    }

    return true;
  };

  const calculateArrowCoords = (
    sourceId: string,
    targetId: string,
    containerRect: DOMRect,
    color: string
  ): ArrowData | null => {
    const sourceEl = document.getElementById(sourceId);
    const targetEl = document.getElementById(targetId);

    if (!sourceEl || !targetEl) return null;
    if (!isElementVisible(sourceEl) || !isElementVisible(targetEl)) return null;

    const sourceRect = sourceEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    let y1 = sourceRect.top + sourceRect.height / 2 - containerRect.top;
    let y2 = targetRect.top + targetRect.height / 2 - containerRect.top;

    const sL = sourceRect.left - containerRect.left;
    const sR = sourceRect.right - containerRect.left;
    const tL = targetRect.left - containerRect.left;
    const tR = targetRect.right - containerRect.left;

    const sC = (sL + sR) / 2;
    const tC = (tL + tR) / 2;

    let x1 = 0;
    let x2 = 0;

    if (sR <= tL) {
      // Target is entirely to the right of source
      x1 = sR;
      x2 = tL - 6;
    } else if (sL >= tR) {
      // Target is entirely to the left of source
      x1 = sL;
      x2 = tR + 6;
    } else {
      // Overlap case
      if (tC < sC) {
        // Target is to the left, so arrow must go right-to-left (x2 < x1)
        const distR = Math.abs(sR - tR);
        const distL = Math.abs(sL - tL);
        if (distR < distL) {
          x1 = sR;
          x2 = tR + 6;
        } else {
          x1 = sL;
          x2 = tL - 6;
        }
      } else {
        // Target is to the right, so arrow must go left-to-right (x2 > x1)
        const distL = Math.abs(tL - sL);
        const distR = Math.abs(tR - sR);
        if (distL < distR) {
          x1 = sL;
          x2 = tL - 6;
        } else {
          x1 = sR;
          x2 = tR + 6;
        }
      }
    }

    return {
      id: `${sourceId}->${targetId}`,
      x1,
      y1,
      x2,
      y2,
      color
    };
  };

  return null;
  return (
    <svg
      ref={containerRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-30"
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Definition of arrow head markers for each type of color link */}
        <marker
          id="arrow-amber"
          markerWidth="8"
          markerHeight="6"
          refX="6"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#ffffff" />
        </marker>
        <marker
          id="arrow-indigo"
          markerWidth="8"
          markerHeight="6"
          refX="6"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#d4d4d8" />
        </marker>
        <marker
          id="arrow-pink"
          markerWidth="8"
          markerHeight="6"
          refX="6"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#a1a1aa" />
        </marker>
        <marker
          id="arrow-cyan"
          markerWidth="8"
          markerHeight="6"
          refX="6"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#71717a" />
        </marker>
        <marker
          id="arrow-green"
          markerWidth="8"
          markerHeight="6"
          refX="6"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#ffffff" />
        </marker>
      </defs>

      {/* Render persistent stack-to-heap reference arrows */}
      {arrows.map((arrow) => {
        let markerId = 'arrow-indigo';
        if (arrow.color === '#ffffff') markerId = 'arrow-amber';
        if (arrow.color === '#a1a1aa') markerId = 'arrow-pink';
        if (arrow.color === '#71717a') markerId = 'arrow-cyan';

        const dx = Math.max(40, Math.abs(arrow.x2 - arrow.x1) / 3);
        const cx1 = arrow.x2 > arrow.x1 ? arrow.x1 + dx : arrow.x1 - dx;
        const cy1 = arrow.y1;
        const cx2 = arrow.x2 > arrow.x1 ? arrow.x2 - dx : arrow.x2 + dx;
        const cy2 = arrow.y2;
        const pathData = `M ${arrow.x1} ${arrow.y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${arrow.x2} ${arrow.y2}`;

        return (
          <g key={arrow.id}>
            <path
              d={pathData}
              fill="none"
              stroke={arrow.color}
              strokeWidth="4"
              className="opacity-15 blur-[1px]"
            />
            <path
              d={pathData}
              fill="none"
              stroke={arrow.color}
              strokeWidth="2"
              markerEnd={`url(#${markerId})`}
            />
          </g>
        );
      })}

      {/* Render temporary line-to-variable change arrow */}
      <AnimatePresence>
        {showChangeArrow && changeArrow && (() => {
          const dx = Math.max(40, Math.abs(changeArrow.x2 - changeArrow.x1) / 3);
          const cx1 = changeArrow.x2 > changeArrow.x1 ? changeArrow.x1 + dx : changeArrow.x1 - dx;
          const cy1 = changeArrow.y1;
          const cx2 = changeArrow.x2 > changeArrow.x1 ? changeArrow.x2 - dx : changeArrow.x2 + dx;
          const cy2 = changeArrow.y2;
          const pathData = `M ${changeArrow.x1} ${changeArrow.y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${changeArrow.x2} ${changeArrow.y2}`;

          return (
            <motion.g
              key={changeArrow.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Outer glow */}
              <path
                d={pathData}
                fill="none"
                stroke="#ffffff"
                strokeWidth="5"
                className="opacity-20 blur-[2px]"
              />
              {/* Main dashed flow path */}
              <path
                d={pathData}
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                strokeDasharray="6,4"
                className="animate-dash-flow"
                markerEnd="url(#arrow-green)"
              />
            </motion.g>
          );
        })()}
      </AnimatePresence>
    </svg>
  );
};

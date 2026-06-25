import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayback } from '../state/PlaybackContext';
import type { HeapObject } from '../interpreter/types';

// Helper to resolve 2D array structure from heap
interface TwoDArrayData {
  rows: any[][];
  rowRefIds: number[];
  rowKeys: number[];
  colKeys: number[];
}

function get2DArrayData(refId: number, heap: any): TwoDArrayData | null {
  const outerArray = heap[refId];
  if (!outerArray || outerArray.type !== 'array') return null;

  const rows: any[][] = [];
  const rowRefIds: number[] = [];

  for (const cell of outerArray.values) {
    if (cell.value.type !== 'reference' || cell.value.refId === null) return null;
    const innerArray = heap[cell.value.refId];
    if (!innerArray || innerArray.type !== 'array') return null;
    rows.push(innerArray.values);
    rowRefIds.push(cell.value.refId);
  }

  if (rows.length === 0) return null;

  const rowKeys = Array.from({ length: rows.length }, (_, i) => i);
  const colKeys = Array.from({ length: rows[0].length }, (_, i) => i);

  return { rows, rowRefIds, rowKeys, colKeys };
}

export const HeapView: React.FC = () => {
  const { activeStep } = usePlayback();
  const heap = activeStep?.heap || {};
  const heapKeys = Object.keys(heap).map(Number).sort((a, b) => a - b);

  // Compute all inlined refs to filter them out of the root layout
  const inlinedRefs = new Set<number>();

  Object.entries(heap).forEach(([rawRefId, obj]) => {

    // 1. If an object references a 2D array, we inline that array and its rows
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

    // 2. If a standalone array is a 2D array, we inline its rows
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

  const visibleHeapKeys = heapKeys.filter((refId) => !inlinedRefs.has(refId));

  return (
    <div className="flex flex-col h-full frosted-glass-card p-4 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-zinc-750 pb-2 shrink-0">
        <h3 className="text-xs font-bold text-zinc-300 tracking-wider uppercase font-mono">
          Heap Space
        </h3>
      </div>

      {/* Heap Cards Grid */}
      <div id="heap-object-list" className="grid grid-cols-1 md:grid-cols-2 gap-4 relative flex-1 overflow-y-auto pr-1 items-start">
        {visibleHeapKeys.length === 0 ? (
          <div className="col-span-full flex-1 flex flex-col items-center justify-center text-zinc-600 font-mono text-xs text-center p-6">
            <span className="opacity-40 text-3xl mb-2">📦</span>
            Heap is empty. "new" objects/arrays will appear here.
          </div>
        ) : (
          <AnimatePresence>
            {visibleHeapKeys.map((refId) => (
              <HeapObjectCard key={refId} refId={refId} obj={heap[refId]} heap={heap} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

const HeapObjectCard: React.FC<{
  refId: number;
  obj: HeapObject;
  heap: any;
}> = ({ refId, obj, heap }) => {
  const { activeStep, hoveredRefId, setHoveredRefId } = usePlayback();
  const isCardHovered = hoveredRefId === refId;
  const elementId = `heap-object-${refId}`;

  const getIndexLabels = (idx: number): string[] => {
    if (!activeStep || !activeStep.stack || activeStep.stack.length === 0) return [];
    const topFrame = activeStep.stack[activeStep.stack.length - 1];
    const labels: string[] = [];

    Object.values(topFrame.variables).forEach((v) => {
      if (v.value.type === 'primitive' && typeof v.value.value === 'number') {
        const val = Math.floor(v.value.value);
        if (val === idx) {
          const nameLower = v.name.toLowerCase();
          const isCommonIndex = [
            'low', 'high', 'mid', 'left', 'right', 'i', 'j', 'k', 'p', 'q',
            'start', 'end', 'index', 'idx', 'ptr', 'pointer'
          ].includes(nameLower) || v.name.length === 1;

          if (isCommonIndex) {
            labels.push(v.name);
          }
        }
      }
    });

    return labels;
  };

  // Check if we have a 2D array associated with this object (as a field)
  let inlinedMatrix: TwoDArrayData | null = null;
  let matrixFieldName = '';

  if (obj.type === 'object') {
    for (const [fieldName, fieldState] of Object.entries(obj.fields)) {
      if (fieldState.value.type === 'reference' && fieldState.value.refId !== null) {
        const matrixData = get2DArrayData(fieldState.value.refId, heap);
        if (matrixData) {
          inlinedMatrix = matrixData;
          matrixFieldName = fieldName;
          break;
        }
      }
    }
  } else if (obj.type === 'array') {
    // If this itself is a 2D array
    inlinedMatrix = get2DArrayData(refId, heap);
  }

  // Filter fields: if we inlined the matrix, don't show the matrix reference field in the top list
  const displayFields = obj.type === 'object'
    ? Object.entries(obj.fields).filter(([name]) => name !== matrixFieldName)
    : [];

  return (
    <motion.div
      id={elementId}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 250, damping: 22 }}
      onMouseEnter={() => setHoveredRefId(refId)}
      onMouseLeave={() => setHoveredRefId(null)}
      className={`bg-zinc-950 rounded-xl shadow-md overflow-hidden flex flex-col min-w-[220px] visualizer-card border transition-all duration-300 ${
        isCardHovered 
          ? 'border-white shadow-[0_0_20px_rgba(255,255,255,0.25)] scale-[1.02]' 
          : 'border-zinc-850'
      }`}
    >
      {/* Box Header */}
      <div className={`px-3 py-2 border-b font-mono text-xs font-semibold flex items-center justify-between transition-colors duration-300 ${
        isCardHovered ? 'bg-white text-black' : 'bg-zinc-900 border-zinc-800 text-white'
      }`}>
        <span>
          {obj.type === 'object' ? obj.className : `${obj.elementType}[]`}
        </span>
        <span className={`text-[10px] transition-colors duration-300 ${isCardHovered ? 'text-black/60' : 'text-zinc-400'}`}>ref@{refId}</span>
      </div>

      {/* Box Body */}
      <div className="p-3">
        {/* Render Primitive / Reference fields as beautiful capsules side-by-side */}
        {displayFields.length > 0 && (
          <div className="flex flex-wrap gap-2.5 mb-3">
            {displayFields.map(([fieldName, fieldState]) => {
              const isChanged =
                activeStep?.changedElement?.type === 'heap' &&
                activeStep?.changedElement?.refId === refId &&
                activeStep?.changedElement?.field === fieldName;

              const fieldElementId = `heap-field-${refId}-${fieldName}`;
              const val = fieldState.value;

              return (
                <motion.div
                  key={fieldName}
                  id={fieldElementId}
                  animate={isChanged ? {
                    scale: [1, 1.1, 1],
                    transition: { duration: 0.5 }
                  } : {}}
                  className="flex flex-row items-center gap-2 border border-zinc-800 bg-zinc-950 px-2.5 py-1 rounded font-mono text-xs shadow-sm relative"
                >
                  {/* Label */}
                  <span className="text-zinc-500 font-medium select-none">
                    {fieldName} =
                  </span>
                  
                  {/* Value */}
                  <span className="text-white font-bold">
                    {val.type === 'primitive' ? (
                      val.value === null ? 'null' : String(val.value)
                    ) : (
                      val.refId === null ? 'null' : `ref@${val.refId}`
                    )}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* 2D Matrix Grid Rendering */}
        {inlinedMatrix && (
          <div className="flex flex-col gap-1 mt-1">
            {matrixFieldName && (
              <span className="text-[10px] font-mono text-zinc-400 mb-1">
                {matrixFieldName}:
              </span>
            )}
            <div className="bg-white text-black border border-zinc-200 rounded-xl p-3 w-fit shadow-md font-serif">
              <table className="border-collapse">
                <thead>
                  <tr>
                    {/* Top corner cell */}
                    <th className="w-8 h-8 font-bold text-center text-xs text-zinc-400"></th>
                    {inlinedMatrix.colKeys.map((colIdx) => (
                      <th key={colIdx} className="w-8 h-8 font-bold text-center text-xs font-serif text-black">
                        {colIdx}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inlinedMatrix.rows.map((rowCells, rowIdx) => {
                    const rowRefId = inlinedMatrix!.rowRefIds[rowIdx];
                    return (
                      <tr key={rowIdx}>
                        {/* Row header */}
                        <td className="w-8 h-8 font-bold text-center text-xs font-serif text-black">
                          {rowIdx}
                        </td>
                        {rowCells.map((cell, colIdx) => {
                          const isCellChanged =
                            activeStep?.changedElement?.type === 'heap' &&
                            activeStep?.changedElement?.refId === rowRefId &&
                            activeStep?.changedElement?.field === colIdx;

                          return (
                            <td key={colIdx} className="p-0.5">
                              <motion.div
                                animate={isCellChanged ? {
                                  scale: [1, 1.15, 1],
                                  backgroundColor: ['#f4f4f5', '#bfdbfe', '#bfdbfe', '#bfdbfe'],
                                  transition: { duration: 0.6 }
                                } : {}}
                                className={`w-8 h-8 flex items-center justify-center text-xs font-serif rounded border border-zinc-200 transition-colors
                                  ${isCellChanged ? 'bg-blue-100 text-black font-bold border-blue-300' : 'bg-zinc-50 text-black'}
                                `}
                              >
                                {cell.value.type === 'primitive' ? (
                                  cell.value.value === null ? 'null' : String(cell.value.value)
                                ) : (
                                  cell.value.refId === null ? 'null' : `ref@${cell.value.refId}`
                                )}
                              </motion.div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Fallback for standard array representations */}
        {obj.type === 'array' && !inlinedMatrix && (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap gap-2 py-1 items-center">
              {obj.values.map((cell, idx) => {
                const isChanged =
                  activeStep?.changedElement?.type === 'heap' &&
                  activeStep?.changedElement?.refId === refId &&
                  activeStep?.changedElement?.field === idx;

                const cellElementId = `heap-array-cell-${refId}-${idx}`;
                const labels = getIndexLabels(idx);

                return (
                  <div key={idx} className="flex flex-col items-center relative">
                    <span className="text-[9px] font-mono text-zinc-550 mb-1">
                      [{idx}]
                    </span>

                    <motion.div
                      id={cellElementId}
                      animate={isChanged ? {
                        rotateY: [0, 180, 360],
                        scale: [1, 1.15, 1],
                        borderColor: ['#27272a', '#ffffff', '#27272a'],
                        backgroundColor: [
                          'rgba(39, 39, 42, 0.8)',
                          'rgba(255, 255, 255, 0.2)',
                          'rgba(9, 9, 11, 0.8)'
                        ],
                        transition: { duration: 0.8, ease: 'easeInOut' }
                      } : {}}
                      className="w-12 h-10 flex items-center justify-center rounded-lg border border-zinc-850 bg-zinc-950/80 text-[11px] font-mono select-none"
                    >
                      {cell.value.type === 'primitive' ? (
                        <span className="text-white font-semibold truncate px-1">
                          {cell.value.value === null ? 'null' : String(cell.value.value)}
                        </span>
                      ) : (
                        <div className="flex flex-col items-center">
                          {cell.value.refId === null ? (
                            <span className="text-zinc-650 text-[10px]">null</span>
                          ) : (
                            <>
                              <span className="text-[9px] text-white font-bold">
                                ref@{cell.value.refId}
                              </span>
                              <span className="w-1.5 h-1.5 rounded-full bg-white border border-zinc-400 mt-0.5"></span>
                            </>
                          )}
                        </div>
                      )}
                    </motion.div>

                    {/* Array Index Pointer Badges */}
                    {labels.length > 0 && (
                      <div className="flex flex-col gap-0.5 mt-1.5 items-center select-none z-10">
                        {labels.map((lbl) => (
                          <span
                            key={lbl}
                            className="text-[9px] font-mono font-bold text-white uppercase tracking-wider scale-90 whitespace-nowrap"
                          >
                            {lbl}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { usePlayback } from '../state/PlaybackContext';
import { FLOWCHARTS, getActiveFlowNodeId } from '../interpreter/flowchart';

export const FlowchartPanel: React.FC = () => {
  const { code, activeStep, currentStepIndex, trace } = usePlayback();

  // Determine active preset based on code signature
  const presetName = useMemo(() => {
    if (code.includes('LoopTest')) return 'loops';
    if (code.includes('ArrayTest')) return 'arrays';
    if (code.includes('ObjectTest') || code.includes('Point')) return 'objects';
    if (code.includes('RecursionTest') || code.includes('fact')) return 'recursion';
    return 'loops';
  }, [code]);

  const graph = useMemo(() => FLOWCHARTS[presetName] || FLOWCHARTS.loops, [presetName]);

  // Determine which flowchart node is active
  const activeNodeId = useMemo(() => {
    if (!activeStep) return 'start';
    return getActiveFlowNodeId(presetName, activeStep, currentStepIndex);
  }, [presetName, activeStep, currentStepIndex]);

  // Compute set of visited nodes (active in any step from 0 to currentStepIndex - 1)
  const visitedNodes = useMemo(() => {
    const visited = new Set<string>();
    for (let i = 0; i < currentStepIndex; i++) {
      visited.add(getActiveFlowNodeId(presetName, trace[i], i));
    }
    return visited;
  }, [presetName, trace, currentStepIndex]);

  // Track the execution trail of the last 5 visited nodes (excluding the active one)
  const ghostNodes = useMemo(() => {
    const trail: string[] = [];
    for (let i = Math.max(0, currentStepIndex - 5); i < currentStepIndex; i++) {
      const nid = getActiveFlowNodeId(presetName, trace[i], i);
      if (nid !== activeNodeId && !trail.includes(nid)) {
        trail.push(nid);
      }
    }
    return trail;
  }, [presetName, trace, currentStepIndex, activeNodeId]);

  // Determine immediate predecessor node to animate active link
  const prevNodeId = useMemo(() => {
    if (currentStepIndex === 0) return null;
    return getActiveFlowNodeId(presetName, trace[currentStepIndex - 1], currentStepIndex - 1);
  }, [presetName, trace, currentStepIndex]);

  // Parse Loop iteration info from active step explanation
  const loopInfo = useMemo(() => {
    if (!activeStep || activeNodeId !== 'loop_check') return null;

    const match = activeStep.explanation.match(/Iteration (\d+)/i);
    const current = match ? Number(match[1]) : 1;

    // Scan trace to find total iterations
    let total = 1;
    trace.forEach((s) => {
      const m = s.explanation.match(/Iteration (\d+)/i);
      if (m) {
        const val = Number(m[1]);
        if (val > total) total = val;
      }
    });

    return { current, total };
  }, [activeStep, activeNodeId, trace]);

  // Define colors for node types
  const getNodeColorClass = (type: string, isActive: boolean, isGhost: boolean) => {
    if (isGhost) return 'border-slate-800 bg-slate-950/20 text-slate-600';
    if (isActive) {
      switch (type) {
        case 'condition': return 'border-amber-400 bg-amber-950/40 text-amber-300 ring-2 ring-amber-500/20';
        case 'methodCall': return 'border-emerald-400 bg-emerald-950/40 text-emerald-300 ring-2 ring-emerald-500/20';
        case 'return': return 'border-rose-450 bg-rose-950/40 text-rose-300 ring-2 ring-rose-500/20';
        default: return 'border-indigo-400 bg-indigo-950/40 text-indigo-300 ring-2 ring-indigo-500/20';
      }
    }
    // Visited but inactive
    switch (type) {
      case 'start': return 'border-slate-700 bg-slate-900 text-slate-400';
      case 'end': return 'border-slate-700 bg-slate-900 text-slate-400';
      case 'condition': return 'border-amber-600/40 bg-amber-950/10 text-amber-500/60';
      case 'methodCall': return 'border-emerald-600/40 bg-emerald-950/10 text-emerald-500/60';
      case 'return': return 'border-rose-600/40 bg-rose-950/10 text-rose-500/60';
      default: return 'border-slate-800 bg-slate-950/60 text-slate-400';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/40 border border-slate-850 p-4 rounded-2xl shadow-lg backdrop-blur-sm overflow-hidden select-none">
      <div className="flex items-center justify-between mb-4 border-b border-slate-800/60 pb-2 shrink-0">
        <h3 className="text-xs font-bold text-slate-300 tracking-wider uppercase font-mono">
          Flowchart
        </h3>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-slate-500">
          Control Flow Graph
        </span>
      </div>

      {/* Canvas Wrapper */}
      <div className="flex-1 relative overflow-auto bg-slate-950/30 rounded-xl border border-slate-850 p-2 min-h-0">
        <div className="absolute inset-0" style={{ width: '400px', height: '600px' }}>
          
          {/* SVG Connector Links Layer */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ overflow: 'visible' }}>
            <defs>
              <marker id="arrow-visited" markerWidth="6" markerHeight="6" refX="16" refY="3" orient="auto">
                <polygon points="0 0, 6 3, 0 6" fill="#334155" />
              </marker>
              <marker id="arrow-active" markerWidth="6" markerHeight="6" refX="16" refY="3" orient="auto">
                <polygon points="0 0, 6 3, 0 6" fill="#6366f1" />
              </marker>
              <marker id="arrow-active-amber" markerWidth="6" markerHeight="6" refX="16" refY="3" orient="auto">
                <polygon points="0 0, 6 3, 0 6" fill="#fbbf24" />
              </marker>
            </defs>

            {graph.links.map((link, idx) => {
              const sourceNode = graph.nodes.find((n) => n.id === link.source);
              const targetNode = graph.nodes.find((n) => n.id === link.target);

              if (!sourceNode || !targetNode) return null;

              const isLinkActive = prevNodeId === link.source && activeNodeId === link.target;
              const isLinkVisited = visitedNodes.has(link.source) && (visitedNodes.has(link.target) || activeNodeId === link.target);

              // Calculate connection coordinates (nodes have fixed grid positions)
              const x1 = sourceNode.x;
              const y1 = sourceNode.y + (sourceNode.type === 'condition' ? 30 : 20); // offset based on node height
              const x2 = targetNode.x;
              const y2 = targetNode.y - (targetNode.type === 'condition' ? 30 : 20); // offset based on node height

              // Generate custom paths (loop-backs require curves, normal links are straight vertical)
              let pathData = `M ${x1} ${y1} L ${x2} ${y2}`;
              if (link.type === 'loop-back') {
                // Loop back path curved up and left
                pathData = `M ${x1} ${sourceNode.y} C ${x1} ${sourceNode.y - 120}, ${x2 + 80} ${y2 + 20}, ${x2 + 10} ${y2 - 2}`;
              } else if (link.type === 'call') {
                // Horizontal method invocation curve
                pathData = `M ${sourceNode.x + 55} ${sourceNode.y} C ${sourceNode.x + 100} ${sourceNode.y}, ${targetNode.x} ${targetNode.y - 30}, ${targetNode.x} ${targetNode.y - 15}`;
              } else if (link.type === 'return') {
                // Method exit back to main curve
                pathData = `M ${sourceNode.x} ${sourceNode.y + 15} C ${sourceNode.x} ${sourceNode.y + 50}, ${targetNode.x + 80} ${targetNode.y - 20}, ${targetNode.x + 55} ${targetNode.y}`;
              }

              // Determine color based on link state
              const strokeColor = isLinkActive
                ? (link.type === 'true' ? '#fbbf24' : '#6366f1')
                : isLinkVisited
                ? '#334155'
                : '#1e293b';

              const strokeWidth = isLinkActive ? '2.5' : '1.5';
              const markerId = isLinkActive
                ? (link.type === 'true' ? 'arrow-active-amber' : 'arrow-active')
                : 'arrow-visited';

              return (
                <g key={idx}>
                  {/* Background link */}
                  <path
                    d={pathData}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    markerEnd={`url(#${markerId})`}
                    className={isLinkActive ? 'animate-path-flow' : ''}
                    style={isLinkActive ? {
                      strokeDasharray: '6, 4',
                      animation: 'flow 1s linear infinite'
                    } : undefined}
                  />

                  {/* Traveling electron dot along the active wire link */}
                  {isLinkActive && (
                    <motion.circle
                      r="3.5"
                      fill={link.type === 'true' ? '#fbbf24' : '#818cf8'}
                      className="shadow-glow"
                      style={{
                        offsetPath: `path('${pathData}')`,
                        offsetRotate: 'auto',
                        animation: 'travel 1.5s linear infinite'
                      }}
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {/* HTML Nodes Layer */}
          {graph.nodes.map((node) => {
            const isActive = activeNodeId === node.id;
            const isGhost = ghostNodes.includes(node.id) && !isActive;

            // Dimensions: shape-specific
            const width = node.type === 'condition' ? '70px' : '110px';
            const height = node.type === 'condition' ? '70px' : '36px';

            const activeClass = isActive ? 'animate-active-glow' : '';
            const borderClass = getNodeColorClass(node.type, isActive, isGhost);

            return (
              <div
                key={node.id}
                style={{
                  position: 'absolute',
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  transform: 'translate(-50%, -50%)',
                  width,
                  height,
                  zIndex: 20
                }}
              >
                {/* Node Scale Motion Container */}
                <motion.div
                  animate={isActive ? { scale: 1.05 } : { scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                  className={`w-full h-full flex items-center justify-center font-mono relative ${activeClass}`}
                >
                  {/* Loop Progress Ring overlay around diamond condition */}
                  {node.id === 'loop_check' && loopInfo && isActive && (
                    <div className="absolute inset-0 -m-1 pointer-events-none scale-105">
                      <svg className="w-full h-full -rotate-90">
                        <circle
                          cx="39"
                          cy="39"
                          r="33"
                          fill="transparent"
                          stroke="#1e293b"
                          strokeWidth="2.5"
                        />
                        <motion.circle
                          cx="39"
                          cy="39"
                          r="33"
                          fill="transparent"
                          stroke="#fbbf24"
                          strokeWidth="2.5"
                          strokeDasharray={2 * Math.PI * 33}
                          initial={{ strokeDashoffset: 2 * Math.PI * 33 }}
                          animate={{
                            strokeDashoffset:
                              2 * Math.PI * 33 * (1 - loopInfo.current / loopInfo.total)
                          }}
                          transition={{ duration: 0.5 }}
                        />
                      </svg>
                    </div>
                  )}

                  {/* Active Pulse Ring */}
                  {isActive && (
                    <div className="absolute inset-0 -m-1 border border-indigo-500/50 rounded-xl animate-ping opacity-75"></div>
                  )}

                  {/* RENDER CONDITION (Diamond) */}
                  {node.type === 'condition' ? (
                    <div
                      className={`w-[50px] h-[50px] rotate-45 border flex items-center justify-center shadow-md relative ${borderClass} transition-colors duration-200`}
                    >
                      <div className="-rotate-45 text-[9px] w-[60px] text-center font-bold truncate px-1">
                        {node.label}
                      </div>
                    </div>
                  ) : (
                    /* RENDER START/END (Pill) or STATEMENT (Rectangle) */
                    <div
                      className={`w-full h-full border flex items-center justify-center text-center font-semibold text-[10px] px-2 shadow-md relative select-none transition-colors duration-200 ${
                        node.type === 'start' || node.type === 'end'
                          ? 'rounded-full uppercase tracking-wider'
                          : 'rounded-xl'
                      } ${borderClass}`}
                    >
                      <span className="truncate">{node.label}</span>
                    </div>
                  )}

                </motion.div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CSS Keyframes for wires and traveling dot animations */}
      <style>{`
        @keyframes flow {
          to {
            stroke-dashoffset: -20;
          }
        }
        @keyframes travel {
          0% {
            offsetDistance: 0%;
          }
          100% {
            offsetDistance: 100%;
          }
        }
        .shadow-glow {
          filter: drop-shadow(0 0 4px currentColor);
        }
      `}</style>
    </div>
  );
};

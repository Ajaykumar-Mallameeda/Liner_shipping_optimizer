/**
 * Live Pipeline View - Real-time pipeline execution visualization
 */

import React, { useState, useEffect } from 'react';
import { usePipelineStatus, useStageProgress, useCurrentIteration, useTotalIterations } from '../../store/dashboardStore';

// Pipeline nodes definition
const pipelineNodes = [
  { id: 'orch', label: 'Orchestrator Agent', sub: 'LLM problem analysis', color: '#00d4ff', x: 50, y: 5, type: 'master' },
  { id: 'decomp', label: 'Problem Decomposition', sub: 'Port Clustering · Regional Split', color: '#7c3aed', x: 50, y: 18, type: 'process' },
  { id: 'reg', label: 'Regional Agents × 5', sub: 'Asia · Europe · Americas · ME · Africa', color: '#10b981', x: 50, y: 31, type: 'agents' },
  { id: 'gen', label: 'Service Generator', sub: 'Candidate service pool generation', color: '#06b6d4', x: 50, y: 44, type: 'process' },
  { id: 'ga', label: 'Hierarchical GA', sub: 'Selection · crossover · mutation', color: '#8b5cf6', x: 50, y: 57, type: 'compute' },
  { id: 'milp', label: 'MILP Optimization', sub: 'Flow optimization · hub allocation', color: '#f59e0b', x: 50, y: 70, type: 'compute' },
  { id: 'coord', label: 'Coordinator Agent', sub: 'Conflict detection · resolution', color: '#ef4444', x: 50, y: 83, type: 'master' },
  { id: 'agg', label: 'Global Aggregation', sub: 'Roll-up · Executive summary', color: '#00d4ff', x: 50, y: 96, type: 'output' },
];

export function LivePipelineView() {
  const [active, setActive] = useState(null);
  const [tick, setTick] = useState(0);

  const pipelineStatus = usePipelineStatus();
  const stageProgress = useStageProgress();
  const currentIteration = useCurrentIteration();
  const totalIterations = useTotalIterations();

  // Animation tick
  useEffect(() => {
    if (pipelineStatus === 'running') {
      const t = setInterval(() => setTick(p => p + 1), 80);
      return () => clearInterval(t);
    }
  }, [pipelineStatus]);

  // Get active stage based on progress
  const getActiveStage = () => {
    if (!stageProgress) return null;

    const stageIndex = pipelineNodes.findIndex(n => n.id === stageProgress.stage);
    return stageIndex >= 0 ? stageIndex : null;
  };

  const activeStageIndex = getActiveStage();

  return (
    <div className="flex gap-6 h-full">
      <div className="flex-1 relative" style={{ minHeight: 520 }}>
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="flowGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          {/* Flow animations */}
          {pipelineStatus === 'running' && pipelineNodes.slice(0, -1).map((n, i) => {
            const next = pipelineNodes[i + 1];
            const offset = ((tick * 0.8 + i * 15) % 100) / 100;
            const py = n.y + (next.y - n.y) * offset;
            const isActive = activeStageIndex !== null && i <= activeStageIndex;

            return (
              <g key={n.id}>
                <line
                  x1={n.x}
                  y1={n.y + 2}
                  x2={next.x}
                  y2={next.y - 2}
                  stroke="url(#flowGrad)"
                  strokeWidth="0.3"
                  strokeOpacity={isActive ? 0.8 : 0.2}
                />
                <circle
                  cx={n.x}
                  cy={py}
                  r="0.8"
                  fill={isActive ? '#00d4ff' : '#6b7280'}
                  opacity={isActive ? 0.9 : 0.3}
                >
                  {isActive && (
                    <animate
                      attributeName="opacity"
                      values="0.4;1;0.4"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  )}
                </circle>
              </g>
            );
          })}

          {/* Feedback loop arrow */}
          <path
            d="M 80,83 Q 95,57 80,31"
            stroke="#ef4444"
            strokeWidth="0.5"
            fill="none"
            strokeDasharray="2,2"
            strokeOpacity={currentIteration > 0 ? 0.9 : 0.3}
          />
          <polygon
            points="78,33 80,29 82,33"
            fill="#ef4444"
            opacity={currentIteration > 0 ? 0.9 : 0.3}
          />
          <text
            x={90}
            y={60}
            fontSize="2.5"
            fill="#ef4444"
            opacity={currentIteration > 0 ? 0.9 : 0.3}
            textAnchor="middle"
          >
            feedback
          </text>
        </svg>

        {/* Pipeline nodes */}
        <div className="relative z-10 flex flex-col gap-2 py-4 px-8">
          {pipelineNodes.map((node) => {
            const isActive = activeStageIndex !== null &&
                           pipelineNodes.findIndex(n => n.id === node.id) <= activeStageIndex;
            const isComplete = activeStageIndex !== null &&
                            pipelineNodes.findIndex(n => n.id === node.id) < activeStageIndex;

            return (
              <button
                key={node.id}
                onClick={() => setActive(active === node.id ? null : node.id)}
                className="group flex items-center gap-3 rounded-lg px-4 py-2.5 transition-all duration-200 text-left"
                style={{
                  background: active === node.id ? `${node.color}18` :
                           isActive ? `${node.color}08` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${active === node.id ? node.color + "66" :
                              isActive ? node.color + "33" : "rgba(255,255,255,0.06)"}`,
                  boxShadow: active === node.id ? `0 0 20px ${node.color}22` :
                              isActive ? `0 0 10px ${node.color}11` : "none"
                }}
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{
                  backgroundColor: node.color,
                  boxShadow: `0 0 6px ${node.color}`,
                  opacity: isActive ? 1 : 0.3
                }} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-white/90" style={{ fontFamily: "'Courier New', monospace", letterSpacing: "0.02em" }}>
                    {node.label}
                  </div>
                  <div className="text-xs text-white/40 mt-0.5">{node.sub}</div>
                </div>
                <div className="text-xs px-2 py-0.5 rounded" style={{
                  background: `${node.color}22`,
                  color: isActive ? node.color : "#6b7280",
                  border: `1px solid ${node.color}44`
                }}>
                  {isComplete ? '✓' : isActive ? '⏳' : node.type}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sidebar stats */}
      <div className="w-64 flex-shrink-0">
        <div className="rounded-xl p-4 h-full" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-xs font-mono text-white/40 mb-4 uppercase tracking-widest">
            Pipeline Stats
          </div>

          {/* Current stage progress */}
          {stageProgress && (
            <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)' }}>
              <div className="text-xs font-mono text-cyan-400 mb-2">
                {stageProgress.stage.toUpperCase()}
              </div>
              <div className="text-xs text-white/60 mb-2">
                {stageProgress.message}
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${stageProgress.progress}%`, background: '#00d4ff' }}
                />
              </div>
              <div className="text-xs text-white/40 mt-1 font-mono">
                {stageProgress.progress.toFixed(0)}% complete
              </div>
            </div>
          )}

          {/* Statistics */}
          {[
            { label: 'Total Runtime', value: `${Math.floor((Date.now() - (stageProgress?.timestamp || Date.now())) / 1000)}s` },
            { label: 'Current Iteration', value: `${currentIteration + 1}/${totalIterations}` },
            { label: 'Pipeline Status', value: pipelineStatus },
            { label: 'Active Stage', value: stageProgress?.stage || 'None' },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-xs text-white/50">{label}</span>
              <span className="text-xs font-mono text-white/90">{value}</span>
            </div>
          ))}

          {/* Iteration feedback */}
          {currentIteration > 0 && (
            <div className="mt-4">
              <div className="text-xs text-white/40 mb-2 font-mono uppercase tracking-widest">
                Feedback Loop
              </div>
              <div className="flex gap-1 mt-2">
                {Array.from({ length: totalIterations }, (_, i) => (
                  <div key={i} className="flex-1 rounded p-2 text-center" style={{
                    background: i < currentIteration ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${i < currentIteration ? '#10b98133' : 'rgba(255,255,255,0.1)'}`
                  }}>
                    <div className="text-xs font-mono" style={{ color: i < currentIteration ? '#10b981' : '#6b7280' }}>
                      it.{i}
                    </div>
                    <div className="text-xs text-white/60 mt-0.5">
                      {i < currentIteration ? '✓' : '⏳'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status indicator */}
          <div className="mt-4 p-3 rounded-lg" style={{
            background: pipelineStatus === 'running' ? 'rgba(245,158,11,0.08)' :
                       pipelineStatus === 'complete' ? 'rgba(16,185,129,0.08)' :
                       pipelineStatus === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${pipelineStatus === 'running' ? 'rgba(245,158,11,0.2)' :
                              pipelineStatus === 'complete' ? 'rgba(16,185,129,0.2)' :
                              pipelineStatus === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)'}`
          }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{
                backgroundColor: pipelineStatus === 'running' ? '#f59e0b' :
                                 pipelineStatus === 'complete' ? '#10b981' :
                                 pipelineStatus === 'error' ? '#ef4444' : '#6b7280'
              }} />
              <span className="text-xs font-mono uppercase tracking-widest" style={{
                color: pipelineStatus === 'running' ? '#f59e0b' :
                       pipelineStatus === 'complete' ? '#10b981' :
                       pipelineStatus === 'error' ? '#ef4444' : '#6b7280'
              }}>
                {pipelineStatus}
              </span>
            </div>
            {stageProgress && (
              <div className="text-xs text-white/40 mt-2 font-mono">
                {stageProgress.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
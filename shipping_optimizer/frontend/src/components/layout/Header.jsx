import PulseDot from '../common/PulseDot.jsx';
import { fmtNum } from '../../utils/formatters.js';

export default function Header({ optimizationState, startOptimization, isPipelineRunning, showFlows, onToggleFlows, onReset, onToggleFullscreen, presentationMode, onToggleDemo, demoMode, onExport }) {
  return (
    <header className="dashboard-header flex-shrink-0 flex items-center justify-between px-6 py-3 relative z-10"
      style={{ background: "rgba(2,12,24,0.95)", borderBottom: "1px solid rgba(0,212,255,0.15)", backdropFilter: "blur(20px)" }}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold"
              style={{ background: "linear-gradient(135deg, #00d4ff22, #10b98122)", border: "1px solid #00d4ff44", color: "#00d4ff" }}>
              ⬡
            </div>
          </div>
          <div>
            <div className="text-sm font-bold tracking-widest text-white uppercase" style={{ letterSpacing: "0.12em" }}>AI Vessel Routing System</div>
            <div className="text-xs text-white/30 uppercase tracking-widest" style={{ fontSize: "9px" }}>Multi-Agent Liner Shipping Optimizer</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-2">
          <PulseDot color={optimizationState.isConnected ? "#10b981" : "#ef4444"} />
          <span className={`text-xs font-mono uppercase tracking-widest ${optimizationState.isConnected ? "text-emerald-400" : "text-red-400"}`}>
            {optimizationState.isConnected ? "Live" : "Offline"}
          </span>
          {optimizationState.isPipelineRunning && (
            <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">
              {optimizationState.currentStage}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-5">
        {[
          { label: "Ports", value: fmtNum(optimizationState.global.ports) },
          { label: "Lanes", value: fmtNum(optimizationState.global.lanes) },
          { label: "Services", value: fmtNum(optimizationState.global.services) },
          { label: "Weekly TEU", value: `${(optimizationState.global.weeklyDemand / 1000).toFixed(0)}K` },
          {label: "Runtime", value: `${optimizationState.global.runtime || "0.0"}s` },
          { label: "Iterations", value: optimizationState.iterations.length.toString() },
          { label: "Convergence", value: optimizationState.global.convergence.toFixed(3) },
        ].map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="text-xs font-bold text-white/90 font-mono">{value}</div>
            <div className="text-white/30 font-mono" style={{ fontSize: "9px", letterSpacing: "0.08em" }}>{label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={startOptimization}
          disabled={isPipelineRunning}
          className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: isPipelineRunning ? "rgba(239,68,68,0.08)" : "rgba(0,212,255,0.08)", border: `1px solid ${isPipelineRunning ? "rgba(239,68,68,0.2)" : "rgba(0,212,255,0.2)"}`, color: isPipelineRunning ? "rgba(239,68,68,0.8)" : "rgba(0,212,255,0.8)" }}>
          {isPipelineRunning ? "⏸ Running" : "▶ Play"}
        </button>
        <button onClick={onToggleFlows} className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105"
          style={{ background: showFlows ? "rgba(0,212,255,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${showFlows ? "rgba(0,212,255,0.3)" : "rgba(255,255,255,0.08)"}`, color: showFlows ? "rgba(0,212,255,0.9)" : "#e2e8f0" }}>
          {showFlows ? "⏻ Flows" : "⊝ Flows"}
        </button>
        <button onClick={onReset} className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}>
          ⊡ Reset
        </button>
        <button onClick={onToggleFullscreen} className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105"
          style={{ background: presentationMode ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${presentationMode ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)"}`, color: presentationMode ? "#10b981" : "#e2e8f0" }}>
          ⛶ Fullscreen
        </button>
        <button onClick={onToggleDemo} className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105"
          style={{ background: demoMode ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${demoMode ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)"}`, color: demoMode ? "#10b981" : "#e2e8f0" }}>
          {demoMode ? "⏸ Demo" : "▶ Demo"}
        </button>
        <button onClick={onExport} className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}>
          ↓ Export
        </button>
      </div>
    </header>
  );
}

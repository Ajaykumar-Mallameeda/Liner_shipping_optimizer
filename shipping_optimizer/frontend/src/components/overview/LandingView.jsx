import KpiCard from './KpiCard.jsx';
import PulseDot from '../common/PulseDot.jsx';
import { BENCHMARKS } from '../common/BenchmarkBadge.jsx';
import { fmt, fmtNum } from '../../utils/formatters.js';

export default function LandingView({ optimizationState }) {
  const g = optimizationState.global;
  return (
    <div className="space-y-5">
      <div className="rounded-xl p-6" style={{ background: "linear-gradient(135deg, rgba(0,212,255,0.12), rgba(16,185,129,0.08))", border: "1px solid rgba(0,212,255,0.2)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <PulseDot color={optimizationState.isConnected ? "#10b981" : "#ef4444"} />
            <span className="text-xs font-mono uppercase" style={{ color: optimizationState.isConnected ? "#10b981" : "#ef4444" }}>
              {optimizationState.isConnected ? "System Operational" : "Offline"}
            </span>
          </div>
          {optimizationState.isPipelineRunning && (
            <span className="text-xs font-mono text-cyan-400">{optimizationState.currentStage}</span>
          )}
        </div>
        <div className="text-5xl font-bold font-mono tracking-tight mb-2" style={{ color: "#00d4ff", textShadow: "0 0 40px rgba(0,212,255,0.3)" }}>
          {g.weeklyProfit ? `$${(g.weeklyProfit / 1e6).toFixed(1)}M` : "$0M"}
        </div>
        <div className="text-sm text-white/40 font-mono">weekly profit · all regions</div>
      </div>
      <div className="grid grid-cols-5 gap-4">
        <KpiCard label="Coverage" value={`${g.coverage.toFixed(1)}%`} sub={`${(g.unserved || 0).toLocaleString()} TEU unserved`} color="#00d4ff"
          rawValue={g.coverage} benchmark={BENCHMARKS.coverage} />
        <KpiCard label="Margin" value={`${g.margin.toFixed(1)}%`} sub={fmt(g.operatingCost || 0)} color="#10b981"
          rawValue={g.margin} benchmark={BENCHMARKS.margin} />
        <KpiCard label="Services" value={(g.totalServices || 0).toLocaleString()} sub="deployed globally" color="#8b5cf6"
          rawValue={g.totalServices} benchmark={BENCHMARKS.services} />
        <KpiCard label="Ports" value={g.ports ? g.ports.toLocaleString() : "—"} sub="in network" color="#f59e0b" />
        <KpiCard label="Demand" value={g.weeklyDemand ? `${(g.weeklyDemand / 1000).toFixed(0)}K` : "—"} sub="TEU/wk" color="#ec4899" />
      </div>
      <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-2">Executive Summary</div>
        <p className="text-sm text-white/70 font-mono leading-relaxed">
          {g.executive_summary ? g.executive_summary.slice(0, 280) + "..." : "Run the optimization pipeline to generate an executive summary."}
        </p>
      </div>
    </div>
  );
}

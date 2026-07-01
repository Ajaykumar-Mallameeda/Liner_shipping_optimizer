import { fmt } from '../../utils/formatters.js';

export default function FeedbackView({ optimizationState }) {
  const maxProfit = Math.max(...optimizationState.iterations.map(i => i.profit));
  const convScores = optimizationState.iterations.map(it => it.score).filter(s => s > 0);
  const minScore = convScores.length > 1 ? Math.min(...convScores) : 0.95;
  const maxScore = convScores.length > 1 ? Math.max(...convScores) : 1.0;
  const range = Math.max(maxScore - minScore, 0.01);
  const gridLines = convScores.length > 1
    ? Array.from({length: 5}, (_, i) => minScore + (range * i / 4))
    : [0.95, 0.97, 0.99];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {optimizationState.iterations.map((it) => (
          <div key={it.iter} className="rounded-xl p-5 transition-all"
            style={{
              background: it.rerun ? "rgba(239,68,68,0.06)" : "rgba(16,185,129,0.06)",
              border: `1px solid ${it.rerun ? "#ef444433" : "#10b98133"}`
            }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono text-white/40 uppercase tracking-widest">Iteration {it.iter}</span>
              <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: it.rerun ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)", color: it.rerun ? "#ef4444" : "#10b981" }}>
                {it.rerun ? "RERUN" : "CONVERGED"}
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-white mb-1">{fmt(it.profit)}</div>
            <div className="text-xs text-white/40 mb-3">weekly profit</div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded p-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div className="text-xs text-white/40 font-mono">Coverage</div>
                <div className="text-sm font-mono text-white/80">{it.coverage.toFixed(1)}%</div>
              </div>
              <div className="rounded p-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div className="text-xs text-white/40 font-mono">Conv.Score</div>
                <div className="text-sm font-mono text-white/80">{it.score}</div>
              </div>
            </div>
            <div className="text-xs text-white/40 font-mono leading-relaxed">{it.reason.slice(0, 60)}...</div>

            <div className="mt-3">
              <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${(it.profit / maxProfit) * 100}%`, background: it.rerun ? "#ef4444" : "#10b981" }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-4">Convergence Trajectory</div>
        <svg viewBox="0 0 400 80" className="w-full">
          <defs>
            <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {gridLines.map((v, i) => {
            const y = 70 - ((v - minScore) / range) * 60;
            return (
              <g key={i}>
                <line x1={40} y1={y} x2={390} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                <text x={35} y={y + 3} fontSize="7" fill="rgba(255,255,255,0.3)" textAnchor="end" fontFamily="monospace">{v.toFixed(3)}</text>
              </g>
            );
          })}
          <polygon
            points={optimizationState.iterations.length > 0
              ? `${optimizationState.iterations.map((it, i) => {
                  const x = 40 + (i / Math.max(1, optimizationState.iterations.length - 1)) * 320;
                  const y = 70 - ((it.score - minScore) / range) * 60;
                  return `${x},${y}`;
                }).join(" ")} ${40 + (Math.max(0, optimizationState.iterations.length - 1) / Math.max(1, optimizationState.iterations.length - 1)) * 320},70 40,70`
              : "40,70 40,70"}
            fill="url(#convGrad)"
            className="transition-all duration-700"
          />
          <polyline
            points={optimizationState.iterations.length > 0
              ? optimizationState.iterations.map((it, i) => {
                  const x = 40 + (i / Math.max(1, optimizationState.iterations.length - 1)) * 320;
                  const y = 70 - ((it.score - minScore) / range) * 60;
                  return `${x},${y}`;
                }).join(" ")
              : "40,70"}
            fill="none" stroke="#00d4ff" strokeWidth="2" strokeLinejoin="round"
            className="transition-all duration-700"
          />
          {optimizationState.iterations.map((it, i) => {
            const x = 40 + (i / Math.max(1, optimizationState.iterations.length - 1)) * 320;
            const cy = 70 - ((it.score - minScore) / range) * 60;
            return (
              <g key={it.iter}>
                <circle cx={x} cy={cy} r="4" fill="#00d4ff" />
                <circle cx={x} cy={cy} r="8" fill="#00d4ff" opacity="0.2" />
                <text x={x} y={cy - 10} fontSize="7" fill="#00d4ff" textAnchor="middle" fontFamily="monospace">it.{it.iter}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Final Convergence",
            value: optimizationState.iterations.length > 0 ? optimizationState.iterations[optimizationState.iterations.length - 1].score.toFixed(3) : "N/A",
            color: "#10b981",
            sub: `${optimizationState.iterations.length > 0 ? (optimizationState.iterations[optimizationState.iterations.length - 1].score * 100).toFixed(1) : 0}% optimal`
          },
          {
            label: "Coverage Gap",
            value: optimizationState.global?.decision_output?.feedback?.coverage_gap ? `${optimizationState.global.decision_output.feedback.coverage_gap.toFixed(2)}pp` : "N/A",
            color: "#f59e0b",
            sub: "below 70% target"
          },
          {
            label: "Profit Improvement",
            value: optimizationState.iterations.length > 1
              ? `+${(((optimizationState.iterations[optimizationState.iterations.length - 1].profit - optimizationState.iterations[0].profit) / optimizationState.iterations[0].profit) * 100).toFixed(1)}%`
              : "N/A",
            color: "#00d4ff",
            sub: optimizationState.iterations.length > 1 ? `it.0 → it.${optimizationState.iterations.length - 1}` : "Baseline"
          },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="rounded-lg p-4 text-center" style={{ background: `${color}08`, border: `1px solid ${color}22` }}>
            <div className="text-xs text-white/40 font-mono mb-1">{label}</div>
            <div className="text-2xl font-bold font-mono" style={{ color }}>{value}</div>
            <div className="text-xs text-white/40 mt-1">{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

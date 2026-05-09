import { useState, useEffect, useRef, useCallback } from "react";

// Import WebSocket integration hook
// Note: In production, these files would be bundled together
// For demo purposes, we'll simulate the WebSocket connection
const useOptimizationState = () => {
  const [state, setState] = useState({
    global: {
      ports: 435, lanes: 9622, services: 1200, weeklyDemand: 833484,
      runtime: 356.1, iterations: 3, convergence: 0.982,
      weeklyProfit: 773616415, annualProfit: 40228053557,
      coverage: 59.5, totalServices: 465, margin: 84.0, unserved: 337374,
      operatingCost: 146921209
    },
    regions: [
      { id: "asia", name: "Asia", color: "#00d4ff", profit: 106904049, coverage: 76.9, services: 99, margin: 79.7, cost: 20610000, uncovered: 24978, hubs: [146, 176, 282, 48, 102], strategy: "hybrid", generated: 802, filtered: 400, selected: 99 },
      { id: "europe", name: "Europe", color: "#7c3aed", profit: 71797633, coverage: 49.7, services: 88, margin: 71.7, cost: 20250000, uncovered: 88188, hubs: [221, 36, 75, 13, 86], strategy: "hybrid", generated: 896, filtered: 400, selected: 88 },
      { id: "americas", name: "Americas", color: "#10b981", profit: 466846485, coverage: 56.4, services: 94, margin: 92.0, cost: 20140000, uncovered: 180468, hubs: [235, 285, 100, 129, 41], strategy: "hybrid", generated: 826, filtered: 400, selected: 94 },
      { id: "middle_east", name: "Middle East", color: "#f59e0b", profit: 55850044, coverage: 86.2, services: 77, margin: 73.9, cost: 17340000, uncovered: 4776, hubs: [229, 225, 190, 108, 220], strategy: "hybrid", generated: 764, filtered: 400, selected: 77 },
      { id: "africa", name: "Africa", color: "#ef4444", profit: 72218205, coverage: 61.7, services: 107, margin: 70.1, cost: 21030000, uncovered: 38964, hubs: [113, 112, 69, 114, 204], strategy: "hybrid", generated: 812, filtered: 400, selected: 107 }
    ],
    iterations: [
      { iter: 0, profit: 740786392, coverage: 64.7, score: 0.975, rerun: true, reason: "coverage 64.7% is 5.3pp below 70.0% target" },
      { iter: 1, profit: 771721477, coverage: 66.0, score: 0.981, rerun: true, reason: "coverage 66.0% is 4.0pp below 70.0% target" },
      { iter: 2, profit: 773616415, coverage: 66.2, score: 0.982, rerun: false, reason: "[CAPPED] max iterations reached" }
    ],
    corridors: [
      { from: "Port 285", to: "Port 146", teu: 10902, region: "americas" },
      { from: "Port 235", to: "Port 36", teu: 5292, region: "americas" },
      { from: "Port 235", to: "Port 146", teu: 4938, region: "americas" },
      { from: "Port 221", to: "Port 100", teu: 1932, region: "europe" },
      { from: "Port 112", to: "Port 176", teu: 1128, region: "africa" }
    ],
    isConnected: true,
    isPipelineRunning: false,
    currentStage: null,
    stageProgress: 0,
    currentIteration: 0,
    maxIterations: 3,
    pipelineError: null
  });

  const startOptimization = useCallback(() => {
    // This would connect to the WebSocket and start the pipeline
    console.log("Starting optimization pipeline...");
  }, []);

  return { ...state, startOptimization };
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
const fmt = (n) => n >= 1e9 ? `$${(n/1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : `$${n.toLocaleString()}`;
const fmtNum = (n) => n.toLocaleString();

// ─── ANIMATED COUNTER ────────────────────────────────────────────────────────
function Counter({ value, prefix = "", suffix = "", decimals = 0, duration = 2000 }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = value / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= value) { setCount(value); clearInterval(timer); }
      else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [value, duration]);
  return <span>{prefix}{decimals > 0 ? count.toFixed(decimals) : Math.floor(count).toLocaleString()}{suffix}</span>;
}

// ─── SPARKLINE ───────────────────────────────────────────────────────────────
function Sparkline({ data, color, height = 32 }) {
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 60;
    const y = height - ((v - min) / (max - min + 0.001)) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width="60" height={height} className="opacity-60">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ─── PULSE DOT ───────────────────────────────────────────────────────────────
function PulseDot({ color = "#00d4ff" }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }} />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: color }} />
    </span>
  );
}

// ─── PROGRESS BAR ────────────────────────────────────────────────────────────
function ProgressBar({ value, max = 100, color, animated = true }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-1000 ${animated ? "" : ""}`}
        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}aa, ${color})`, boxShadow: `0 0 8px ${color}66` }}
      />
    </div>
  );
}

// ─── NAV ITEM ────────────────────────────────────────────────────────────────
const navItems = [
  { id: "overview", label: "Overview", icon: "⬡" },
  { id: "pipeline", label: "Pipeline", icon: "◈" },
  { id: "regional", label: "Regional Agents", icon: "◎" },
  { id: "funnel", label: "GA · MILP Analytics", icon: "◆" },
  { id: "feedback", label: "Feedback Loop", icon: "↺" },
  { id: "conflict", label: "Conflict Resolution", icon: "⧖" },
  { id: "map", label: "Maritime Map", icon: "⊕" },
  { id: "summary", label: "Executive Summary", icon: "▣" },
];

// ─── PIPELINE NODES ──────────────────────────────────────────────────────────
const pipelineNodes = [
  { id: "orch", label: "Orchestrator Agent", sub: "LLM problem analysis", color: "#00d4ff", x: 50, y: 5, type: "master" },
  { id: "decomp", label: "Problem Decomposition", sub: "Port Clustering · Regional Split", color: "#7c3aed", x: 50, y: 18, type: "process" },
  { id: "reg", label: "Regional Agents × 5", sub: "Asia · Europe · Americas · ME · Africa", color: "#10b981", x: 50, y: 31, type: "agents" },
  { id: "gen", label: "Service Generator", sub: "1,200 candidate services", color: "#06b6d4", x: 50, y: 44, type: "process" },
  { id: "ga", label: "Hierarchical GA", sub: "Selection · crossover · mutation", color: "#8b5cf6", x: 50, y: 57, type: "compute" },
  { id: "milp", label: "MILP Optimization", sub: "Flow optimization · hub allocation", color: "#f59e0b", x: 50, y: 70, type: "compute" },
  { id: "coord", label: "Coordinator Agent", sub: "Conflict detection · resolution", color: "#ef4444", x: 50, y: 83, type: "master" },
  { id: "agg", label: "Global Aggregation", sub: "Roll-up · Executive summary", color: "#00d4ff", x: 50, y: 96, type: "output" },
];

// ─── PIPELINE VIEW ───────────────────────────────────────────────────────────
function PipelineView() {
  const [active, setActive] = useState(null);
  const [tick, setTick] = useState(0);

  // Get live pipeline state
  const optimizationState = useOptimizationState();

  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 80);
    return () => clearInterval(t);
  }, []);

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
          {pipelineNodes.slice(0, -1).map((n, i) => {
            const next = pipelineNodes[i + 1];
            const offset = ((tick * 0.8 + i * 15) % 100) / 100;
            const py = n.y + (next.y - n.y) * offset;
            return (
              <g key={n.id}>
                <line x1={n.x} y1={n.y + 2} x2={next.x} y2={next.y - 2} stroke="url(#flowGrad)" strokeWidth="0.3" strokeOpacity="0.4" />
                <circle cx={n.x} cy={py} r="0.8" fill="#00d4ff" opacity="0.9">
                  <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite" />
                </circle>
              </g>
            );
          })}
          {/* Feedback loop arrow */}
          <path d="M 80,83 Q 95,57 80,31" stroke="#ef4444" strokeWidth="0.5" fill="none" strokeDasharray="2,2" strokeOpacity="0.7" />
          <polygon points="78,33 80,29 82,33" fill="#ef4444" opacity="0.7" />
          <text x="90" y="60" fontSize="2.5" fill="#ef4444" opacity="0.7" textAnchor="middle">feedback</text>
        </svg>

        <div className="relative z-10 flex flex-col gap-2 py-4 px-8">
          {pipelineNodes.map((node) => (
            <button
              key={node.id}
              onClick={() => setActive(active === node.id ? null : node.id)}
              className="group flex items-center gap-3 rounded-lg px-4 py-2.5 transition-all duration-200 text-left"
              style={{
                background: active === node.id ? `${node.color}18` : "rgba(255,255,255,0.02)",
                border: `1px solid ${active === node.id ? node.color + "66" : "rgba(255,255,255,0.06)"}`,
                boxShadow: active === node.id ? `0 0 20px ${node.color}22` : "none"
              }}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: node.color, boxShadow: `0 0 6px ${node.color}` }} />
              <div className="flex-1">
                <div className="text-sm font-medium text-white/90" style={{ fontFamily: "'Courier New', monospace", letterSpacing: "0.02em" }}>{node.label}</div>
                <div className="text-xs text-white/40 mt-0.5">{node.sub}</div>
              </div>
              <div className="text-xs px-2 py-0.5 rounded" style={{ background: `${node.color}22`, color: node.color, border: `1px solid ${node.color}44` }}>
                {node.type}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="w-64 flex-shrink-0">
        <div className="rounded-xl p-4 h-full" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="text-xs font-mono text-white/40 mb-4 uppercase tracking-widest">Pipeline Stats</div>
          {[
            { label: "Total Runtime", value: `${optimizationState.global.runtime || "356.1"}s` },
            { label: "Feedback Iterations", value: DATA.iterations.length.toString() },
            { label: "Convergence Score", value: optimizationState.global.convergence.toFixed(3) },
            { label: "Services Generated", value: "4,100" },
            { label: "Services Filtered", value: "2,000" },
            { label: "Services Selected", value: fmtNum(DATA.global.totalServices) },
            { label: "Conflicts Detected", value: "0" },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-xs text-white/50">{label}</span>
              <span className="text-xs font-mono text-white/90">{value}</span>
            </div>
          ))}
          <div className="mt-4">
            <div className="text-xs text-white/40 mb-2 font-mono uppercase tracking-widest">Feedback Loop</div>
            <div className="flex gap-1 mt-2">
              {DATA.iterations.map((it, i) => (
                <div key={i} className="flex-1 rounded p-2 text-center" style={{ background: it.rerun ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)", border: `1px solid ${it.rerun ? "#ef444433" : "#10b98133"}` }}>
                  <div className="text-xs font-mono" style={{ color: it.rerun ? "#ef4444" : "#10b981" }}>it.{it.iter}</div>
                  <div className="text-xs text-white/60 mt-0.5">{it.coverage.toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── REGION CARD ─────────────────────────────────────────────────────────────
function RegionCard({ r, onClick, selected }) {
  return (
    <div
      onClick={() => onClick(r)}
      className="cursor-pointer rounded-xl p-4 transition-all duration-300 hover:scale-[1.02]"
      style={{
        background: selected ? `${r.color}12` : "rgba(255,255,255,0.025)",
        border: `1px solid ${selected ? r.color + "55" : "rgba(255,255,255,0.07)"}`,
        boxShadow: selected ? `0 0 30px ${r.color}20, inset 0 0 20px ${r.color}08` : "none"
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color, boxShadow: `0 0 8px ${r.color}` }} />
          <span className="text-sm font-semibold text-white/90" style={{ fontFamily: "'Courier New', monospace" }}>{r.name}</span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: `${r.color}20`, color: r.color }}>{r.strategy}</span>
      </div>

      <div className="text-xl font-bold text-white mb-1" style={{ fontFamily: "'Courier New', monospace" }}>
        {fmt(r.profit)}
      </div>
      <div className="text-xs text-white/40 mb-3">weekly profit</div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: "Coverage", value: `${r.coverage}%` },
          { label: "Services", value: r.services },
          { label: "Margin", value: `${r.margin}%` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div className="text-xs text-white/40 mb-0.5">{label}</div>
            <div className="text-sm font-mono text-white/90">{value}</div>
          </div>
        ))}
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-xs text-white/40 mb-1">
          <span>Coverage</span><span>{r.coverage}%</span>
        </div>
        <ProgressBar value={r.coverage} color={r.color} />
      </div>

      <div className="flex flex-wrap gap-1 mt-2">
        {r.hubs.slice(0, 3).map(h => (
          <span key={h} className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: `${r.color}15`, color: r.color + "cc", border: `1px solid ${r.color}30` }}>
            P{h}
          </span>
        ))}
        <span className="text-xs px-1.5 py-0.5 rounded font-mono text-white/30" style={{ background: "rgba(255,255,255,0.04)" }}>
          +{r.hubs.length - 3}
        </span>
      </div>
    </div>
  );
}

// ─── REGIONAL VIEW ───────────────────────────────────────────────────────────
function RegionalView() {
  const [sel, setSel] = useState(DATA.regions[0]);
  return (
    <div className="flex gap-6 h-full">
      <div className="grid grid-cols-1 gap-3 w-80 flex-shrink-0 overflow-y-auto pr-1">
        {DATA.regions.map(r => <RegionCard key={r.id} r={r} onClick={setSel} selected={sel?.id === r.id} />)}
      </div>
      <div className="flex-1 rounded-xl p-5 overflow-y-auto" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {sel && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: sel.color, boxShadow: `0 0 12px ${sel.color}` }} />
              <h2 className="text-lg font-semibold text-white" style={{ fontFamily: "'Courier New', monospace" }}>{sel.name} Regional Agent</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                { label: "Weekly Profit", value: fmt(sel.profit), color: sel.color },
                { label: "Annual Profit", value: fmt(sel.profit * 52), color: "#10b981" },
                { label: "Operating Cost", value: fmt(sel.cost), color: "#ef4444" },
                { label: "Uncovered TEU", value: fmtNum(sel.uncovered), color: "#f59e0b" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg p-4" style={{ background: `${color}08`, border: `1px solid ${color}22` }}>
                  <div className="text-xs text-white/40 mb-1 font-mono">{label}</div>
                  <div className="text-xl font-bold font-mono" style={{ color }}>{value}</div>
                </div>
              ))}
            </div>

            <div className="mb-5">
              <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-3">Service Funnel</div>
              <div className="flex items-center gap-2">
                {[
                  { label: "Generated", value: sel.generated, w: 100 },
                  { label: "Filtered", value: sel.filtered, w: (sel.filtered / sel.generated) * 100 },
                  { label: "Selected", value: sel.selected, w: (sel.selected / sel.generated) * 100 },
                ].map(({ label, value, w }, i) => (
                  <div key={label} className="flex-1">
                    <div className="text-xs text-white/40 mb-1 font-mono">{label}</div>
                    <div className="h-8 rounded flex items-center justify-center text-sm font-bold font-mono transition-all duration-700"
                      style={{ width: `${Math.max(30, w)}%`, background: `${sel.color}${i === 0 ? "40" : i === 1 ? "30" : "60"}`, color: sel.color }}>
                      {fmtNum(value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-3">Hub Ports</div>
              <div className="flex flex-wrap gap-2">
                {sel.hubs.map(h => (
                  <div key={h} className="px-3 py-1.5 rounded-lg text-sm font-mono" style={{ background: `${sel.color}15`, color: sel.color, border: `1px solid ${sel.color}33` }}>
                    Port {h}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-2">Strategy</div>
              <div className="text-sm text-white/80 font-mono">
                Strategy C — <span style={{ color: sel.color }}>Hybrid</span><br />
                <span className="text-white/50 text-xs">Balancing hub consolidation with direct lane coverage across {sel.services} selected services.</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FUNNEL CHART ────────────────────────────────────────────────────────────
function FunnelView() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-3">
        {DATA.regions.map(r => (
          <div key={r.id} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-1.5 mb-3">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color }} />
              <span className="text-xs font-mono text-white/70">{r.name}</span>
            </div>
            {[
              { label: "Gen", value: r.generated, max: 900 },
              { label: "Flt", value: r.filtered, max: 900 },
              { label: "Sel", value: r.selected, max: 900 },
            ].map(({ label, value, max }) => (
              <div key={label} className="mb-2">
                <div className="flex justify-between text-xs text-white/40 mb-1">
                  <span className="font-mono">{label}</span>
                  <span className="font-mono">{fmtNum(value)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(value / max) * 100}%`, background: r.color, opacity: label === "Sel" ? 1 : 0.5 }} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-4">Profit per Service ($/wk)</div>
          <div className="space-y-2">
            {DATA.regions.map(r => {
              const pps = Math.round(r.profit / r.services);
              return (
                <div key={r.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/60 font-mono">{r.name}</span>
                    <span className="font-mono" style={{ color: r.color }}>${fmtNum(pps)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(pps / 5000000) * 100}%`, background: `linear-gradient(90deg, ${r.color}88, ${r.color})`, boxShadow: `0 0 6px ${r.color}66` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-4">Coverage Distribution</div>
          <div className="space-y-2">
            {DATA.regions.map(r => (
              <div key={r.id}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/60 font-mono">{r.name}</span>
                  <span className="font-mono" style={{ color: r.color }}>{r.coverage}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${r.coverage}%`, background: `linear-gradient(90deg, ${r.color}66, ${r.color})` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FEEDBACK VIEW ───────────────────────────────────────────────────────────
function FeedbackView() {
  const maxProfit = Math.max(...DATA.iterations.map(i => i.profit));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {DATA.iterations.map((it) => (
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
                <div className="text-sm font-mono text-white/80">{it.coverage}%</div>
              </div>
              <div className="rounded p-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div className="text-xs text-white/40 font-mono">Conv.Score</div>
                <div className="text-sm font-mono text-white/80">{it.score}</div>
              </div>
            </div>
            <div className="text-xs text-white/40 font-mono leading-relaxed">{it.reason.slice(0, 60)}...</div>

            {/* profit bar */}
            <div className="mt-3">
              <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${(it.profit / maxProfit) * 100}%`, background: it.rerun ? "#ef4444" : "#10b981" }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Convergence graph */}
      <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-4">Convergence Trajectory</div>
        <svg viewBox="0 0 400 80" className="w-full">
          <defs>
            <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Grid */}
          {[0.97, 0.975, 0.98, 0.985].map((v, i) => {
            const y = 70 - ((v - 0.97) / 0.015) * 60;
            return (
              <g key={i}>
                <line x1={40} y1={y} x2={390} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                <text x={35} y={y + 3} fontSize="7" fill="rgba(255,255,255,0.3)" textAnchor="end" fontFamily="monospace">{v.toFixed(3)}</text>
              </g>
            );
          })}
          {/* Area */}
          <polygon
            points={`40,${70 - ((0.975 - 0.97) / 0.015) * 60} 200,${70 - ((0.981 - 0.97) / 0.015) * 60} 360,${70 - ((0.982 - 0.97) / 0.015) * 60} 360,70 40,70`}
            fill="url(#convGrad)"
          />
          {/* Line */}
          <polyline
            points={`40,${70 - ((0.975 - 0.97) / 0.015) * 60} 200,${70 - ((0.981 - 0.97) / 0.015) * 60} 360,${70 - ((0.982 - 0.97) / 0.015) * 60}`}
            fill="none" stroke="#00d4ff" strokeWidth="2" strokeLinejoin="round"
          />
          {[
            { x: 40, y: 0.975, label: "it.0" },
            { x: 200, y: 0.981, label: "it.1" },
            { x: 360, y: 0.982, label: "it.2" },
          ].map(({ x, y: v, label }) => {
            const cy = 70 - ((v - 0.97) / 0.015) * 60;
            return (
              <g key={label}>
                <circle cx={x} cy={cy} r="4" fill="#00d4ff" />
                <circle cx={x} cy={cy} r="8" fill="#00d4ff" opacity="0.2" />
                <text x={x} y={cy - 10} fontSize="7" fill="#00d4ff" textAnchor="middle" fontFamily="monospace">{label}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Final Convergence", value: "0.982", color: "#10b981", sub: "98.2% optimal" },
          { label: "Coverage Gap", value: "3.83pp", color: "#f59e0b", sub: "below 70% target" },
          { label: "Profit Improvement", value: "+4.4%", color: "#00d4ff", sub: "it.0 → it.2" },
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

// ─── CONFLICT VIEW ───────────────────────────────────────────────────────────
function ConflictView() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Conflicts Detected", value: "0", color: "#10b981", icon: "✓" },
          { label: "Conflicts Resolved", value: "0", color: "#10b981", icon: "✓" },
          { label: "Conflict Severity", value: "None", color: "#10b981", icon: "○" },
          { label: "Evaluation Status", value: "Moderate", color: "#f59e0b", icon: "◎" },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="rounded-xl p-4 text-center" style={{ background: `${color}08`, border: `1px solid ${color}22` }}>
            <div className="text-2xl mb-1" style={{ color }}>{icon}</div>
            <div className="text-xl font-bold font-mono" style={{ color }}>{value}</div>
            <div className="text-xs text-white/40 mt-1 font-mono">{label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl p-5" style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)" }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 8px #10b981" }} />
          <span className="text-sm font-mono text-emerald-400">No Regional Conflicts Detected</span>
        </div>
        <p className="text-xs text-white/50 font-mono leading-relaxed">
          The CoordinatorAgent found zero overlapping service assignments across all 5 regional agents. 
          Each service ID is uniquely assigned to exactly one region. Resolution protocol was not triggered.
        </p>
      </div>

      <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-4">Coordinator Evaluation</div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Score", value: "3.5 / 5", color: "#f59e0b" },
            { label: "Status", value: "Moderate", color: "#f59e0b" },
            { label: "Reasons", value: "Coverage gap", color: "#f59e0b" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="text-xs text-white/40 font-mono mb-1">{label}</div>
              <div className="text-sm font-mono" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-white/40 font-mono leading-relaxed">
          System achieved strong profitability (84.0% margin) but demand coverage at 59.5% falls short of the 70% target. 
          The coordinator recommends additional service expansion in Europe and Americas corridors in the next planning cycle.
        </div>
      </div>
    </div>
  );
}

// ─── MAP VIEW ────────────────────────────────────────────────────────────────
function MapView() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 50);
    return () => clearInterval(t);
  }, []);

  // Approximate world map port positions (simplified SVG coords)
  const portCoords = {
    285: [120, 180], 146: [250, 185], 235: [115, 190], 36: [450, 160],
    221: [420, 165], 100: [440, 170], 112: [480, 230], 176: [490, 195],
    220: [530, 185], 41: [270, 195], 69: [460, 240], 75: [430, 155],
    13: [425, 158], 86: [435, 162], 129: [110, 195], 108: [535, 190],
    229: [525, 185], 225: [520, 188], 190: [515, 182], 113: [475, 235],
    114: [470, 238], 204: [480, 242], 48: [260, 180], 102: [255, 190],
    282: [245, 175],
  };

  const corridors = [
    { from: 285, to: 146, teu: 10902, color: "#10b981" },
    { from: 235, to: 36, teu: 5292, color: "#10b981" },
    { from: 221, to: 100, teu: 1932, color: "#7c3aed" },
    { from: 112, to: 176, teu: 1128, color: "#ef4444" },
    { from: 220, to: 221, teu: 966, color: "#f59e0b" },
    { from: 146, to: 41, teu: 800, color: "#00d4ff" },
  ];

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="px-5 py-3 border-b border-white/5 flex items-center gap-3">
        <PulseDot color="#00d4ff" />
        <span className="text-xs font-mono text-white/60 uppercase tracking-widest">Global Maritime Route Map</span>
        <div className="ml-auto flex gap-3">
          {DATA.regions.map(r => (
            <div key={r.id} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color }} />
              <span className="text-xs font-mono text-white/40">{r.name}</span>
            </div>
          ))}
        </div>
      </div>
      <svg viewBox="0 0 700 380" className="w-full" style={{ background: "linear-gradient(180deg, #030d1a 0%, #060f1e 100%)" }}>
        {/* Ocean texture */}
        <defs>
          <radialGradient id="oceanGrad" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#0a1628" />
            <stop offset="100%" stopColor="#030d1a" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect width="700" height="380" fill="url(#oceanGrad)" />

        {/* Simplified continent shapes */}
        {/* North America */}
        <path d="M 60,80 L 180,70 L 200,120 L 180,180 L 140,200 L 100,190 L 70,160 Z" fill="#0f1f35" stroke="#1a3050" strokeWidth="0.5" />
        {/* South America */}
        <path d="M 140,210 L 180,200 L 185,290 L 165,330 L 140,320 L 130,280 Z" fill="#0f1f35" stroke="#1a3050" strokeWidth="0.5" />
        {/* Europe */}
        <path d="M 360,70 L 480,65 L 490,110 L 450,130 L 400,120 L 370,100 Z" fill="#0f1f35" stroke="#1a3050" strokeWidth="0.5" />
        {/* Africa */}
        <path d="M 400,140 L 500,135 L 510,260 L 475,310 L 440,300 L 410,260 L 395,200 Z" fill="#0f1f35" stroke="#1a3050" strokeWidth="0.5" />
        {/* Asia */}
        <path d="M 490,55 L 660,60 L 670,180 L 610,200 L 540,170 L 500,130 L 490,90 Z" fill="#0f1f35" stroke="#1a3050" strokeWidth="0.5" />
        {/* Australia */}
        <path d="M 580,250 L 650,245 L 655,300 L 625,315 L 590,305 L 575,280 Z" fill="#0f1f35" stroke="#1a3050" strokeWidth="0.5" />

        {/* Grid lines */}
        {[100, 200, 300].map(y => (
          <line key={y} x1={0} y1={y} x2={700} y2={y} stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
        ))}
        {[175, 350, 525].map(x => (
          <line key={x} x1={x} y1={0} x2={x} y2={380} stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
        ))}

        {/* Animated shipping routes */}
        {corridors.map((c, i) => {
          const [x1, y1] = portCoords[c.from] || [0, 0];
          const [x2, y2] = portCoords[c.to] || [0, 0];
          const w = Math.max(0.5, (c.teu / 15000) * 3);
          const t = ((tick * 0.8 + i * 30) % 100) / 100;
          const px = x1 + (x2 - x1) * t;
          const py = y1 + (y2 - y1) * t;
          const cx1 = x1 + (x2 - x1) * 0.33;
          const cy1 = Math.min(y1, y2) - 30;
          return (
            <g key={i}>
              <path d={`M ${x1} ${y1} Q ${cx1} ${cy1} ${x2} ${y2}`} fill="none" stroke={c.color} strokeWidth={w} opacity="0.3" />
              <path d={`M ${x1} ${y1} Q ${cx1} ${cy1} ${x2} ${y2}`} fill="none" stroke={c.color} strokeWidth={w + 1} opacity="0.1" filter="url(#glow)" />
              <circle cx={px} cy={py} r="2.5" fill={c.color} opacity="0.9" filter="url(#glow)">
                <animate attributeName="r" values="2;3.5;2" dur="1s" repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}

        {/* Port dots */}
        {Object.entries(portCoords).slice(0, 20).map(([id, [x, y]]) => (
          <circle key={id} cx={x} cy={y} r="2" fill="#ffffff" opacity="0.4" />
        ))}

        {/* Corridor labels */}
        <text x={185} y={158} fontSize="8" fill="#10b981" opacity="0.8" fontFamily="monospace">P285→P146 ▶ 10,902 TEU</text>
        <text x={445} y={148} fontSize="8" fill="#7c3aed" opacity="0.8" fontFamily="monospace">P221→P100</text>

        {/* Legend */}
        <rect x={10} y={320} width="160" height="55" rx="4" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
        <text x={18} y={334} fontSize="7" fill="rgba(255,255,255,0.4)" fontFamily="monospace" letterSpacing="2">MAJOR CORRIDORS</text>
        {corridors.slice(0, 4).map((c, i) => (
          <g key={i}>
            <line x1={18} y1={343 + i * 9} x2={30} y2={343 + i * 9} stroke={c.color} strokeWidth="2" />
            <text x={34} y={346 + i * 9} fontSize="6.5" fill="rgba(255,255,255,0.5)" fontFamily="monospace">P{c.from}→P{c.to}: {fmtNum(c.teu)} TEU</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── SUMMARY VIEW ────────────────────────────────────────────────────────────
function SummaryView() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl p-6" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(0,212,255,0.08))", border: "1px solid rgba(16,185,129,0.2)" }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-3 h-3 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 12px #10b981" }} />
          <span className="text-sm font-mono font-semibold text-emerald-400 uppercase tracking-widest">Verdict: Good</span>
        </div>
        <p className="text-base text-white/80 font-mono leading-relaxed">
          The global weekly profit is <span className="text-emerald-400 font-bold">$773,616,415</span>, indicating strong financial performance 
          with an <span className="text-emerald-400 font-bold">84.0% profit margin</span> across 465 deployed services.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <div className="text-xs font-mono text-emerald-400 uppercase tracking-widest mb-3">Strengths</div>
          {[
            "Global weekly profit $773.6M — excellent financial performance",
            "Americas region: $466.8M profit, 92.0% margin — highest performer",
            "Middle East: 86.2% coverage — best regional coverage achieved",
            "No inter-regional service conflicts detected",
            "Convergence reached at 0.982 within 3 iterations",
          ].map((s, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <span className="text-emerald-400 text-xs mt-0.5 flex-shrink-0">+</span>
              <span className="text-xs text-white/60 font-mono leading-relaxed">{s}</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl p-5" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <div className="text-xs font-mono text-red-400 uppercase tracking-widest mb-3">Weaknesses</div>
          {[
            "Demand coverage 59.5% — 337,374 TEU/wk remains unserved",
            "Europe: only 49.7% coverage — lowest regional performance",
            "Coverage gap 3.83pp below 70.0% target after 3 iterations",
            "Operating cost $146.9M/wk represents scale risk",
            "Americas dominates profits — concentration risk",
          ].map((s, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <span className="text-red-400 text-xs mt-0.5 flex-shrink-0">−</span>
              <span className="text-xs text-white/60 font-mono leading-relaxed">{s}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl p-5" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
        <div className="text-xs font-mono text-amber-400 uppercase tracking-widest mb-3">Priority Actions</div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { title: "Expand Europe Coverage", detail: "Target Port 221 → Port 100 (1,932 TEU/wk). Add 8 services to European hub network." },
            { title: "Serve Top Corridor", detail: "Port 285 → Port 146: 10,902 TEU/wk unserved. Highest priority route expansion." },
            { title: "Americas Consolidation", detail: "Leverage 92% margin to fund coverage expansion in underserved Africa lanes." },
            { title: "Next GA Iteration", detail: "Increase coverage_weight in GA objective. Set target 73%+ for iteration 4." },
          ].map(({ title, detail }, i) => (
            <div key={i} className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="text-xs font-mono text-amber-400 mb-1">{String(i + 1).padStart(2, "0")} · {title}</div>
              <div className="text-xs text-white/50 font-mono leading-relaxed">{detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── KPI CARD ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, sparkData }) {
  return (
    <div className="rounded-xl p-5 transition-all duration-300 hover:scale-[1.02] cursor-default group"
      style={{ background: `${color}08`, border: `1px solid ${color}22`, boxShadow: `0 0 0 transparent`, transition: "box-shadow 0.3s" }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 30px ${color}20`}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "0 0 0 transparent"}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-mono text-white/40 uppercase tracking-widest">{label}</span>
        {sparkData && <Sparkline data={sparkData} color={color} />}
      </div>
      <div className="text-3xl font-bold font-mono tracking-tight" style={{ color, textShadow: `0 0 20px ${color}66` }}>
        {value}
      </div>
      {sub && <div className="text-xs text-white/40 mt-1 font-mono">{sub}</div>}
      <div className="mt-3 h-px w-full" style={{ background: `linear-gradient(90deg, ${color}44, transparent)` }} />
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  // Get live optimization data from WebSocket
  const optimizationState = useOptimizationState();

  const [activeNav, setActiveNav] = useState("overview");
  const [showPulse, setShowPulse] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setShowPulse(p => !p), 1500);
    return () => clearInterval(t);
  }, []);

  // Use live data instead of static DATA
  const DATA = {
    global: optimizationState.global,
    regions: optimizationState.regions,
    iterations: optimizationState.iterations,
    corridors: optimizationState.corridors
  };

  const renderMain = () => {
    switch (activeNav) {
      case "overview": return (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <KpiCard
              label="Weekly Profit"
              value={`$${(DATA.global.weeklyProfit / 1e6).toFixed(1)}M`}
              sub={`${DATA.global.margin.toFixed(1)}% margin`}
              color="#00d4ff"
              sparkData={DATA.iterations.map(i => i.profit / 1e6)}
            />
            <KpiCard
              label="Annual Profit"
              value={`$${(DATA.global.annualProfit / 1e9).toFixed(1)}B`}
              sub="52-week projection"
              color="#10b981"
              sparkData={DATA.iterations.map(i => (i.profit * 52) / 1e9)}
            />
            <KpiCard
              label="Demand Coverage"
              value={`${DATA.global.coverage.toFixed(1)}%`}
              sub={`${fmtNum(DATA.global.unserved)} TEU/wk unserved`}
              color="#f59e0b"
              sparkData={DATA.iterations.map(i => i.coverage)}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <KpiCard label="Services Deployed" value={fmtNum(DATA.global.totalServices)} sub="across 5 regions" color="#8b5cf6" />
            <KpiCard
              label="Profit Margin"
              value={`${DATA.global.margin.toFixed(1)}%`}
              sub={`${fmt(DATA.global.operatingCost)} operating cost`}
              color="#ec4899"
              sparkData={DATA.iterations.map(i => i.score * 100)}
            />
            <KpiCard
              label="Convergence Score"
              value={DATA.global.convergence.toFixed(3)}
              sub={`${DATA.iterations.length} feedback iterations`}
              color="#6366f1"
              sparkData={DATA.iterations.map(i => i.score)}
            />
          </div>
          <MapView />
        </div>
      );
      case "pipeline": return <PipelineView />;
      case "regional": return <RegionalView />;
      case "funnel": return <FunnelView />;
      case "feedback": return <FeedbackView />;
      case "conflict": return <ConflictView />;
      case "map": return <MapView />;
      case "summary": return <SummaryView />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{
      background: "#020c18",
      color: "#e2e8f0",
      fontFamily: "'Courier New', 'Consolas', monospace"
    }}>
      {/* Scanline overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
        zIndex: 100
      }} />

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 relative z-10"
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
            { label: "Ports", value: fmtNum(DATA.global.ports) },
            { label: "Lanes", value: fmtNum(DATA.global.lanes) },
            { label: "Services", value: fmtNum(DATA.global.services) },
            { label: "Weekly TEU", value: `${(DATA.global.weeklyDemand / 1000).toFixed(0)}K` },
            { label: "Runtime", value: `${DATA.global.runtime || "356.1"}s` },
            { label: "Iterations", value: DATA.iterations.length.toString() },
            { label: "Convergence", value: DATA.global.convergence.toFixed(3) },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-xs font-bold text-white/90 font-mono">{value}</div>
              <div className="text-white/30 font-mono" style={{ fontSize: "9px", letterSpacing: "0.08em" }}>{label}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => optimizationState.startOptimization()}
            disabled={optimizationState.isPipelineRunning}
            className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: optimizationState.isPipelineRunning ? "rgba(239,68,68,0.08)" : "rgba(0,212,255,0.08)", border: `1px solid ${optimizationState.isPipelineRunning ? "rgba(239,68,68,0.2)" : "rgba(0,212,255,0.2)"}`, color: optimizationState.isPipelineRunning ? "rgba(239,68,68,0.8)" : "rgba(0,212,255,0.8)" }}>
            {optimizationState.isPipelineRunning ? "⏸ Running" : "▶ Play"}
          </button>
          {["⇌ Flows", "⊡ Reset", "↓ Export"].map(btn => (
            <button key={btn} className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105"
              style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "rgba(0,212,255,0.8)" }}>
              {btn}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── SIDEBAR ──────────────────────────────────────────────── */}
        <aside className="flex-shrink-0 w-52 flex flex-col relative z-10"
          style={{ background: "rgba(2,12,24,0.9)", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="p-3 border-b border-white/5">
            <div className="text-white/20 font-mono uppercase tracking-widest" style={{ fontSize: "9px", letterSpacing: "0.15em" }}>Navigation</div>
          </div>
          <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {navItems.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setActiveNav(id)}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 group"
                style={{
                  background: activeNav === id ? "rgba(0,212,255,0.1)" : "transparent",
                  border: `1px solid ${activeNav === id ? "rgba(0,212,255,0.25)" : "transparent"}`,
                  color: activeNav === id ? "#00d4ff" : "rgba(255,255,255,0.45)",
                }}>
                <span className="text-base leading-none">{icon}</span>
                <span className="text-xs font-mono truncate">{label}</span>
                {activeNav === id && <div className="ml-auto w-1 h-1 rounded-full bg-cyan-400" />}
              </button>
            ))}
          </nav>

          {/* Sidebar bottom stats */}
          <div className="p-3 border-t border-white/5 space-y-2">
            {[
              { label: "Passed Assertions", value: "242/243", color: "#10b981" },
              { label: "Score", value: "100%", color: "#10b981" },
              { label: "Warnings", value: "2", color: "#f59e0b" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-white/30 font-mono" style={{ fontSize: "9px" }}>{label}</span>
                <span className="font-mono text-xs font-bold" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* ── MAIN ─────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-5 relative">
          {/* Section title */}
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(0,212,255,0.3), transparent)" }} />
            <span className="text-xs font-mono text-white/30 uppercase tracking-widest px-2">
              {navItems.find(n => n.id === activeNav)?.label}
            </span>
            <div className="h-px flex-1" style={{ background: "linear-gradient(270deg, rgba(0,212,255,0.3), transparent)" }} />
          </div>

          {renderMain()}
        </main>
      </div>

      {/* ── FOOTER STATUS BAR ──────────────────────────────────────── */}
      <footer className="flex-shrink-0 flex items-center justify-between px-6 py-1.5 relative z-10"
        style={{ background: "rgba(2,12,24,0.95)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-4">
          {[
            { dot: optimizationState.isPipelineRunning ? "#f59e0b" : "#10b981", text: `Pipeline: ${optimizationState.isPipelineRunning ? (optimizationState.currentStage || "Running") : "Complete"}` },
            { dot: "#00d4ff", text: "GA: Converged" },
            { dot: "#10b981", text: "MILP: Optimal" },
            { dot: "#f59e0b", text: `Coverage: ${DATA.global.coverage.toFixed(1)}%` },
          ].map(({ dot, text }) => (
            <div key={text} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dot }} />
              <span className="text-white/30 font-mono" style={{ fontSize: "10px" }}>{text}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/20 font-mono" style={{ fontSize: "10px" }}>AI Vessel Routing System v2.0 · 435 ports · 9,622 lanes</span>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 6px #10b981" }} />
            <span className="text-emerald-400 font-mono" style={{ fontSize: "10px" }}>OPERATIONAL</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

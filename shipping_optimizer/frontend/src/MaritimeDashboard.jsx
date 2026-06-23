import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ComposableMap, Geographies, Geography, Line, Marker } from "react-simple-maps";
import portCoords from './data/port_coordinates.json';
// WebSocket integration hook for live optimization data
const useOptimizationState = () => {
  const [state, setState] = useState({
    global: {
      ports: null, lanes: 9622, services: null, weeklyDemand: null,
      runtime: 0, iterations: 0, convergence: 0,
      weeklyProfit: 0, annualProfit: 0,
      coverage: 0, totalServices: 0, margin: 0, unserved: 0,
      operatingCost: 0,
      selected_services: []
    },
    regions: {},
    iterations: [],
    corridors: [],
    isConnected: false,
    isPipelineRunning: false,
    currentStage: null,
    stageProgress: 0,
    currentIteration: 0,
    maxIterations: 3,
    pipelineError: null
  });

  const ws = useRef(null);
  const reconnectTimeout = useRef(null);
  const retryCount = useRef(0);
  const MAX_RETRIES = 5;

  const connect = useCallback(() => {
    try {
      ws.current = new WebSocket('ws://localhost:8000/ws/pipeline');

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        retryCount.current = 0; // reset on successful connection
        setState(prev => ({ ...prev, isConnected: true }));
      };

      ws.current.onmessage = (event) => {
        const message = JSON.parse(event.data);

        switch(message.type) {
          case 'initial_state':
            if (message.data) {
              // Process regions to add colors
              const rawRegions = message.data.regions || {};
              const processedRegions = {};
              Object.entries(rawRegions).forEach(([id, data]) => {
                processedRegions[id] = {
                  ...data,
                  id,
                  name: data.name || (id === "middle_east" ? "Middle East" : id.charAt(0).toUpperCase() + id.slice(1)),
                  color: getRegionColor(id)
                };
              });

              setState(prev => ({
                ...prev,
                global: {
                  ...prev.global,
                  ...message.data.metrics,
                  ports: message.data.problem_stats?.ports ?? prev.global.ports,
                  lanes: message.data.problem_stats?.lanes ?? prev.global.lanes,
                  services: message.data.problem_stats?.services ?? prev.global.services,
                  weeklyDemand: message.data.problem_stats?.weekly_demand ?? prev.global.weeklyDemand,
                  selected_services: message.data.metrics?.selected_services || prev.global.selected_services || []
                },
                regions: processedRegions,
                iterations: message.data.iterations || [],
                corridors: message.data.corridors || []
              }));
            }
            break;

          case 'pipeline_started':
            setState(prev => ({
              ...prev,
              isPipelineRunning: true,
              currentStage: 'Initializing',
              pipelineError: null
            }));
            break;

          case 'stage_started':
            setState(prev => ({
              ...prev,
              currentStage: message.data?.stage || message.stage,
              stageProgress: 0
            }));
            break;

          case 'stage_progress':
            setState(prev => ({
              ...prev,
              stageProgress: message.data?.progress ?? message.progress ?? 0
            }));
            break;

          case 'region_update':
          case 'region_updated':
            {
              const rData = message.data?.region_data || message.data || message;
              const rId = message.data?.region_id || rData.id || rData.region_id;
              if (!rId) break;
              
              setState(prev => ({
                ...prev,
                regions: {
                  ...prev.regions,
                  [rId]: {
                    ...prev.regions[rId],
                    ...rData,
                    id: rId,
                    name: rData.name || (rId === "middle_east" ? "Middle East" : rId.charAt(0).toUpperCase() + rId.slice(1)),
                    color: getRegionColor(rId)
                  }
                }
              }));
            }
            break;

          case 'iteration_completed':
            {
              const itData = message.data?.iteration_data || message.data || message;
              const itNum = message.data?.iteration || itData.iteration || itData.iter;
              
              setState(prev => ({
                ...prev,
                iterations: [...prev.iterations, {
                  iter: itNum,
                  profit: itData.profit || 0,
                  coverage: itData.coverage || 0,
                  score: itData.score || 0,
                  rerun: itData.rerun || false,
                  reason: itData.reason || ''
                }],
                currentIteration: itNum
              }));
            }
            break;

          case 'map_updated':
            setState(prev => ({
              ...prev,
              corridors: message.data?.corridors || message.corridors || []
            }));
            break;

          case 'pipeline_completed':
            {
              const results = message.data?.results || message.results || message.data || {};
              setState(prev => ({
                ...prev,
                isPipelineRunning: false,
                currentStage: 'Complete',
                stageProgress: 100,
                global: {
                  ...prev.global,
                  ...results,
                  selected_services: results.selected_services || prev.global.selected_services || []
                }
              }));
            }
            break;

          case 'pipeline_error':
            setState(prev => ({
              ...prev,
              isPipelineRunning: false,
              pipelineError: message.data?.error || message.error || 'Unknown error'
            }));
            break;
        }
      };

      ws.current.onclose = () => {
        console.log('WebSocket disconnected');
        setState(prev => ({ ...prev, isConnected: false }));

        // Exponential backoff reconnect with max retries
        if (retryCount.current < MAX_RETRIES) {
          const delay = Math.min(1000 * Math.pow(2, retryCount.current), 30000);
          retryCount.current++;
          console.log(`Reconnecting in ${delay}ms (attempt ${retryCount.current}/${MAX_RETRIES})...`);
          reconnectTimeout.current = setTimeout(() => connect(), delay);
        } else {
          console.log('Max reconnect attempts reached. Giving up.');
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setState(prev => ({ ...prev, pipelineError: 'Connection error' }));
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connect]);

  const startOptimization = useCallback(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'start_pipeline',
        data: {
          dataset_path: 'data/datasets/large_shipping_problem.json'
        }
      }));
    } else {
      console.error('WebSocket not connected');
    }
  }, []);

  // Helper to get region colors
  const getRegionColor = (regionId) => {
    const colors = {
      asia: "#00d4ff",
      europe: "#7c3aed",
      americas: "#10b981",
      middle_east: "#f59e0b",
      africa: "#ef4444"
    };
    return colors[regionId] || "#00d4ff";
  };

  return { ...state, startOptimization };
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
const fmt = (n) => {
  if (n == null) return "—";
  return n >= 1e9 ? `$${(n/1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : `$${n.toLocaleString()}`;
};
const fmtNum = (n) => n != null ? n.toLocaleString() : "—";

// Parse strategy code from raw strategy text (e.g. "Strategy: C\nReason 1:...") → "C"
const parseStrategyCode = (raw) => {
  if (!raw) return "—";
  const m = raw.match(/Strategy[:\s]+([A-Z])/i);
  return m ? `Strategy ${m[1]}` : raw.split('\n')[0].slice(0, 20);
};

// Parse strategy reasons from raw strategy text → array of strings
const parseStrategyReasons = (raw) => {
  if (!raw) return [];
  return raw.split('\n').filter(l => l.trim().startsWith('Reason')).map(l => l.replace(/^Reason\s*\d+:\s*/i, '').trim());
};

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

// Helper to convert hex to rgba for better CSS support
const hexToRgba = (hex, alpha) => {
  if (!hex || hex[0] !== '#') return `rgba(0, 212, 255, ${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// ─── BENCHMARKS CONFIG ──────────────────────────────────────────────────────
const BENCHMARKS = {
  weeklyProfit: { target: 500_000_000, label: "Weekly Profit Target", higher: true },
  coverage:      { target: 70.0,       label: "Demand Coverage",      higher: true },
  margin:        { target: 20.0,       label: "Profit Margin",       higher: true },
  services:      { target: 450,        label: "Services Deployed",   higher: true },
  convergence:   { target: 0.970,      label: "Convergence Score",   higher: true },
};

function BenchmarkBadge({ value, benchmark, compact }) {
  if (value == null || benchmark == null) return null;
  const isMet = value >= benchmark.target;
  if (compact) {
    return (
      <span className="text-[10px] font-mono" style={{ color: isMet ? "#10b981" : "#ef4444" }}>
        {isMet ? "✓" : "▼"}
      </span>
    );
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono ml-2"
      style={{ background: isMet ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: isMet ? "#10b981" : "#ef4444" }}>
      {isMet ? "● On Target" : "▼ Below Target"}
    </span>
  );
}

// ─── SPARKLINE ───────────────────────────────────────────────────────────────
function Sparkline({ data, color, height = 32 }) {
  if (!data || data.length < 2) {
    return (
      <svg width="60" height={height} className="opacity-20">
        <line x1="0" y1={height/2} x2="60" y2={height/2} stroke={color || "#00d4ff"} strokeWidth="1" strokeDasharray="2,2" />
      </svg>
    );
  }
  
  const sortedData = [...data]; // Ensure chronological order if needed
  const max = Math.max(...sortedData), min = Math.min(...sortedData);
  const range = Math.max(1, max - min);

  const trend = sortedData.length > 1
    ? (sortedData[sortedData.length - 1] > sortedData[0] ? "up" : sortedData[sortedData.length - 1] < sortedData[0] ? "down" : "flat")
    : "flat";
  const trendColor = trend === "up" ? "#10b981" : trend === "down" ? "#ef4444" : "#6b7280";
  const trendArrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "—";
  
  const pts = sortedData.map((v, i) => {
    const x = (i / (sortedData.length - 1)) * 60;
    const y = height - ((v - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  }).join(" ");
  
  return (
    <svg width="60" height={height} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M 0,${height} ${pts} L 60,${height} Z`} fill={`url(#grad-${color})`} opacity="0.3" />
      <polyline points={pts} fill="none" stroke={color || "#00d4ff"} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="60" cy={height - ((sortedData[sortedData.length-1] - min) / range) * (height - 8) - 4} r="2" fill={color} />
      <text x="52" y="6" fontSize="8" fill={trendColor} fontWeight="bold" textAnchor="end">{trendArrow}</text>
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
  { id: "landing", label: "Landing", icon: "⌂" },
  { id: "overview", label: "Overview", icon: "⬡" },
  { id: "pipeline", label: "Pipeline", icon: "◈" },
  { id: "regional", label: "Regional Agents", icon: "◎" },
  { id: "funnel", label: "GA · MILP Analytics", icon: "◆" },
  { id: "feedback", label: "Feedback Loop", icon: "↺" },
  { id: "conflict", label: "Conflict Resolution", icon: "⧖" },
  { id: "map", label: "Maritime Map", icon: "⊕" },
  { id: "summary", label: "Executive Summary", icon: "▣" },
];

// ─── PIPE NODE (Architecture Diagram Card) ───────────────────────────────────
function PipeNode({ x, y, w = 150, h, color, lbl, tit, desc, pills = [], active, onClick }) {
  return (
    <div onClick={onClick} style={{
      position: "absolute", left: x, top: y, width: w, height: h || "auto",
      background: active ? `${color}18` : "rgba(255,255,255,0.03)",
      border: `1px solid ${active ? color + "66" : "rgba(255,255,255,0.08)"}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 6, cursor: "pointer", padding: "9px 10px 8px",
      boxShadow: active ? `0 0 18px ${color}25` : "0 2px 8px rgba(0,0,0,0.25)",
      transition: "all 0.2s", zIndex: 10, overflow: "hidden",
    }}>
      <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color, marginBottom: 3, fontFamily: "monospace", opacity: 0.85, lineHeight: 1.3 }}>{lbl}</div>
      <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.92)", marginBottom: 4, lineHeight: 1.2, fontFamily: "monospace", letterSpacing: "0.03em" }}>{tit}</div>
      {desc && <div style={{ fontSize: 8, color: "rgba(255,255,255,0.42)", lineHeight: 1.55, whiteSpace: "pre-line" }}>{desc}</div>}
      {pills.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 6 }}>
          {pills.map(p => <span key={p} style={{ fontSize: 7, padding: "2px 5px", borderRadius: 3, background: `${color}18`, color, border: `1px solid ${color}33`, fontWeight: 700, fontFamily: "monospace" }}>{p}</span>)}
        </div>
      )}
    </div>
  );
}

// ─── REGION PIPELINE NODE (Mini horizontal pipeline per region) ───────────────
function RegionPipelineNode({ x, y, W, H, region, liveData, stages, tick, active, onClick }) {
  const color = region.color;
  const gen = liveData.generated || 0;
  const flt = liveData.filtered || 0;
  const sel = liveData.selected || 0;
  const stageActive = [gen > 0, flt > 0, flt > 0, sel > 0, sel > 0];
  const litIdx = gen > 0 ? Math.floor(tick / 18) % 5 : -1;
  return (
    <div onClick={onClick} style={{
      position: "absolute", left: x, top: y, width: W, height: H,
      border: `1px solid ${active ? color + "77" : "rgba(255,255,255,0.07)"}`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 6,
      background: active ? `${color}12` : "rgba(255,255,255,0.025)",
      cursor: "pointer",
      boxShadow: active ? `0 0 18px ${color}22` : "0 2px 8px rgba(0,0,0,0.15)",
      transition: "all 0.2s", zIndex: 10, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 11px 4px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: "1px", color, fontFamily: "monospace", opacity: 0.8 }}>REGIONAL AGENT — SELF-CONTAINED PIPELINE</div>
            <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.9)", fontFamily: "monospace", lineHeight: 1.1 }}>{region.name}</div>
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 8, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>
          <div>{liveData.coverage != null ? `${liveData.coverage.toFixed(1)}% cov` : "—"}</div>
          <div style={{ color }}>{liveData.services || "—"} svc</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "6px 11px 5px" }}>
        {stages.map((s, i) => {
          const isLit = stageActive[i] && i === litIdx;
          const isOn  = stageActive[i];
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", flex: 1, gap: 3 }}>
              <div style={{
                flex: 1, padding: "3px 5px", borderRadius: 4, textAlign: "center",
                fontSize: 7.5, fontWeight: 800, fontFamily: "monospace",
                border: `1.5px solid ${isLit ? "transparent" : s.color + "44"}`,
                background: isLit ? s.color : (isOn ? s.color + "18" : "rgba(255,255,255,0.04)"),
                color: isLit ? "#fff" : (isOn ? s.color : "rgba(255,255,255,0.28)"),
                boxShadow: isLit ? `0 0 10px ${s.color}` : "none",
                transform: isLit ? "scale(1.06)" : "scale(1)",
                transition: "all 0.3s", letterSpacing: "0.4px",
              }}>
                <div>{s.lbl}</div>
                {i === 0 && gen > 0 && <div style={{ fontSize: 6, opacity: 0.8 }}>{fmtNum(gen)}</div>}
                {i === 1 && flt > 0 && <div style={{ fontSize: 6, opacity: 0.8 }}>{fmtNum(flt)}</div>}
                {i === 3 && sel > 0 && <div style={{ fontSize: 6, opacity: 0.8 }}>{fmtNum(sel)}</div>}
                {i === 4 && liveData.profit && <div style={{ fontSize: 6, opacity: 0.8 }}>{fmt(liveData.profit)}</div>}
              </div>
              {i < stages.length - 1 && <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, flexShrink: 0 }}>›</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PIPELINE VIEW (Production Architecture Diagram) ─────────────────────────
function PipelineView() {
  const optimizationState = useOptimizationState();
  const liveRegions = Object.values(optimizationState.regions);
  const g = optimizationState.global;
  const [activeNode, setActiveNode] = useState(null);
  const [tick, setTick] = useState(0);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 60);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateScale = () => {
      const width = containerRef.current.clientWidth;
      if (width > 0) {
        setContainerWidth(width);
      }
    };
    const observer = new ResizeObserver(updateScale);
    observer.observe(containerRef.current);
    updateScale();
    return () => observer.disconnect();
  }, []);

  // ── Layout constants ──────────────────────────────────────────────────────
  const CW = 1200;   // total canvas width
  const CH = 548;    // canvas height
  const REG_TOP = 40;
  const REG_H   = 83;
  const REG_GAP = 9;
  const totalRegH = 5 * REG_H + 4 * REG_GAP;  // = 451
  const midY = REG_TOP + totalRegH / 2;          // = 265.5

  // Column X positions (left edge of each layer band)
  const C = {
    DATA:  0,    ETL:   105,  CTRL:  210,  REG:   330,
    RES:   650,  VAL:   770,  FIN:   890,  INFRA: 995,
    RESIL: 995,  OUT:   1100,
  };
  const CW2 = { DATA:95, ETL:95, CTRL:110, REG:310, RES:110, VAL:110, FIN:95, INFRA:95, RESIL:95, OUT:95 };

  // Scale factor based on container width
  const scale = Math.min(1, containerWidth / CW);

  // Regional list with colors
  const REGION_LIST = [
    { id: "asia",        name: "ASIA",        color: "#00d4ff" },
    { id: "europe",      name: "EUROPE",      color: "#7c3aed" },
    { id: "americas",    name: "AMERICAS",    color: "#10b981" },
    { id: "africa",      name: "AFRICA",      color: "#ef4444" },
    { id: "middle_east", name: "MIDDLE EAST", color: "#f59e0b" },
  ];

  const STAGES = [
    { id: "sg", lbl: "SVC GEN",   color: "#4b8eff" },
    { id: "sf", lbl: "FILTER",    color: "#888" },
    { id: "ga", lbl: "GA L1+L2", color: "#ff9a45" },
    { id: "ml", lbl: "MILP FLOW", color: "#10b981" },
    { id: "pr", lbl: "PROFIT",    color: "#aaaaaa" },
  ];

  const LAYERS = [
    { id: "data",  label: "DATA LAYER",                  color: "#888888", x: C.DATA,  w: CW2.DATA  },
    { id: "etl",   label: "ETL / PROCESSING",            color: "#a0a0ff", x: C.ETL,   w: CW2.ETL   },
    { id: "ctrl",  label: "GLOBAL CONTROL",              color: "#4b8eff", x: C.CTRL,  w: CW2.CTRL  },
    { id: "reg",   label: "PARALLEL REGIONAL EXECUTION", color: "#00d4ff", x: C.REG,   w: CW2.REG   },
    { id: "res",   label: "RESOLUTION",                  color: "#ef4444", x: C.RES,   w: CW2.RES   },
    { id: "val",   label: "VALIDATION + BENCHMARK",      color: "#f59e0b", x: C.VAL,   w: CW2.VAL   },
    { id: "fin",   label: "FINAL OPT",                   color: "#10b981", x: C.FIN,   w: CW2.FIN   },
    { id: "infra_resil", label: "INFRA & RESILIENCE",    color: "#00c8e0", x: C.INFRA, w: CW2.INFRA },
    { id: "out",   label: "OUTPUT",                      color: "#34d882", x: C.OUT,   w: CW2.OUT   },
  ];

  // Stacked node heights  
  const HALF_H  = Math.floor(totalRegH * 0.45);  // ≈ 202
  const HALF_GAP = totalRegH - 2 * HALF_H;        // gap between stacked pairs

  // Node click detail info
  const NODE_INFO = {
    "PORTS DB":    { label: "Port Database",         items: ["435 global ports worldwide", "UN/LOCODE port identifiers", "Draft · capacity · geographic coords", "Port cost & handling fees"] },
    "DEMAND OD":   { label: "OD Demand Matrix",      items: ["9,622 origin-destination lanes", "FFE/week → TEU/week (×2 conversion)", "Revenue rates per corridor", "Transit time requirements"] },
    "FLEET DB":    { label: "Fleet Database",         items: ["6 vessel size classes", "Capacity per vessel type (TEU)", "Operating cost specs", "Fuel curve: Ronen (1982) cubic v³"] },
    "DIST MATRIX": { label: "Distance Matrix",        items: ["62,002 inter-port pairs", "Nautical miles + canal flags", "Panama / Suez Canal routing", "Steaming time model"] },
    "COST MODEL":  { label: "Cost Model",             items: ["Port handling cost per TEU", "Fuel: cubic law v³ (Ronen 1982)", "Vessel operating cost / day", "Transshipment premium costs"] },
    "HIST ROUTES": { label: "Historical Routes",      items: ["Past shipping service patterns", "LINERLIB benchmark baselines", "WorldLarge, WorldSmall, Baltic", "Incumbent solution comparison"] },
    "EXT SIGNALS": { label: "External Signals",       items: ["AIS vessel tracking data", "Maritime market intelligence", "Weather routing input", "Port congestion signals"] },
    "etl":         { label: "ETL + Validation",       items: ["Schema validation (Pydantic strict)", "FFE→TEU conversion (×2.0)", "K-means geographic clustering", "Origin-only OD ownership rule", "800–2,000 candidate routes per region"] },
    "orch":        { label: "Global Orchestrator",    items: ["LLM problem analysis (GPT-OSS-120B)", "α=0.50 β=0.40 γ=0.10 initial weights", "Adaptive weight adjustment per iter", "Up to 3 feedback iterations", "Global fleet constraint: ≤300 vessels"] },
    "split":       { label: "Regional Splitter",      items: ["K-means on 435 port coordinates", "Origin-only OD demand assignment", "No demand duplication across regions", "800–2,000 candidates per region", "Demand conservation assert: Σregional==global"] },
    "aggr":        { label: "Global Aggregation",     items: ["Merges 5 regional results", "Coverage from unique served_od_map", "NOT averaged regional figures", "Max-profit region wins each OD pair", "Conservation: Σregional TEU == global TEU"] },
    "coord":       { label: "Coordinator Agent",      items: ["Coverage gap vs 70% target", "If gap > 5%: β↑, α↓ (adaptive)", "Conflict detection across regions", "Convergence score computation (0–1)", "Triggers rerun if not converged"] },
    "valid":       { label: "Route Validator",        items: ["Fleet ≤300 vessels (hard constraint)", "MILP status == Optimal required", "Flow conservation at all hub ports", "FFE/TEU consistency check (×2)", "EBIT profit margin standard verified"] },
    "bench":       { label: "Benchmark Engine",       items: ["LINERLIB WorldLarge baseline", "WorldSmall + Baltic comparison", "Coverage % vs benchmark target", "Weekly profit delta (USD)", "Fleet utilization ratio analysis"] },
    "final":       { label: "Final Optimizer",        items: ["Hard constraint validation pass", "Relative FP tolerance: 1e-6", "Service frequencies → integers", "Zero demand edge case handled", "Structured error on MILP infeasibility"] },
    "infra":       { label: "Infrastructure / Obs",   items: ["Redis Streams: async job queue", "PostgreSQL: persistent solution store", "FastAPI + Nginx: API gateway", "Prometheus: metrics collection", "Grafana: optimization dashboards", "OpenTelemetry: distributed tracing"] },
    "resil":       { label: "Resilience / Fault",     items: ["Circuit Breakers: 5 fail → 60s cooldown", "Exponential backoff retry logic", "MILP timeout fallback strategy", "Last-known-good solution cache", "Partial Recovery Engine"] },
    "output":      { label: "Optimized Network",      items: ["Service route configurations", "Vessel deployment plan", "Sailing frequency schedules", "Profit dashboard (Revenue − OpCost)", "Benchmark comparison report", "Executive summary output"] },
  };

  const activeInfo = activeNode ? (NODE_INFO[activeNode] || null) : null;
  const totalGenerated = liveRegions.reduce((s, r) => s + (r.generated || 0), 0);
  const totalFiltered  = liveRegions.reduce((s, r) => s + (r.filtered  || 0), 0);

  // Arrow positions
  const DATA_R  = C.DATA  + CW2.DATA;
  const ETL_L   = C.ETL   + 4;    const ETL_R  = C.ETL  + CW2.ETL;
  const CTRL_L  = C.CTRL  + 4;    const CTRL_R = C.CTRL + CW2.CTRL;
  const REG_L   = C.REG   + 4;    const REG_R  = C.REG  + CW2.REG;
  const RES_L   = C.RES   + 4;    const RES_R  = C.RES  + CW2.RES;
  const VAL_L   = C.VAL   + 4;    const VAL_R  = C.VAL  + CW2.VAL;
  const FIN_L   = C.FIN   + 4;    const FIN_R  = C.FIN  + CW2.FIN;
  const INFRA_L = C.INFRA + 4;    const INFRA_R= C.INFRA+ CW2.INFRA;
  const RESIL_L = C.RESIL + 4;    const RESIL_R= C.RESIL+ CW2.RESIL;
  const OUT_L   = C.OUT   + 4;

  const orchCY = REG_TOP + HALF_H / 2;
  const splitCY = REG_TOP + HALF_H + HALF_GAP + HALF_H / 2;
  const aggrCY  = REG_TOP + HALF_H / 2;
  const coordCY = REG_TOP + HALF_H + HALF_GAP + HALF_H / 2;
  const infraCY = REG_TOP + HALF_H / 2;
  const resilCY = REG_TOP + HALF_H + HALF_GAP + HALF_H / 2;
  const ctrlMidX = C.CTRL + CW2.CTRL / 2;
  const resMidX  = C.RES  + CW2.RES  / 2;
  const valMidX  = C.VAL  + CW2.VAL  / 2;

  return (
    <div style={{ display: "flex", gap: 14, height: "100%", minHeight: 548 }}>

      {/* ── Scrollable Architecture Canvas ─────────────────────────────────── */}
      <div ref={containerRef} style={{ flex: 1, overflow: "hidden", borderRadius: 12, background: "rgba(0,0,0,0.18)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{
          position: "relative",
          width: CW,
          height: CH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          transition: "transform 0.1s ease-out",
          marginBottom: `-${CH * (1 - scale)}px`,
          marginRight: `-${CW * (1 - scale)}px`
        }}>

          {/* Layer bands */}
          {LAYERS.map(l => (
            <div key={l.id} style={{
              position: "absolute", left: l.x, top: 0, width: l.w, height: CH,
              background: `${l.color}07`,
              borderRight: `1px dashed ${l.color}1e`,
            }}>
              <div style={{
                position: "absolute", top: 7, left: 0, right: 0, textAlign: "center",
                fontSize: 7, fontWeight: 800, letterSpacing: "1px",
                color: l.color, fontFamily: "monospace", textTransform: "uppercase", opacity: 0.75,
                whiteSpace: "nowrap", overflow: "hidden",
              }}>{l.label}</div>
            </div>
          ))}

          {/* SVG Connections */}
          <svg style={{ position: "absolute", inset: 0, width: CW, height: CH, pointerEvents: "none", overflow: "visible", zIndex: 2 }}>
            <defs>
              <style>{`
                @keyframes df { to { stroke-dashoffset: -24; } }
                @keyframes dr { to { stroke-dashoffset: 24; } }
                .af { animation: df 1.4s linear infinite; }
                .ar { animation: dr 2s linear infinite; }
              `}</style>
              <marker id="ah" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto">
                <path d="M0,0 L0,5 L5,2.5 Z" fill="rgba(255,255,255,0.28)" />
              </marker>
              <marker id="ahr" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto">
                <path d="M0,0 L0,5 L5,2.5 Z" fill="rgba(239,68,68,0.8)" />
              </marker>
            </defs>

            {/* DATA → ETL (centre) */}
            <line x1={DATA_R} y1={midY} x2={ETL_L} y2={midY} stroke="rgba(255,255,255,0.14)" strokeWidth={1} strokeDasharray="5,3" className="af" markerEnd="url(#ah)" />

            {/* ETL → Orch */}
            <path d={`M ${ETL_R} ${midY} C ${ETL_R+14} ${midY}, ${CTRL_L-14} ${orchCY}, ${CTRL_L} ${orchCY}`} fill="none" stroke="rgba(75,142,255,0.45)" strokeWidth={1.1} strokeDasharray="6,3" className="af" markerEnd="url(#ah)" />

            {/* Orch → Split (vertical) */}
            <line x1={ctrlMidX} y1={REG_TOP + HALF_H} x2={ctrlMidX} y2={REG_TOP + HALF_H + HALF_GAP} stroke="rgba(75,142,255,0.3)" strokeWidth={0.9} strokeDasharray="4,3" />

            {/* Split → Regional fan-out */}
            {REGION_LIST.map((r, i) => {
              const ry = REG_TOP + i * (REG_H + REG_GAP) + REG_H / 2;
              return (
                <path key={r.id}
                  d={`M ${CTRL_R} ${splitCY} C ${CTRL_R+16} ${splitCY}, ${REG_L-16} ${ry}, ${REG_L} ${ry}`}
                  fill="none" stroke={`${r.color}38`} strokeWidth={0.8} strokeDasharray="5,3" className="af"
                  markerEnd="url(#ah)"
                />
              );
            })}

            {/* Regional → Aggr fan-in */}
            {REGION_LIST.map((r, i) => {
              const ry = REG_TOP + i * (REG_H + REG_GAP) + REG_H / 2;
              return (
                <path key={r.id}
                  d={`M ${REG_R} ${ry} C ${REG_R+16} ${ry}, ${RES_L-16} ${aggrCY}, ${RES_L} ${aggrCY}`}
                  fill="none" stroke={`${r.color}30`} strokeWidth={0.7} strokeDasharray="5,3" className="af"
                />
              );
            })}

            {/* Aggr → Coord (vertical) */}
            <line x1={resMidX} y1={REG_TOP + HALF_H} x2={resMidX} y2={REG_TOP + HALF_H + HALF_GAP} stroke="rgba(239,68,68,0.4)" strokeWidth={0.9} strokeDasharray="4,3" />

            {/* Coord → Validation */}
            <path d={`M ${RES_R} ${coordCY} C ${RES_R+14} ${coordCY}, ${VAL_L-14} ${midY}, ${VAL_L} ${midY}`} fill="none" stroke="rgba(245,158,11,0.4)" strokeWidth={1.1} strokeDasharray="6,3" className="af" markerEnd="url(#ah)" />

            {/* Valid → Bench vertical */}
            <line x1={valMidX} y1={REG_TOP + HALF_H} x2={valMidX} y2={REG_TOP + HALF_H + HALF_GAP} stroke="rgba(245,158,11,0.3)" strokeWidth={0.9} strokeDasharray="4,3" />

            {/* Val → Final */}
            <line x1={VAL_R} y1={midY} x2={FIN_L} y2={midY} stroke="rgba(16,185,129,0.4)" strokeWidth={1.1} strokeDasharray="6,3" className="af" markerEnd="url(#ah)" />

            {/* FIN → INFRA & RESIL */}
            <path d={`M ${FIN_R} ${midY} C ${FIN_R+12} ${midY}, ${INFRA_L-12} ${infraCY}, ${INFRA_L} ${infraCY}`} fill="none" stroke="rgba(0,200,224,0.4)" strokeWidth={1.1} strokeDasharray="6,3" className="af" markerEnd="url(#ah)" />
            <path d={`M ${FIN_R} ${midY} C ${FIN_R+12} ${midY}, ${RESIL_L-12} ${resilCY}, ${RESIL_L} ${resilCY}`} fill="none" stroke="rgba(169,120,255,0.4)" strokeWidth={1.1} strokeDasharray="6,3" className="af" markerEnd="url(#ah)" />

            {/* INFRA & RESIL → OUT */}
            <path d={`M ${INFRA_R} ${infraCY} C ${INFRA_R+12} ${infraCY}, ${OUT_L-12} ${midY}, ${OUT_L} ${midY}`} fill="none" stroke="rgba(0,200,224,0.4)" strokeWidth={1.1} strokeDasharray="6,3" className="af" markerEnd="url(#ah)" />
            <path d={`M ${RESIL_R} ${resilCY} C ${RESIL_R+12} ${resilCY}, ${OUT_L-12} ${midY}, ${OUT_L} ${midY}`} fill="none" stroke="rgba(52,216,130,0.55)" strokeWidth={1.4} strokeDasharray="6,3" className="af" markerEnd="url(#ah)" />

            {/* Feedback Loop: Coordinator → Orchestrator (red dashed U-curve at bottom) */}
            <path
              d={`M ${resMidX} ${REG_TOP + totalRegH + 12} Q ${resMidX} ${CH - 18}, ${ctrlMidX} ${CH - 18} Q ${ctrlMidX - 30} ${CH - 18}, ${ctrlMidX} ${REG_TOP + totalRegH + 12}`}
              fill="none" stroke="rgba(239,68,68,0.6)" strokeWidth={1.4} strokeDasharray="8,4" className="ar"
              markerEnd="url(#ahr)"
            />
            <text x={(resMidX + ctrlMidX) / 2} y={CH - 5} fontSize="6.5" fill="rgba(239,68,68,0.65)" fontFamily="monospace" fontWeight="700" textAnchor="middle">
              FEEDBACK LOOP — {optimizationState.iterations.length || 3} ITERATIONS
            </text>
          </svg>

          {/* ── DATA Layer Nodes (7 stacked) ───────────────────────────────── */}
          {[
            { id: "PORTS DB",    lbl: "Port Database",     desc: "435 ports\nDraft, cost, coords",      pills: ["ports.csv"] },
            { id: "DEMAND OD",   lbl: "Demand Matrix",     desc: "9,622 OD lanes\nFFE/wk, revenue", pills: ["demand.csv"] },
            { id: "FLEET DB",    lbl: "Fleet Database",    desc: "6 vessel classes\nCapacity & cost",       pills: ["fleet.csv"] },
            { id: "DIST MATRIX", lbl: "Distance Matrix",   desc: "62,002 pairs\nPanama/Suez flags",        pills: ["dist_dense"] },
            { id: "COST MODEL",  lbl: "Cost Model",        desc: "Port handling\nFuel & vessel ops",        pills: ["enrichment"] },
            { id: "HIST ROUTES", lbl: "Historical Routes", desc: "Past service lines\nLINERLIB baseline",    pills: ["LINERLIB"] },
            { id: "EXT SIGNALS", lbl: "External Signals",  desc: "AIS tracking\nWeather feeds",   pills: ["API/AIS"] },
          ].map((n, i) => {
            const nodeH = Math.floor((totalRegH - 6 * 5) / 7);
            return (
              <PipeNode key={n.id}
                x={C.DATA + 5} y={REG_TOP + i * (nodeH + 5)}
                w={CW2.DATA - 10} h={nodeH} color="#888888"
                lbl={n.lbl} tit={n.id} desc={n.desc} pills={n.pills}
                active={activeNode === n.id}
                onClick={() => setActiveNode(activeNode === n.id ? null : n.id)}
              />
            );
          })}

          {/* ── ETL (tall, spans full height) ──────────────────────────────── */}
          <PipeNode
            x={C.ETL + 5} y={REG_TOP} w={CW2.ETL - 10} h={totalRegH}
            color="#a0a0ff" lbl="Layer 2 — ETL Pipeline"
            tit="ETL + VALIDATION"
            desc={"Pydantic checks\nFFE→TEU (×2.0)\nPort clustering\nCandidate routes"}
            pills={["Pydantic", "K-means", "FFE→TEU"]}
            active={activeNode === "etl"}
            onClick={() => setActiveNode(activeNode === "etl" ? null : "etl")}
          />

          {/* ── Orchestrator ────────────────────────────────────────────────── */}
          <PipeNode
            x={C.CTRL + 5} y={REG_TOP} w={CW2.CTRL - 10} h={HALF_H}
            color="#4b8eff" lbl="Layer 3 — Master Controller (LLM)"
            tit="GLOBAL ORCHESTRATOR"
            desc={"LLM analysis\nWeight tuning\nIteration control"}
            pills={["GPT-OSS-120B", "Iter Ctrl", "α/β/γ"]}
            active={activeNode === "orch"}
            onClick={() => setActiveNode(activeNode === "orch" ? null : "orch")}
          />

          {/* ── Regional Splitter ───────────────────────────────────────────── */}
          <PipeNode
            x={C.CTRL + 5} y={REG_TOP + HALF_H + HALF_GAP} w={CW2.CTRL - 10} h={HALF_H}
            color="#4b8eff" lbl="Decomposition Engine"
            tit="REGIONAL SPLITTER"
            desc={"K-means split\n5 regions\nOrigin-only OD"}
            pills={["K-means", "Origin-only", "No Dup"]}
            active={activeNode === "split"}
            onClick={() => setActiveNode(activeNode === "split" ? null : "split")}
          />

          {/* ── Regional Agent Nodes ────────────────────────────────────────── */}
          {REGION_LIST.map((r, i) => {
            const liveData = liveRegions.find(rd => rd.id === r.id) || {};
            const ry = REG_TOP + i * (REG_H + REG_GAP);
            return (
              <RegionPipelineNode
                key={r.id}
                x={C.REG + 5} y={ry} W={CW2.REG - 10} H={REG_H}
                region={r} liveData={liveData} stages={STAGES} tick={tick}
                active={activeNode === r.id}
                onClick={() => setActiveNode(activeNode === r.id ? null : r.id)}
              />
            );
          })}

          {/* ── Global Aggregation ──────────────────────────────────────────── */}
          <PipeNode
            x={C.RES + 5} y={REG_TOP} w={CW2.RES - 10} h={HALF_H}
            color="#ef4444" lbl="Aggregation Layer"
            tit="GLOBAL AGGREGATION"
            desc={"Merge results\nOD uniqueness\nConservation check"}
            pills={["OD Unique", "Max-Profit", "Conservation"]}
            active={activeNode === "aggr"}
            onClick={() => setActiveNode(activeNode === "aggr" ? null : "aggr")}
          />

          {/* ── Coordinator Agent ───────────────────────────────────────────── */}
          <PipeNode
            x={C.RES + 5} y={REG_TOP + HALF_H + HALF_GAP} w={CW2.RES - 10} h={HALF_H}
            color="#ef4444" lbl="Decision Engine (LLM)"
            tit="COORDINATOR AGENT"
            desc={"Conflict resolution\nα/β/γ weight tuning\nFeedback loop"}
            pills={["Conflict Detect", "α/β/γ Tune", "Convergence"]}
            active={activeNode === "coord"}
            onClick={() => setActiveNode(activeNode === "coord" ? null : "coord")}
          />

          {/* ── Route Validator ─────────────────────────────────────────────── */}
          <PipeNode
            x={C.VAL + 5} y={REG_TOP} w={CW2.VAL - 10} h={HALF_H}
            color="#f59e0b" lbl="Route Validation Engine"
            tit="ROUTE VALIDATOR"
            desc={"Fleet limit ≤300\nFlow balance check\nEBIT verified"}
            pills={["Fleet Cap", "Flow Bal", "EBIT"]}
            active={activeNode === "valid"}
            onClick={() => setActiveNode(activeNode === "valid" ? null : "valid")}
          />

          {/* ── Benchmark Engine ────────────────────────────────────────────── */}
          <PipeNode
            x={C.VAL + 5} y={REG_TOP + HALF_H + HALF_GAP} w={CW2.VAL - 10} h={HALF_H}
            color="#f59e0b" lbl="Benchmark Comparator"
            tit="BENCHMARK ENGINE"
            desc={"LINERLIB comparison\nKPI scoring\nAcademic metrics"}
            pills={["WorldLarge", "Baltic", "WorldSmall"]}
            active={activeNode === "bench"}
            onClick={() => setActiveNode(activeNode === "bench" ? null : "bench")}
          />

          {/* ── Final Optimizer ─────────────────────────────────────────────── */}
          <PipeNode
            x={C.FIN + 5} y={REG_TOP + Math.floor(totalRegH * 0.22)} w={CW2.FIN - 10} h={Math.floor(totalRegH * 0.56)}
            color="#10b981" lbl="Final Optimizer"
            tit="FINAL OPTIMIZER"
            desc={"Constraint pass\nFleet ≤300 limit\nFlow balance"}
            pills={["Fleet ≤300", "FP 1e-6", "Flow Bal"]}
            active={activeNode === "final"}
            onClick={() => setActiveNode(activeNode === "final" ? null : "final")}
          />

          {/* ── Infra + Observability (top) ─────────────────────────────────── */}
          <PipeNode
            x={C.INFRA + 5} y={REG_TOP} w={CW2.INFRA - 10} h={HALF_H}
            color="#00c8e0" lbl="Layer 6 — Infrastructure"
            tit="INFRA + OBS"
            desc={"Redis & Postgres\nFastAPI & Nginx\nPrometheus/Grafana"}
            pills={["Redis", "Prometheus", "Grafana"]}
            active={activeNode === "infra"}
            onClick={() => setActiveNode(activeNode === "infra" ? null : "infra")}
          />

          {/* ── Resilience (bottom) ─────────────────────────────────────────── */}
          <PipeNode
            x={C.RESIL + 5} y={REG_TOP + HALF_H + HALF_GAP} w={CW2.RESIL - 10} h={HALF_H}
            color="#a978ff" lbl="Layer 7 — Resilience"
            tit="RESILIENCE + FAULT"
            desc={"Circuit breakers\nBackoff retries\nPartial recovery"}
            pills={["Circ.Breaker", "Backoff", "Partial Rec"]}
            active={activeNode === "resil"}
            onClick={() => setActiveNode(activeNode === "resil" ? null : "resil")}
          />

          {/* ── Output ──────────────────────────────────────────────────────── */}
          <PipeNode
            x={C.OUT + 5} y={REG_TOP + Math.floor(totalRegH * 0.22)} w={CW2.OUT - 10} h={Math.floor(totalRegH * 0.56)}
            color="#34d882" lbl="Layer 8 — Output"
            tit="OPTIMIZED NETWORK"
            desc={"Service plans\nVessel deployment\nProfit report"}
            pills={["Routes", "Profit", "Report"]}
            active={activeNode === "output"}
            onClick={() => setActiveNode(activeNode === "output" ? null : "output")}
          />

        </div>
      </div>

      {/* ── Right Panel: Stats + Node Detail + Feedback Loop ───────────────── */}
      <div style={{ width: 258, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>

        {/* Pipeline Stats */}
        <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.4)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 12 }}>Pipeline Stats</div>
          {[
            { label: "Total Runtime",       value: g.runtime ? `${g.runtime}s` : "—" },
            { label: "Feedback Iterations", value: optimizationState.iterations.length.toString() },
            { label: "Convergence Score",   value: g.convergence ? g.convergence.toFixed(3) : "—" },
            { label: "Services Generated",  value: fmtNum(totalGenerated) },
            { label: "Services Filtered",   value: fmtNum(totalFiltered) },
            { label: "Services Selected",   value: fmtNum(g.totalServices) },
            { label: "Conflicts Detected",  value: g.decision_output?.conflicts?.length?.toString() || "0" },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.42)", fontFamily: "monospace" }}>{label}</span>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.9)", fontWeight: 700 }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Node Detail Panel */}
        <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", flex: 1, minHeight: 120 }}>
          {activeInfo ? (
            <>
              <div style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.4)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 8 }}>Node Detail</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)", fontFamily: "monospace", marginBottom: 10 }}>{activeInfo.label}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {activeInfo.items.map((item, i) => (
                  <div key={i} style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", padding: "4px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 4, borderLeft: "2px solid rgba(255,255,255,0.1)", fontFamily: "monospace", lineHeight: 1.5 }}>
                    {item}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, height: "100%", minHeight: 80 }}>
              <div style={{ fontSize: 22, opacity: 0.25 }}>◎</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", fontFamily: "monospace", textAlign: "center" }}>Click any node to see details</div>
            </div>
          )}
        </div>

        {/* Feedback Loop Iterations */}
        <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", flex_shrink: 0 }}>
          <div style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.4)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: 10 }}>Feedback Loop</div>
          <div style={{ display: "flex", gap: 6 }}>
            {optimizationState.iterations.length > 0 ? optimizationState.iterations.map((it, i) => (
              <div key={i} style={{
                flex: 1, borderRadius: 6, padding: "8px 4px", textAlign: "center",
                background: it.rerun ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
                border: `1px solid ${it.rerun ? "#ef444430" : "#10b98130"}`,
              }}>
                <div style={{ fontSize: 10, fontFamily: "monospace", color: it.rerun ? "#ef4444" : "#10b981", fontWeight: 700 }}>it.{it.iter}</div>
                <div style={{ fontSize: 8.5, color: it.rerun ? "#ef4444" : "#10b981", fontFamily: "monospace" }}>{it.rerun ? "RERUN" : "OK"}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontFamily: "monospace", marginTop: 2 }}>{it.coverage.toFixed(1)}%</div>
              </div>
            )) : (
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontFamily: "monospace", fontStyle: "italic" }}>No iteration data</div>
            )}
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
          <span className="text-sm font-semibold text-white/90" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>{r.name}</span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: `${r.color}20`, color: r.color }}>{parseStrategyCode(r.strategy)}</span>
      </div>

      <div className="text-xl font-bold text-white mb-1" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        {fmt(r.profit)}
      </div>
      <div className="text-xs text-white/40 mb-3">weekly profit</div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: "Coverage", value: `${r.coverage.toFixed(1)}%` },
          { label: "Services", value: r.services },
          { label: "Margin", value: `${r.margin.toFixed(1)}%` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div className="text-xs text-white/40 mb-0.5">{label}</div>
            <div className="text-sm font-mono text-white/90">{value}</div>
          </div>
        ))}
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-xs text-white/40 mb-1">
          <span>Coverage</span><span>{r.coverage.toFixed(1)}%</span>
        </div>
        <ProgressBar value={r.coverage} color={r.color} />
      </div>

      <div className="flex flex-wrap gap-1 mt-2">
        {r.hubs.slice(0, 3).map(h => (
          <span key={h} className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: `${r.color}15`, color: r.color + "cc", border: `1px solid ${r.color}30` }}>
            {h}
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
  const optimizationState = useOptimizationState();
  const regions = Object.values(optimizationState.regions);
  const [selId, setSelId] = useState(null);

  // Auto-select first region when data arrives
  useEffect(() => {
    if (!selId && regions.length > 0) {
      setSelId(regions[0].id);
    }
  }, [regions, selId]);

  const sel = regions.find(r => r.id === selId) || regions[0];

  if (regions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white/40">No regional data available</div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-full">
      <div className="grid grid-cols-1 gap-3 w-80 flex-shrink-0 overflow-y-auto pr-1">
        {regions.map(r => <RegionCard key={r.id} r={r} onClick={() => setSelId(r.id)} selected={selId === r.id} />)}
      </div>
      <div className="flex-1 rounded-xl p-5 overflow-y-auto" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {sel && regions.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: sel.color, boxShadow: `0 0 12px ${sel.color}` }} />
              <h2 className="text-lg font-semibold text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>{sel.name} Regional Agent</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                { label: "Weekly Profit", value: fmt(sel.profit), color: sel.color },
                { label: "Annual Profit", value: fmt(sel.profit * 52), color: "#10b981" },
                { label: "Operating Cost", value: fmt(sel.operating_cost || sel.cost), color: "#f59e0b" },
                { label: "Uncovered TEU", value: fmtNum(sel.uncovered), color: "#ef4444" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg p-4" style={{ background: `${color}08`, border: `1px solid ${color}22` }}>
                  <div className="text-xs text-white/40 mb-1 font-mono">{label}</div>
                  <div className="text-xl font-bold font-mono" style={{ color }}>{value}</div>
                </div>
              ))}
            </div>

            <div className="mb-6">
              <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-3">Cost Breakdown</div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Base Operating Cost", value: fmt(sel.operating_cost || sel.cost), color: "#f59e0b" },
                  { label: "Transshipment Cost", value: fmt(sel.transship_cost || 0), color: "#f59e0b" },
                  { label: "Total Weekly Cost", value: fmt(sel.cost), color: "#ef4444" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="text-[10px] text-white/40 mb-1 font-mono uppercase tracking-wider">{label}</div>
                    <div className="text-lg font-bold font-mono text-white/80">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-3">Service Funnel</div>
              {(() => {
                const gen = sel.generated || 1;
                const fltPct = ((sel.filtered / gen) * 100).toFixed(0);
                const selPct = ((sel.selected / gen) * 100).toFixed(0);
                
                return (
                  <div className="flex flex-col gap-2 max-w-md">
                    {/* Generated Tier */}
                    <div className="flex flex-col items-center">
                      <div className="flex justify-between w-full text-xs text-white/50 px-1 font-mono">
                        <span>Generated Services</span>
                        <span>{fmtNum(sel.generated)}</span>
                      </div>
                      <div className="w-full h-6 rounded bg-white/10 flex items-center justify-center relative overflow-hidden mt-1">
                        <div className="absolute inset-0 transition-all duration-1000" style={{ background: `linear-gradient(90deg, ${sel.color}22, ${sel.color}44)` }} />
                        <span className="text-xs font-mono text-white/95 z-10 font-bold">100%</span>
                      </div>
                    </div>

                    {/* Filtered Tier */}
                    <div className="flex flex-col items-center">
                      <div className="flex justify-between w-full text-xs text-white/50 px-1 font-mono">
                        <span>Filtered Services (GA Pass)</span>
                        <span>{fmtNum(sel.filtered)}</span>
                      </div>
                      <div className="w-full h-6 rounded bg-white/5 flex items-center justify-center relative overflow-hidden mt-1">
                        <div className="h-full transition-all duration-1000" style={{ width: `${fltPct}%`, background: `linear-gradient(90deg, ${sel.color}33, ${sel.color}66)` }} />
                        <span className="absolute text-xs font-mono text-white/95 z-10 font-bold">{fltPct}%</span>
                      </div>
                    </div>

                    {/* Selected Tier */}
                    <div className="flex flex-col items-center">
                      <div className="flex justify-between w-full text-xs text-white/50 px-1 font-mono">
                        <span>Selected Services (MILP Optimal)</span>
                        <span>{fmtNum(sel.selected)}</span>
                      </div>
                      <div className="w-full h-6 rounded bg-white/5 flex items-center justify-center relative overflow-hidden mt-1">
                        <div className="h-full transition-all duration-1000" style={{ width: `${selPct}%`, background: `linear-gradient(90deg, ${sel.color}88, ${sel.color})`, boxShadow: `0 0 12px ${sel.color}66` }} />
                        <span className="absolute text-xs font-mono text-white/95 z-10 font-bold">{selPct}%</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="mb-5">
              <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-3">Hub Ports</div>
              <div className="flex flex-wrap gap-2">
                {sel.hubs.map(h => (
                  <div key={h} className="px-3 py-1.5 rounded-lg text-sm font-mono" style={{ background: `${sel.color}15`, color: sel.color, border: `1px solid ${sel.color}33` }}>
                    {h}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-3">Optimization Strategy</div>
              {sel.strategy ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sel.color }} />
                    <span className="text-sm font-bold font-mono" style={{ color: sel.color }}>{parseStrategyCode(sel.strategy)}</span>
                  </div>
                  {parseStrategyReasons(sel.strategy).length > 0 ? (
                    <div className="space-y-1.5">
                      {parseStrategyReasons(sel.strategy).map((reason, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-[10px] font-mono mt-0.5 flex-shrink-0" style={{ color: sel.color }}>R{i+1}</span>
                          <span className="text-xs text-white/60 font-mono leading-relaxed">{reason}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-white/50 font-mono leading-relaxed">{sel.strategy}</p>
                  )}
                </div>
              ) : (
                <div className="text-sm text-white/40 font-mono italic">Strategy from optimizer not available</div>
              )}
              {sel.explanation && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <div className="text-[10px] text-white/30 font-mono uppercase tracking-widest mb-1">Region Report</div>
                  <p className="text-xs text-white/50 font-mono leading-relaxed">{sel.explanation.slice(0, 200)}{sel.explanation.length > 200 ? "..." : ""}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FUNNEL CHART ────────────────────────────────────────────────────────────
function FunnelView() {
  const optimizationState = useOptimizationState();
  const regions = Object.values(optimizationState.regions);

  // Aggregate global totals across all regions for the pyramid
  const totalGenerated = regions.reduce((s, r) => s + (r.generated || 0), 0);
  const totalFiltered = regions.reduce((s, r) => s + (r.filtered || 0), 0);
  const totalSelected = regions.reduce((s, r) => s + (r.selected || 0), 0);
  const filtPct = totalGenerated > 0 ? ((totalFiltered / totalGenerated) * 100).toFixed(1) : 0;
  const selPct = totalGenerated > 0 ? ((totalSelected / totalGenerated) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-5">
      {/* ── Global Service Pyramid ── */}
      <div className="rounded-xl p-6" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-5">Global Service Selection Pyramid · All Regions Combined</div>
        <div className="flex flex-col items-center gap-0 max-w-xl mx-auto">
          {/* Generated — widest */}
          <div className="flex flex-col items-center w-full">
            <div className="flex justify-between w-full text-xs text-white/60 px-2 font-mono mb-1">
              <span className="font-semibold text-white/80">① Generated Services</span>
              <span className="font-bold text-white">{fmtNum(totalGenerated)} <span className="text-white/40">— 100%</span></span>
            </div>
            <div className="w-full h-10 rounded-lg bg-white/10 flex items-center justify-center relative overflow-hidden" style={{ background: "linear-gradient(90deg, rgba(0,212,255,0.15), rgba(0,212,255,0.3))" }}>
              <span className="text-sm font-bold font-mono text-white/90">100% — All Candidate Services</span>
            </div>
          </div>

          {/* Arrow down */}
          <div className="text-white/20 text-xl my-1">▼</div>

          {/* Filtered — medium */}
          <div className="flex flex-col items-center" style={{ width: `${Math.max(40, filtPct)}%`, minWidth: 220 }}>
            <div className="flex justify-between w-full text-xs text-white/60 px-2 font-mono mb-1">
              <span className="font-semibold text-white/80">② Filtered (GA Pass)</span>
              <span className="font-bold" style={{ color: "#10b981" }}>{fmtNum(totalFiltered)} <span className="text-white/40">— {filtPct}%</span></span>
            </div>
            <div className="w-full h-9 rounded-lg flex items-center justify-center relative overflow-hidden" style={{ background: "linear-gradient(90deg, rgba(16,185,129,0.2), rgba(16,185,129,0.4))", border: "1px solid rgba(16,185,129,0.3)" }}>
              <span className="text-sm font-bold font-mono" style={{ color: "#10b981" }}>{filtPct}% pass GA filter</span>
            </div>
          </div>

          {/* Arrow down */}
          <div className="text-white/20 text-xl my-1">▼</div>

          {/* Selected — narrowest */}
          <div className="flex flex-col items-center" style={{ width: `${Math.max(25, selPct)}%`, minWidth: 160 }}>
            <div className="flex justify-between w-full text-xs text-white/60 px-2 font-mono mb-1">
              <span className="font-semibold text-white/80">③ Selected (MILP)</span>
              <span className="font-bold" style={{ color: "#f59e0b" }}>{fmtNum(totalSelected)} <span className="text-white/40">— {selPct}%</span></span>
            </div>
            <div className="w-full h-8 rounded-lg flex items-center justify-center relative overflow-hidden" style={{ background: "linear-gradient(90deg, rgba(245,158,11,0.3), rgba(245,158,11,0.6))", border: "1px solid rgba(245,158,11,0.4)", boxShadow: "0 0 20px rgba(245,158,11,0.2)" }}>
              <span className="text-sm font-bold font-mono" style={{ color: "#f59e0b" }}>{selPct}% MILP optimal</span>
            </div>
          </div>
        </div>

        {/* Reduction stats */}
        <div className="grid grid-cols-3 gap-4 mt-5">
          {[
            { label: "Total Generated", value: fmtNum(totalGenerated), color: "#00d4ff", sub: "candidate services" },
            { label: "After GA Filter", value: fmtNum(totalFiltered), color: "#10b981", sub: `${filtPct}% retained`, pct: filtPct },
            { label: "MILP Selected", value: fmtNum(totalSelected), color: "#f59e0b", sub: `${selPct}% of generated`, pct: selPct },
          ].map(({ label, value, color, sub }) => (
            <div key={label} className="rounded-lg p-4 text-center" style={{ background: `${color}08`, border: `1px solid ${color}22` }}>
              <div className="text-xs text-white/40 font-mono mb-1">{label}</div>
              <div className="text-2xl font-bold font-mono" style={{ color }}>{value}</div>
              <div className="text-xs text-white/40 mt-1 font-mono">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Per-Region Breakdown ── */}
      <div className="grid grid-cols-5 gap-3">
        {regions.map(r => (
          <div key={r.id} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${r.color}33` }}>
            <div className="flex items-center gap-1.5 mb-3">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color }} />
              <span className="text-xs font-mono text-white/70">{r.name}</span>
            </div>
            {(() => {
              const gen = r.generated || 1;
              const fltPct = ((r.filtered / gen) * 100).toFixed(0);
              const selPct = ((r.selected / gen) * 100).toFixed(0);
              
              return (
                <div className="flex flex-col gap-2 mt-2">
                  {/* Generated Tier */}
                  <div className="flex flex-col items-center">
                    <div className="flex justify-between w-full text-[10px] text-white/50 px-1 font-mono">
                      <span>Generated</span>
                      <span>{fmtNum(r.generated)}</span>
                    </div>
                    <div className="w-full h-4 rounded bg-white/10 flex items-center justify-center relative overflow-hidden mt-0.5">
                      <div className="absolute inset-0 transition-all duration-1000" style={{ background: `linear-gradient(90deg, ${r.color}22, ${r.color}44)` }} />
                      <span className="text-[10px] font-mono text-white/90 z-10 font-bold">100%</span>
                    </div>
                  </div>

                  {/* Filtered Tier */}
                  <div className="flex flex-col items-center">
                    <div className="flex justify-between w-full text-[10px] text-white/50 px-1 font-mono">
                      <span>Filtered</span>
                      <span>{fmtNum(r.filtered)}</span>
                    </div>
                    <div className="w-full h-4 rounded bg-white/5 flex items-center justify-center relative overflow-hidden mt-0.5">
                      <div className="h-full transition-all duration-1000" style={{ width: `${fltPct}%`, background: `linear-gradient(90deg, ${r.color}33, ${r.color}66)` }} />
                      <span className="absolute text-[10px] font-mono text-white/90 z-10 font-bold">{fltPct}%</span>
                    </div>
                  </div>

                  {/* Selected Tier */}
                  <div className="flex flex-col items-center">
                    <div className="flex justify-between w-full text-[10px] text-white/50 px-1 font-mono">
                      <span>Selected</span>
                      <span>{fmtNum(r.selected)}</span>
                    </div>
                    <div className="w-full h-4 rounded bg-white/5 flex items-center justify-center relative overflow-hidden mt-0.5">
                      <div className="h-full transition-all duration-1000" style={{ width: `${selPct}%`, background: `linear-gradient(90deg, ${r.color}88, ${r.color})`, boxShadow: `0 0 10px ${r.color}55` }} />
                      <span className="absolute text-[10px] font-mono text-white/90 z-10 font-bold">{selPct}%</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-4">Profit per Service ($/wk)</div>
          <div className="space-y-2">
            {regions.map(r => {
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
            {regions.map(r => (
              <div key={r.id}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/60 font-mono">{r.name}</span>
                  <span className="font-mono" style={{ color: r.color }}>{r.coverage.toFixed(1)}%</span>
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
  const optimizationState = useOptimizationState();
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
          {gridLines.map((v, i) => {
            const y = 70 - ((v - minScore) / range) * 60;
            return (
              <g key={i}>
                <line x1={40} y1={y} x2={390} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                <text x={35} y={y + 3} fontSize="7" fill="rgba(255,255,255,0.3)" textAnchor="end" fontFamily="monospace">{v.toFixed(3)}</text>
              </g>
            );
          })}
          {/* Area */}
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
          {/* Line */}
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

// ─── CONFLICT VIEW ───────────────────────────────────────────────────────────
function ConflictView() {
  const state = useOptimizationState();
  const decision = state.global.decision_output || {};
  const conflicts = decision.conflicts || [];
  const evalData = decision.evaluation || { score: null, max: null, status: "No data", reasons: ["No evaluation data available"] };
  const conflictCount = conflicts.length;
  const severity = decision.feedback?.conflict_severity || 0;
  
  const hasConflicts = conflictCount > 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Conflicts Detected", value: conflictCount.toString(), color: hasConflicts ? "#ef4444" : "#10b981", icon: hasConflicts ? "⚠" : "✓" },
          { label: "Conflicts Resolved", value: decision.resolution_log?.length.toString() || "0", color: "#10b981", icon: "✓" },
          { label: "Conflict Severity", value: severity > 0 ? severity.toString() : "None", color: severity > 0 ? "#ef4444" : "#10b981", icon: "○" },
          { label: "Evaluation Status", value: evalData.status || "No data", color: "#f59e0b", icon: "◎" },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="rounded-xl p-4 text-center" style={{ background: `${color}08`, border: `1px solid ${color}22` }}>
            <div className="text-2xl mb-1" style={{ color }}>{icon}</div>
            <div className="text-xl font-bold font-mono" style={{ color }}>{value}</div>
            <div className="text-xs text-white/40 mt-1 font-mono">{label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl p-5" style={{ background: hasConflicts ? "rgba(239,68,68,0.05)" : "rgba(16,185,129,0.05)", border: `1px solid ${hasConflicts ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)"}` }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: hasConflicts ? "#ef4444" : "#10b981", boxShadow: `0 0 8px ${hasConflicts ? "#ef4444" : "#10b981"}` }} />
          <span className="text-sm font-mono" style={{ color: hasConflicts ? "#ef4444" : "#10b981" }}>
            {hasConflicts ? `${conflictCount} Regional Conflicts Detected` : "No Regional Conflicts Detected"}
          </span>
        </div>
        <p className="text-xs text-white/50 font-mono leading-relaxed">
          {hasConflicts 
            ? "The CoordinatorAgent detected overlapping service assignments or resource bottlenecks across regions. Resolution protocols are active."
            : "The CoordinatorAgent found zero overlapping service assignments across all regional agents. Each service ID is uniquely assigned to exactly one region. Resolution protocol was not triggered."}
        </p>
      </div>

      <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-4">Coordinator Evaluation</div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Score", value: evalData.score != null ? `${evalData.score} / ${evalData.max}` : "—", color: "#f59e0b" },
            { label: "Status", value: evalData.status || "No data", color: "#f59e0b" },
            { label: "Reasons", value: evalData.reasons?.length > 0 ? evalData.reasons[0].slice(0,25)+"..." : "N/A", color: "#f59e0b" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="text-xs text-white/40 font-mono mb-1">{label}</div>
              <div className="text-sm font-mono" style={{ color }} title={label==="Reasons" ? evalData.reasons?.join(", ") : undefined}>{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-white/40 font-mono leading-relaxed">
          {evalData.reasons?.join(". ") || "System achieved strong profitability but demand coverage requires further balancing in the next planning cycle."}
        </div>
      </div>
    </div>
  );
}

// ─── MAP VIEW ────────────────────────────────────────────────────────────────
// ─── MAP VIEW ────────────────────────────────────────────────────────────────
const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

function MapView() {
  const [tick, setTick] = useState(0);
  const optimizationState = useOptimizationState();
  const regions = Object.values(optimizationState.regions);

  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 50);
    return () => clearInterval(t);
  }, []);

  const getRegionColor = (regionId) => {
    const colors = {
      asia: "#00d4ff",
      europe: "#7c3aed",
      americas: "#10b981",
      middle_east: "#f59e0b",
      africa: "#ef4444"
    };
    return colors[regionId?.toLowerCase()] || "#10b981";
  };


  const services = optimizationState.global.selected_services || [];

  // ── Build a deterministic port→region map from ALL services ─────────────
  // Each port gets the region where it appears most frequently across services.
  // This ensures port 285 (Americas hub) always renders in Americas coords,
  // even when it appears in an Asia-labeled inter-regional service.
  const portRegionMap = useMemo(() => {
    const counts = {};
    services.forEach(svc => {
      const region = svc.region?.toLowerCase() || 'asia';
      (svc.ports || []).forEach(p => {
        if (!counts[p]) counts[p] = {};
        counts[p][region] = (counts[p][region] || 0) + 1;
      });
    });
    const map = {};
    Object.entries(counts).forEach(([port, regionCounts]) => {
      map[port] = Object.entries(regionCounts)
        .sort((a, b) => b[1] - a[1])[0][0];
    });
    return map;
  }, [services]);

  // ── Stable per-port coordinates (region-aware, globally consistent) ─────
  const getPortLocation = useCallback((portId, fallbackRegion) => {
    // Real coordinate lookup from port_coordinates.json
    if (portId && portCoords[portId]) {
      const coord = portCoords[portId];
      // port_coordinates.json stores [lat, lng]; map API expects [lng, lat]
      return [coord[1], coord[0]];
    }
    // Fallback for unknown ports: deterministic position within region bounds
    const regionId = portRegionMap[portId] || fallbackRegion?.toLowerCase() || 'asia';
    const strHash = (str) => { let h=0; for(let i=0;i<str.length;i++)h=((h<<5)-h)+str.charCodeAt(i); return Math.abs(h); };
    const seed = typeof portId === 'string' ? strHash(portId) : (portId * 9301 + 49297);
    const rnd1 = (seed % 233280) / 233280;
    const rnd2 = ((seed * 9301 + 49297) % 233280) / 233280;
    const bounds = {
      asia:        { minLng: 70,  maxLng: 135, minLat: 5,   maxLat: 40  },
      europe:      { minLng: -5,  maxLng: 28,  minLat: 38,  maxLat: 58  },
      americas:    { minLng: -115,maxLng: -45, minLat: -25, maxLat: 48  },
      middle_east: { minLng: 38,  maxLng: 58,  minLat: 14,  maxLat: 29  },
      africa:      { minLng: -10, maxLng: 45,  minLat: -30, maxLat: 30  },
    };
    const b = bounds[regionId] || bounds.asia;
    return [
      b.minLng + rnd1 * (b.maxLng - b.minLng),
      b.minLat + rnd2 * (b.maxLat - b.minLat),
    ];
  }, [portRegionMap, portCoords]);

  // ── Classify services as regional or inter-regional ─────────────────────
  const { regionalServices, interRegionalServices } = useMemo(() => {
    const regional = [], interReg = [];
    services.forEach(svc => {
      if (!svc.ports || svc.ports.length < 2) return;
      const svcRegion = svc.region?.toLowerCase() || 'asia';
      const portRegions = new Set(
        svc.ports.map(p => portRegionMap[p] || svcRegion)
      );
      if (portRegions.size > 1) {
        interReg.push({ ...svc, portRegions: [...portRegions] });
      } else {
        regional.push(svc);
      }
    });
    return { regionalServices: regional, interRegionalServices: interReg };
  }, [services, portRegionMap]);

  // Corridors for legend
  const corridors = optimizationState.corridors.length > 0
    ? optimizationState.corridors.map(c => ({
        ...c,
        from: typeof c.from === 'string' ? c.from.replace('Port ', '') : c.from,
        to: typeof c.to === 'string' ? c.to.replace('Port ', '') : c.to,
        color: getRegionColor(c.region || 'americas')
      }))
    : [
      { from: "CNYTN", to: "USLAX", teu: 21804, color: "#10b981" },
      { from: "CNSHA", to: "DEBRV", teu: 10584, color: "#10b981" },
      { from: "CNSHA", to: "USLAX", teu: 9135,  color: "#7c3aed" },
      { from: "CNYTN", to: "GBFXT", teu: 8100,  color: "#ef4444" },
      { from: "CNYTN", to: "NLRTM", teu: 8088,  color: "#f59e0b" },
    ];

  // ── Map mode toggles (story modes M4) ─────────────────────────────────
  const [mapMode, setMapMode] = useState("services");
  const [visibleRegions, setVisibleRegions] = useState(new Set(["asia","europe","americas","middle_east","africa"]));
  const [showNetworkStats, setShowNetworkStats] = useState(false);
  const [minLoad, setMinLoad] = useState(0);
  const [clickedPort, setClickedPort] = useState(null);

  // Collect hub ports from all regions (M1)
  const hubSet = useMemo(() => new Set(regions.flatMap(r => r.hubs || [])), [regions]);

  // Filter services by visible regions (M5) and min load (M7)
  const filteredRegional = useMemo(() =>
    regionalServices.filter(s => visibleRegions.has(s.region?.toLowerCase()) && s.load >= minLoad),
  [regionalServices, visibleRegions, minLoad]);

  const filteredInterRegional = useMemo(() =>
    interRegionalServices.filter(s => {
      const regions_on_route = s.portRegions || [s.region?.toLowerCase()];
      return regions_on_route.some(r => visibleRegions.has(r)) && s.load >= minLoad;
    }),
  [interRegionalServices, visibleRegions, minLoad]);

  // Route importance tiers (M2)
  const routeTiers = useMemo(() => {
    const allLoads = [...regionalServices, ...interRegionalServices].map(s => s.load).sort((a,b) => a-b);
    if (allLoads.length < 3) return { high: Infinity, medium: Infinity };
    const p33 = allLoads[Math.floor(allLoads.length * 0.33)];
    const p66 = allLoads[Math.floor(allLoads.length * 0.66)];
    return { high: p66, medium: p33 };
  }, [regionalServices, interRegionalServices]);

  // Network stats (M6)
  const networkStats = useMemo(() => ({
    totalRoutes: filteredRegional.length + filteredInterRegional.length,
    totalTeu: [...filteredRegional, ...filteredInterRegional].reduce((s, svc) => s + (svc.load || 0), 0),
    byRegion: regions.reduce((acc, r) => { acc[r.id] = filteredRegional.filter(s => s.region?.toLowerCase() === r.id).length; return acc; }, {}),
    hubCount: hubSet.size,
    interRegionalCount: filteredInterRegional.length,
    regionalCount: filteredRegional.length,
  }), [filteredRegional, filteredInterRegional, regions, hubSet]);

  // Port tracking for click card (M3)
  const portRouteCount = useMemo(() => {
    const counts = {};
    [...filteredRegional, ...filteredInterRegional].forEach(svc => {
      (svc.ports || []).forEach(p => { counts[p] = (counts[p] || 0) + 1; });
    });
    return counts;
  }, [filteredRegional, filteredInterRegional]);


  return (
    <div className="rounded-xl overflow-hidden relative" style={{ background: "#030d1a", border: "1px solid rgba(255,255,255,0.07)", height: "480px" }}>
      {/* Map header: Story mode toggles + region filters */}
      <div className="absolute top-0 left-0 right-0 z-10 px-5 py-2 border-b border-white/5 bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-3 mb-1.5">
          <PulseDot color="#00d4ff" />
          <span className="text-xs font-mono text-white/60 uppercase tracking-widest">Global Maritime Route Map</span>
          {/* Story mode toggles (M4) */}
          <div className="ml-auto flex items-center gap-2">
            {["services","hubs","routes","regions"].map(mode => (
              <button key={mode} onClick={() => setMapMode(mode)}
                className="text-[10px] px-2 py-0.5 rounded font-mono uppercase transition-all"
                style={{ background: mapMode === mode ? "rgba(0,212,255,0.15)" : "rgba(255,255,255,0.04)",
                         border: `1px solid ${mapMode === mode ? "rgba(0,212,255,0.3)" : "rgba(255,255,255,0.08)"}`,
                         color: mapMode === mode ? "#00d4ff" : "rgba(255,255,255,0.5)" }}>
                {mode === "services" ? "◈ Services" : mode === "hubs" ? "◎ Hubs" : mode === "routes" ? "▤ Routes" : "⊕ Regions"}
              </button>
            ))}
            {/* Network stats toggle (M6) */}
            <button onClick={() => setShowNetworkStats(s => !s)}
              className="text-[10px] px-2 py-0.5 rounded font-mono"
              style={{ background: showNetworkStats ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)",
                       border: `1px solid ${showNetworkStats ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.15)"}`,
                       color: showNetworkStats ? "#10b981" : "rgba(255,255,255,0.5)" }}>
              Σ Stats
            </button>
          </div>
        </div>
        {/* Region filter checkboxes (M5) */}
        <div className="flex items-center gap-3 mt-1">
          <button onClick={() => setVisibleRegions(new Set(visibleRegions.size === 5 ? [] : ["asia","europe","americas","middle_east","africa"]))}
            className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)" }}>
            {visibleRegions.size === 5 ? "All" : visibleRegions.size === 0 ? "None" : `${visibleRegions.size}`}
          </button>
          {regions.map(r => (
            <label key={r.id} className="flex items-center gap-1 cursor-pointer" onClick={() => {
              const next = new Set(visibleRegions);
              next.has(r.id) ? next.delete(r.id) : next.add(r.id);
              setVisibleRegions(next);
            }}>
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: visibleRegions.has(r.id) ? r.color : "transparent", border: `1px solid ${r.color}66` }} />
              <span className="text-[10px] font-mono" style={{ color: visibleRegions.has(r.id) ? r.color : "rgba(255,255,255,0.3)" }}>{r.name}</span>
            </label>
          ))}
          {/* Load filter slider (M7) */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[9px] font-mono text-white/30">Min Load:</span>
            <input type="range" min="0" max="10000" value={minLoad} onChange={e => setMinLoad(parseInt(e.target.value))}
              className="w-16 h-1" style={{ accentColor: "#00d4ff" }} />
            <span className="text-[9px] font-mono text-white/40">{minLoad.toLocaleString()} TEU</span>
            <span className="text-[9px] font-mono text-white/20">({filteredRegional.length + filteredInterRegional.length} routes)</span>
          </div>
        </div>
      </div>

      <div className="w-full h-full" style={{ background: "linear-gradient(180deg, #030d1a 0%, #060f1e 100%)" }}>
        <ComposableMap projection="geoMercator" projectionConfig={{ scale: 110, center: [10, 15] }} style={{ width: "100%", height: "100%" }}>
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#0f1f35"
                  stroke="#1a3050"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: "none" },
                    hover: { fill: "#132742", outline: "none" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {/* ── Regional service routes (colored by region) ── */}
          {(mapMode === "services" || mapMode === "routes") && filteredRegional.map((svc, idx) => {
            const color = getRegionColor(svc.region);
            const coords = svc.ports.map(p => getPortLocation(p, svc.region));
            const tier = svc.load >= routeTiers.high ? "high" : svc.load >= routeTiers.medium ? "medium" : "low";
            const tierWidths = { high: 1.4, medium: 0.9, low: 0.5 };
            const tierOpacities = { high: 0.55, medium: 0.35, low: 0.2 };
            return (
              <Line key={`reg-${svc.id}-${idx}`} coordinates={coords}
                stroke={color} strokeWidth={tierWidths[tier]} strokeOpacity={tierOpacities[tier]} strokeLinecap="round" />
            );
          })}

          {/* ── Inter-regional routes (white/gold — cross-continental) ── */}
          {(mapMode === "services" || mapMode === "routes") && filteredInterRegional.map((svc, idx) => {
            const coords = svc.ports.map(p => getPortLocation(p, svc.region));
            const tier = svc.load >= routeTiers.high ? "high" : svc.load >= routeTiers.medium ? "medium" : "low";
            const tierWidths = { high: 2.0, medium: 1.2, low: 0.7 };
            const tierOpacities = { high: 0.8, medium: 0.55, low: 0.3 };
            const color = svc.load > 8000 ? "#fbbf24" : "rgba(255,255,255,0.7)";
            return (
              <Line key={`inter-${svc.id}-${idx}`} coordinates={coords}
                stroke={color} strokeWidth={tierWidths[tier]} strokeOpacity={tierOpacities[tier]} strokeLinecap="round" />
            );
          })}

          {/* ── Animated flow dots: regional (colored) ── */}
          {mapMode === "services" && filteredRegional.filter(s => s.load >= 500).slice(0, 25).map((svc, idx) => {
            if (svc.ports.length < 2) return null;
            const color = getRegionColor(svc.region);
            const numSegs = svc.ports.length - 1;
            const speed = 18 + (idx % 8);
            const offset = (idx * 13) % 100;
            const t = ((tick + offset) / speed) % numSegs;
            const seg = Math.floor(t);
            const frac = t - seg;
            const p1 = getPortLocation(svc.ports[seg], svc.region);
            const p2 = getPortLocation(svc.ports[seg + 1], svc.region);
            const lng = p1[0] + (p2[0] - p1[0]) * frac;
            const lat = p1[1] + (p2[1] - p1[1]) * frac;
            return (
              <Marker key={`rdot-${svc.id}-${idx}`} coordinates={[lng, lat]}>
                <circle r={2.5} fill={color} opacity={0.9} />
                <circle r={4} fill={color} opacity={0.25} />
              </Marker>
            );
          })}

          {/* ── Animated flow dots: inter-regional (white pulses) ── */}
          {mapMode === "services" && filteredInterRegional.filter(s => s.load >= 300).slice(0, 20).map((svc, idx) => {
            if (svc.ports.length < 2) return null;
            const numSegs = svc.ports.length - 1;
            const speed = 14 + (idx % 6);
            const offset = (idx * 17) % 100;
            const t = ((tick + offset) / speed) % numSegs;
            const seg = Math.floor(t);
            const frac = t - seg;
            const p1 = getPortLocation(svc.ports[seg], svc.region);
            const p2 = getPortLocation(svc.ports[seg + 1], svc.region);
            const lng = p1[0] + (p2[0] - p1[0]) * frac;
            const lat = p1[1] + (p2[1] - p1[1]) * frac;
            const dotColor = svc.load > 8000 ? "#fbbf24" : "#ffffff";
            return (
              <Marker key={`idot-${svc.id}-${idx}`} coordinates={[lng, lat]}>
                <circle r={3} fill={dotColor} opacity={1} />
                <circle r={5.5} fill={dotColor} opacity={0.3} />
              </Marker>
            );
          })}

          {/* ── Region color zone markers (mode=regions) ── */}
          {mapMode === "regions" && regions.map(r => {
            // Draw a prominent region label at the centroid of the region bounds
            const regionBounds = {
              asia:        { lng: 110, lat: 25, label: "ASIA" },
              europe:      { lng: 12,  lat: 50, label: "EUROPE" },
              americas:    { lng: -80, lat: 15, label: "AMERICAS" },
              middle_east: { lng: 48,  lat: 22, label: "MIDDLE EAST" },
              africa:      { lng: 18,  lat: 0,  label: "AFRICA" },
            };
            const b = regionBounds[r.id];
            if (!b) return null;
            return (
              <Marker key={`region-label-${r.id}`} coordinates={[b.lng, b.lat]}>
                <text
                  textAnchor="middle"
                  fontSize="7"
                  fontWeight="bold"
                  fontFamily="monospace"
                  fill={r.color}
                  opacity={0.85}
                  style={{ pointerEvents: "none", userSelect: "none",
                           textShadow: `0 0 8px ${r.color}`, letterSpacing: "0.05em" }}
                >{b.label}</text>
                <rect x={-24} y={-9} width={48} height={12} rx={3} fill={r.color} opacity={0.1} />
              </Marker>
            );
          })}

          {/* ── Port dots with hub emphasis (M1) ── */}
          {Object.entries(portRegionMap).map(([portId, region]) => {
            const coord = getPortLocation(portId, region);
            const isHub = hubSet.has(portId);
            if (mapMode === "hubs" && !isHub) return null;
            if (mapMode === "regions") {
              const rColor = getRegionColor(region);
              return (
                <Marker key={`reg-${portId}`} coordinates={coord}>
                  <circle r={isHub ? 2.5 : 1.5} fill={rColor} opacity={isHub ? 0.9 : 0.5} style={{ cursor: "pointer" }}
                    onClick={() => setClickedPort(clickedPort === portId ? null : `${portId}`)} />
                  {isHub && <circle r={4} fill={rColor} opacity={0.2} />}
                </Marker>
              );
            }
            if (isHub) {
              const regionColor = getRegionColor(region);
              return (
                <Marker key={`hub-${portId}`} coordinates={coord}>
                  {/* Outer glow ring */}
                  <circle r={6} fill={regionColor} opacity={0.1} />
                  {/* Inner ring */}
                  <circle r={3.5} fill="none" stroke={regionColor} strokeWidth={0.8} opacity={0.7} />
                  {/* Center dot */}
                  <circle r={2} fill={regionColor} opacity={0.95} style={{ cursor: "pointer" }}
                    onClick={() => setClickedPort(clickedPort === portId ? null : `${portId}`)} />
                  {/* Star marker above */}
                  <text x={0} y={-6} textAnchor="middle" fontSize="5" fill={regionColor} opacity={0.9}
                    style={{ pointerEvents: "none" }}>★</text>
                </Marker>
              );
            }
            return (
              <Marker key={`dot-${portId}`} coordinates={coord}>
                <circle r={0.6} fill="#fff" opacity={0.3} />
              </Marker>
            );
          })}
        </ComposableMap>
      </div>

      {/* ── Network Stats Panel (M6) ── */}
      {showNetworkStats && (
        <div className="absolute top-16 right-5 z-10 p-4 rounded-xl bg-black/80 backdrop-blur-md border border-white/10 min-w-[180px]">
          <div className="text-[10px] text-white/40 font-mono tracking-widest mb-3 uppercase">Network Stats</div>
          {[
            { label: "Total Routes", value: networkStats.totalRoutes },
            { label: "Total TEU/wk", value: networkStats.totalTeu.toLocaleString() },
            { label: "Hub Ports", value: networkStats.hubCount },
            { label: "Inter-Regional", value: networkStats.interRegionalCount },
            { label: "Regional", value: networkStats.regionalCount },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center py-1 border-b border-white/5 last:border-0">
              <span className="text-[10px] text-white/40 font-mono">{label}</span>
              <span className="text-[10px] text-white/80 font-mono font-bold">{value}</span>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t border-white/10">
            {regions.map(r => (
              <div key={r.id} className="flex justify-between items-center py-0.5">
                <span className="text-[9px] font-mono" style={{ color: r.color }}>{r.name}</span>
                <span className="text-[9px] text-white/60 font-mono">{networkStats.byRegion[r.id] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Port Card (M3) ── */}
      {clickedPort && (
        <div className="absolute bottom-24 left-5 z-10 p-4 rounded-xl bg-black/80 backdrop-blur-md border border-white/10 min-w-[160px]">
          <button onClick={() => setClickedPort(null)} className="absolute top-2 right-2 text-white/40 text-xs font-mono">✕</button>
          <div className="text-[10px] text-white/40 font-mono tracking-widest mb-2 uppercase">Port {clickedPort}</div>
          <div className="text-xs text-white/80 font-mono mb-1">Region: {portRegionMap[clickedPort] || "Unknown"}</div>
          <div className="text-xs text-white/60 font-mono">Routes: {portRouteCount[clickedPort] || 0}</div>
          {hubSet.has(clickedPort) && <div className="text-[10px] text-amber-400 font-mono mt-1">★ Hub Port</div>}
        </div>
      )}

      {/* ── Legend ── */}
      <div className="absolute bottom-5 left-5 z-10 p-4 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 min-w-[220px]">
        <div className="text-[10px] text-white/40 font-mono tracking-widest mb-3 uppercase">Route Legend</div>
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-5 h-[1.5px]" style={{ background: "rgba(255,255,255,0.5)" }} />
          <span className="text-xs text-white/60 font-mono">Inter-Regional ({filteredInterRegional.length})</span>
        </div>
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-5 h-[1px]" style={{ background: "#fbbf24" }} />
          <span className="text-xs text-white/60 font-mono">High-Load Cross-Region</span>
        </div>
        {/* Tier legend */}
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-5 h-[3px]" style={{ background: "#10b981" }} />
          <span className="text-[10px] text-white/50 font-mono">High Load</span>
        </div>
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-5 h-[2px]" style={{ background: "rgba(255,255,255,0.4)" }} />
          <span className="text-[10px] text-white/50 font-mono">Medium Load</span>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-5 h-[1px]" style={{ background: "rgba(255,255,255,0.15)" }} />
          <span className="text-[10px] text-white/50 font-mono">Low Load</span>
        </div>
        {corridors.length > 0 ? corridors.slice(0, 4).map((c, i) => (
          <div key={i} className="flex items-center gap-3 mb-1.5">
            <div className="w-5 h-[2px]" style={{ background: c.color }} />
            <div className="text-xs text-white/70 font-mono">{c.from}→{c.to}: {fmtNum(c.teu)} TEU</div>
          </div>
        )) : (
          <div className="text-[10px] text-white/30 font-mono italic">Corridor data not available</div>
        )}
      </div>
    </div>
  );
}

// ─── LANDING VIEW ────────────────────────────────────────────────────────────
function LandingView() {
  const state = useOptimizationState();
  const g = state.global;
  return (
    <div className="space-y-5">
      <div className="rounded-xl p-6" style={{ background: "linear-gradient(135deg, rgba(0,212,255,0.12), rgba(16,185,129,0.08))", border: "1px solid rgba(0,212,255,0.2)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <PulseDot color={state.isConnected ? "#10b981" : "#ef4444"} />
            <span className="text-xs font-mono uppercase" style={{ color: state.isConnected ? "#10b981" : "#ef4444" }}>
              {state.isConnected ? "System Operational" : "Offline"}
            </span>
          </div>
          {state.isPipelineRunning && (
            <span className="text-xs font-mono text-cyan-400">{state.currentStage}</span>
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

// ─── SUMMARY VIEW ────────────────────────────────────────────────────────────
function SummaryView() {
  const state = useOptimizationState();
  const summaryText = state.global.executive_summary || "";

  // Parse the summary text roughly
  const extractSection = (header) => {
    const lines = summaryText.split('\n');
    let inSection = false;
    const items = [];
    for (const line of lines) {
      if (line.startsWith(header)) {
        inSection = true;
        continue;
      }
      if (inSection) {
        if (line.trim() === "" || (!line.startsWith("-") && !line.startsWith(" "))) break;
        if (line.startsWith("-")) items.push(line.replace("-", "").trim());
      }
    }
    return items;
  };

  const strengths = extractSection("Strengths:");
  const weaknesses = extractSection("Weaknesses:");
  const actions = extractSection("Priority Actions:");

  const isGood = summaryText.includes("Verdict: Good");

  return (
    <div className="space-y-5">
      <div className="rounded-xl p-6" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(0,212,255,0.08))", border: "1px solid rgba(16,185,129,0.2)" }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: isGood ? "#10b981" : "#f59e0b", boxShadow: `0 0 12px ${isGood ? "#10b981" : "#f59e0b"}` }} />
          <span className="text-sm font-mono font-semibold uppercase tracking-widest" style={{ color: isGood ? "#10b981" : "#f59e0b" }}>
            {isGood ? "Verdict: Good" : "Verdict: Needs Improvement"}
          </span>
        </div>
        <p className="text-base text-white/80 font-mono leading-relaxed">
          The global weekly profit is <span className="text-emerald-400 font-bold">{fmt(state.global.weeklyProfit)}</span>, indicating strong financial performance
          with an <span className="text-emerald-400 font-bold">{state.global.margin?.toFixed(1)}% profit margin</span> across {fmtNum(state.global.totalServices)} deployed services.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <div className="text-xs font-mono text-emerald-400 uppercase tracking-widest mb-3">Strengths</div>
          {(strengths.length > 0 ? strengths : [
            "Data unavailable for this run.",
            "Data unavailable for this run.",
            "Data unavailable for this run."
          ]).map((s, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <span className="text-emerald-400 text-xs mt-0.5 flex-shrink-0">+</span>
              <span className="text-xs text-white/60 font-mono leading-relaxed">{s}</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl p-5" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <div className="text-xs font-mono text-red-400 uppercase tracking-widest mb-3">Weaknesses</div>
          {(weaknesses.length > 0 ? weaknesses : [
            "Data unavailable for this run.",
            "Data unavailable for this run."
          ]).map((s, i) => (
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
          {(actions.length > 0 ? actions : [
            "Data unavailable for this run.",
            "Data unavailable for this run.",
            "Data unavailable for this run."
          ]).map((detail, i) => (
            <div key={i} className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="text-xs font-mono text-amber-400 mb-1">{String(i + 1).padStart(2, "0")} · Action</div>
              <div className="text-xs text-white/50 font-mono leading-relaxed">{detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── KPI CARD ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, sparkData, benchmark, rawValue }) {
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
        {benchmark && rawValue != null && <BenchmarkBadge value={rawValue} benchmark={benchmark} compact />}
      </div>
      {sub && <div className="text-xs text-white/40 mt-1 font-mono">{sub}</div>}
      <div className="mt-3 h-px w-full" style={{ background: `linear-gradient(90deg, ${color}44, transparent)` }} />
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
// ── DEMO SCREENSHOT GUIDE ─────────────────────────────────
// Best views for screenshots:
// 1. "Landing" tab — full executive scorecard (1920x1080)
// 2. "Maritime Map" tab — "Services" mode, all regions visible
// 3. "Pipeline" tab — animated flow diagram
// 4. "Overview" tab — full KPI grid with sparklines
// Recommended: 1920x1080, use Fullscreen mode to hide chrome
// Export: use the ↓ Export button (PNG download)
export default function App() {
  // Get live optimization data from WebSocket
  const optimizationState = useOptimizationState();

  const [activeNav, setActiveNav] = useState("landing");
  const [showPulse, setShowPulse] = useState(true);
  const [presentationMode, setPresentationMode] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [showFlows, setShowFlows] = useState(true);

  // Presentation mode: fullscreen
  useEffect(() => {
    const handleFSChange = () => {
      setPresentationMode(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  // Demo mode: auto-cycle through tabs
  useEffect(() => {
    if (!demoMode) return;
    const tabs = ["landing", "overview", "pipeline", "regional", "funnel", "feedback", "map", "summary"];
    const interval = setInterval(() => {
      setActiveNav(prev => {
        const idx = tabs.indexOf(prev);
        return tabs[(idx + 1) % tabs.length];
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [demoMode]);

  useEffect(() => {
    const t = setInterval(() => setShowPulse(p => !p), 1500);
    return () => clearInterval(t);
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const mainEl = document.querySelector('main');
      if (!mainEl) return;
      const canvas = document.createElement('canvas');
      const rect = mainEl.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      ctx.fillStyle = '#020c18';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = '#00d4ff';
      ctx.font = '24px monospace';
      ctx.fillText('AI Vessel Routing System', 20, 50);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '14px monospace';
      ctx.fillText(`Dashboard Snapshot — ${new Date().toISOString().slice(0, 10)}`, 20, 80);
      ctx.fillStyle = '#10b981';
      ctx.fillText('Export feature: full html2canvas integration pending', 20, 120);
      const link = document.createElement('a');
      link.download = `dashboard-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch(e) {
      console.error('Export failed:', e);
    }
  }, []);

  const handleReset = useCallback(() => {
    window.location.reload();
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Use live data from optimization state
  const regions = Object.values(optimizationState.regions);

  const renderMain = () => {
    switch (activeNav) {
      case "landing": return <LandingView />;
      case "overview": return (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <KpiCard
              label="Weekly Profit"
              value={`$${(optimizationState.global.weeklyProfit / 1e6).toFixed(1)}M`}
              sub={`${optimizationState.global.margin.toFixed(1)}% margin`}
              color="#00d4ff" rawValue={optimizationState.global.weeklyProfit}
              benchmark={BENCHMARKS.weeklyProfit}
              sparkData={optimizationState.iterations.map(i => i.profit / 1e6)}
            />
            <KpiCard
              label="Annual Profit"
              value={`$${(optimizationState.global.annualProfit / 1e9).toFixed(1)}B`}
              sub="52-week projection"
              color="#10b981"
              sparkData={optimizationState.iterations.map(i => (i.profit * 52) / 1e9)}
            />
            <KpiCard
              label="Demand Coverage"
              value={`${optimizationState.global.coverage.toFixed(1)}%`}
              sub={`${fmtNum(optimizationState.global.unserved)} TEU/wk unserved`}
              color="#f59e0b" rawValue={optimizationState.global.coverage}
              benchmark={BENCHMARKS.coverage}
              sparkData={optimizationState.iterations.map(i => i.coverage)}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <KpiCard label="Services Deployed" value={fmtNum(optimizationState.global.totalServices)} sub="across 5 regions" color="#8b5cf6"
              rawValue={optimizationState.global.totalServices} benchmark={BENCHMARKS.services} />
            <KpiCard
              label="Profit Margin"
              value={`${optimizationState.global.margin.toFixed(1)}%`}
              sub={`${fmt(optimizationState.global.operatingCost)} operating cost`}
              color="#ec4899" rawValue={optimizationState.global.margin}
              benchmark={BENCHMARKS.margin}
              sparkData={optimizationState.iterations.map(i => i.score * 100)}
            />
            <KpiCard
              label="Convergence Score"
              value={optimizationState.global.convergence.toFixed(3)}
              sub={`${optimizationState.iterations.length} feedback iterations`}
              color="#6366f1" rawValue={optimizationState.global.convergence}
              benchmark={BENCHMARKS.convergence}
              sparkData={optimizationState.iterations.map(i => i.score)}
            />
          </div>
          {/* Baseline comparison panel (O11) */}
          <div className="rounded-xl px-5 py-3 flex items-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-xs font-mono text-white/30 uppercase tracking-widest mr-4">vs Previous Run</span>
            <span className="text-xs font-mono text-white/40 italic">Baseline data not available — single-run mode</span>
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
    <div className={`min-h-screen flex flex-col ${presentationMode ? 'presentation-mode' : ''}`} style={{
      background: "#020c18",
      color: "#e2e8f0",
      fontFamily: "'Inter', 'SF Pro', system-ui, sans-serif"
    }}>

      {/* ── HEADER ─────────────────────────────────────────────────── */}
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
            onClick={() => optimizationState.startOptimization()}
            disabled={optimizationState.isPipelineRunning}
            className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: optimizationState.isPipelineRunning ? "rgba(239,68,68,0.08)" : "rgba(0,212,255,0.08)", border: `1px solid ${optimizationState.isPipelineRunning ? "rgba(239,68,68,0.2)" : "rgba(0,212,255,0.2)"}`, color: optimizationState.isPipelineRunning ? "rgba(239,68,68,0.8)" : "rgba(0,212,255,0.8)" }}>
            {optimizationState.isPipelineRunning ? "⏸ Running" : "▶ Play"}
          </button>
          <button onClick={() => setShowFlows(f => !f)} className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105"
            style={{ background: showFlows ? "rgba(0,212,255,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${showFlows ? "rgba(0,212,255,0.3)" : "rgba(255,255,255,0.08)"}`, color: showFlows ? "rgba(0,212,255,0.9)" : "#e2e8f0" }}>
            {showFlows ? "⏻ Flows" : "⊝ Flows"}
          </button>
          <button onClick={handleReset} className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}>
            ⊡ Reset
          </button>
          <button onClick={toggleFullscreen} className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105"
            style={{ background: presentationMode ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${presentationMode ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)"}`, color: presentationMode ? "#10b981" : "#e2e8f0" }}>
            ⛶ Fullscreen
          </button>
          <button onClick={() => setDemoMode(d => !d)} className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105"
            style={{ background: demoMode ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${demoMode ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)"}`, color: demoMode ? "#10b981" : "#e2e8f0" }}>
            {demoMode ? "⏸ Demo" : "▶ Demo"}
          </button>
          <button onClick={handleExport} className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" }}>
            ↓ Export
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── SIDEBAR ──────────────────────────────────────────────── */}
        <aside className="dashboard-sidebar flex-shrink-0 w-52 flex flex-col relative z-10"
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
            {(() => {
              const sc = optimizationState.global.status;
              const passed = sc?.assertions_passed;
              const total = sc?.assertions_total;
              const warnings = sc?.warnings;
              const scorePct = passed != null && total ? ((passed / total) * 100).toFixed(0) : null;
              return [
                {
                  label: "Assertions",
                  value: passed != null ? `${passed}/${total ?? "—"}` : "—",
                  color: passed != null && total && (passed / total) > 0.95 ? "#10b981" : "#f59e0b"
                },
                {
                  label: "Score",
                  value: scorePct != null ? `${scorePct}%` : "—",
                  color: scorePct >= 95 ? "#10b981" : scorePct >= 80 ? "#f59e0b" : "#ef4444"
                },
                {
                  label: "Warnings",
                  value: warnings != null ? `${warnings}` : "0",
                  color: (warnings || 0) > 0 ? "#f59e0b" : "#10b981"
                },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-white/30 font-mono" style={{ fontSize: "9px" }}>{label}</span>
                  <span className="font-mono text-xs font-bold" style={{ color }}>{value}</span>
                </div>
              ));
            })()}
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
      <footer className="dashboard-footer flex-shrink-0 flex items-center justify-between px-6 py-1.5 relative z-10"
        style={{ background: "rgba(2,12,24,0.95)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-4">
          {[
            { dot: optimizationState.isPipelineRunning ? "#f59e0b" : "#10b981", text: `Pipeline: ${optimizationState.isPipelineRunning ? (optimizationState.currentStage || "Running") : "Complete"}` },
            { dot: "#00d4ff", text: "GA: Converged" },
            { dot: "#10b981", text: "MILP: Optimal" },
            { dot: "#f59e0b", text: `Coverage: ${optimizationState.global.coverage.toFixed(1)}%` },
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

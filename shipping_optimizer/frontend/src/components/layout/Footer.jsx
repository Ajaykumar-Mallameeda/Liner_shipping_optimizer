export default function Footer({ optimizationState, isPipelineRunning, currentStage }) {
  return (
    <footer className="dashboard-footer flex-shrink-0 flex items-center justify-between px-6 py-1.5 relative z-10"
      style={{ background: "rgba(2,12,24,0.95)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="flex items-center gap-4">
        {[
          { dot: isPipelineRunning ? "#f59e0b" : "#10b981", text: `Pipeline: ${isPipelineRunning ? (currentStage || "Running") : "Complete"}` },
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
  );
}

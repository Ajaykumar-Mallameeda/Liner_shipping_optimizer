import navItems from './navItems.js';

export default function Sidebar({ activeNav, onNavChange, optimizationState }) {
  return (
    <aside className="dashboard-sidebar flex-shrink-0 w-52 flex flex-col relative z-10"
      style={{ background: "rgba(2,12,24,0.9)", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="p-3 border-b border-white/5">
        <div className="text-white/20 font-mono uppercase tracking-widest" style={{ fontSize: "9px", letterSpacing: "0.15em" }}>Navigation</div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {navItems.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => onNavChange(id)}
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

      <div className="p-3 border-t border-white/5 space-y-2">
        {(() => {
          const sc = optimizationState.global.test_scorecard || {};
          const passed = sc.assertions_passed ?? optimizationState.global.status?.assertions_passed;
          const total = sc.assertions_total ?? optimizationState.global.status?.assertions_total;
          const warnings = sc.warnings ?? optimizationState.global.status?.warnings;
          const score = sc.score;
          const scorePct = score != null ? score : (passed != null && total ? ((passed / total) * 100) : null);
          return [
            {
              label: "Assertions",
              value: passed != null ? `${passed}/${total ?? "—"}` : "—",
              color: passed != null && total && (passed / total) > 0.95 ? "#10b981" : "#f59e0b"
            },
            {
              label: "Score",
              value: scorePct != null ? `${Number(scorePct).toFixed(1)}%` : "—",
              color: scorePct !== null && Number(scorePct) >= 95 ? "#10b981" : Number(scorePct) >= 80 ? "#f59e0b" : "#ef4444"
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
  );
}

import { useState, useEffect, useCallback } from "react";
import { useOptimizationState } from '../hooks/useOptimizationState.js';
import { fmt, fmtNum } from '../utils/formatters.js';
import { BENCHMARKS } from '../components/common/BenchmarkBadge.jsx';

// Common UI
import PulseDot from '../components/common/PulseDot.jsx';
import ProgressBar from '../components/common/ProgressBar.jsx';

// Layout
import Header from '../components/layout/Header.jsx';
import Sidebar from '../components/layout/Sidebar.jsx';
import Footer from '../components/layout/Footer.jsx';
import navItems from '../components/layout/navItems.js';

// Overview
import KpiCard from '../components/overview/KpiCard.jsx';
import LandingView from '../components/overview/LandingView.jsx';
import SummaryView from '../components/overview/SummaryView.jsx';
import RuntimeHealth from '../components/overview/RuntimeHealth.jsx';
import BackendCertification from '../components/overview/BackendCertification.jsx';

// Regions
import RegionDetails from '../components/regions/RegionDetails.jsx';
import RegionalIntelligence from '../components/regions/RegionalIntelligence.jsx';

// Optimization
import PipelineView from '../components/optimization/PipelineView.jsx';
import FunnelView from '../components/optimization/FunnelView.jsx';
import FeedbackView from '../components/optimization/FeedbackView.jsx';
import ConflictView from '../components/optimization/ConflictView.jsx';
import FleetPanel from '../components/optimization/FleetPanel.jsx';
import FleetDashboard from '../components/optimization/FleetDashboard.jsx';
import RouteTable from '../components/optimization/RouteTable.jsx';
import PortPanel from '../components/optimization/PortPanel.jsx';
import DecisionTrace from '../components/optimization/DecisionTrace.jsx';
import OptimizationInsights from '../components/optimization/OptimizationInsights.jsx';
import DecisionExplanation from '../components/optimization/DecisionExplanation.jsx';
import ExportPanel from '../components/optimization/ExportPanel.jsx';
import ScenarioWorkspace from '../components/optimization/ScenarioWorkspace.jsx';

// Map
import WorldMap from '../components/map/WorldMap.jsx';

export default function App() {
  const optimizationState = useOptimizationState();

  const [activeNav, setActiveNav] = useState("landing");
  const [showPulse, setShowPulse] = useState(true);
  const [presentationMode, setPresentationMode] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [showFlows, setShowFlows] = useState(true);

  useEffect(() => {
    const handleFSChange = () => {
      setPresentationMode(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  useEffect(() => {
    if (!demoMode) return;
    const tabs = ["landing", "overview", "fleet", "routes", "ports", "pipeline", "regional", "funnel", "feedback", "map", "scenarios", "summary"];
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

  const handleExport = useCallback(() => {
    setActiveNav("export");
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

  const regions = Object.values(optimizationState.regions);

  const renderMain = () => {
    switch (activeNav) {
      case "landing": return <LandingView optimizationState={optimizationState} />;
      case "fleet": return <FleetDashboard optimizationState={optimizationState} />;
      case "routes": return <RouteTable optimizationState={optimizationState} />;
      case "ports": return <PortPanel optimizationState={optimizationState} />;
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
          <div className="rounded-xl px-5 py-3 flex items-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-xs font-mono text-white/30 uppercase tracking-widest mr-4">vs Previous Run</span>
            <span className="text-xs font-mono text-white/40 italic">Baseline data not available — single-run mode</span>
          </div>
          <WorldMap optimizationState={optimizationState} />
        </div>
      );
      case "pipeline": return (
        <div className="flex gap-4 h-full">
          <div className="flex-1 min-w-0"><PipelineView optimizationState={optimizationState} /></div>
          <div className="w-72 flex-shrink-0 space-y-4">
            <DecisionTrace optimizationState={optimizationState} />
            <OptimizationInsights optimizationState={optimizationState} />
          </div>
        </div>
      );
      case "regional": return (
        <div className="flex gap-4 h-full">
          <div className="flex-1 min-w-0"><RegionDetails optimizationState={optimizationState} /></div>
          <div className="w-72 flex-shrink-0"><RegionalIntelligence optimizationState={optimizationState} /></div>
        </div>
      );
      case "funnel": return <FunnelView optimizationState={optimizationState} />;
      case "feedback": return (
        <div className="flex gap-4">
          <div className="flex-1 min-w-0"><FeedbackView optimizationState={optimizationState} /></div>
          <div className="w-72 flex-shrink-0 space-y-4">
            <DecisionExplanation optimizationState={optimizationState} />
            <DecisionTrace optimizationState={optimizationState} />
          </div>
        </div>
      );
      case "conflict": return <ConflictView optimizationState={optimizationState} />;
      case "map": return <WorldMap optimizationState={optimizationState} />;
      case "scenarios": return <ScenarioWorkspace optimizationState={optimizationState} />;
      case "export": return <ExportPanel optimizationState={optimizationState} />;
      case "summary": return (
        <div className="flex gap-4">
          <div className="flex-1 min-w-0"><SummaryView optimizationState={optimizationState} /></div>
          <div className="w-72 flex-shrink-0">
            <BackendCertification optimizationState={optimizationState} />
          </div>
        </div>
      );
      default: return null;
    }
  };

  return (
    <div className={`min-h-screen flex flex-col ${presentationMode ? 'presentation-mode' : ''}`} style={{
      background: "#020c18",
      color: "#e2e8f0",
      fontFamily: "'Inter', 'SF Pro', system-ui, sans-serif"
    }}>
      <Header
        optimizationState={optimizationState}
        startOptimization={optimizationState.startOptimization}
        isPipelineRunning={optimizationState.isPipelineRunning}
        showFlows={showFlows}
        onToggleFlows={() => setShowFlows(f => !f)}
        onReset={handleReset}
        onToggleFullscreen={toggleFullscreen}
        presentationMode={presentationMode}
        onToggleDemo={() => setDemoMode(d => !d)}
        demoMode={demoMode}
        onExport={handleExport}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeNav={activeNav} onNavChange={setActiveNav} optimizationState={optimizationState} />

        <main className="flex-1 overflow-y-auto p-5 relative">
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

      <Footer
        optimizationState={optimizationState}
        isPipelineRunning={optimizationState.isPipelineRunning}
        currentStage={optimizationState.currentStage}
      />
    </div>
  );
}

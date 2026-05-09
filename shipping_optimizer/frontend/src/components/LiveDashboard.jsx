/**
 * Live Dashboard Component - Main dashboard with real-time data
 */

import React, { useState, useEffect } from 'react';
import { useDashboardStore, useFormattedMetrics, useRegionList, useRuntime } from '../store/dashboardStore';
import { usePipelineWebSocket } from '../hooks/useWebSocket';
import { useExportResults } from '../hooks/useApi';

// Import existing UI components
import { Counter } from './ui/Counter';
import { Sparkline } from './ui/Sparkline';
import { PulseDot } from './ui/PulseDot';
import { ProgressBar } from './ui/ProgressBar';
import { KpiCard } from './ui/KpiCard';
import { MapView } from './views/MapView';
import { PipelineView } from './views/PipelineView';
import { RegionalView } from './views/RegionalView';
import { FunnelView } from './views/FunnelView';
import { FeedbackView } from './views/FeedbackView';
import { ConflictView } from './views/ConflictView';
import { SummaryView } from './views/SummaryView';

// Navigation items
const navItems = [
  { id: 'overview', label: 'Overview', icon: '⬡' },
  { id: 'pipeline', label: 'Pipeline', icon: '◈' },
  { id: 'regional', label: 'Regional Agents', icon: '◎' },
  { id: 'funnel', label: 'GA · MILP Analytics', icon: '◆' },
  { id: 'feedback', label: 'Feedback Loop', icon: '↺' },
  { id: 'conflict', label: 'Conflict Resolution', icon: '⧖' },
  { id: 'map', label: 'Maritime Map', icon: '⊕' },
  { id: 'summary', label: 'Executive Summary', icon: '▣' },
];

export default function LiveDashboard() {
  const [activeNav, setActiveNav] = useState('overview');
  const [showPulse, setShowPulse] = useState(true);

  // Store hooks
  const pipelineStatus = useDashboardStore((state) => state.pipelineStatus);
  const error = useDashboardStore((state) => state.error);
  const metrics = useFormattedMetrics();
  const regions = useRegionList();
  const runtime = useRuntime();

  // WebSocket hooks
  const { isConnected, startPipeline, stopPipeline, ping } = usePipelineWebSocket();
  const { exportResults, loading: exporting } = useExportResults();

  // Animation
  useEffect(() => {
    const t = setInterval(() => setShowPulse(p => !p), 1500);
    return () => clearInterval(t);
  }, []);

  // ============================================================================
  // Header Component
  // ============================================================================

  const Header = () => (
    <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 relative z-10"
      style={{ background: 'rgba(2,12,24,0.95)', borderBottom: '1px solid rgba(0,212,255,0.15)', backdropFilter: 'blur(20px)' }}>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold"
              style={{ background: 'linear-gradient(135deg, #00d4ff22, #10b98122)', border: '1px solid #00d4ff44', color: '#00d4ff' }}>
              ⬡
            </div>
          </div>
          <div>
            <div className="text-sm font-bold tracking-widest text-white uppercase" style={{ letterSpacing: '0.12em' }}>
              AI Vessel Routing System
            </div>
            <div className="text-xs text-white/30 uppercase tracking-widest" style={{ fontSize: '9px' }}>
              Multi-Agent Liner Shipping Optimizer
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-2">
          <PulseDot color={isConnected ? '#10b981' : '#ef4444'} />
          <span className="text-xs font-mono uppercase tracking-widest"
            style={{ color: isConnected ? '#10b981' : '#ef4444' }}>
            {isConnected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-5">
        {/* Problem Stats */}
        {metrics && (
          <>
            <div className="text-center">
              <div className="text-xs font-bold text-white/90 font-mono">{metrics.problem_stats?.ports || 0}</div>
              <div className="text-white/30 font-mono" style={{ fontSize: '9px', letterSpacing: '0.08em' }}>Ports</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-bold text-white/90 font-mono">{metrics.problem_stats?.lanes || 0}</div>
              <div className="text-white/30 font-mono" style={{ fontSize: '9px', letterSpacing: '0.08em' }}>Lanes</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-bold text-white/90 font-mono">{metrics.problem_stats?.services || 0}</div>
              <div className="text-white/30 font-mono" style={{ fontSize: '9px', letterSpacing: '0.08em' }}>Services</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-bold text-white/90 font-mono">
                {(metrics.problem_stats?.weekly_demand / 1000).toFixed(0)}K
              </div>
              <div className="text-white/30 font-mono" style={{ fontSize: '9px', letterSpacing: '0.08em' }}>Weekly TEU</div>
            </div>
          </>
        )}

        {/* Runtime and Status */}
        <div className="text-center">
          <div className="text-xs font-bold text-white/90 font-mono">{runtime}s</div>
          <div className="text-white/30 font-mono" style={{ fontSize: '9px', letterSpacing: '0.08em' }}>Runtime</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-bold text-white/90 font-mono" style={{
            color: pipelineStatus === 'running' ? '#f59e0b' :
                   pipelineStatus === 'complete' ? '#10b981' :
                   pipelineStatus === 'error' ? '#ef4444' : '#6b7280'
          }}>
            {pipelineStatus}
          </div>
          <div className="text-white/30 font-mono" style={{ fontSize: '9px', letterSpacing: '0.08em' }}>Status</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => startPipeline()}
          disabled={pipelineStatus === 'running'}
          className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: pipelineStatus === 'running' ? 'rgba(239,68,68,0.08)' : 'rgba(0,212,255,0.08)',
            border: `1px solid ${pipelineStatus === 'running' ? 'rgba(239,68,68,0.2)' : 'rgba(0,212,255,0.2)'}`,
            color: pipelineStatus === 'running' ? 'rgba(239,68,68,0.8)' : 'rgba(0,212,255,0.8)'
          }}>
          {pipelineStatus === 'running' ? '⏸ Pause' : '▶ Play'}
        </button>
        <button
          onClick={stopPipeline}
          disabled={pipelineStatus !== 'running'}
          className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: 'rgba(0,212,255,0.8)' }}>
          ⏹ Stop
        </button>
        <button
          onClick={() => ping()}
          className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105"
          style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: 'rgba(0,212,255,0.8)' }}>
          ↻ Refresh
        </button>
        <button
          onClick={exportResults}
          disabled={exporting || !metrics}
          className="px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: 'rgba(0,212,255,0.8)' }}>
          ↓ Export
        </button>
      </div>
    </header>
  );

  // ============================================================================
  // Main Content Renderer
  // ============================================================================

  const renderMain = () => {
    switch (activeNav) {
      case 'overview':
        if (!metrics) {
          return (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <PulseDot color="#00d4ff" />
                <p className="text-white/60 mt-4 font-mono">Waiting for optimization data...</p>
                <button
                  onClick={startPipeline}
                  className="mt-4 px-4 py-2 rounded text-xs font-mono"
                  style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: 'rgba(0,212,255,0.8)' }}>
                  Start Optimization
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <KpiCard
                label="Weekly Profit"
                value={metrics.weeklyProfitFormatted}
                sub={`${metrics.profitMarginFormatted} margin`}
                color="#00d4ff"
                sparkData={metrics.iterationProfits || []}
              />
              <KpiCard
                label="Annual Profit"
                value={metrics.annualProfitFormatted}
                sub="52-week projection"
                color="#10b981"
              />
              <KpiCard
                label="Demand Coverage"
                value={metrics.coverageFormatted}
                sub={`${metrics.unservedDemandFormatted} unserved`}
                color="#f59e0b"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <KpiCard
                label="Services Deployed"
                value={metrics.total_services.toLocaleString()}
                sub={`across ${regions.length} regions`}
                color="#8b5cf6"
              />
              <KpiCard
                label="Profit Margin"
                value={metrics.profitMarginFormatted}
                sub={`${metrics.operatingCostFormatted} operating cost`}
                color="#ec4899"
              />
              <KpiCard
                label="Efficiency Score"
                value={metrics.convergence_score?.toFixed(3) || '0.000'}
                sub={`${metrics.iterations?.length || 0} iterations`}
                color="#6366f1"
              />
            </div>
            <MapView />
          </div>
        );

      case 'pipeline':
        return <PipelineView />;
      case 'regional':
        return <RegionalView />;
      case 'funnel':
        return <FunnelView />;
      case 'feedback':
        return <FeedbackView />;
      case 'conflict':
        return <ConflictView />;
      case 'map':
        return <MapView />;
      case 'summary':
        return <SummaryView />;
      default:
        return null;
    }
  };

  // ============================================================================
  // Error Display
  // ============================================================================

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#020c18', color: '#e2e8f0' }}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠</span>
          </div>
          <h2 className="text-xl font-bold text-red-400 mb-2">Pipeline Error</h2>
          <p className="text-white/60 font-mono mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded text-xs font-mono"
            style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: 'rgba(0,212,255,0.8)' }}>
            Reload Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Main Render
  // ============================================================================

  return (
    <div className="min-h-screen flex flex-col" style={{
      background: '#020c18',
      color: '#e2e8f0',
      fontFamily: "'Courier New', 'Consolas', monospace"
    }}>
      {/* Scanline overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
        zIndex: 100
      }} />

      {/* Header */}
      <Header />

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="flex-shrink-0 w-52 flex flex-col relative z-10"
          style={{ background: 'rgba(2,12,24,0.9)', borderRight: '1px solid rgba(255,255,255,0.05)' }}>

          <div className="p-3 border-b border-white/5">
            <div className="text-white/20 font-mono uppercase tracking-widest" style={{ fontSize: '9px', letterSpacing: '0.15em' }}>
              Navigation
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {navItems.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setActiveNav(id)}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 group"
                style={{
                  background: activeNav === id ? 'rgba(0,212,255,0.1)' : 'transparent',
                  border: `1px solid ${activeNav === id ? 'rgba(0,212,255,0.25)' : 'transparent'}`,
                  color: activeNav === id ? '#00d4ff' : 'rgba(255,255,255,0.45)',
                }}>
                <span className="text-base leading-none">{icon}</span>
                <span className="text-xs font-mono truncate">{label}</span>
                {activeNav === id && <div className="ml-auto w-1 h-1 rounded-full bg-cyan-400" />}
              </button>
            ))}
          </nav>

          {/* Connection Status */}
          <div className="p-3 border-t border-white/5 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-white/30 font-mono" style={{ fontSize: '9px' }}>Connection</span>
              <span className="font-mono text-xs font-bold" style={{ color: isConnected ? '#10b981' : '#ef4444' }}>
                {isConnected ? 'Connected' : 'Offline'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/30 font-mono" style={{ fontSize: '9px' }}>Pipeline</span>
              <span className="font-mono text-xs font-bold" style={{
                color: pipelineStatus === 'running' ? '#f59e0b' :
                       pipelineStatus === 'complete' ? '#10b981' :
                       pipelineStatus === 'error' ? '#ef4444' : '#6b7280'
              }}>
                {pipelineStatus}
              </span>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-5 relative">
          {/* Section title */}
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(0,212,255,0.3), transparent)' }} />
            <span className="text-xs font-mono text-white/30 uppercase tracking-widest px-2">
              {navItems.find(n => n.id === activeNav)?.label}
            </span>
            <div className="h-px flex-1" style={{ background: 'linear-gradient(270deg, rgba(0,212,255,0.3), transparent)' }} />
          </div>

          {renderMain()}
        </main>
      </div>

      {/* Footer Status Bar */}
      <footer className="flex-shrink-0 flex items-center justify-between px-6 py-1.5 relative z-10"
        style={{ background: 'rgba(2,12,24,0.95)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>

        <div className="flex items-center gap-4">
          {[
            { dot: isConnected ? '#10b981' : '#ef4444', text: `API: ${isConnected ? 'Connected' : 'Offline'}` },
            { dot: pipelineStatus === 'complete' ? '#10b981' : pipelineStatus === 'running' ? '#f59e0b' : '#6b7280', text: `Pipeline: ${pipelineStatus}` },
            { dot: metrics ? '#10b981' : '#6b7280', text: `Optimization: ${metrics ? 'Ready' : 'No Data'}` },
            { dot: metrics ? '#f59e0b' : '#6b7280', text: `Coverage: ${metrics?.coverageFormatted || 'N/A'}` },
          ].map(({ dot, text }) => (
            <div key={text} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dot }} />
              <span className="text-white/30 font-mono" style={{ fontSize: '10px' }}>{text}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-white/20 font-mono" style={{ fontSize: '10px' }}>
            AI Vessel Routing System v2.0 · Real-time Optimization
          </span>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{
              backgroundColor: isConnected && pipelineStatus !== 'error' ? '#10b981' : '#ef4444',
              boxShadow: isConnected && pipelineStatus !== 'error' ? '0 0 6px #10b981' : 'none'
            }} />
            <span className="font-mono" style={{
              fontSize: '10px',
              color: isConnected && pipelineStatus !== 'error' ? '#10b981' : '#ef4444'
            }}>
              {isConnected && pipelineStatus !== 'error' ? 'OPERATIONAL' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
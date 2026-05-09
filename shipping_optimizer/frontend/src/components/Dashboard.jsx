/**
 * Dashboard Component with WebSocket Integration
 * This component wraps the maritime dashboard with real-time data
 */

import React from 'react';
import { useOptimizationState } from '../hooks/useOptimizationState';
import MaritimeDashboard from '../../maritime_dashboard.jsx';

export default function Dashboard() {
  const optimizationState = useOptimizationState();

  // The maritime dashboard will use the optimization state through its own hook
  return <MaritimeDashboard />;
}
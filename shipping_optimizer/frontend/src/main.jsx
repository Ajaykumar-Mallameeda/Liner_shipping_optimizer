import React from 'react';
import ReactDOM from 'react-dom/client';
import LiveDashboard from './components/live/LiveDashboard';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LiveDashboard />
  </React.StrictMode>
);
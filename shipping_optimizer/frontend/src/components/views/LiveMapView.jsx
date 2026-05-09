/**
 * Live Maritime Map View - Real-time vessel route visualization
 */

import React, { useState, useEffect } from 'react';
import { useCorridors, useActiveRoutes, useRegions } from '../../store/dashboardStore';
import { PulseDot } from '../ui/PulseDot';

export function LiveMapView() {
  const [tick, setTick] = useState(0);
  const corridors = useCorridors();
  const activeRoutes = useActiveRoutes();
  const regions = useRegions();

  // Animation tick
  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 50);
    return () => clearInterval(t);
  }, []);

  // Port coordinates (simplified world map)
  const portCoords = {
    285: [120, 180], 146: [250, 185], 235: [115, 190], 36: [450, 160],
    221: [420, 165], 100: [440, 170], 112: [480, 230], 176: [490, 195],
    220: [530, 185], 41: [270, 195], 69: [460, 240], 75: [430, 155],
    13: [425, 158], 86: [435, 162], 129: [110, 195], 108: [535, 190],
    229: [525, 185], 225: [520, 188], 190: [515, 182], 113: [475, 235],
    114: [470, 238], 204: [480, 242], 48: [260, 180], 102: [255, 190],
    282: [245, 175],
  };

  // Get region color
  const getRegionColor = (regionId: string) => {
    const region = regions[regionId];
    return region?.color || '#6b7280';
  };

  // Extract port numbers from corridor names
  const extractPortId = (portStr: string) => {
    const match = portStr.match(/Port (\d+)/);
    return match ? parseInt(match[1]) : 0;
  };

  // Render corridors
  const renderCorridors = () => {
    const allCorridors = activeRoutes.length > 0 ? activeRoutes : corridors;

    return allCorridors.map((c, i) => {
      const fromId = extractPortId(c.from_port);
      const toId = extractPortId(c.to_port);
      const [x1, y1] = portCoords[fromId] || [0, 0];
      const [x2, y2] = portCoords[toId] || [0, 0];
      const w = Math.max(0.5, (c.teu / 15000) * 3);
      const t = ((tick * 0.8 + i * 30) % 100) / 100;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      const cx1 = x1 + (x2 - x1) * 0.33;
      const cy1 = Math.min(y1, y2) - 30;
      const color = getRegionColor(c.region);
      const isActive = activeRoutes.some(r => r.from_port === c.from_port && r.to_port === c.to_port);

      return (
        <g key={i}>
          <path
            d={`M ${x1} ${y1} Q ${cx1} ${cy1} ${x2} ${y2}`}
            fill="none"
            stroke={color}
            strokeWidth={w}
            opacity={isActive ? 0.6 : 0.3}
          />
          <path
            d={`M ${x1} ${y1} Q ${cx1} ${cy1} ${x2} ${y2}`}
            fill="none"
            stroke={color}
            strokeWidth={w + 1}
            opacity={isActive ? 0.2 : 0.1}
            filter="url(#glow)"
          />
          <circle
            cx={px}
            cy={py}
            r={isActive ? 3 : 2.5}
            fill={color}
            opacity="0.9"
            filter="url(#glow)"
          >
            <animate
              attributeName="r"
              values="2;3.5;2"
              dur="1s"
              repeatCount="indefinite"
            />
          </circle>
        </g>
      );
    });
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="px-5 py-3 border-b border-white/5 flex items-center gap-3">
        <PulseDot color="#00d4ff" />
        <span className="text-xs font-mono text-white/60 uppercase tracking-widest">
          Global Maritime Route Map
        </span>
        <div className="ml-auto flex gap-3">
          {Object.entries(regions).map(([id, region]) => (
            <div key={id} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: region.color }} />
              <span className="text-xs font-mono text-white/40">{region.name}</span>
            </div>
          ))}
        </div>
      </div>

      <svg viewBox="0 0 700 380" className="w-full" style={{ background: 'linear-gradient(180deg, #030d1a 0%, #060f1e 100%)' }}>
        {/* Ocean texture */}
        <defs>
          <radialGradient id="oceanGrad" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#0a1628" />
            <stop offset="100%" stopColor="#030d1a" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="700" height="380" fill="url(#oceanGrad)" />

        {/* Simplified continent shapes */}
        <path d="M 60,80 L 180,70 L 200,120 L 180,180 L 140,200 L 100,190 L 70,160 Z" fill="#0f1f35" stroke="#1a3050" strokeWidth="0.5" />
        <path d="M 140,210 L 180,200 L 185,290 L 165,330 L 140,320 L 130,280 Z" fill="#0f1f35" stroke="#1a3050" strokeWidth="0.5" />
        <path d="M 360,70 L 480,65 L 490,110 L 450,130 L 400,120 L 370,100 Z" fill="#0f1f35" stroke="#1a3050" strokeWidth="0.5" />
        <path d="M 400,140 L 500,135 L 510,260 L 475,310 L 440,300 L 410,260 L 395,200 Z" fill="#0f1f35" stroke="#1a3050" strokeWidth="0.5" />
        <path d="M 490,55 L 660,60 L 670,180 L 610,200 L 540,170 L 500,130 L 490,90 Z" fill="#0f1f35" stroke="#1a3050" strokeWidth="0.5" />
        <path d="M 580,250 L 650,245 L 655,300 L 625,315 L 590,305 L 575,280 Z" fill="#0f1f35" stroke="#1a3050" strokeWidth="0.5" />

        {/* Grid lines */}
        {[100, 200, 300].map(y => (
          <line key={y} x1={0} y1={y} x2={700} y2={y} stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
        ))}
        {[175, 350, 525].map(x => (
          <line key={x} x1={x} y1={0} x2={x} y2={380} stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
        ))}

        {/* Animated shipping routes */}
        {renderCorridors()}

        {/* Port dots */}
        {Object.entries(portCoords).slice(0, 20).map(([id, [x, y]]) => (
          <circle key={id} cx={x} cy={y} r="2" fill="#ffffff" opacity="0.4" />
        ))}

        {/* Corridor labels */}
        {corridors.slice(0, 2).map((c, i) => {
          const fromId = extractPortId(c.from_port);
          const [x, y] = portCoords[fromId] || [0, 0];
          const color = getRegionColor(c.region);

          return (
            <text key={i} x={x - 20} y={y - 10} fontSize="8" fill={color} opacity="0.8" fontFamily="monospace">
              {c.from_port} ▶ {c.teu.toLocaleString()} TEU
            </text>
          );
        })}

        {/* Legend */}
        <rect x={10} y={320} width="160" height="55" rx="4" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
        <text x={18} y={334} fontSize="7" fill="rgba(255,255,255,0.4)" fontFamily="monospace" letterSpacing="2">
          ACTIVE CORRIDORS
        </text>
        {corridors.slice(0, 4).map((c, i) => {
          const color = getRegionColor(c.region);
          return (
            <g key={i}>
              <line x1={18} y1={343 + i * 9} x2={30} y2={343 + i * 9} stroke={color} strokeWidth="2" />
              <text x={34} y={346 + i * 9} fontSize="6.5" fill="rgba(255,255,255,0.5)" fontFamily="monospace">
                {c.from_port}→{c.to_port}: {c.teu.toLocaleString()} TEU
              </text>
            </g>
          );
        })}

        {/* Active routes indicator */}
        {activeRoutes.length > 0 && (
          <g>
            <rect x={580} y={10} width="110" height="30" rx="4" fill="rgba(16,185,129,0.1)" stroke="rgba(16,185,129,0.3)" strokeWidth="0.5" />
            <text x={590} y={20} fontSize="7" fill="#10b981" fontFamily="monospace" letterSpacing="1">
              NEW ROUTES
            </text>
            <text x={590} y={30} fontSize="8" fill="#10b981" fontFamily="monospace">
              {activeRoutes.length} active
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
import { useState, useEffect, useCallback, useMemo } from "react";
import { ComposableMap, Geographies, Geography, Line, Marker } from "react-simple-maps";
import portCoords from '../../assets/port_coordinates.json';
import PulseDot from '../common/PulseDot.jsx';
import { fmtNum } from '../../utils/formatters.js';

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

function getRegionColor(regionId) {
  const colors = {
    asia: "#00d4ff",
    europe: "#7c3aed",
    americas: "#10b981",
    middle_east: "#f59e0b",
    africa: "#ef4444"
  };
  return colors[regionId?.toLowerCase()] || "#10b981";
}

export default function WorldMap({ optimizationState }) {
  const [tick, setTick] = useState(0);
  const regions = Object.values(optimizationState.regions);

  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 50);
    return () => clearInterval(t);
  }, []);

  const services = optimizationState.global.selected_services || [];

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
      map[port] = Object.entries(regionCounts).sort((a, b) => b[1] - a[1])[0][0];
    });
    return map;
  }, [services]);

  const getPortLocation = useCallback((portId, fallbackRegion) => {
    if (portId && portCoords[portId]) {
      const coord = portCoords[portId];
      return [coord[1], coord[0]];
    }
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
    return [b.minLng + rnd1 * (b.maxLng - b.minLng), b.minLat + rnd2 * (b.maxLat - b.minLat)];
  }, [portRegionMap]);

  const { regionalServices, interRegionalServices } = useMemo(() => {
    const regional = [], interReg = [];
    services.forEach(svc => {
      if (!svc.ports || svc.ports.length < 2) return;
      const svcRegion = svc.region?.toLowerCase() || 'asia';
      const portRegions = new Set(svc.ports.map(p => portRegionMap[p] || svcRegion));
      if (portRegions.size > 1) { interReg.push({ ...svc, portRegions: [...portRegions] }); }
      else { regional.push(svc); }
    });
    return { regionalServices: regional, interRegionalServices: interReg };
  }, [services, portRegionMap]);

  const corridors = optimizationState.corridors.length > 0
    ? optimizationState.corridors.map(c => ({
        ...c,
        from: typeof c.from === 'string' ? c.from.replace('Port ', '') : c.from,
        to: typeof c.to === 'string' ? c.to.replace('Port ', '') : c.to,
        color: getRegionColor(c.region || 'americas')
      }))
    : (() => {
        const svcs = optimizationState.global.selected_services || [];
        if (svcs.length === 0) return [];
        const corrCounts = {};
        svcs.forEach(s => {
          if (!s.ports || s.ports.length < 2) return;
          const from = s.ports[0];
          const to = s.ports[s.ports.length - 1];
          if (from && to) {
            const key = `${from}→${to}`;
            corrCounts[key] = (corrCounts[key] || 0) + (s.load || 1);
          }
        });
        return Object.entries(corrCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, teu]) => {
          const [from, to] = key.split('→');
          return { from, to, teu: Math.round(teu), color: "#10b981" };
        });
      })();

  const [mapMode, setMapMode] = useState("services");
  const [visibleRegions, setVisibleRegions] = useState(new Set(["asia","europe","americas","middle_east","africa"]));
  const [showNetworkStats, setShowNetworkStats] = useState(false);
  const [minLoad, setMinLoad] = useState(0);
  const [clickedPort, setClickedPort] = useState(null);

  const hubSet = useMemo(() => new Set(regions.flatMap(r => r.hubs || [])), [regions]);

  const filteredRegional = useMemo(() =>
    regionalServices.filter(s => visibleRegions.has(s.region?.toLowerCase()) && s.load >= minLoad),
  [regionalServices, visibleRegions, minLoad]);

  const filteredInterRegional = useMemo(() =>
    interRegionalServices.filter(s => {
      const regions_on_route = s.portRegions || [s.region?.toLowerCase()];
      return regions_on_route.some(r => visibleRegions.has(r)) && s.load >= minLoad;
    }),
  [interRegionalServices, visibleRegions, minLoad]);

  const routeTiers = useMemo(() => {
    const allLoads = [...regionalServices, ...interRegionalServices].map(s => s.load).sort((a,b) => a-b);
    if (allLoads.length < 3) return { high: Infinity, medium: Infinity };
    const p33 = allLoads[Math.floor(allLoads.length * 0.33)];
    const p66 = allLoads[Math.floor(allLoads.length * 0.66)];
    return { high: p66, medium: p33 };
  }, [regionalServices, interRegionalServices]);

  const networkStats = useMemo(() => ({
    totalRoutes: filteredRegional.length + filteredInterRegional.length,
    totalTeu: [...filteredRegional, ...filteredInterRegional].reduce((s, svc) => s + (svc.load || 0), 0),
    byRegion: regions.reduce((acc, r) => { acc[r.id] = filteredRegional.filter(s => s.region?.toLowerCase() === r.id).length; return acc; }, {}),
    hubCount: hubSet.size,
    interRegionalCount: filteredInterRegional.length,
    regionalCount: filteredRegional.length,
  }), [filteredRegional, filteredInterRegional, regions, hubSet]);

  const portRouteCount = useMemo(() => {
    const counts = {};
    [...filteredRegional, ...filteredInterRegional].forEach(svc => {
      (svc.ports || []).forEach(p => { counts[p] = (counts[p] || 0) + 1; });
    });
    return counts;
  }, [filteredRegional, filteredInterRegional]);

  return (
    <div className="rounded-xl overflow-hidden relative" style={{ background: "#030d1a", border: "1px solid rgba(255,255,255,0.07)", height: "480px" }}>
      <div className="absolute top-0 left-0 right-0 z-10 px-5 py-2 border-b border-white/5 bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-3 mb-1.5">
          <PulseDot color="#00d4ff" />
          <span className="text-xs font-mono text-white/60 uppercase tracking-widest">Global Maritime Route Map</span>
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
            <button onClick={() => setShowNetworkStats(s => !s)}
              className="text-[10px] px-2 py-0.5 rounded font-mono"
              style={{ background: showNetworkStats ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)",
                       border: `1px solid ${showNetworkStats ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.15)"}`,
                       color: showNetworkStats ? "#10b981" : "rgba(255,255,255,0.5)" }}>
              Σ Stats
            </button>
          </div>
        </div>
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
                <Geography key={geo.rsmKey} geography={geo} fill="#0f1f35" stroke="#1a3050" strokeWidth={0.5}
                  style={{ default: { outline: "none" }, hover: { fill: "#132742", outline: "none" }, pressed: { outline: "none" } }} />
              ))
            }
          </Geographies>

          {(mapMode === "services" || mapMode === "routes") && filteredRegional.map((svc, idx) => {
            const color = getRegionColor(svc.region);
            const coords = svc.ports.map(p => getPortLocation(p, svc.region));
            const tier = svc.load >= routeTiers.high ? "high" : svc.load >= routeTiers.medium ? "medium" : "low";
            const tierWidths = { high: 1.4, medium: 0.9, low: 0.5 };
            const tierOpacities = { high: 0.55, medium: 0.35, low: 0.2 };
            return (<Line key={`reg-${svc.id}-${idx}`} coordinates={coords} stroke={color} strokeWidth={tierWidths[tier]} strokeOpacity={tierOpacities[tier]} strokeLinecap="round" />);
          })}

          {(mapMode === "services" || mapMode === "routes") && filteredInterRegional.map((svc, idx) => {
            const coords = svc.ports.map(p => getPortLocation(p, svc.region));
            const tier = svc.load >= routeTiers.high ? "high" : svc.load >= routeTiers.medium ? "medium" : "low";
            const tierWidths = { high: 2.0, medium: 1.2, low: 0.7 };
            const tierOpacities = { high: 0.8, medium: 0.55, low: 0.3 };
            const color = svc.load > 8000 ? "#fbbf24" : "rgba(255,255,255,0.7)";
            return (<Line key={`inter-${svc.id}-${idx}`} coordinates={coords} stroke={color} strokeWidth={tierWidths[tier]} strokeOpacity={tierOpacities[tier]} strokeLinecap="round" />);
          })}

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
            return (<Marker key={`rdot-${svc.id}-${idx}`} coordinates={[lng, lat]}><circle r={2.5} fill={color} opacity={0.9} /><circle r={4} fill={color} opacity={0.25} /></Marker>);
          })}

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
            return (<Marker key={`idot-${svc.id}-${idx}`} coordinates={[lng, lat]}><circle r={3} fill={dotColor} opacity={1} /><circle r={5.5} fill={dotColor} opacity={0.3} /></Marker>);
          })}

          {mapMode === "regions" && regions.map(r => {
            const regionBounds = {
              asia:        { lng: 110, lat: 25, label: "ASIA" },
              europe:      { lng: 12,  lat: 50, label: "EUROPE" },
              americas:    { lng: -80, lat: 15, label: "AMERICAS" },
              middle_east: { lng: 48,  lat: 22, label: "MIDDLE EAST" },
              africa:      { lng: 18,  lat: 0,  label: "AFRICA" },
            };
            const b = regionBounds[r.id];
            if (!b) return null;
            return (<Marker key={`region-label-${r.id}`} coordinates={[b.lng, b.lat]}>
              <text textAnchor="middle" fontSize="7" fontWeight="bold" fontFamily="monospace" fill={r.color} opacity={0.85} style={{ pointerEvents: "none", userSelect: "none", textShadow: `0 0 8px ${r.color}`, letterSpacing: "0.05em" }}>{b.label}</text>
              <rect x={-24} y={-9} width={48} height={12} rx={3} fill={r.color} opacity={0.1} />
            </Marker>);
          })}

          {Object.entries(portRegionMap).map(([portId, region]) => {
            const coord = getPortLocation(portId, region);
            const isHub = hubSet.has(portId);
            if (mapMode === "hubs" && !isHub) return null;
            if (mapMode === "regions") {
              const rColor = getRegionColor(region);
              return (<Marker key={`reg-${portId}`} coordinates={coord}>
                <circle r={isHub ? 2.5 : 1.5} fill={rColor} opacity={isHub ? 0.9 : 0.5} style={{ cursor: "pointer" }} onClick={() => setClickedPort(clickedPort === portId ? null : `${portId}`)} />
                {isHub && <circle r={4} fill={rColor} opacity={0.2} />}
              </Marker>);
            }
            if (isHub) {
              const regionColor = getRegionColor(region);
              return (<Marker key={`hub-${portId}`} coordinates={coord}>
                <circle r={6} fill={regionColor} opacity={0.1} />
                <circle r={3.5} fill="none" stroke={regionColor} strokeWidth={0.8} opacity={0.7} />
                <circle r={2} fill={regionColor} opacity={0.95} style={{ cursor: "pointer" }} onClick={() => setClickedPort(clickedPort === portId ? null : `${portId}`)} />
                <text x={0} y={-6} textAnchor="middle" fontSize="5" fill={regionColor} opacity={0.9} style={{ pointerEvents: "none" }}>★</text>
              </Marker>);
            }
            return (<Marker key={`dot-${portId}`} coordinates={coord}><circle r={0.6} fill="#fff" opacity={0.3} /></Marker>);
          })}
        </ComposableMap>
      </div>

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

      {clickedPort && (
        <div className="absolute bottom-24 left-5 z-10 p-4 rounded-xl bg-black/80 backdrop-blur-md border border-white/10 min-w-[160px]">
          <button onClick={() => setClickedPort(null)} className="absolute top-2 right-2 text-white/40 text-xs font-mono">✕</button>
          <div className="text-[10px] text-white/40 font-mono tracking-widest mb-2 uppercase">Port {clickedPort}</div>
          <div className="text-xs text-white/80 font-mono mb-1">Region: {portRegionMap[clickedPort] || "Unknown"}</div>
          <div className="text-xs text-white/60 font-mono">Routes: {portRouteCount[clickedPort] || 0}</div>
          {hubSet.has(clickedPort) && <div className="text-[10px] text-amber-400 font-mono mt-1">★ Hub Port</div>}
        </div>
      )}

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

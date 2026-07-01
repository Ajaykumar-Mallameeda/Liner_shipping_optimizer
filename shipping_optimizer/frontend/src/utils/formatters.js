export const fmt = (n) => {
  if (n == null) return '—';
  return n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toLocaleString()}`;
};

export const fmtNum = (n) => (n != null ? n.toLocaleString() : '—');

export const parseStrategyCode = (raw) => {
  if (!raw) return '—';
  const m = raw.match(/Strategy[:\s]+([A-Z])/i);
  return m ? `Strategy ${m[1]}` : raw.split('\n')[0].slice(0, 20);
};

export const parseStrategyReasons = (raw) => {
  if (!raw) return [];
  return raw
    .split('\n')
    .filter((l) => l.trim().startsWith('Reason'))
    .map((l) => l.replace(/^Reason\s*\d+:\s*/i, '').trim());
};

export const hexToRgba = (hex, alpha) => {
  if (!hex || hex[0] !== '#') return `rgba(0, 212, 255, ${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

import { useState } from 'react';

const RISK = {
  high:   { bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.15)', accent: '#ef4444', badge: 'rgba(239,68,68,0.12)', badgeText: '#f87171' },
  medium: { bg: 'rgba(234,179,8,0.05)',  border: 'rgba(234,179,8,0.12)',  accent: '#eab308', badge: 'rgba(234,179,8,0.1)',  badgeText: '#fbbf24' },
  low:    { bg: 'rgba(34,197,94,0.05)',  border: 'rgba(34,197,94,0.12)',  accent: '#22c55e', badge: 'rgba(34,197,94,0.1)',  badgeText: '#4ade80' },
};

function scoreMeta(s) {
  if (s == null) return null;
  if (s >= 60) return { label: `${s}% risk`, color: '#f87171', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' };
  if (s >= 25) return { label: `${s}% risk`, color: '#fbbf24', bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.2)' };
  return { label: `${s}% risk`, color: '#4ade80', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)' };
}

export default function RiskCard({ result, score }) {
  const [open, setOpen] = useState(new Set());
  if (!Array.isArray(result) || !result.length) return null;
  const sm = scoreMeta(score);
  const toggle = i => setOpen(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const sorted = [...result].sort((a, b) => {
    const o = { high: 0, medium: 1, low: 2 };
    return (o[(a.risktype || '').toLowerCase()] ?? 2) - (o[(b.risktype || '').toLowerCase()] ?? 2);
  });

  return (
    <div>
      {/* Score badge */}
      {sm && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.02em', color: sm.color, background: sm.bg, border: `1px solid ${sm.border}`, marginBottom: 12 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: sm.color }} />
          {sm.label}
        </div>
      )}

      {/* Clauses */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.map((c, i) => {
          const risk = (c.risktype || 'low').toLowerCase();
          const r = RISK[risk] || RISK.low;
          const isOpen = open.has(i);
          return (
            <div
              key={i}
              onClick={() => c.riskReason && toggle(i)}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${r.border}`,
                borderLeft: `3px solid ${r.accent}`,
                background: r.bg,
                cursor: c.riskReason ? 'pointer' : 'default',
                transition: 'background 150ms',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 4, color: r.badgeText, background: r.badge }}>
                  {risk}
                </span>
                {c.riskReason && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-tertiary)', transform: isOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 150ms' }}><polyline points="9 18 15 12 9 6"/></svg>
                )}
              </div>
              <div style={{ fontSize: '0.82rem', lineHeight: 1.55, color: 'var(--text)' }}>{c.lineSummary}</div>
              {c.riskReason && isOpen && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5, paddingTop: 6, borderTop: `1px solid ${r.border}` }}>
                  {c.riskReason}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

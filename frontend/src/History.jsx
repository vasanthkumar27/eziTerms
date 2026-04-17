import { useEffect, useState, useCallback } from 'react';
import { apiGet } from './api';

function timeAgo(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function scoreColor(score) {
  if (score == null) return '#888';
  if (score >= 70) return '#ef4444';
  if (score >= 40) return '#f59e0b';
  if (score >= 20) return '#eab308';
  return '#22c55e';
}

function sourceLabel(source) {
  switch (source) {
    case 'paste': return 'Text';
    case 'url': return 'URL';
    case 'upload': return 'File';
    default: return source || '—';
  }
}

export default function History({ onReopen }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const data = await apiGet('/api/history');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e?.data?.detail || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const parseSummary = (raw) => {
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  };

  const handleReopen = (row) => {
    const items = parseSummary(row.summary);
    if (onReopen) onReopen({
      result: items,
      risk_score: row.risk_score,
      url: row.document_url,
      title: row.document_name || row.document_url || `Scan ${row.id}`,
    });
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px 80px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <header style={headerStyle}>
          <div style={eyebrow}>History</div>
          <h2 style={title}>Your scan sessions</h2>
          <p style={subtitle}>
            Everything you've scanned on Distil, most recent first. Click any scan to peek at the
            risks again; they're stored so you can pick up where you left off.
          </p>
        </header>

        {err && <div style={errorBox}>{err}</div>}
        {loading && <div style={{ color: 'var(--text-secondary)', padding: '32px 0', textAlign: 'center' }}>Loading…</div>}

        {!loading && rows.length === 0 && (
          <div className="glass-subtle" style={emptyCard}>
            <div style={{ fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>No scans yet.</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Paste a T&amp;C, drop a file, or enter a URL — every scan gets saved here.
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 10 }} data-testid="history-items">
          {rows.map(r => {
            const items = parseSummary(r.summary);
            const expanded = expandedId === r.id;
            return (
              <div key={r.id} className="glass lift" style={itemCard} data-testid={`history-row-${r.id}`}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{
                    ...scoreBubble,
                    color: scoreColor(r.risk_score),
                    borderColor: scoreColor(r.risk_score) + '55',
                    background: scoreColor(r.risk_score) + '18',
                  }}>
                    {r.risk_score != null ? Math.round(r.risk_score) : '—'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={sourcePill}>{sourceLabel(r.source)}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{timeAgo(r.created_at)}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>· {items.length} findings</span>
                    </div>
                    <div style={rowTitle}>
                      {r.document_name || (r.document_url
                        ? (() => { try { return new URL(r.document_url).hostname + new URL(r.document_url).pathname; } catch { return r.document_url; } })()
                        : 'Pasted text')}
                    </div>
                    {r.document_url && (
                      <a href={r.document_url} target="_blank" rel="noopener noreferrer" style={rowUrl}>
                        {r.document_url.slice(0, 90)}{r.document_url.length > 90 ? '…' : ''}
                      </a>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      className="glass-btn"
                      onClick={() => setExpandedId(expanded ? null : r.id)}
                      style={rowBtn}
                      data-testid={`expand-btn-${r.id}`}
                    >
                      {expanded ? 'Hide' : 'Preview'}
                    </button>
                    <button
                      className="glass-btn"
                      onClick={() => handleReopen(r)}
                      style={rowBtn}
                      data-testid={`reopen-btn-${r.id}`}
                    >
                      Reopen
                    </button>
                  </div>
                </div>
                {expanded && items.length > 0 && (
                  <div style={{ marginTop: 12, display: 'grid', gap: 6, paddingTop: 12, borderTop: '1px solid var(--glass-border)' }}>
                    {items.slice(0, 6).map((it, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--text)' }}>
                        <span style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 999,
                          fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                          color: it.risktype === 'high' ? '#ef4444' : it.risktype === 'medium' ? '#f59e0b' : '#22c55e',
                          background: (it.risktype === 'high' ? '#ef4444' : it.risktype === 'medium' ? '#f59e0b' : '#22c55e') + '22',
                          flexShrink: 0, marginTop: 2,
                        }}>{it.risktype}</span>
                        <span style={{ lineHeight: 1.5 }}>{it.lineSummary}</span>
                      </div>
                    ))}
                    {items.length > 6 && (
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        +{items.length - 6} more — use Reopen for the full view
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const headerStyle = { marginBottom: 18 };
const eyebrow = { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 };
const title = { fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 6, letterSpacing: '-0.02em' };
const subtitle = { fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: 540 };

const errorBox = { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: 10, color: '#fca5a5', fontSize: 13, marginBottom: 12 };

const itemCard = { padding: 12, borderRadius: 14 };
const scoreBubble = { width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, border: '1px solid', flexShrink: 0 };
const sourcePill = { fontSize: 10.5, padding: '2px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)', letterSpacing: '0.05em', fontWeight: 600, textTransform: 'uppercase' };
const rowTitle = { fontSize: 14.5, fontWeight: 600, color: '#fff', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const rowUrl = { display: 'block', fontSize: 12, color: 'var(--blue)', marginTop: 2, textDecoration: 'none' };
const rowBtn = { fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' };

const emptyCard = { padding: 24, borderRadius: 14, textAlign: 'center' };

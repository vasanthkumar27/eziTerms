import { useEffect, useState, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from './api';

function statusColor(status) {
  switch (status) {
    case 'changed': return '#f59e0b';
    case 'unchanged': return '#22c55e';
    case 'fetch_error': return '#ef4444';
    case 'accepted': return '#3291ff';
    default: return '#888';
  }
}

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
  return `${days}d ago`;
}

export default function Watchlist() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [working, setWorking] = useState(false);
  const [checkingId, setCheckingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await apiGet('/api/accepted-terms');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e?.data?.detail || 'Failed to load watchlist');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addUrl.trim() || working) return;
    setWorking(true);
    setErr('');
    try {
      await apiPost('/api/accepted-terms', { url: addUrl.trim(), title: addTitle.trim() });
      setAddUrl(''); setAddTitle('');
      await load();
    } catch (e) {
      setErr(e?.data?.detail || 'Could not save. Is the URL reachable?');
    } finally {
      setWorking(false);
    }
  };

  const handleCheck = async (id) => {
    setCheckingId(id);
    setErr('');
    try {
      await apiPost(`/api/accepted-terms/${id}/check`, {});
      await load();
    } catch (e) {
      setErr(e?.data?.detail || 'Check failed');
    } finally {
      setCheckingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this from your watchlist?')) return;
    try {
      await apiDelete(`/api/accepted-terms/${id}`);
      await load();
    } catch (e) {
      setErr(e?.data?.detail || 'Could not remove');
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px 80px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <header style={headerStyle}>
          <div>
            <div style={eyebrow}>Watchlist</div>
            <h2 style={title}>T&amp;Cs you've accepted</h2>
            <p style={subtitle}>
              We re-check these every few hours. If the terms change, we'll email you a diff so you
              know what you actually agreed to.
            </p>
          </div>
        </header>

        <form onSubmit={handleAdd} className="glass" style={addCard} data-testid="add-accepted-form">
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr auto', gap: 10 }}>
            <input
              type="url"
              placeholder="https://example.com/terms"
              value={addUrl}
              onChange={e => setAddUrl(e.target.value)}
              style={inputStyle}
              required
              data-testid="add-url-input"
            />
            <input
              type="text"
              placeholder="Label (optional, e.g. Acme)"
              value={addTitle}
              onChange={e => setAddTitle(e.target.value)}
              style={inputStyle}
              data-testid="add-title-input"
            />
            <button
              type="submit"
              disabled={working || !addUrl.trim()}
              style={addBtn}
              data-testid="add-submit"
            >
              {working ? 'Saving…' : 'Save'}
            </button>
          </div>
          <div style={hintRow}>
            We'll fetch the page now to store a baseline, then check for changes on a schedule.
          </div>
        </form>

        {err && <div style={errorBox}>{err}</div>}

        {loading && <div style={{ color: 'var(--text-secondary)', padding: '32px 0', textAlign: 'center' }}>Loading…</div>}

        {!loading && rows.length === 0 && (
          <div className="glass-subtle" style={emptyCard}>
            <div style={{ fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>
              Nothing on your watchlist yet.
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Add a T&amp;C URL above, or accept terms through the EziTerms Chrome extension — it'll
              save them here automatically.
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }} data-testid="watchlist-items">
          {rows.map(r => (
            <div key={r.id} className="glass lift" style={itemCard} data-testid={`watch-row-${r.id}`}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ ...dotStyle, background: statusColor(r.last_status) }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <div style={rowTitle}>{r.title || new URL(r.url).hostname}</div>
                    {typeof r.risk_score === 'number' && (
                      <span style={{ ...chip, background: 'rgba(245,158,11,0.15)', color: '#fbbf24', borderColor: 'rgba(245,158,11,0.3)' }}>
                        {r.risk_score.toFixed(0)}/100 risk
                      </span>
                    )}
                    <span style={{ ...chip, textTransform: 'capitalize' }}>
                      {r.last_status?.replace('_', ' ')}
                    </span>
                  </div>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" style={rowUrl}>
                    {r.url}
                  </a>
                  <div style={rowMeta}>
                    <span>Saved {timeAgo(r.accepted_at)}</span>
                    <span>·</span>
                    <span>Last checked {timeAgo(r.last_checked_at)}</span>
                    {r.last_changed_at && (
                      <>
                        <span>·</span>
                        <span style={{ color: '#f59e0b' }}>Changed {timeAgo(r.last_changed_at)}</span>
                      </>
                    )}
                    {r.last_error && (
                      <>
                        <span>·</span>
                        <span style={{ color: '#ef4444' }} title={r.last_error}>error</span>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    className="glass-btn"
                    onClick={() => handleCheck(r.id)}
                    disabled={checkingId === r.id}
                    style={rowBtn}
                    data-testid={`check-btn-${r.id}`}
                  >
                    {checkingId === r.id ? 'Checking…' : 'Check now'}
                  </button>
                  <button
                    className="glass-btn"
                    onClick={() => handleDelete(r.id)}
                    style={{ ...rowBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                    data-testid={`delete-btn-${r.id}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const headerStyle = { marginBottom: 18 };
const eyebrow = { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 };
const title = { fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 6, letterSpacing: '-0.02em' };
const subtitle = { fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: 540 };

const addCard = { padding: 14, borderRadius: 14, marginBottom: 18 };
const inputStyle = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, padding: '10px 12px', outline: 'none', minWidth: 0 };
const addBtn = { background: '#fff', color: '#000', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', minWidth: 90 };
const hintRow = { marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' };

const errorBox = { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: 10, color: '#fca5a5', fontSize: 13, marginBottom: 12 };

const itemCard = { padding: 14, borderRadius: 14 };
const dotStyle = { width: 10, height: 10, borderRadius: 999, marginTop: 6, flexShrink: 0 };
const rowTitle = { fontSize: 15, fontWeight: 600, color: '#fff' };
const rowUrl = { display: 'block', fontSize: 12.5, color: 'var(--blue)', marginTop: 4, wordBreak: 'break-all', textDecoration: 'none' };
const rowMeta = { marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 8, flexWrap: 'wrap' };
const chip = { fontSize: 10.5, padding: '2px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)', letterSpacing: '0.04em', fontWeight: 500 };
const rowBtn = { fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' };

const emptyCard = { padding: 24, borderRadius: 14, textAlign: 'center' };

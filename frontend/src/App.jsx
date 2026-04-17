import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiPost, apiUpload, isLoggedIn, logout as apiLogout } from './api';
import LoginModal from './LoginModal';
import RiskCard from './RiskCard';
import Landing from './Landing';
import Watchlist from './Watchlist';
import History from './History';

function riskScore(result) {
  if (!Array.isArray(result) || !result.length) return null;
  const w = { high: 55, medium: 15, low: 0 };
  const t = result.reduce((a, i) => a + (w[(i.risktype || '').toLowerCase()] ?? 0), 0);
  return Math.round(Math.min(100, (t / result.length / 55) * 100) * 100) / 100;
}

function detectLoginIntent() {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  return path === '/login' || params.has('login');
}

function detectSignupMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'signup';
}

export default function App() {
  const [authed, setAuthed] = useState(isLoggedIn());
  const loginIntent = detectLoginIntent();
  const [showLogin, setShowLogin] = useState(!authed && loginIntent);
  const [started, setStarted] = useState(false);
  const [initialMode] = useState(() => detectSignupMode() ? 'signup' : 'login');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState(null);
  const [lastTermsText, setLastTermsText] = useState('');
  const [view, setView] = useState('chat'); // 'chat' | 'watchlist' | 'history'
  const fileRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (loginIntent) {
      window.history.replaceState(null, '', '/');
    }
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (started && authed) setTimeout(() => inputRef.current?.focus(), 100); }, [started, authed]);

  const addMsg = useCallback((role, content, extra) => {
    setMessages(p => [...p, { role, content, ts: Date.now(), ...extra }]);
  }, []);

  const handleAuthSuccess = () => {
    setAuthed(true);
    setShowLogin(false);
    if (!started) setStarted(true);
    addMsg('system', 'Ready. Paste T&C text, upload a document, or enter a URL to analyze.');
  };

  const handleLogout = async () => {
    await apiLogout();
    setAuthed(false);
    setStarted(false);
    setMessages([]);
    setLastAnalysis(null);
    setLastTermsText('');
  };

  const handleStart = () => {
    if (!authed) { setShowLogin(true); return; }
    setStarted(true);
    addMsg('system', 'Ready. Paste T&C text, upload a document, or enter a URL to analyze.');
  };

  const analyzeText = async (text, source = 'paste') => {
    if (!authed) { setShowLogin(true); return; }
    addMsg('user', text.length > 400 ? text.slice(0, 400) + '...' : text, { label: source === 'url' ? 'URL' : 'Text' });
    setLoading(true);
    try {
      const data = source === 'url'
        ? await apiPost('/api/analyze-terms', { url: text, crawl: true })
        : await apiPost('/api/analyze-terms', { terms: text });
      const score = data.risk_score ?? riskScore(data.result);
      setLastAnalysis(data.result);
      // If the server fetched + concatenated pages, use that text as chat context
      setLastTermsText(data.terms_text || text);
      const crawledNote = data.pages && data.pages.length > 1
        ? `Crawled ${data.pages.length} pages from ${data.source_url}.`
        : null;
      addMsg('bot', crawledNote, { analysis: data.result, score });
    } catch (e) {
      addMsg('bot', e?.data?.detail || 'Analysis failed. Try again.');
    } finally { setLoading(false); }
  };

  const analyzeFile = async (file) => {
    if (!authed) { setShowLogin(true); return; }
    addMsg('user', file.name, { label: `${(file.size / 1024).toFixed(0)} KB` });
    setLoading(true);
    try {
      const data = await apiUpload('/api/upload-terms', file);
      const score = data.risk_score ?? riskScore(data.result);
      setLastAnalysis(data.result);
      if (data.terms_text) setLastTermsText(data.terms_text);
      addMsg('bot', null, { analysis: data.result, score });
    } catch (e) {
      addMsg('bot', e?.data?.detail || 'Upload failed.');
    } finally { setLoading(false); }
  };

  const askQuestion = async (question) => {
    if (!authed) { setShowLogin(true); return; }
    if (!lastTermsText && !lastAnalysis) {
      addMsg('bot', 'Analyze some Terms & Conditions first, then ask me questions about them.');
      return;
    }
    addMsg('user', question);
    setLoading(true);
    try {
      const body = { message: question, terms_text: lastTermsText };
      if (lastAnalysis) body.scan_results = [{ result: lastAnalysis }];
      const data = await apiPost('/api/chatbot', body);
      addMsg('bot', data.reply);
    } catch {
      addMsg('bot', 'Something went wrong. Please try again.');
    } finally { setLoading(false); }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const val = input.trim();
    if (!val || loading) return;
    setInput('');
    if (/^https?:\/\//i.test(val)) {
      analyzeText(val, 'url');
    } else if (val.length > 200) {
      analyzeText(val, 'paste');
    } else {
      askQuestion(val);
    }
  };

  const onFileDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) analyzeFile(f);
  };

  // ─── LANDING ───
  if (!started) {
    return (
      <>
        <Landing
          authed={authed}
          onStart={handleStart}
          onLogin={() => setShowLogin(true)}
          onLogout={handleLogout}
        />
        {showLogin && <LoginModal initialMode={initialMode} onSuccess={handleAuthSuccess} onClose={() => setShowLogin(false)} />}
      </>
    );
  }

  // ─── CHAT INTERFACE ───
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Nav */}
      <nav className="app-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={logoStyle}>Distil</span>
          <span style={badgeStyle}>AI</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => { setStarted(false); }} style={navLink}>Home</button>
          <button
            onClick={() => setView(view === 'history' ? 'chat' : 'history')}
            className="glass-btn"
            style={{ ...navChipBtn, background: view === 'history' ? 'rgba(255,255,255,0.14)' : undefined }}
            data-testid="nav-history-toggle"
          >
            History
          </button>
          <button
            onClick={() => setView(view === 'watchlist' ? 'chat' : 'watchlist')}
            className="glass-btn"
            style={{ ...navChipBtn, background: view === 'watchlist' ? 'rgba(255,255,255,0.14)' : undefined }}
            data-testid="nav-watchlist-toggle"
          >
            Watchlist
          </button>
          <button onClick={handleLogout} style={navLink}>Sign out</button>
        </div>
      </nav>

      {view === 'watchlist' ? (
        <Watchlist onBack={() => setView('chat')} />
      ) : view === 'history' ? (
        <History onReopen={(snap) => {
          setLastAnalysis(snap.result);
          setMessages(m => [...m, {
            role: 'user', content: snap.title, label: 'From history',
          }, {
            role: 'bot', content: snap.url ? `Reopened from history — ${snap.url}` : 'Reopened from history.',
            analysis: snap.result, score: snap.risk_score,
          }]);
          setView('chat');
        }} />
      ) : (
      <>

      {/* Messages */}
      <main
        style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1rem' }}
        onDragOver={e => e.preventDefault()}
        onDrop={onFileDrop}
      >
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ animation: 'fadeUp .3s ease forwards', marginBottom: 16 }}>
              {m.role === 'system' ? (
                <div style={systemBubble}>{m.content}</div>
              ) : m.role === 'user' ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div className="glass-user" style={userBubble}>
                    {m.label && <div style={labelStyle}>{m.label}</div>}
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{m.content}</div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div className="glass-bot" style={botBubble}>
                    {m.content && (
                      <div style={markdownBody}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={markdownComponents}
                        >
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    )}
                    {m.analysis && <RiskCard result={m.analysis} score={m.score} />}
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div style={{ animation: 'fadeIn .2s ease', marginBottom: 16 }}>
              <div className="glass-bot" style={botBubble}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={spinnerStyle} />
                  <span style={{ color: 'var(--text-secondary)' }}>Analyzing...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <div className="glass-subtle" style={inputDock}>
        <form onSubmit={handleSubmit} style={{ maxWidth: 760, margin: '0 auto', display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="glass-btn"
            style={attachBtn}
            title="Upload document"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
          </button>
          <input type="file" ref={fileRef} accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) analyzeFile(f); e.target.value = ''; }} />
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Paste terms, enter a URL, or ask a question..."
            disabled={loading}
            style={chatInput}
          />
          <button type="submit" disabled={loading || !input.trim()} style={sendBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </form>
      </div>
      </>
      )}

      {showLogin && <LoginModal initialMode={initialMode} onSuccess={handleAuthSuccess} onClose={() => setShowLogin(false)} />}
    </div>
  );
}

// ─── Styles ───
const logoStyle = { fontSize: '0.95rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#fff' };
const badgeStyle = { fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: 'rgba(50,145,255,0.15)', color: 'var(--blue)', border: '1px solid rgba(50,145,255,0.2)' };
const navLink = { background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.82rem', cursor: 'pointer', padding: '4px 0', transition: 'color var(--transition)' };
const navChipBtn = { fontSize: '0.78rem', padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontWeight: 500 };

const inputDock = { padding: '12px 16px', borderTop: '1px solid var(--glass-border)' };

const systemBubble = { fontSize: '0.8rem', color: 'var(--text-tertiary)', fontStyle: 'italic', padding: '0 4px' };
const userBubble = { maxWidth: '70%', padding: '10px 14px', borderRadius: '16px 16px 4px 16px', fontSize: '0.86rem', color: 'var(--text)' };
const botBubble = { maxWidth: '80%', padding: '12px 16px', borderRadius: '16px 16px 16px 4px', fontSize: '0.86rem', color: 'var(--text)' };
const labelStyle = { fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 4 };

const chatInput = { flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', borderRadius: 12, color: 'var(--text)', fontSize: '0.88rem', padding: '10px 14px', outline: 'none', transition: 'border-color var(--transition), background var(--transition)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' };
const attachBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 12, cursor: 'pointer', flexShrink: 0 };
const sendBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 12, border: 'none', background: '#fff', color: '#000', cursor: 'pointer', flexShrink: 0, transition: 'opacity var(--transition), transform var(--transition)' };
const spinnerStyle = { display: 'inline-block', width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: 'var(--text-secondary)', borderRadius: '50%', animation: 'spin .6s linear infinite' };

const markdownBody = { lineHeight: 1.6, fontSize: '0.88rem', color: 'var(--text)' };

const markdownComponents = {
  p: ({ node, ...props }) => <p style={{ margin: '0 0 8px' }} {...props} />,
  ul: ({ node, ...props }) => <ul style={{ margin: '0 0 8px', paddingLeft: 20 }} {...props} />,
  ol: ({ node, ...props }) => <ol style={{ margin: '0 0 8px', paddingLeft: 20 }} {...props} />,
  li: ({ node, ...props }) => <li style={{ marginBottom: 4 }} {...props} />,
  h1: ({ node, ...props }) => <h3 style={{ margin: '8px 0 6px', fontSize: '1rem', fontWeight: 700 }} {...props} />,
  h2: ({ node, ...props }) => <h3 style={{ margin: '8px 0 6px', fontSize: '0.95rem', fontWeight: 700 }} {...props} />,
  h3: ({ node, ...props }) => <h4 style={{ margin: '8px 0 6px', fontSize: '0.9rem', fontWeight: 600 }} {...props} />,
  strong: ({ node, ...props }) => <strong style={{ color: '#fff', fontWeight: 600 }} {...props} />,
  em: ({ node, ...props }) => <em style={{ color: 'var(--text)' }} {...props} />,
  a: ({ node, ...props }) => <a style={{ color: 'var(--blue, #3291ff)', textDecoration: 'underline' }} target="_blank" rel="noopener noreferrer" {...props} />,
  code: ({ node, inline, ...props }) => inline
    ? <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4, fontSize: '0.82em', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} {...props} />
    : <pre style={{ background: 'rgba(0,0,0,0.4)', padding: 10, borderRadius: 8, overflow: 'auto', fontSize: '0.8em' }}><code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} {...props} /></pre>,
  blockquote: ({ node, ...props }) => <blockquote style={{ borderLeft: '3px solid var(--border)', paddingLeft: 10, margin: '6px 0', color: 'var(--text-secondary)' }} {...props} />,
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />,
};

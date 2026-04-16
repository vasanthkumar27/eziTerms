export default function Landing({ authed, onStart, onLogin, onLogout }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav className="app-nav" style={{ padding: 'var(--nav-top-pad) 32px 10px 32px' }}>
        <span style={logo}>EziTerms</span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {authed ? (
            <>
              <button onClick={onStart} style={navBtn}>Open App</button>
              <button onClick={onLogout} style={navBtnGhost}>Sign out</button>
            </>
          ) : (
            <button onClick={onLogin} style={navBtn}>Sign in</button>
          )}
        </div>
      </nav>

      {/* Hero */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', textAlign: 'center', position: 'relative' }}>
        {/* Glow orb */}
        <div style={glowOrb} />

        <div style={{ animation: 'fadeUp .6s ease forwards', maxWidth: 680 }}>
          <div style={pillBadge}>
            <span style={pillDot} />
            AI-powered legal analysis
          </div>

          <h1 style={heroTitle}>
            Understand any<br />
            <span style={heroGradient}>Terms & Conditions</span><br />
            in seconds
          </h1>

          <p style={heroSub}>
            Paste legal text, upload documents, or enter a URL. Our AI reads the fine print,
            flags hidden risks, and lets you ask questions in plain English.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 40, flexWrap: 'wrap' }}>
            <button onClick={onStart} style={ctaPrimary}>
              Start Analyzing
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
            <a href="https://chromewebstore.google.com/" target="_blank" rel="noopener noreferrer" style={ctaSecondary}>
              Chrome Extension
            </a>
          </div>
        </div>

        {/* Feature cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, maxWidth: 720, width: '100%', marginTop: 80, animation: 'fadeUp .8s ease forwards' }}>
          {features.map((f, i) => (
            <div key={i} style={featureCard}>
              <div style={featureIcon}>{f.icon}</div>
              <div style={featureTitle}>{f.title}</div>
              <div style={featureDesc}>{f.desc}</div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '32px 0', fontSize: '0.75rem', color: 'var(--text-tertiary)', borderTop: '1px solid var(--border)' }}>
        EziTerms — AI that reads the fine print so you don't have to.
      </footer>
    </div>
  );
}

const features = [
  { icon: '📄', title: 'Paste or Upload', desc: 'Drop a PDF, paste text, or point to a URL.' },
  { icon: '⚡', title: 'Instant Analysis', desc: 'AI flags high, medium, and low risk clauses.' },
  { icon: '💬', title: 'Ask Questions', desc: 'Chat about the terms in plain English.' },
  { icon: '🔒', title: 'PII Masking', desc: 'Presidio masks personal data before analysis.' },
  { icon: '🧠', title: 'Smart Detection', desc: 'ML model auto-detects T&C pages.' },
  { icon: '🌐', title: 'Extension', desc: 'Chrome extension scans sites as you browse.' },
];

// ─── Styles ───
const nav = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: 64, borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 50 };
const logo = { fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.03em', color: '#fff' };
const navBtn = { padding: '7px 16px', fontSize: '0.82rem', fontWeight: 500, borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', background: '#fff', color: '#000', cursor: 'pointer', transition: 'opacity 150ms' };
const navBtnGhost = { padding: '7px 16px', fontSize: '0.82rem', fontWeight: 500, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' };

const glowOrb = { position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle,rgba(50,145,255,0.07) 0%,transparent 70%)', pointerEvents: 'none', filter: 'blur(40px)' };

const pillBadge = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)', border: '1px solid var(--border)', background: 'var(--bg-card)', marginBottom: 24 };
const pillDot = { width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.5)' };

const heroTitle = { fontSize: 'clamp(2.2rem,5vw,3.8rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.04em', color: '#fff' };
const heroGradient = { background: 'linear-gradient(135deg,#fff 0%,rgba(255,255,255,0.4) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
const heroSub = { fontSize: 'clamp(0.92rem,1.5vw,1.1rem)', color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 520, margin: '20px auto 0' };

const ctaPrimary = { display: 'inline-flex', alignItems: 'center', padding: '12px 28px', fontSize: '0.92rem', fontWeight: 600, borderRadius: 10, border: 'none', background: '#fff', color: '#000', cursor: 'pointer', transition: 'transform 150ms, box-shadow 150ms', boxShadow: '0 0 0 0 rgba(255,255,255,0)' };
const ctaSecondary = { display: 'inline-flex', alignItems: 'center', padding: '12px 24px', fontSize: '0.88rem', fontWeight: 500, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', textDecoration: 'none', transition: 'border-color 150ms' };

const featureCard = { padding: '20px 18px', borderRadius: 14, background: 'var(--glass-bg-subtle)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid var(--glass-border)', transition: 'border-color 200ms, background 200ms, transform 200ms', cursor: 'default' };
const featureIcon = { fontSize: '1.4rem', marginBottom: 10 };
const featureTitle = { fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: 4 };
const featureDesc = { fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 };

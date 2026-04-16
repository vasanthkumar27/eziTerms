import { useState, useEffect, useRef } from 'react';
import { loginWithEmail, signupWithEmail, loginWithGoogle, getGoogleClientId } from './api';

export default function LoginModal({ onSuccess, onClose, initialMode }) {
  const [mode, setMode] = useState(initialMode || 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const googleBtnRef = useRef(null);

  const clientId = getGoogleClientId();

  useEffect(() => {
    if (!clientId || typeof window.google === 'undefined') return;
    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
      });
      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          width: 316,
          text: mode === 'signup' ? 'signup_with' : 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'center',
        });
      }
    } catch {}
  }, [clientId, mode]);

  async function handleGoogleCredential(response) {
    if (!response?.credential) return;
    setError('');
    setGLoading(true);
    try {
      await loginWithGoogle(response.credential);
      onSuccess();
    } catch (err) {
      setError(err?.data?.detail || 'Google sign-in failed');
    } finally { setGLoading(false); }
  }

  async function handleGoogleTokenFlow() {
    if (!clientId || typeof window.google === 'undefined') return;
    setError('');
    setGLoading(true);
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'email profile openid',
        callback: async (resp) => {
          if (resp.error) {
            setError('Google sign-in was cancelled');
            setGLoading(false);
            return;
          }
          try {
            await loginWithGoogle(resp.access_token);
            onSuccess();
          } catch (err) {
            setError(err?.data?.detail || 'Google sign-in failed');
          } finally { setGLoading(false); }
        },
      });
      tokenClient.requestAccessToken();
    } catch {
      setError('Google sign-in unavailable');
      setGLoading(false);
    }
  }

  const handle = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signupWithEmail(email, password);
        await loginWithEmail(email, password);
      } else {
        await loginWithEmail(email, password);
      }
      onSuccess();
    } catch (err) {
      setError(err?.data?.detail || (typeof err === 'string' ? err : 'Authentication failed'));
    } finally { setLoading(false); }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={closeBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <h2 style={title}>{mode === 'signup' ? 'Create account' : 'Welcome back'}</h2>
        <p style={subtitle}>{mode === 'signup' ? 'Enter your details to get started' : 'Sign in to continue'}</p>

        {error && <div style={errorBox}>{error}</div>}

        {/* Google Sign-In */}
        {clientId && (
          <>
            <button onClick={handleGoogleTokenFlow} disabled={gLoading} style={googleBtn}>
              <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 019.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.97 23.97 0 000 24c0 3.77.9 7.35 2.56 10.56l7.97-5.97z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 5.97C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              <span>{gLoading ? 'Signing in...' : 'Continue with Google'}</span>
            </button>

            <div style={divider}>
              <span style={dividerLine} />
              <span style={dividerText}>or</span>
              <span style={dividerLine} />
            </div>
          </>
        )}

        <form onSubmit={handle}>
          <label style={labelStyle}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} placeholder="you@example.com" />

          <label style={{ ...labelStyle, marginTop: 14 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} placeholder="********" />

          <button type="submit" disabled={loading} style={submitBtn}>
            {loading ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Continue'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }} style={switchBtn}>
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, animation: 'fadeIn .15s ease' };
const modal = { position: 'relative', background: '#0a0a0a', border: '1px solid var(--border)', borderRadius: 16, padding: '36px 32px 28px', width: '100%', maxWidth: 380, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' };
const closeBtn = { position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4, borderRadius: 6 };
const title = { fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#fff', marginBottom: 4 };
const subtitle = { fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 24 };
const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 };
const inputStyle = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: '0.88rem', padding: '10px 12px', outline: 'none', transition: 'border-color 150ms' };
const submitBtn = { width: '100%', marginTop: 20, padding: '10px', fontSize: '0.88rem', fontWeight: 600, borderRadius: 8, border: 'none', background: '#fff', color: '#000', cursor: 'pointer', transition: 'opacity 150ms' };
const errorBox = { padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: '0.8rem', marginBottom: 16 };
const googleBtn = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '10px 14px', fontSize: '0.88rem', fontWeight: 500, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text)', cursor: 'pointer', transition: 'border-color 150ms, background 150ms' };
const divider = { display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' };
const dividerLine = { flex: 1, height: 1, background: 'var(--border)' };
const dividerText = { fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' };
const switchBtn = { background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer', padding: '6px 0', transition: 'color 150ms' };

import React, { useState, useEffect } from 'react';
import API_ENDPOINTS from '../masterconstans/MasterConstants';
import { setTokens, getAccessToken } from '../utils/tokenStore';
import { fusion } from '../theme/fusionTheme';
import GoogleIcon from '../assets/google-icon.svg';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Backend (FastAPI) returns errors in { detail: string | Array<{msg?: string}> }; also support legacy { error }. */
function getApiErrorMessage(data: { detail?: string | Array<{ msg?: string }>; error?: string }): string {
  if (data.detail != null) {
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail) && data.detail[0]?.msg) return data.detail[0].msg;
  }
  return data.error ?? '';
}

function decodeUserId(accessToken: string): string | null {
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    return payload?.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

async function apiGet(path: string, accessToken: string | null): Promise<unknown> {
  const base = API_ENDPOINTS.AWS_BASE_API_URL.replace(/\/$/, '');
  const url = path.startsWith('http') ? path : `${base}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, data };
  return data;
}

async function apiPost(path: string, body: object, accessToken: string | null): Promise<unknown> {
  const base = API_ENDPOINTS.AWS_BASE_API_URL.replace(/\/$/, '');
  const url = path.startsWith('http') ? path : `${base}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, data };
  return data;
}

type AuthorizationProps = {
  onAuthSuccess: () => void;
};

const Authorization: React.FC<AuthorizationProps> = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [step, setStep] = useState<'auth' | 'complete'>('auth');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const API_URL = API_ENDPOINTS.AWS_BASE_API_URL;

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Use background script for chrome.identity (works in both side panel and content script).
      const token = await new Promise<string | null>((resolve) => {
        chrome.runtime.sendMessage({ action: 'GOOGLE_SIGNIN_REQUEST' }, (res: { ok?: boolean; token?: string; error?: string } | undefined) => {
          if (res?.ok && res.token) resolve(res.token);
          else resolve(null);
        });
      });
      if (!token) {
        setErrorMsg('Google sign-in failed: could not get token');
        setLoading(false);
        return;
      }
      const res = await fetch(API_ENDPOINTS.AWS_BASE_API_URL + API_ENDPOINTS.LOGIN_GOOGLE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      const errorMessage = getApiErrorMessage(data);
      if (!res.ok) {
        setErrorMsg(errorMessage || 'Google login failed on backend');
      } else {
        if (data.access && data.refresh) {
          await setTokens(data.access, data.refresh, data.session_id);
          const userId = decodeUserId(data.access);
          if (userId) {
            const profile = await apiGet(API_ENDPOINTS.USER_PROFILE(userId), data.access).catch(() => null) as { first_name?: string; last_name?: string } | null;
            const needsProfile = !profile?.first_name || !profile?.last_name;
            if (needsProfile) {
              setStep('complete');
              setLoading(false);
              return;
            }
          }
          onAuthSuccess();
        } else {
          setErrorMsg('Invalid login response from backend');
        }
      }
    } catch (e: unknown) {
      setErrorMsg('Network error or unexpected issue: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleProfileComplete = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg('First name and last name are required');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const access = await getAccessToken();
      if (!access) {
        setErrorMsg('Session expired. Please log in again.');
        setLoading(false);
        return;
      }
      await apiPost(API_ENDPOINTS.SIGNUP_COMPLETE, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone_number: null,
      }, access);
      onAuthSuccess();
    } catch (e: unknown) {
      const err = e as { data?: { detail?: string } };
      setErrorMsg(err?.data?.detail || (e instanceof Error ? e.message : 'Failed to save profile'));
    } finally {
      setLoading(false);
    }
  };

  const clearForm = () => {
    setUsername('');
    setPassword('');
    setErrorMsg(null);
  };

  const toggleForm = () => {
    clearForm();
    setIsLogin(!isLogin);
  };

  const validateFields = (): boolean => {
    const identifier = username.trim();
    if (identifier.length < 3) {
      setErrorMsg('Enter email or username (at least 3 characters)');
      return false;
    }
    if (!isLogin && !EMAIL_REGEX.test(identifier.toLowerCase())) {
      setErrorMsg('Please enter a valid email address for signup');
      return false;
    }
    if (isLogin && identifier.includes('@') && !EMAIL_REGEX.test(identifier)) {
      setErrorMsg('Please enter a valid email address');
      return false;
    }
    if (password.length < (isLogin ? 6 : 8)) {
      setErrorMsg(isLogin ? 'Password must be at least 6 characters' : 'Password must be at least 8 characters');
      return false;
    }
    if (!isLogin && password.length >= 8) {
      if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
        setErrorMsg('Password must contain 1 uppercase, 1 lowercase, and 1 digit');
        return false;
      }
    }
    setErrorMsg(null);
    return true;
  };

  const handleSubmit = async () => {
    if (!validateFields()) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const endpoint = isLogin ? API_ENDPOINTS.LOGIN_GENERIC : API_ENDPOINTS.SIGNUP_GENERIC;
      const identifier = isLogin ? username.trim() : username.trim().toLowerCase();
      const res = await fetch(API_URL + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: identifier, password }),
      });

      const data = await res.json();
      const errorMessage = getApiErrorMessage(data);

      if (!res.ok) {
        setErrorMsg(errorMessage || 'Incorrect email or password');
      } else {
        if (isLogin) {
          if (data.access && data.refresh) {
            await setTokens(data.access, data.refresh, data.session_id);
            const userId = decodeUserId(data.access);
            if (userId) {
              const profile = await apiGet(API_ENDPOINTS.USER_PROFILE(userId), data.access).catch(() => null) as { first_name?: string; last_name?: string } | null;
              const needsProfile = !profile?.first_name || !profile?.last_name;
              if (needsProfile) {
                setStep('complete');
                setLoading(false);
                return;
              }
            }
            onAuthSuccess();
          } else {
            setErrorMsg('Invalid login response');
          }
        } else {
          const loginRes = await fetch(API_URL + API_ENDPOINTS.LOGIN_GENERIC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.trim(), password }),
          });
          const loginData = await loginRes.json();
          if (loginRes.ok && loginData.access && loginData.refresh) {
            await setTokens(loginData.access, loginData.refresh, loginData.session_id);
            const userId = decodeUserId(loginData.access);
            if (userId) {
              const profile = await apiGet(API_ENDPOINTS.USER_PROFILE(userId), loginData.access).catch(() => null) as { first_name?: string; last_name?: string } | null;
              const needsProfile = !profile?.first_name || !profile?.last_name;
              if (needsProfile) {
                setStep('complete');
                setLoading(false);
                return;
              }
            }
            onAuthSuccess();
          } else {
            setErrorMsg('Signup successful. Please log in.');
            toggleForm();
          }
        }
      }
    } catch {
      setErrorMsg('Network error, please try again');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const styleId = 'spin-keyframes-style';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg);}
          100% { transform: rotate(360deg);}
        }
      `;
      document.head.appendChild(styleEl);
    }
  }, []);

  if (step === 'complete') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle} role="main" aria-label="Complete profile form">
          <header style={headerStyle}>
            <h2 style={titleStyle}>Complete Profile</h2>
            <p style={{ ...toggleTextStyle, marginBottom: 12 }}>Add your name to personalize your experience</p>
          </header>
          {errorMsg && <div style={errorStyle} role="alert">{errorMsg}</div>}
          <label htmlFor="firstName" style={srOnlyStyle}>First name</label>
          <input
            id="firstName"
            type="text"
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            style={inputStyle}
            disabled={loading}
            autoComplete="given-name"
          />
          <label htmlFor="lastName" style={srOnlyStyle}>Last name</label>
          <input
            id="lastName"
            type="text"
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            style={inputStyle}
            disabled={loading}
            autoComplete="family-name"
          />
          <button
            type="button"
            data-eziterms-btn="primary"
            onClick={handleProfileComplete}
            style={loading ? disabledButtonStyle : buttonStyle}
            disabled={loading}
          >
            {loading ? <div style={spinnerStyle} aria-label="Loading"></div> : 'Complete'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle} role="main" aria-label="Authentication form">
        <header style={headerStyle}>
          <h2 style={titleStyle}>{isLogin ? 'Login' : 'Sign Up'}</h2>
          <div style={toggleSwitchStyle} role="group" aria-label="Toggle authentication mode">
            <button
              onClick={() => {
                if (!loading) setIsLogin(true);
              }}
              style={isLogin ? activeSwitchStyle : inactiveSwitchStyle}
              disabled={loading}
              aria-pressed={isLogin}
              type="button"
            >
              Login
            </button>
            <button
              onClick={() => {
                if (!loading) setIsLogin(false);
              }}
              style={!isLogin ? activeSwitchStyle : inactiveSwitchStyle}
              disabled={loading}
              aria-pressed={!isLogin}
              type="button"
            >
              Sign Up
            </button>
          </div>
        </header>

        {errorMsg && <div style={errorStyle} role="alert">{errorMsg}</div>}

        <label htmlFor="username" style={srOnlyStyle}>{isLogin ? 'Email or username' : 'Email'}</label>
        <input
          id="username"
          type={isLogin ? 'text' : 'email'}
          placeholder={isLogin ? 'Email or username' : 'Email'}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={inputStyle}
          disabled={loading}
          autoComplete="email"
          aria-required="true"
          aria-invalid={!!errorMsg}
        />

        <label htmlFor="password" style={srOnlyStyle}>Password</label>
        <input
          id="password"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          disabled={loading}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          aria-required="true"
          aria-invalid={!!errorMsg}
        />

        <button
          type="button"
          data-eziterms-btn="primary"
          onClick={handleSubmit}
          style={loading ? disabledButtonStyle : buttonStyle}
          disabled={loading}
          aria-live="polite"
        >
          {loading ? <div style={spinnerStyle} aria-label="Loading"></div> : isLogin ? 'Log In' : 'Sign Up'}
        </button>

        <div style={toggleTextStyle}>
          {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
          <span
            onClick={() => !loading && toggleForm()}
            style={toggleLinkStyle}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleForm(); }}
          >
            {isLogin ? 'Sign Up' : 'Login'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0' }} aria-hidden="true">
          <div style={dividerStyle} />
          <p style={dividerTextStyle}>Or</p>
          <div style={dividerStyle} />
        </div>

        <button
          type="button"
          data-eziterms-btn="primary"
          onClick={handleGoogleSignIn}
          style={loading ? disabledGoogleButtonStyle : googleButtonStyle}
          disabled={loading}
          aria-label="Sign in with Google"
        >
          {loading ? (
            <div style={spinnerStyle} aria-label="Loading"></div>
          ) : (
            <>
              <img src={GoogleIcon} alt="Google icon" style={{ width: 20, height: 20, marginRight: 10 }} />
              Sign in with Google
            </>
          )}
        </button>
      </div>
    </div>
  );
};

/* Auth: responsive card, adapts to panel size */

const containerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  padding: '8px 0',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  fontFamily: fusion.font,
  boxSizing: 'border-box',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255, 255, 255, 0.04)',
  border: `1px solid ${fusion.border}`,
  borderRadius: 10,
  width: '100%',
  maxWidth: 360,
  padding: '16px 18px',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const headerStyle: React.CSSProperties = {
  textAlign: 'center',
  marginBottom: 4,
};

const titleStyle: React.CSSProperties = {
  marginBottom: 8,
  fontWeight: 700,
  fontSize: 17,
  color: fusion.text,
};

const toggleSwitchStyle: React.CSSProperties = {
  display: 'inline-flex',
  borderRadius: 50,
  backgroundColor: 'rgba(255, 255, 255, 0.06)',
  padding: 3,
  border: `1px solid ${fusion.border}`,
};

const baseSwitchStyle: React.CSSProperties = {
  padding: '6px 16px',
  borderRadius: 50,
  border: 'none',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 12,
  transition: fusion.transition,
  userSelect: 'none',
};

const activeSwitchStyle: React.CSSProperties = {
  ...baseSwitchStyle,
  background: fusion.gradient,
  color: '#fff',
};

const inactiveSwitchStyle: React.CSSProperties = {
  ...baseSwitchStyle,
  backgroundColor: 'transparent',
  color: fusion.textMuted,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${fusion.border}`,
  fontSize: 13,
  outline: 'none',
  backgroundColor: 'rgba(255, 255, 255, 0.06)',
  color: fusion.text,
  boxSizing: 'border-box',
  transition: fusion.transition,
};

const buttonStyle: React.CSSProperties = {
  background: fusion.gradient,
  color: '#fff',
  padding: '12px 18px',
  width: '100%',
  borderRadius: 8,
  border: 'none',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  userSelect: 'none',
  boxShadow: '0 2px 12px rgba(139, 92, 246, 0.35)',
};

const disabledButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  opacity: 0.6,
  cursor: 'not-allowed',
};

const googleButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'rgba(255, 255, 255, 0.06)',
  color: fusion.text,
  border: `1px solid ${fusion.border}`,
  boxShadow: 'none',
  justifyContent: 'center',
};

const disabledGoogleButtonStyle: React.CSSProperties = {
  ...googleButtonStyle,
  opacity: 0.6,
  cursor: 'not-allowed',
};

const errorStyle: React.CSSProperties = {
  marginBottom: fusion.space4,
  color: fusion.dangerText,
  fontWeight: fusion.fontWeightSemibold,
  textAlign: 'center',
  fontSize: fusion.fontSizeSm,
  backgroundColor: fusion.dangerBg,
  padding: fusion.space3,
  borderRadius: fusion.radius,
  border: '1px solid rgba(239, 68, 68, 0.35)',
  lineHeight: fusion.lineHeightNormal,
};

const toggleTextStyle: React.CSSProperties = {
  marginTop: fusion.space3,
  fontSize: fusion.fontSizeSm,
  textAlign: 'center',
  color: fusion.textMuted,
};

const toggleLinkStyle: React.CSSProperties = {
  color: fusion.accentAmber,
  cursor: 'pointer',
  fontWeight: fusion.fontWeightSemibold,
  textDecoration: 'none',
  userSelect: 'none',
};

const spinnerStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  border: '3px solid rgba(255,255,255,0.3)',
  borderTop: '3px solid #fff',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
};

const dividerStyle: React.CSSProperties = {
  flex: 1,
  backgroundColor: fusion.border,
  height: 1,
};

const dividerTextStyle: React.CSSProperties = {
  margin: `0 ${fusion.space4}px`,
  color: fusion.textMuted,
  fontSize: fusion.fontSizeSm,
};

const srOnlyStyle: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export default Authorization;

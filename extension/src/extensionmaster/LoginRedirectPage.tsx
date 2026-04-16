/**
 * Shown when user opens the extension without being logged in.
 * Website is the auth master: redirect user to website login/signup pages.
 */

import React from 'react';
import { fusion } from '../theme/fusionTheme';
import { getWebsiteBaseUrl } from '../masterconstans/MasterConstants';

const LoginRedirectPage: React.FC = () => {
  const baseUrl = getWebsiteBaseUrl().replace(/\/$/, '');
  const loginUrl = `${baseUrl}/?login`;
  const signupUrl = `${baseUrl}/?login&mode=signup`;

  const openInNewTab = (url: string) => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div style={wrapper}>
      <div style={card}>
        <h2 style={titleStyle}>Sign in to continue</h2>
        <p style={messageStyle}>
          Log in on the EziTerms website to use the extension.
        </p>
        <button
          type="button"
          onClick={() => openInNewTab(loginUrl)}
          style={primaryBtn}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => openInNewTab(signupUrl)}
          style={secondaryBtn}
        >
          Create account
        </button>
      </div>
    </div>
  );
};

export default LoginRedirectPage;

const wrapper: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '16px 14px',
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
};

const card: React.CSSProperties = {
  backgroundColor: fusion.bgCard,
  border: `1px solid ${fusion.border}`,
  borderRadius: 14,
  width: '100%',
  maxWidth: 320,
  padding: '28px 24px',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  alignItems: 'stretch',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
};

const titleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 16,
  color: fusion.text,
  textAlign: 'center',
  margin: 0,
  lineHeight: 1.4,
  letterSpacing: '-0.02em',
};

const messageStyle: React.CSSProperties = {
  fontSize: 13,
  color: fusion.textMuted,
  textAlign: 'center',
  margin: 0,
  lineHeight: 1.5,
};

const primaryBtn: React.CSSProperties = {
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
  transition: fusion.transition,
  background: '#fff',
  color: '#000',
  boxShadow: 'none',
};

const secondaryBtn: React.CSSProperties = {
  padding: '12px 18px',
  width: '100%',
  borderRadius: 8,
  border: `1px solid ${fusion.border}`,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: fusion.transition,
  background: 'transparent',
  color: fusion.textMuted,
};

// Header.tsx - Fusion theme

import React, { useState } from 'react';
import { fusion } from '../theme/fusionTheme';

type HeaderProps = {
  activeTab: 'risk' | 'anee';
  setActiveTab: (tab: 'risk' | 'anee') => void;
};

const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  const tabBase: React.CSSProperties = {
    flex: 1,
    padding: '7px 10px',
    fontSize: fusion.fontSizeSm,
    border: `1px solid ${fusion.border}`,
    borderRadius: fusion.radiusSm,
    backgroundColor: fusion.bgInput,
    color: fusion.textMuted,
    cursor: 'pointer',
    fontWeight: fusion.fontWeightSemibold,
    transition: fusion.transition,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 32,
  };

  const tabActive: React.CSSProperties = {
    background: '#fff',
    color: '#000',
    border: 'none',
    boxShadow: 'none',
  };

  const tabHover: React.CSSProperties = {
    backgroundColor: fusion.bgCardHover,
    color: fusion.text,
  };

  return (
    <div style={headerStyle}>
      <button
        type="button"
        onClick={() => setActiveTab('risk')}
        onMouseEnter={() => setHoveredTab('risk')}
        onMouseLeave={() => setHoveredTab(null)}
        style={{
          ...tabBase,
          ...(activeTab === 'risk' ? tabActive : {}),
          ...(hoveredTab === 'risk' && activeTab !== 'risk' ? tabHover : {}),
        }}
      >
        <MiniBarsIcon />
        Risk
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('anee')}
        onMouseEnter={() => setHoveredTab('anee')}
        onMouseLeave={() => setHoveredTab(null)}
        style={{
          ...tabBase,
          ...(activeTab === 'anee' ? tabActive : {}),
          ...(hoveredTab === 'anee' && activeTab !== 'anee' ? tabHover : {}),
        }}
      >
        <MiniSparkIcon />
        Anee
      </button>
    </div>
  );
};

export default Header;

/* Tab bar: compact Risk | Anee toggle */
const headerStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginBottom: 12,
  paddingBottom: 12,
  borderBottom: `1px solid ${fusion.border}`,
};

function MiniBarsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 20V10M12 20V4M18 20v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MiniSparkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m12 3 2.3 5.5L20 11l-5.7 2.5L12 19l-2.3-5.5L4 11l5.7-2.5L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
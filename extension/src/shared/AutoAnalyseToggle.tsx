/**
 * Auto Analyse toggle - controls automatic T&C detection on page load.
 * When ON: Content script runs classifier and shows "T&C detected" popup.
 * When OFF: No automatic detection.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { fusion } from '../theme/fusionTheme';
import { getAutoAnalyseEnabled, setAutoAnalyseEnabled, DEFAULT_AUTO_ANALYSE_ENABLED } from '../utils/autoAnalyseStorage';

const STORAGE_KEY = 'eziterms_auto_analyse_enabled';

const AutoAnalyseToggle: React.FC = () => {
  const [enabled, setEnabled] = useState(DEFAULT_AUTO_ANALYSE_ENABLED);

  useEffect(() => {
    getAutoAnalyseEnabled().then(setEnabled);
  }, []);

  useEffect(() => {
    const handler = (
      changes: { [key: string]: chrome.storage.StorageChange },
      namespace: string
    ) => {
      if (namespace === 'local' && changes[STORAGE_KEY]) {
        const val = changes[STORAGE_KEY].newValue;
        setEnabled(val === true || val === false ? val : DEFAULT_AUTO_ANALYSE_ENABLED);
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  const handleToggle = useCallback(async () => {
    const next = !enabled;
    setEnabled(next);
    await setAutoAnalyseEnabled(next);
  }, [enabled]);

  return (
    <div style={toggleContainer}>
      <div style={toggleRow}>
        <span style={labelStyle}>Auto Analyse</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Auto Analyse ${enabled ? 'on' : 'off'}`}
          onClick={handleToggle}
          style={{
            ...toggleTrackStyle,
            ...(enabled ? toggleTrackOnStyle : {}),
          }}
        >
          <span
            style={{
              ...toggleThumbStyle,
              ...(enabled ? toggleThumbOnStyle : {}),
            }}
          />
        </button>
      </div>
    </div>
  );
};

export default AutoAnalyseToggle;

const toggleContainer: React.CSSProperties = {
  position: 'relative',
  padding: '8px 0',
  borderBottom: `1px solid ${fusion.border}`,
  marginBottom: 8,
  flexShrink: 0,
};

const toggleRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: fusion.text,
};

const toggleTrackStyle: React.CSSProperties = {
  width: 36,
  height: 20,
  borderRadius: 10,
  background: fusion.bgInput,
  border: `1px solid ${fusion.border}`,
  cursor: 'pointer',
  padding: 2,
  position: 'relative',
  transition: fusion.transition,
};

const toggleTrackOnStyle: React.CSSProperties = {
  background: '#fff',
  borderColor: '#fff',
};

const toggleThumbStyle: React.CSSProperties = {
  position: 'absolute',
  top: 2,
  left: 2,
  width: 14,
  height: 14,
  borderRadius: 7,
  background: fusion.textMuted,
  transition: fusion.transition,
};

const toggleThumbOnStyle: React.CSSProperties = {
  left: 18,
  background: '#000',
};

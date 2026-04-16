/**
 * Extension on/off — switch only (no label). Controls chrome.storage eziterms_extension_enabled.
 */
import React, { useEffect, useState } from 'react';
import { getExtensionEnabled, setExtensionEnabled } from '../utils/extensionEnabledStorage';
import { fusion } from '../theme/fusionTheme';

const track: React.CSSProperties = {
  width: 44,
  height: 26,
  borderRadius: 13,
  border: 'none',
  padding: 2,
  cursor: 'pointer',
  flexShrink: 0,
  transition: fusion.transition,
  position: 'relative',
};

const knob: React.CSSProperties = {
  position: 'absolute',
  top: 2,
  width: 22,
  height: 22,
  borderRadius: '50%',
  boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
  transition: fusion.transition,
};

type ExtensionEnabledSwitchProps = {
  /** Native tooltip; default explains page injection vs side panel */
  title?: string;
};

export const ExtensionEnabledSwitch: React.FC<ExtensionEnabledSwitchProps> = ({
  title = 'When off, EziTerms hides on web pages (side panel stays available from the toolbar)',
}) => {
  const [on, setOn] = useState(true);

  useEffect(() => {
    getExtensionEnabled().then(setOn);
  }, []);

  const toggle = async () => {
    const next = !on;
    setOn(next);
    try {
      await setExtensionEnabled(next);
    } catch {
      setOn(!next);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="EziTerms on web pages"
      title={title}
      onClick={toggle}
      style={{
        ...track,
        background: on ? '#fff' : fusion.bgInput,
      }}
    >
      <span
        style={{
          ...knob,
          left: on ? 20 : 2,
          background: on ? '#000' : '#888',
        }}
      />
    </button>
  );
};

export default ExtensionEnabledSwitch;

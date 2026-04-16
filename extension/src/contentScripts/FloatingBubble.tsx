/**
 * Glass droplet bubble - docked on left or right edge.
 * Click opens the extension side panel directly.
 * Drag to reposition; release on left/right half to dock.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getExtensionEnabled } from '../utils/extensionEnabledStorage';
import { getExtensionApi } from '../utils/extensionContext';
import { BUBBLE_WIDTH, BUBBLE_HEIGHT, DROPLET_SIZE, POSITION_KEY } from '../utils/bubbleConstants';

const DRAG_THRESHOLD_PX = 6;

type Side = 'left' | 'right';
type BubbleState = { side: Side; y: number };

function getDefaultState(): BubbleState {
  const h = typeof window !== 'undefined' ? window.innerHeight : 600;
  return { side: 'right', y: (h - BUBBLE_HEIGHT) / 2 };
}

async function getStoredState(): Promise<BubbleState | null> {
  try {
    const ext = getExtensionApi();
    if (!ext?.storage?.local) return null;
    const r = await ext.storage.local.get([POSITION_KEY]);
    const p = r[POSITION_KEY];
    if (p && typeof p.y === 'number') {
      return { side: (p.side === 'left' ? 'left' : 'right') as Side, y: p.y };
    }
    return null;
  } catch {
    return null;
  }
}

async function setStoredState(s: BubbleState): Promise<void> {
  try {
    const ext = getExtensionApi();
    if (!ext?.storage?.local) return;
    await ext.storage.local.set({ [POSITION_KEY]: s });
  } catch { /* Extension context invalidated */ }
}

const glassBubble = {
  background: 'rgba(0, 0, 0, 0.6)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
};

const FloatingBubble: React.FC = () => {
  const [enabled, setEnabled] = useState(true);
  const [state, setState] = useState<BubbleState>(getDefaultState());
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [isAppearing, setIsAppearing] = useState(true);
  const dragStartRef = useRef<{ x: number; y: number; startY: number } | null>(null);
  const didDragRef = useRef(false);

  const winW = typeof window !== 'undefined' ? window.innerWidth : 800;
  const winH = typeof window !== 'undefined' ? window.innerHeight : 600;
  const centerX = winW / 2;

  useEffect(() => {
    if (enabled) {
      const t = setTimeout(() => setIsAppearing(false), 400);
      return () => clearTimeout(t);
    }
  }, [enabled]);

  useEffect(() => {
    getExtensionEnabled().then(setEnabled);
    getStoredState().then((s) => s && setState(s));
  }, []);

  useEffect(() => {
    const ext = getExtensionApi();
    if (!ext?.storage?.onChanged) return;
    const handler = (
      changes: { [key: string]: chrome.storage.StorageChange },
      namespace: string
    ) => {
      try {
        if (namespace === 'local' && changes.eziterms_extension_enabled) {
          const v = changes.eziterms_extension_enabled.newValue;
          if (v === false) {
            setIsExiting(true);
            setTimeout(() => {
              setEnabled(false);
              setIsExiting(false);
            }, 300);
          } else {
            setEnabled(v === true || v === false ? v : true);
            setIsAppearing(true);
          }
        }
      } catch { /* Extension context invalidated */ }
    };
    ext.storage.onChanged.addListener(handler);
    return () => {
      try { ext.storage.onChanged.removeListener(handler); } catch { /* invalidated */ }
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    didDragRef.current = false;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, startY: state.y };
  }, [state.y]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) didDragRef.current = true;
      const dyy = e.clientY - start.y;
      let ny = start.startY + dyy;
      ny = Math.max(0, Math.min(ny, winH - DROPLET_SIZE));
      setState((s) => ({ ...s, y: ny }));
      setDragPos({ x: e.clientX, y: ny });
    };
    const onUp = (e: MouseEvent) => {
      setIsDragging(false);
      dragStartRef.current = null;
      setDragPos(null);
      const x = e.clientX;
      if (didDragRef.current) {
        const onLeft = x < centerX;
        setState((prev) => {
          const next = { side: (onLeft ? 'left' : 'right') as Side, y: prev.y };
          setStoredState(next);
          return next;
        });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, centerX, winW, winH]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (didDragRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    try {
      const ext = getExtensionApi();
      if (!ext?.runtime?.sendMessage) return;
      // Send immediately to preserve user gesture - Chrome requires sidePanel.open() in response to a click.
      // Background will use sender.tab from the content script message.
      ext.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' }).catch(() => {});
    } catch { /* Extension context invalidated */ }
  }, []);
  const isDroplet = isDragging && dragPos !== null;

  if (!enabled && !isExiting) return null;

  const bubbleSize = isDroplet ? DROPLET_SIZE : BUBBLE_HEIGHT;
  const bubbleW = isDroplet ? DROPLET_SIZE : BUBBLE_WIDTH;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="Open EziTerms"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        style={{
          position: 'fixed',
          top: isDroplet ? dragPos!.y : state.y,
          left: isDroplet ? dragPos!.x - DROPLET_SIZE / 2 : (state.side === 'left' ? 0 : undefined),
          right: isDroplet ? undefined : (state.side === 'right' ? 0 : undefined),
          width: bubbleW,
          height: bubbleSize,
          borderRadius: isDroplet ? '50%' : (state.side === 'left' ? '0 14px 14px 0' : '14px 0 0 14px'),
          ...glassBubble,
          cursor: isDragging ? 'grabbing' : 'pointer',
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2147483646,
          transition: isDragging ? 'border-radius 0.25s ease, width 0.25s ease, height 0.25s ease' : 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          opacity: isExiting ? 0 : 1,
          visibility: 'visible',
          animation: isExiting ? 'eziterms-bubble-pop 0.3s ease-out forwards' : (isAppearing ? 'eziterms-bubble-appear 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' : undefined),
        }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleClick(e as unknown as React.MouseEvent))}
      >
        <img
          src={
            getExtensionApi()?.runtime?.getURL?.('assets/eziterms-Logo-icon-dark-theme.png') ??
            (typeof chrome !== 'undefined' && chrome.runtime?.getURL
              ? chrome.runtime.getURL('assets/eziterms-Logo-icon-dark-theme.png')
              : '')
          }
          alt=""
          width={isDroplet ? 20 : 14}
          height={isDroplet ? 20 : 14}
          style={{
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
            objectFit: 'contain',
          }}
        />
      </div>
    </>
  );
};

export default FloatingBubble;

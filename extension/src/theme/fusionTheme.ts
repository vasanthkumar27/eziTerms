/**
 * Distil Extension Design System
 * Professional glassmorphism — Arc/Linear/Vercel aesthetic.
 * Deep-space dark base + subtle neon ambient glows + single-layer glass surfaces.
 */

export const fusion = {
  /* ---- Base ---- */
  bg: '#08080A',
  bgElevated: '#0a0a0a',
  bgCard: 'rgba(255, 255, 255, 0.03)',
  bgCardHover: 'rgba(255, 255, 255, 0.05)',
  bgInput: 'rgba(0, 0, 0, 0.25)',
  bgInputFocus: 'rgba(255, 255, 255, 0.05)',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.15)',

  /* ---- Text ---- */
  text: '#FAFAFA',
  textMuted: '#A1A1AA',
  textSubtle: '#71717A',

  /* ---- Brand ---- */
  accent: '#06B6D4',
  accent2: '#06B6D4',
  accentGlow: 'rgba(6, 182, 212, 0.4)',
  accentSoft: 'rgba(6, 182, 212, 0.1)',
  accentAmber: 'rgba(251, 146, 60, 0.95)',

  /* ---- Gradients ---- */
  gradient: 'linear-gradient(135deg, #fff 0%, rgba(255, 255, 255, 0.85) 100%)',
  gradientHover: 'linear-gradient(135deg, #ededed 0%, rgba(255, 255, 255, 0.7) 100%)',
  gradientSoft: 'linear-gradient(180deg, rgba(6, 182, 212, 0.035) 0%, transparent 100%)',

  /* ---- Ambient page glows (for wrapper background) ---- */
  ambientGlowPrimary: 'rgba(6, 182, 212, 0.12)',
  ambientGlowSecondary: 'rgba(79, 70, 229, 0.08)',

  /* ---- Glass surfaces ---- */
  glass: 'rgba(255, 255, 255, 0.03)',
  glassHover: 'rgba(255, 255, 255, 0.06)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  glassBorderStrong: 'rgba(255, 255, 255, 0.15)',
  glassBg: 'rgba(255, 255, 255, 0.02)',
  glassBgStrong: 'rgba(255, 255, 255, 0.04)',
  glassBlur: 'blur(20px)',
  glassBlurSm: 'blur(12px)',

  /* ---- Border radius ---- */
  radius: 10,
  radiusSm: 8,
  radiusLg: 14,
  radiusXl: 18,

  /* ---- Typography ---- */
  font: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontSizeXs: 11,
  fontSizeSm: 13,
  fontSizeBase: 14,
  fontSizeMd: 15,
  fontSizeLg: 16,
  fontSizeXl: 18,
  fontSize2xl: 20,
  fontWeightMedium: 500,
  fontWeightSemibold: 600,
  fontWeightBold: 700,
  lineHeightTight: 1.35,
  lineHeightNormal: 1.5,
  lineHeightRelaxed: 1.6,
  letterSpacingTight: '-0.02em',
  letterSpacingOverline: '0.1em',

  /* ---- Spacing ---- */
  space1: 4,
  space2: 8,
  space3: 12,
  space4: 16,
  space5: 20,
  space6: 24,
  space8: 32,
  space10: 40,

  /* ---- Shadows ---- */
  shadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
  shadowSm: '0 2px 8px rgba(0, 0, 0, 0.25)',
  shadowButton: '0 2px 12px rgba(0, 0, 0, 0.2)',
  shadowCard: '0 4px 12px rgba(0, 0, 0, 0.25)',
  shadowGlass: '0 8px 32px rgba(0, 0, 0, 0.4)',
  shadowAmbient: '0 12px 48px rgba(0, 0, 0, 0.5)',

  /* ---- Motion ---- */
  transition: 'all 0.2s ease',
  transitionFast: 'all 0.12s ease',
  easingSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',

  /* ---- Semantic ---- */
  successBg: 'rgba(34, 197, 94, 0.12)',
  successText: '#4ade80',
  dangerBg: 'rgba(239, 68, 68, 0.12)',
  dangerText: '#f87171',
} as const;


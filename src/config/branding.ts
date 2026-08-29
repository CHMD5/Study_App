/**
 * The single source of truth for placeholder branding.
 *
 * Replacing "Vidya Test Prep" with a real institution is an edit to THIS FILE
 * plus swapping the two SVGs in public/brand/. Nothing else in the app hardcodes
 * the org name, the product name, or the palette.
 */
export const BRAND = {
  orgName: 'Vidya Test Prep',
  productName: 'JEE Mains Test Platform',
  shortName: 'VTP',

  primary: '#1E3A8A',
  accent: '#F59E0B',
  ink: '#0F172A',
  ground: '#F8FAFC',

  logoMark: '/brand/logo-mark.svg',
  logoLockup: '/brand/logo-lockup.svg',
} as const;

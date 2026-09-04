import { editorial } from "../../theme/editorial";
export const C = {
  // Original colors (kept for backward compatibility)
  black: '#000000',
  white: '#ffffff',
  blue: '#0078D4',
  greenOriginal: '#107C10',
  redOriginal: '#C62828',
  gray: '#5F646D',
  lightGray: '#F6F9FC',
  darkGray: '#1A1F2B',
  yellow: '#F7C948',
  teal: '#00B294',
  purpleOriginal: '#6264A7',

  // PMW product palette for the form-builder workspace.
  purple: editorial.pmwBlue,           // Primary action
  purpleLight: editorial.pmwBlueDark,      // Primary hover
  purplePale: editorial.skySoft,       // Pale blue wash
  purpleMid: editorial.sky,        // Sky accent
  purpleDark: editorial.ink,       // Ink
  purpleAccent: editorial.pmwPurple,     // Secondary admin accent

  offWhite: editorial.paper,         // Workspace background
  border: editorial.border,           // Border
  borderLight: editorial.blueWash,      // Border light

  textPrimary: editorial.ink,      // Text primary
  textSecond: editorial.muted,       // Text secondary
  textMuted: editorial.softMuted,        // Text muted

  green: editorial.success,            // Success
  greenPale: editorial.successSoft,        // Success pale

  red: editorial.error,              // Error
  redPale: editorial.errorSoft,          // Error pale

  amber: editorial.warning,            // Warning
  amberPale: editorial.accentSoft,        // Warning pale

  // Shadows (very subtle)
  shadow: "0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.08), 0 8px 20px rgba(26,31,43,0.06)",
  shadowMd: "0 0 0 1px rgba(0,0,0,0.08), 0 10px 30px rgba(26,31,43,0.12)",
} as const;

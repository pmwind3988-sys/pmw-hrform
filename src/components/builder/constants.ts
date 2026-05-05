export const C = {
  // Original colors (kept for backward compatibility)
  black: '#000000',
  white: '#ffffff',
  blue: '#0078D4',
  greenOriginal: '#107C10',
  redOriginal: '#E74C3C',
  gray: '#666666',
  lightGray: '#F4F4F4',
  darkGray: '#323130',
  yellow: '#FFB900',
  teal: '#00B294',
  purpleOriginal: '#6264A7',
  
  // Zapier-style palette (clean, modern)
  purple: "#0078D4",           // Primary accent (blue, matches MUI theme)
  purpleLight: "#106EBE",      // Primary hover
  purplePale: "#E6F2FB",       // Primary pale
  purpleMid: "#B4D5F0",        // Primary mid
  purpleDark: "#005A9E",       // Primary dark
  
  offWhite: "#F9FAFB",         // Background (gray-50)
  border: "#E5E7EB",           // Border (gray-200)
  borderLight: "#F3F4F6",      // Border light (gray-100)
  
  textPrimary: "#111827",      // Text primary (gray-900)
  textSecond: "#6B7280",       // Text secondary (gray-500)
  textMuted: "#9CA3AF",        // Text muted (gray-400)
  
  green: "#059669",            // Success
  greenPale: "#D1FAE5",        // Success pale
  
  red: "#DC2626",              // Error
  redPale: "#FEE2E2",          // Error pale
  
  amber: "#D97706",            // Warning
  amberPale: "#FEF3C7",        // Warning pale
  
  // Shadows (very subtle)
  shadow: "0 1px 2px rgba(0,0,0,0.05), 0 4px 6px rgba(0,0,0,0.05)",
  shadowMd: "0 4px 6px rgba(0,0,0,0.05)",
} as const;

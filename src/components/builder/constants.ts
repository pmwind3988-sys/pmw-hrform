export const C = {
  // Original colors (kept for backward compatibility)
  black: '#000000',
  white: '#ffffff',
  blue: '#000000',
  greenOriginal: '#107C10',
  redOriginal: '#C62828',
  gray: '#5F646D',
  lightGray: '#F7F5EF',
  darkGray: '#101010',
  yellow: '#FFF546',
  teal: '#00B294',
  purpleOriginal: '#6264A7',
  
  // Editorial palette inspired by the public career experience.
  purple: "#000000",           // Primary action
  purpleLight: "#333333",      // Primary hover
  purplePale: "#EAF5FC",       // Pale blue wash
  purpleMid: "#BFDDF4",        // Sky accent
  purpleDark: "#101010",       // Ink
  
  offWhite: "#F7F5EF",         // Paper background
  border: "#D6DCE5",           // Border
  borderLight: "#E7E2D6",      // Border light
  
  textPrimary: "#101010",      // Text primary
  textSecond: "#5F646D",       // Text secondary
  textMuted: "#747B86",        // Text muted
  
  green: "#107C10",            // Success
  greenPale: "#E3F1E3",        // Success pale
  
  red: "#C62828",              // Error
  redPale: "#F8E4E4",          // Error pale
  
  amber: "#B15C00",            // Warning
  amberPale: "#FFF7BD",        // Warning pale
  
  // Shadows (very subtle)
  shadow: "0 10px 28px rgba(16,16,16,0.07)",
  shadowMd: "0 14px 36px rgba(16,16,16,0.10)",
} as const;

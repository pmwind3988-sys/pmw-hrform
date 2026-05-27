export const editorial = {
  black: "#000000",
  ink: "#101010",
  muted: "#5F646D",
  softMuted: "#747B86",
  white: "#FFFFFF",
  sky: "#BFDDF4",
  skySoft: "#DCECF8",
  blueWash: "#EAF5FC",
  paper: "#F7F5EF",
  paperSoft: "#FBFAF5",
  panel: "#FFFFFF",
  border: "#D6DCE5",
  borderStrong: "#111111",
  yellow: "#FFF546",
  pmwBlue: "#0078D4",
  pmwPurple: "#6264A7",
  success: "#107C10",
  warning: "#B15C00",
  error: "#C62828",
} as const;

export const editorialFonts = {
  sans: '"Inter", "Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
} as const;

export const editorialShadow = "0 10px 28px rgba(16, 16, 16, 0.07)";
export const editorialHairline = `1px solid ${editorial.border}`;
export const editorialInkline = `1px solid ${editorial.borderStrong}`;

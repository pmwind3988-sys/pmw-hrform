export const editorial = {
  black: "#000000",
  ink: "#101010",
  muted: "#5F646D",
  softMuted: "#747B86",
  white: "#FFFFFF",
  sky: "#BFDDF4",
  skySoft: "#EAF5FC",
  blueWash: "#EAF5FC",
  blueSoft: "#F4FAFE",
  purpleWash: "#F1F0FA",
  paper: "#F7F5EF",
  appSurface: "#F7FAFD",
  paperSoft: "#FBFAF5",
  panel: "#FFFFFF",
  border: "#D6DCE5",
  borderStrong: "#111111",
  pmwBlue: "#0078D4",
  pmwBlueDark: "#005A9E",
  pmwBlueSoft: "#D7ECFA",
  pmwPurple: "#6264A7",
  pmwPurpleDark: "#4B4D89",
  pmwPurpleSoft: "#E6E7F6",
  yellow: "#FFF546",
  yellowSoft: "#FFF8B8",
  success: "#107C10",
  warning: "#B15C00",
  error: "#C62828",
} as const;

export const editorialFonts = {
  sans: '"Inter", "Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
  serif: '"Inter", "Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
  mono: '"Inter", "Segoe UI", "Aptos", "Helvetica Neue", Arial, sans-serif',
} as const;

export const editorialShadow = "0 10px 28px rgba(16, 16, 16, 0.07)";
export const editorialHairline = `1px solid ${editorial.border}`;
export const editorialInkline = `1px solid ${editorial.borderStrong}`;

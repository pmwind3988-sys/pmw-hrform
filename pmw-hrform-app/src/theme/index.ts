import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: {
      main: "#0078D4",
      light: "#4DA3E8",
      dark: "#005A9E",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#6264A7",
      light: "#8E91C4",
      dark: "#4A4C80",
      contrastText: "#ffffff",
    },
    background: {
      default: "#ffffff",
      paper: "#ffffff",
    },
    text: {
      primary: "#1a1a2e",
      secondary: "rgba(0,0,0,0.55)",
    },
  },
  typography: {
    fontFamily: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
    h1: {
      fontSize: "2.5rem",
      fontWeight: 300,
      letterSpacing: "-0.02em",
    },
    h2: {
      fontSize: "2rem",
      fontWeight: 300,
      letterSpacing: "-0.01em",
    },
    h3: {
      fontSize: "1.75rem",
      fontWeight: 300,
      letterSpacing: "-0.02em",
    },
    body1: {
      fontSize: "1rem",
      lineHeight: 1.7,
    },
  },
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 960,
      lg: 1280,
      xl: 1920,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: "none",
          fontWeight: 500,
          padding: "12px 24px",
          transition: "all 0.2s ease",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          boxShadow: "0 2px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
          border: "1px solid rgba(0,0,0,0.04)",
        },
      },
    },
  },
});

export default theme;

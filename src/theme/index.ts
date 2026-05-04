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
    // Extended surface palette for depth
    background: {
      default: "#FAFBFC",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#1A1A2E",
      secondary: "rgba(26, 26, 46, 0.65)",
    },
    // Semantic colors refined
    success: {
      main: "#16A34A",
      light: "rgba(22, 163, 74, 0.12)",
      contrastText: "#ffffff",
    },
    warning: {
      main: "#D97706",
      light: "rgba(217, 119, 6, 0.12)",
      contrastText: "#ffffff",
    },
    error: {
      main: "#DC2626",
      light: "rgba(220, 38, 38, 0.12)",
      contrastText: "#ffffff",
    },
    // Neutral palette
    grey: {
      50: "#FAFBFC",
      100: "#F3F4F6",
      200: "#E5E7EB",
      300: "#D1D5DB",
      400: "#9CA3AF",
      500: "#6B7280",
      600: "#4B5563",
      700: "#374151",
      800: "#1F2937",
      900: "#111827",
    },
  },
  typography: {
    // Distinctive font pairing
    fontFamily: '"DM Sans", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
    h1: {
      fontSize: "2.5rem",
      fontWeight: 300,
      letterSpacing: "-0.02em",
      lineHeight: 1.2,
    },
    h2: {
      fontSize: "2rem",
      fontWeight: 300,
      letterSpacing: "-0.01em",
      lineHeight: 1.25,
    },
    h3: {
      fontSize: "1.5rem",
      fontWeight: 500,
      letterSpacing: "-0.01em",
      lineHeight: 1.3,
    },
    h4: {
      fontSize: "1.25rem",
      fontWeight: 500,
      letterSpacing: "0",
      lineHeight: 1.35,
    },
    h5: {
      fontSize: "1.1rem",
      fontWeight: 600,
      letterSpacing: "0",
      lineHeight: 1.4,
    },
    h6: {
      fontSize: "1rem",
      fontWeight: 600,
      letterSpacing: "0.01em",
      lineHeight: 1.45,
    },
    body1: {
      fontSize: "0.95rem",
      lineHeight: 1.7,
    },
    body2: {
      fontSize: "0.85rem",
      lineHeight: 1.6,
    },
    caption: {
      fontSize: "0.75rem",
      lineHeight: 1.5,
      letterSpacing: "0.02em",
    },
    button: {
      fontWeight: 500,
      letterSpacing: "0",
      textTransform: "none",
    },
  },
  shape: {
    borderRadius: 12,
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
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          // Subtle noise texture overlay
          "&::before": {
            content: '""',
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: -1,
            opacity: 0.03,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: "none",
          fontWeight: 500,
          padding: "12px 24px",
          fontSize: "0.9rem",
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: "none",
          "&:hover": {
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
          },
          "&:active": {
            transform: "scale(0.98)",
          },
        },
        contained: {
          boxShadow: "0 2px 8px rgba(0, 120, 212, 0.25)",
          "&:hover": {
            boxShadow: "0 6px 16px rgba(0, 120, 212, 0.35)",
          },
        },
        outlined: {
          borderWidth: "1.5px",
          "&:hover": {
            borderWidth: "1.5px",
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.06)",
          border: "1px solid rgba(0, 0, 0, 0.04)",
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          "&:hover": {
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1), 0 8px 32px rgba(0, 0, 0, 0.06)",
            transform: "translateY(-2px)",
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
        rounded: {
          borderRadius: 16,
        },
        elevation1: {
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04), 0 2px 8px rgba(0, 0, 0, 0.06)",
        },
        elevation2: {
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(0, 0, 0, 0.08)",
        },
        elevation3: {
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.1)",
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 12,
            transition: "all 0.2s ease",
            "&:hover": {
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: "rgba(0, 120, 212, 0.5)",
              },
            },
            "&.Mui-focused": {
              boxShadow: "0 0 0 4px rgba(0, 120, 212, 0.1)",
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
          fontSize: "0.8rem",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 24,
          boxShadow: "0 8px 40px rgba(0, 0, 0, 0.15)",
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.12)",
          border: "1px solid rgba(0, 0, 0, 0.06)",
          marginTop: 8,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: "2px 6px",
          padding: "10px 12px",
          transition: "all 0.15s ease",
          "&:hover": {
            backgroundColor: "rgba(0, 120, 212, 0.08)",
          },
          "&.Mui-selected": {
            backgroundColor: "rgba(0, 120, 212, 0.12)",
            "&:hover": {
              backgroundColor: "rgba(0, 120, 212, 0.16)",
            },
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          backgroundColor: "rgba(0, 120, 212, 0.1)",
        },
        bar: {
          borderRadius: 6,
        },
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: {
          color: "#0078D4",
        },
      },
    },
  },
});

export default theme;

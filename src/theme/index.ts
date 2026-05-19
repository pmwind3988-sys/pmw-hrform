import { createTheme, keyframes } from "@mui/material/styles";

const fadeInUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

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
      default: "#F8F9FC",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#111827",
      secondary: "#6B7280",
    },
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
    grey: {
      50: "#F8F9FC",
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
    fontFamily: '"DM Sans", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
    h1: {
      fontSize: "3rem",
      fontWeight: 700,
      letterSpacing: "-0.04em",
      lineHeight: 1.15,
    },
    h2: {
      fontSize: "2.25rem",
      fontWeight: 700,
      letterSpacing: "-0.03em",
      lineHeight: 1.2,
    },
    h3: {
      fontSize: "1.75rem",
      fontWeight: 600,
      letterSpacing: "-0.02em",
      lineHeight: 1.25,
    },
    h4: {
      fontSize: "1.35rem",
      fontWeight: 600,
      letterSpacing: "-0.01em",
      lineHeight: 1.3,
    },
    h5: {
      fontSize: "1.15rem",
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
      lineHeight: 1.6,
      fontWeight: 400,
    },
    body2: {
      fontSize: "0.875rem",
      lineHeight: 1.55,
      fontWeight: 400,
    },
    caption: {
      fontSize: "0.75rem",
      lineHeight: 1.5,
      letterSpacing: "0.01em",
      fontWeight: 500,
    },
    button: {
      fontWeight: 500,
      letterSpacing: "0",
      textTransform: "none",
      fontSize: "0.9rem",
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
          minHeight: "100vh",
          background: "var(--app-bg, linear-gradient(145deg, #eef0f7 0%, rgba(248,249,252,0.88) 40%, #f4f0f8 100%))",
          "&::before": {
            content: '""',
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: -1,
            opacity: 0.025,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          },
          "&::after": {
            content: '""',
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: -1,
            opacity: 0.04,
            backgroundImage: `radial-gradient(ellipse at 20% 50%, rgba(98,100,167,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(0,120,212,0.08) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(98,100,167,0.06) 0%, transparent 50%)`,
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
          padding: "14px 28px",
          fontSize: "0.9rem",
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: "none",
          "&:hover": {
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
            transform: "translateY(-1px)",
          },
          "&:active": {
            transform: "scale(0.98) translateY(0)",
          },
        },
        contained: {
          boxShadow: "0 2px 8px rgba(0, 120, 212, 0.2)",
          "&:hover": {
            boxShadow: "0 6px 20px rgba(0, 120, 212, 0.3)",
          },
        },
        outlined: {
          borderWidth: "1.5px",
          "&:hover": {
            borderWidth: "1.5px",
          },
        },
        sizeLarge: {
          padding: "16px 32px",
          fontSize: "1rem",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.04)",
          border: "1px solid rgba(0, 0, 0, 0.04)",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          "&:hover": {
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)",
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
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04), 0 2px 8px rgba(0, 0, 0, 0.04)",
        },
        elevation2: {
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04), 0 6px 16px rgba(0, 0, 0, 0.06)",
        },
        elevation3: {
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.06), 0 12px 32px rgba(0, 0, 0, 0.08)",
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 12,
            transition: "all 0.2s ease",
            backgroundColor: "#FFFFFF",
            "&:hover": {
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: "rgba(0, 120, 212, 0.4)",
              },
            },
            "&.Mui-focused": {
              boxShadow: "0 0 0 3px rgba(0, 120, 212, 0.1)",
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
          height: 28,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 24,
          boxShadow: "0 8px 40px rgba(0, 0, 0, 0.12)",
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.1)",
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
          backgroundColor: "rgba(255, 255, 255, 0.9)",
          backdropFilter: "blur(16px)",
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
          height: 6,
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
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: "all 0.2s ease",
          "&:hover": {
            backgroundColor: "rgba(0, 120, 212, 0.08)",
          },
        },
      },
    },
  },
});

export { fadeInUp };
export default theme;

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
      default: "#F6F8FB",
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
      letterSpacing: "0",
      lineHeight: 1.15,
    },
    h2: {
      fontSize: "2.25rem",
      fontWeight: 700,
      letterSpacing: "0",
      lineHeight: 1.2,
    },
    h3: {
      fontSize: "1.75rem",
      fontWeight: 600,
      letterSpacing: "0",
      lineHeight: 1.25,
    },
    h4: {
      fontSize: "1.35rem",
      fontWeight: 600,
      letterSpacing: "0",
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
    borderRadius: 8,
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
          background: "var(--app-bg, linear-gradient(180deg, #F6F8FB 0%, #EEF3F8 100%))",
        },
        "#root": {
          minHeight: "100vh",
        },
        img: {
          maxWidth: "100%",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: "none",
          fontWeight: 600,
          padding: "10px 18px",
          fontSize: "0.9rem",
          transition: "background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
          boxShadow: "none",
          "&:hover": {
            boxShadow: "0 3px 10px rgba(17, 24, 39, 0.08)",
          },
        },
        contained: {
          boxShadow: "0 2px 8px rgba(0, 120, 212, 0.18)",
          "&:hover": {
            boxShadow: "0 5px 16px rgba(0, 120, 212, 0.24)",
          },
        },
        outlined: {
          borderWidth: "1.5px",
          "&:hover": {
            borderWidth: "1.5px",
          },
        },
        sizeLarge: {
          padding: "12px 24px",
          fontSize: "1rem",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: "0 1px 2px rgba(17, 24, 39, 0.05), 0 4px 12px rgba(17, 24, 39, 0.05)",
          border: "1px solid rgba(17, 24, 39, 0.08)",
          transition: "box-shadow 0.2s ease, border-color 0.2s ease",
          "&:hover": {
            boxShadow: "0 8px 20px rgba(17, 24, 39, 0.08)",
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
          borderRadius: 8,
        },
        elevation1: {
          boxShadow: "0 1px 2px rgba(17, 24, 39, 0.05), 0 4px 12px rgba(17, 24, 39, 0.05)",
        },
        elevation2: {
          boxShadow: "0 2px 6px rgba(17, 24, 39, 0.06), 0 8px 20px rgba(17, 24, 39, 0.06)",
        },
        elevation3: {
          boxShadow: "0 8px 24px rgba(17, 24, 39, 0.08), 0 16px 40px rgba(17, 24, 39, 0.08)",
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 8,
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
          borderRadius: 6,
          fontWeight: 500,
          fontSize: "0.8rem",
          height: 28,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 10,
          boxShadow: "0 12px 40px rgba(17, 24, 39, 0.14)",
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(17, 24, 39, 0.12)",
          border: "1px solid rgba(17, 24, 39, 0.08)",
          marginTop: 8,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 6,
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
          backgroundColor: "rgba(255, 255, 255, 0.96)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(17, 24, 39, 0.08)",
          boxShadow: "0 1px 2px rgba(17, 24, 39, 0.05)",
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
          borderRadius: 8,
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

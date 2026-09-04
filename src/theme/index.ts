import { createTheme, keyframes } from "@mui/material/styles";
import {
  editorial,
  editorialFonts,
  editorialHairline,
  si,
  siFocusRing,
  siTracking,
} from "./editorial";

/**
 * The entrance animation, ported from SI's `.rise`.
 *
 * Kept under the name `fadeInUp` because a dozen call sites animate with it;
 * only the values changed. The travel is 10px rather than 20px and the curve is
 * shorter — SI's entrance is a settle, not a slide.
 */
const fadeInUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const alertSurfaceShadow = si.shadow;

/** The canvas fill SI puts behind inputs and table headers. */
const canvasFill = editorial.appSurface;

const theme = createTheme({
  palette: {
    primary: {
      main: editorial.pmwBlue,
      light: editorial.navyMid,
      dark: editorial.pmwBlueDark,
      contrastText: editorial.white,
    },
    secondary: {
      main: editorial.pmwPurple,
      light: editorial.navyLine,
      dark: editorial.pmwPurpleDark,
      contrastText: editorial.white,
    },
    background: {
      default: editorial.skySoft,
      paper: editorial.panel,
    },
    text: {
      primary: editorial.ink,
      secondary: editorial.muted,
    },
    success: {
      main: editorial.successFill,
      light: editorial.successSoft,
      dark: editorial.success,
      contrastText: editorial.ink,
    },
    warning: {
      main: editorial.warningFill,
      light: editorial.warningSoft,
      dark: editorial.warning,
      contrastText: editorial.ink,
    },
    error: {
      main: editorial.errorFill,
      light: editorial.errorSoft,
      dark: editorial.error,
      contrastText: editorial.white,
    },
    grey: {
      50: "#FAFBFD",
      100: "#F6F8FB",
      200: "#EEF2F9",
      300: "#E5E9F0",
      400: "#A9B4C6",
      500: "#6E7B92",
      600: "#5A6880",
      700: "#3D4859",
      800: "#232B38",
      900: "#101828",
    },
  },
  /**
   * SI's type scale, taken literally (`docs/SI_Design_System.md` §2.2).
   *
   * One family at four weights. Titles are Bold with -0.01em tracking, card
   * titles Semibold, body Regular, and uppercase appears only on the micro
   * label. The scale is deliberately dense and top-to-bottom small — 21px is a
   * *page title* here, not a heading-shaped decoration — because that density
   * is what makes SI read as an enterprise tool rather than a brochure.
   *
   * The two display headings in this app (the careers hero, the dashboard
   * header) set their own `fontSize` inline, and inline `sx` outranks the
   * theme, so they keep their size and simply inherit the weight and tracking.
   */
  typography: {
    fontFamily: editorialFonts.sans,
    /** SI H1 — page title. */
    h1: {
      fontFamily: editorialFonts.sans,
      fontSize: "1.3125rem",
      fontWeight: 700,
      letterSpacing: siTracking.title,
      lineHeight: 1.3,
    },
    /** SI H2 — section title, upper end of its 17–19px range. */
    h2: {
      fontFamily: editorialFonts.sans,
      fontSize: "1.1875rem",
      fontWeight: 700,
      letterSpacing: siTracking.title,
      lineHeight: 1.3,
    },
    /** SI H2 — lower end, for a subsection under an h2. */
    h3: {
      fontSize: "1.0625rem",
      fontWeight: 700,
      letterSpacing: siTracking.title,
      lineHeight: 1.3,
    },
    /** SI card title, bold end of its 14–15px range. */
    h4: {
      fontSize: "0.9375rem",
      fontWeight: 700,
      letterSpacing: siTracking.title,
      lineHeight: 1.4,
    },
    /** SI card title, semibold. */
    h5: {
      fontSize: "0.875rem",
      fontWeight: 600,
      letterSpacing: "0",
      lineHeight: 1.4,
    },
    /** Smallest title: a label that still outranks the body beside it. */
    h6: {
      fontSize: "0.845rem",
      fontWeight: 600,
      letterSpacing: "0",
      lineHeight: 1.4,
    },
    subtitle1: {
      fontSize: "0.9375rem",
      fontWeight: 600,
      lineHeight: 1.4,
    },
    subtitle2: {
      fontSize: "0.845rem",
      fontWeight: 600,
      lineHeight: 1.45,
    },
    body1: {
      fontSize: "0.845rem",
      lineHeight: 1.5,
      fontWeight: 400,
    },
    body2: {
      fontSize: "0.78rem",
      lineHeight: 1.45,
      fontWeight: 400,
    },
    caption: {
      fontSize: "0.78rem",
      lineHeight: 1.4,
      letterSpacing: "0",
      fontWeight: 500,
    },
    /** SI's micro / eyebrow label: the only place uppercase is allowed. */
    overline: {
      fontSize: "0.72rem",
      lineHeight: 1.3,
      fontWeight: 700,
      letterSpacing: siTracking.micro,
      textTransform: "uppercase",
    },
    button: {
      fontFamily: editorialFonts.sans,
      fontWeight: 600,
      letterSpacing: "0",
      textTransform: "none",
      fontSize: "0.845rem",
    },
  },
  shape: {
    borderRadius: si.radius,
  },
  zIndex: {
    snackbar: 20000,
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
          background: `var(--app-bg, ${editorial.paper})`,
          color: editorial.ink,
          textRendering: "optimizeLegibility",
        },
        "#root": {
          minHeight: "100vh",
        },
        "h1, h2, h3, h4, h5, h6": {
          textWrap: "balance",
        },
        "p, li, figcaption, blockquote": {
          textWrap: "pretty",
        },
        "::selection": {
          background: editorial.pmwBlueSoft,
          color: editorial.ink,
        },
        img: {
          maxWidth: "100%",
          height: "auto",
          outline: "1px solid rgba(0, 0, 0, 0.1)",
          outlineOffset: "-1px",
        },
        // SI's rule is that focus is visible on *every* interactive element,
        // with no exemption for quiet controls. Declared once here rather than
        // per component so a control added later inherits it.
        ":focus-visible": siFocusRing,
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: si.radius,
          textTransform: "none",
          fontWeight: 600,
          // SI's medium button: 10px vertical / 16px horizontal.
          padding: "10px 16px",
          fontSize: "0.845rem",
          transition: "background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease",
          boxShadow: "none",
          // SI communicates press by darkening the fill, not by moving the
          // button. The old lift-on-hover fought the card shadows underneath.
          "&:hover": {
            boxShadow: "none",
          },
          "&:focus-visible": siFocusRing,
          "&.Mui-disabled": {
            opacity: 0.5,
          },
        },
        contained: {
          backgroundColor: editorial.pmwBlue,
          color: editorial.white,
          border: `1px solid ${editorial.pmwBlue}`,
          boxShadow: "none",
          "&:hover": {
            backgroundColor: editorial.pmwBlueDark,
            borderColor: editorial.pmwBlueDark,
            boxShadow: "none",
          },
        },
        outlined: {
          color: editorial.pmwBlueDark,
          borderColor: editorial.pmwBlue,
          // SI's ghost button carries a 1.5px border so it holds its own next
          // to a filled button without needing a fill of its own.
          borderWidth: "1.5px",
          backgroundColor: "transparent",
          "&:hover": {
            borderWidth: "1.5px",
            backgroundColor: editorial.blueWash,
            borderColor: editorial.pmwBlueDark,
          },
        },
        text: {
          // SI's "subtle" tertiary variant: a canvas fill on hover, no border.
          "&:hover": {
            backgroundColor: canvasFill,
          },
        },
        sizeSmall: {
          padding: "7px 12px",
          fontSize: "0.78rem",
        },
        sizeLarge: {
          padding: "12px 22px",
          fontSize: "0.9375rem",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: si.radius,
          // One elevation, applied uniformly. In SI no card is deeper than
          // another: hierarchy comes from size and position, so hover shifts
          // the border tint only and the page never shuffles depth on mouseover.
          boxShadow: si.shadow,
          border: editorialHairline,
          transition: "border-color 0.2s ease",
          "&:hover": {
            borderColor: "rgba(0, 120, 212, 0.36)",
          },
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: si.padLoose,
          "&:last-child": {
            paddingBottom: si.padLoose,
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
          borderRadius: si.radius,
        },
        elevation1: {
          boxShadow: si.shadow,
          border: editorialHairline,
        },
        elevation2: {
          boxShadow: si.shadow,
          border: editorialHairline,
        },
        // Lifted surfaces only — dialogs, popovers, panels that float over the
        // page and need to read as detached rather than merely present.
        elevation3: {
          boxShadow: si.shadowRaised,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: si.radius,
            transition: "background-color 0.2s ease, box-shadow 0.2s ease",
            // SI fills inputs with the canvas grey so a field reads as a slot
            // you type into rather than as another white card on white.
            backgroundColor: canvasFill,
            "&:hover": {
              backgroundColor: editorial.white,
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: editorial.pmwBlue,
              },
            },
            "&.Mui-focused": {
              backgroundColor: editorial.white,
              boxShadow: "0 0 0 3px rgba(0, 120, 212, 0.16)",
            },
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: si.radius,
          backgroundColor: canvasFill,
          "&.Mui-focused": {
            backgroundColor: editorial.white,
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: "0.845rem",
          fontWeight: 500,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          // A badge is a tag, not a container: 5px, tighter than everything
          // else in the system, so a row carrying two of them doesn't read as
          // a row of little boxes.
          borderRadius: si.radiusBadge,
          fontWeight: 700,
          fontSize: "0.75rem",
          height: 24,
          border: editorialHairline,
          letterSpacing: "0",
        },
        label: {
          paddingLeft: 8,
          paddingRight: 8,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: si.radius,
          boxShadow: si.shadowRaised,
          border: editorialHairline,
        },
      },
    },
    MuiMenu: {
      defaultProps: {
        // Modal's scroll lock puts `overflow: hidden` + scrollbar-compensation
        // padding on <body>, which shunts the centered layout sideways every
        // time a dropdown opens. Dialogs still lock; anchored menus don't need to.
        disableScrollLock: true,
      },
      styleOverrides: {
        paper: {
          borderRadius: si.radius,
          boxShadow: si.shadowRaised,
          border: editorialHairline,
          marginTop: 8,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          // The inner radius: nested inside a 12px container, 8px keeps the
          // gap between the item's corner and the panel's visually even.
          borderRadius: si.radiusSm,
          margin: "2px 6px",
          padding: "9px 10px",
          fontSize: "0.845rem",
          transition: "background-color 0.15s ease, color 0.15s ease",
          "&:hover": {
            backgroundColor: editorial.blueWash,
          },
          "&.Mui-selected": {
            backgroundColor: editorial.blueWash,
            "&:hover": {
              backgroundColor: editorial.pmwBlueSoft,
            },
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: si.radiusSm,
          backgroundColor: editorial.ink,
          fontSize: "0.75rem",
          fontWeight: 500,
          padding: "7px 10px",
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          borderRadius: si.radius,
          textTransform: "none",
          fontWeight: 600,
          fontSize: "0.845rem",
          minHeight: 42,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          border: "1px solid transparent",
          borderRadius: si.radius,
          boxShadow: alertSurfaceShadow,
          fontWeight: 600,
          opacity: 1,
          // Each severity is matched TWICE on purpose. MUI used to emit one
          // fused class (`MuiAlert-standardError`); from v6 it emits the
          // variant and the colour separately (`MuiAlert-standard` +
          // `MuiAlert-colorError`). On v9 the fused selectors match nothing, so
          // every Alert in the app fell back to MUI's defaults — which render
          // standard-variant text at 12% alpha, i.e. all but invisible. Keep
          // both shapes so the theme survives a version move in either
          // direction.
          "&.MuiAlert-standardSuccess, &.MuiAlert-outlinedSuccess, &.MuiAlert-colorSuccess.MuiAlert-standard, &.MuiAlert-colorSuccess.MuiAlert-outlined": {
            backgroundColor: editorial.successSoft,
            borderColor: editorial.successFill,
            color: editorial.ink,
          },
          "&.MuiAlert-standardWarning, &.MuiAlert-outlinedWarning, &.MuiAlert-colorWarning.MuiAlert-standard, &.MuiAlert-colorWarning.MuiAlert-outlined": {
            backgroundColor: editorial.warningSoft,
            borderColor: editorial.warningFill,
            color: editorial.ink,
          },
          "&.MuiAlert-standardError, &.MuiAlert-outlinedError, &.MuiAlert-colorError.MuiAlert-standard, &.MuiAlert-colorError.MuiAlert-outlined": {
            backgroundColor: editorial.errorSoft,
            borderColor: editorial.errorFill,
            color: editorial.ink,
          },
          "&.MuiAlert-standardInfo, &.MuiAlert-outlinedInfo, &.MuiAlert-colorInfo.MuiAlert-standard, &.MuiAlert-colorInfo.MuiAlert-outlined": {
            backgroundColor: editorial.blueSoft,
            borderColor: editorial.pmwBlueSoft,
            color: editorial.ink,
          },
          "&.MuiAlert-filledSuccess, &.MuiAlert-colorSuccess.MuiAlert-filled": {
            backgroundColor: editorial.successFill,
            color: editorial.ink,
          },
          "&.MuiAlert-filledWarning, &.MuiAlert-colorWarning.MuiAlert-filled": {
            backgroundColor: editorial.warningFill,
            color: editorial.ink,
          },
          "&.MuiAlert-filledError, &.MuiAlert-colorError.MuiAlert-filled": {
            backgroundColor: editorial.errorFill,
            color: editorial.white,
          },
          "&.MuiAlert-filledInfo, &.MuiAlert-colorInfo.MuiAlert-filled": {
            backgroundColor: editorial.pmwBlue,
            color: editorial.white,
          },
        },
        message: {
          color: "inherit",
          fontWeight: 600,
          lineHeight: 1.5,
          padding: "8px 0",
        },
        icon: {
          alignItems: "center",
          opacity: 1,
        },
        action: {
          alignItems: "center",
          color: "inherit",
          paddingTop: 0,
        },
      },
    },
    MuiSnackbar: {
      styleOverrides: {
        root: {
          zIndex: 20000,
          "& .MuiAlert-root": {
            alignItems: "center",
            backgroundColor: editorial.white,
            border: `1px solid ${editorial.pmwBlueSoft}`,
            borderRadius: si.radius,
            boxShadow: si.shadowRaised,
            color: editorial.ink,
            fontWeight: 600,
            opacity: 1,
          },
          "& .MuiAlert-message": {
            color: editorial.ink,
            fontWeight: 600,
            lineHeight: 1.45,
            padding: "8px 0",
          },
          "& .MuiAlert-icon": {
            alignItems: "center",
            opacity: 1,
          },
          "& .MuiAlert-action": {
            alignItems: "center",
            color: editorial.ink,
            paddingTop: 0,
          },
          "& .MuiAlert-standardSuccess, & .MuiAlert-filledSuccess, & .MuiAlert-outlinedSuccess": {
            borderColor: "rgba(16, 124, 16, 0.24)",
          },
          "& .MuiAlert-standardError, & .MuiAlert-filledError, & .MuiAlert-outlinedError": {
            borderColor: "rgba(198, 40, 40, 0.28)",
          },
          "& .MuiAlert-standardWarning, & .MuiAlert-filledWarning, & .MuiAlert-outlinedWarning": {
            borderColor: "rgba(177, 92, 0, 0.28)",
          },
          "& .MuiAlert-standardInfo, & .MuiAlert-filledInfo, & .MuiAlert-outlinedInfo": {
            borderColor: editorial.pmwBlueSoft,
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "rgba(255, 255, 255, 0.82)",
          backdropFilter: "blur(16px)",
          // No shadow on the top bar: SI leaves the separation to the single
          // hairline, so the bar doesn't compete with the cards below it.
          borderBottom: editorialHairline,
          boxShadow: "none",
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          backgroundColor: "rgba(16, 16, 16, 0.1)",
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
          color: editorial.pmwBlue,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: "background-color 0.2s ease, color 0.2s ease",
          borderRadius: si.radiusSm,
          // SI's mobile floor for anything tappable, applied everywhere so a
          // toolbar icon is the same target on a phone as on a desktop.
          minWidth: si.touchTarget,
          minHeight: si.touchTarget,
          "&:hover": {
            backgroundColor: editorial.blueWash,
          },
          "&:focus-visible": siFocusRing,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          // A very light canvas tint on hover, matching SI's list rows.
          "&:hover": {
            backgroundColor: canvasFill,
          },
        },
        head: {
          "&:hover": {
            backgroundColor: "transparent",
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          // SI's table header: canvas fill, uppercase micro-label in the
          // secondary ink, and no divider heavier than the body's hairlines.
          backgroundColor: canvasFill,
          color: editorial.muted,
          fontWeight: 700,
          fontSize: "0.72rem",
          textTransform: "uppercase",
          letterSpacing: siTracking.micro,
          borderBottom: editorialHairline,
        },
        body: {
          borderBottom: editorialHairline,
          fontSize: "0.845rem",
          fontVariantNumeric: "tabular-nums",
          // 44px minimum row height, 52px once a cell stacks two lines.
          paddingTop: 11,
          paddingBottom: 11,
        },
      },
    },
  },
});

export { fadeInUp };
export default theme;

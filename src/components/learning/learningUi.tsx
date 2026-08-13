import type { ReactNode } from "react";
import { Box, Paper, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import {
  ImageOutlined,
  InsertDriveFileOutlined,
  PictureAsPdfOutlined,
  PlayCircleOutlined,
  DescriptionOutlined,
} from "@mui/icons-material";
import { editorial, editorialHairline, editorialShadow } from "../../theme/editorial";
import type { LearningMaterialKind } from "../../types";

export const learningPageSx = {
  minHeight: "100vh",
  background: "var(--app-bg, linear-gradient(180deg, #EEF6FC 0%, #F7FAFD 46%, #FFFFFF 100%))",
  WebkitFontSmoothing: "antialiased",
} satisfies SxProps<Theme>;

export const learningContentSx = {
  maxWidth: 1440,
  mx: "auto",
  px: { xs: 2, sm: 3, md: 4 },
  py: { xs: 2.5, sm: 3.5, md: 4 },
} satisfies SxProps<Theme>;

export const learningPanelSx = {
  borderRadius: "12px",
  boxShadow: editorialShadow,
  backgroundColor: "rgba(255, 255, 255, 0.94)",
  backgroundImage: "none",
  border: editorialHairline,
} satisfies SxProps<Theme>;

export const learningButtonSx = {
  borderRadius: "8px",
  textTransform: "none",
  fontWeight: 800,
  minHeight: 40,
  transition: "background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease",
  "&:active": { transform: "scale(0.96)" },
} satisfies SxProps<Theme>;

/**
 * Every motion in the hub — the hover preview, the image cross-fade, the card
 * lift — is decorative. Anyone who has asked their system for less of it gets
 * the still frame instead.
 */
export const learningReduceMotionSx = {
  "@media (prefers-reduced-motion: reduce)": {
    animation: "none",
    transition: "none",
    transform: "none",
    "&:hover": { transform: "none" },
    "&:active": { transform: "none" },
  },
} satisfies SxProps<Theme>;

interface KindStyle {
  label: string;
  color: string;
  wash: string;
  icon: ReactNode;
}

export function kindStyle(kind: LearningMaterialKind): KindStyle {
  switch (kind) {
    case "video":
      return {
        label: "Video",
        color: editorial.pmwPurpleDark,
        wash: editorial.purpleWash,
        icon: <PlayCircleOutlined />,
      };
    case "image":
      return {
        label: "Image",
        color: editorial.success,
        wash: "#E8F5E9",
        icon: <ImageOutlined />,
      };
    case "pdf":
      return {
        label: "PDF",
        color: editorial.error,
        wash: "#FDECEC",
        icon: <PictureAsPdfOutlined />,
      };
    case "document":
      return {
        label: "Document",
        color: editorial.pmwBlueDark,
        wash: editorial.blueWash,
        icon: <DescriptionOutlined />,
      };
    default:
      return {
        label: "File",
        color: editorial.muted,
        wash: editorial.paperSoft,
        icon: <InsertDriveFileOutlined />,
      };
  }
}

export function LearningEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Paper sx={{ ...learningPanelSx, p: { xs: 3, md: 5 }, textAlign: "center" }}>
      <Box
        sx={{
          width: 56,
          height: 56,
          mx: "auto",
          mb: 2,
          borderRadius: "14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: editorial.blueWash,
          color: editorial.pmwBlueDark,
          "& .MuiSvgIcon-root": { fontSize: 28 },
        }}
      >
        {icon}
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 900, color: editorial.ink, textWrap: "balance" }}>
        {title}
      </Typography>
      <Typography
        variant="body2"
        sx={{ color: editorial.muted, fontWeight: 600, mt: 0.75, maxWidth: 480, mx: "auto", textWrap: "pretty" }}
      >
        {description}
      </Typography>
      {action && <Box sx={{ mt: 2.5 }}>{action}</Box>}
    </Paper>
  );
}

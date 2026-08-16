import type { ReactNode } from "react";
import { Box, Container, IconButton, Paper, Stack, Typography } from "@mui/material";
import { ArrowBack } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import Logo from "../Logo";
import { editorial, editorialHairline } from "../../theme/editorial";
import { learningButtonSx, learningReduceMotionSx } from "./learningUi";

interface LearningHeaderProps {
  title: string;
  subtitle: string;
  backPath: string;
  backLabel: string;
  actions?: ReactNode;
  /**
   * Off for a portal account, which has no dashboard behind this page — a back
   * arrow that only ever returns here is worse than no arrow.
   */
  showBack?: boolean;
}

export default function LearningHeader({
  title,
  subtitle,
  backPath,
  backLabel,
  actions,
  showBack = true,
}: LearningHeaderProps) {
  const navigate = useNavigate();

  return (
    <Paper
      sx={{
        borderRadius: 0,
        boxShadow: "none",
        backgroundColor: "rgba(255, 255, 255, 0.9)",
        backdropFilter: "blur(14px)",
        borderBottom: editorialHairline,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <Container maxWidth="xl">
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: { xs: 1, sm: 2 },
            py: { xs: 1, md: 1.75 },
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, sm: 1.5 }, minWidth: 0 }}>
            {showBack && (
              <IconButton
                onClick={() => navigate(backPath)}
                aria-label={backLabel}
                sx={{
                  color: editorial.pmwBlueDark,
                  flexShrink: 0,
                  transition: "transform 0.18s ease, background-color 0.18s ease",
                  "&:hover": { transform: "translateX(-2px)", backgroundColor: editorial.blueWash },
                  ...learningReduceMotionSx,
                }}
              >
                <ArrowBack />
              </IconButton>
            )}
            <Box
              sx={{
                width: { xs: 38, sm: 46 },
                height: { xs: 38, sm: 46 },
                borderRadius: "10px",
                border: `1px solid ${editorial.pmwBlueSoft}`,
                display: { xs: "none", sm: "flex" },
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255, 255, 255, 0.85)",
                flexShrink: 0,
                overflow: "hidden",
              }}
            >
              <Logo size={{ xs: 30, sm: 38 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="h5"
                component="h1"
                sx={{
                  fontWeight: 800,
                  color: editorial.ink,
                  fontSize: { xs: "1.05rem", sm: "1.3rem", md: "1.45rem" },
                  lineHeight: 1.15,
                  letterSpacing: 0,
                  textWrap: "balance",
                }}
              >
                {title}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: editorial.muted,
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  display: { xs: "none", md: "block" },
                }}
              >
                {subtitle}
              </Typography>
            </Box>
          </Box>

          {actions && (
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: "center",
                flexShrink: 0,
                "& > .MuiButton-root": { ...learningButtonSx, ...learningReduceMotionSx },
              }}
            >
              {actions}
            </Stack>
          )}
        </Box>
      </Container>
    </Paper>
  );
}

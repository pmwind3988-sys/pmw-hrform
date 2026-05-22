import type { ReactNode } from "react";
import {
  Box,
  Button,
  Chip,
  Container,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import {
  ArrowBack,
  AssignmentInd,
  Edit,
  PrivacyTip,
  WorkOutlined,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import Logo from "../Logo";

type CareerPortalSection = "opportunities" | "applications" | "manage" | "apply";

interface CareerPortalHeaderProps {
  title: string;
  subtitle: string;
  activeSection: CareerPortalSection;
  isAdmin?: boolean;
  backPath: string;
  backLabel: string;
  maxWidth?: "md" | "lg" | "xl";
  actions?: ReactNode;
  showSectionNav?: boolean;
  showPrivacyLink?: boolean;
}

const sectionItems: {
  section: CareerPortalSection;
  label: string;
  path: string;
  adminOnly?: boolean;
  icon: ReactNode;
}[] = [
  { section: "opportunities", label: "Opportunities", path: "/career-portal", icon: <WorkOutlined /> },
  { section: "applications", label: "Applications", path: "/admin/career/applications", adminOnly: true, icon: <AssignmentInd /> },
  { section: "manage", label: "Manage Openings", path: "/admin/career/opportunities", adminOnly: true, icon: <Edit /> },
];

export default function CareerPortalHeader({
  title,
  subtitle,
  activeSection,
  isAdmin = false,
  backPath,
  backLabel,
  maxWidth = "lg",
  actions,
  showSectionNav = true,
  showPrivacyLink = true,
}: CareerPortalHeaderProps) {
  const navigate = useNavigate();
  const visibleSections = sectionItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <Paper
      sx={{
        borderRadius: 0,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        backgroundColor: "#ffffff",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <Container maxWidth={maxWidth}>
        <Box
          sx={{
            display: "flex",
            alignItems: { xs: "stretch", md: "center" },
            justifyContent: "space-between",
            gap: { xs: 1.25, sm: 1.5, md: 2 },
            py: { xs: 1.25, sm: 2 },
            flexDirection: { xs: "column", md: "row" },
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
            <IconButton
              onClick={() => navigate(backPath)}
              aria-label={backLabel}
              sx={{ color: "#6B7280", p: { xs: 0.75, sm: 1 }, flexShrink: 0 }}
            >
              <ArrowBack />
            </IconButton>
            <Box
              sx={{
                width: { xs: 38, sm: 46 },
                height: { xs: 38, sm: 46 },
                borderRadius: "8px",
                border: "1px solid rgba(17, 24, 39, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#ffffff",
                flexShrink: 0,
              }}
            >
              <Logo size={{ xs: 30, sm: 38 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.25, flexWrap: "wrap" }}>
                <Chip
                  label="Internal Career Advancement"
                  size="small"
                  sx={{
                    height: 22,
                    borderRadius: "8px",
                    backgroundColor: "#E6F4EA",
                    color: "#2E7D32",
                    fontWeight: 700,
                    fontSize: "0.68rem",
                  }}
                />
              </Stack>
              <Typography
                variant="h5"
                component="h1"
                sx={{
                  fontWeight: 700,
                  color: "#111827",
                  fontSize: { xs: "1.05rem", sm: "1.3rem" },
                  lineHeight: 1.2,
                  letterSpacing: 0,
                }}
              >
                {title}
              </Typography>
              <Typography variant="body2" sx={{ color: "#6B7280", fontSize: { xs: "0.75rem", sm: "0.85rem" } }}>
                {subtitle}
              </Typography>
            </Box>
          </Box>

          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              justifyContent: { xs: "stretch", md: "flex-end" },
              flexWrap: "wrap",
              flexShrink: 0,
              "& > .MuiButton-root": {
                borderRadius: "8px",
                textTransform: "none",
                fontWeight: 700,
                fontSize: { xs: "0.72rem", sm: "0.82rem" },
                minHeight: 36,
              },
            }}
          >
            {showSectionNav && visibleSections.map((item) => {
              const selected = activeSection === item.section;
              return (
                <Button
                  key={item.section}
                  variant={selected ? "contained" : "outlined"}
                  startIcon={item.icon}
                  onClick={() => navigate(item.path)}
                  sx={{
                    flex: { xs: "1 1 auto", md: "0 0 auto" },
                    whiteSpace: "nowrap",
                    backgroundColor: selected ? "#0078D4" : "#ffffff",
                    color: selected ? "#ffffff" : "#374151",
                    borderColor: selected ? "#0078D4" : "#D1D5DB",
                    "&:hover": {
                      backgroundColor: selected ? "#106EBE" : "#F8FAFC",
                      borderColor: selected ? "#106EBE" : "#9CA3AF",
                    },
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
            {actions}
            {showPrivacyLink && (
              <Button
                variant="text"
                startIcon={<PrivacyTip />}
                onClick={() => navigate("/privacy")}
                sx={{
                  color: "#6B7280",
                  flex: { xs: "1 1 auto", md: "0 0 auto" },
                  whiteSpace: "nowrap",
                }}
              >
                Privacy
              </Button>
            )}
          </Stack>
        </Box>
      </Container>
    </Paper>
  );
}

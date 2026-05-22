import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  Divider,
  Link,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ShieldIcon from "@mui/icons-material/Shield";
import {
  PDPA_CONTACT_EMAIL,
  PDPA_CONTROLLER_NAME,
  PDPA_NOTICE_SECTIONS,
  PDPA_NOTICE_VERSION,
} from "../utils/pdpa";

export default function PrivacyNoticePage() {
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: "100vh", background: "var(--app-bg, #F6F8FB)", py: { xs: 3, md: 5 } }}>
      <Container maxWidth="md">
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(-1)}
          sx={{ mb: 2, textTransform: "none", color: "#4B5563", fontWeight: 600 }}
        >
          Back
        </Button>

        <Paper sx={{ borderRadius: "8px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <Box sx={{ p: { xs: 3, md: 4 }, backgroundColor: "#0078D4", color: "#fff" }}>
            <Box sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
              <ShieldIcon />
              <Typography variant="overline" sx={{ letterSpacing: 0, fontWeight: 700 }}>
                PDPA Privacy Notice
              </Typography>
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800, fontSize: { xs: "1.7rem", md: "2.1rem" } }}>
              Personal Data Protection Notice
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
              {PDPA_CONTROLLER_NAME} | Notice version {PDPA_NOTICE_VERSION}
            </Typography>
          </Box>

          <Box sx={{ p: { xs: 3, md: 4 } }}>
            <Typography variant="body1" sx={{ color: "#374151", lineHeight: 1.8 }}>
              This notice explains how personal data submitted through PMW HR Forms and the Internal Career Advancement Portal is collected,
              used, disclosed, protected, retained, and made available for access or correction requests.
            </Typography>

            <Divider sx={{ my: 3 }} />

            <Stack spacing={3}>
              {PDPA_NOTICE_SECTIONS.map((section) => (
                <Box key={section.title}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: "#111827", mb: 0.75 }}>
                    {section.title}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#4B5563", lineHeight: 1.8 }}>
                    {section.body}
                  </Typography>
                </Box>
              ))}
            </Stack>

            <Divider sx={{ my: 3 }} />

            <Typography variant="body2" sx={{ color: "#4B5563", lineHeight: 1.8 }}>
              Questions, access requests, or correction requests can be sent to{" "}
              <Link href={`mailto:${PDPA_CONTACT_EMAIL}`} sx={{ fontWeight: 700 }}>
                {PDPA_CONTACT_EMAIL}
              </Link>
              . This notice should be read together with any form-specific instructions shown before submission.
            </Typography>

            <Button
              component={RouterLink}
              to="/"
              variant="outlined"
              sx={{ mt: 3, borderRadius: "8px", textTransform: "none", fontWeight: 700 }}
            >
              Return Home
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

/**
 * THESIS: The one form standing between signing in and using the place should
 * look like a welcome, not a gate — three fields, stated plainly, on the same
 * white panel the sign-in card used, so arriving here reads as continuing
 * rather than being stopped.
 * OWN-WORLD: The inherited PMW product world — Inter, `--pmw-*` blue, 1px
 * `#DDE4EC` hairlines, a white panel over the admin's live background photo.
 * STORY: Google has just said who you are. Say who you are to PMW, once.
 * FIRST VIEWPORT: Centred 440px card. Heading, the address Google verified,
 * three fields, one primary action.
 */
import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { fadeInUp } from "../theme";
import Logo from "../components/Logo";
import { editorial, editorialHairline, editorialShadow } from "../theme/editorial";
import {
  fetchDepartments,
  saveOwnProfile,
  type GuestMemberSummary,
} from "../utils/guestMemberService";

const PRIMARY_BLUE = editorial.pmwBlueDark;
const PRIMARY_BLUE_HOVER = "#004A82";

interface GuestProfileSetupPageProps {
  /** The signed session's token — the server reads the address from it, not from the form. */
  token: string;
  member: GuestMemberSummary;
  onSaved: (member: GuestMemberSummary) => void;
  onSignOut: () => void;
}

export default function GuestProfileSetupPage({
  token,
  member,
  onSaved,
  onSignOut,
}: GuestProfileSetupPageProps) {
  // Google's name is offered as a starting point rather than imposed: it is
  // frequently a nickname, and what HR keeps on record should be the name the
  // person actually goes by on paper.
  const [fullName, setFullName] = useState(member.fullName || member.googleName || "");
  const [position, setPosition] = useState(member.position || "");
  const [department, setDepartment] = useState(member.department || "");
  const [departments, setDepartments] = useState<string[]>([]);
  const [departmentsLoaded, setDepartmentsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetchDepartments(token)
      .then((list) => {
        if (!cancelled) setDepartments(list);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setDepartmentsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // An unreadable or empty directory falls back to a plain text field. A worse
  // record than a chosen value, and far better than a member who cannot finish
  // signing up because a list they have never heard of is missing.
  const useDropdown = departments.length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError("");
    try {
      const saved = await saveOwnProfile({ fullName, position, department }, token);
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your details. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        py: { xs: 2.5, sm: 3.5 },
        background:
          "var(--app-bg, var(--app-bg-fallback, linear-gradient(180deg, #BFDDF4 0%, #DCECF8 48%, #F7F5EF 100%)))",
        backgroundAttachment: "fixed",
      }}
    >
      <Container maxWidth="xs" disableGutters sx={{ maxWidth: 440 }}>
        <Box
          component="form"
          onSubmit={handleSubmit}
          noValidate
          sx={{
            backgroundColor: editorial.white,
            borderRadius: "12px",
            border: editorialHairline,
            boxShadow: editorialShadow,
            px: { xs: 3, sm: 4.5 },
            py: { xs: 3.5, sm: 4.5 },
            animation: `${fadeInUp} 0.5s cubic-bezier(0.16, 1, 0.3, 1) both`,
            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
          }}
        >
          <Stack sx={{ alignItems: "center", textAlign: "center" }}>
            <Logo size={{ xs: 44, sm: 52 }} />
            <Typography
              component="h1"
              sx={{
                mt: 2,
                fontSize: { xs: "1.3rem", sm: "1.45rem" },
                fontWeight: 700,
                letterSpacing: "-0.01em",
                lineHeight: 1.2,
                color: editorial.ink,
                textWrap: "balance",
              }}
            >
              A few details before you start
            </Typography>
            <Typography
              sx={{
                mt: 1.25,
                mb: 3,
                fontSize: "0.875rem",
                fontWeight: 500,
                lineHeight: 1.5,
                color: editorial.muted,
                textWrap: "pretty",
              }}
            >
              Signed in as <strong>{member.email}</strong>. These are kept on record by HR and shown
              on anything you submit.
            </Typography>
          </Stack>

          <Stack spacing={1.75}>
            <TextField
              label="Full name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              disabled={saving}
              fullWidth
              required
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
            />
            <TextField
              label="Position"
              value={position}
              onChange={(event) => setPosition(event.target.value)}
              placeholder="e.g. Site Supervisor"
              autoComplete="organization-title"
              disabled={saving}
              fullWidth
              required
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
            />
            <TextField
              select={useDropdown}
              label="Department"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              disabled={saving || !departmentsLoaded}
              helperText={
                departmentsLoaded && !useDropdown
                  ? "The department list could not be loaded — type yours instead."
                  : " "
              }
              fullWidth
              required
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
            >
              {useDropdown
                ? departments.map((name) => (
                    <MenuItem key={name} value={name}>
                      {name}
                    </MenuItem>
                  ))
                : null}
            </TextField>

            {error ? (
              <Alert
                severity="error"
                role="alert"
                sx={{ borderRadius: "12px", fontSize: "0.845rem", fontWeight: 600, py: 0.25 }}
              >
                {error}
              </Alert>
            ) : null}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disableElevation
              disabled={saving}
              sx={{
                py: 1.35,
                borderRadius: "12px",
                fontSize: "0.9375rem",
                fontWeight: 700,
                textTransform: "none",
                backgroundColor: PRIMARY_BLUE,
                color: editorial.white,
                transition: "background-color 0.16s ease",
                "&:hover": { backgroundColor: PRIMARY_BLUE_HOVER },
                "&.Mui-disabled": { backgroundColor: editorial.softMuted, color: editorial.white },
                "&:focus-visible": { outline: `3px solid ${editorial.pmwBlueSoft}`, outlineOffset: 2 },
              }}
            >
              {saving ? "Saving…" : "Continue"}
            </Button>
          </Stack>

          <Typography
            sx={{
              mt: 2.5,
              pt: 2,
              borderTop: editorialHairline,
              fontSize: "0.78rem",
              lineHeight: 1.6,
              textAlign: "center",
              color: editorial.muted,
              textWrap: "pretty",
            }}
          >
            You can change these later from your profile.{" "}
            <Button
              onClick={onSignOut}
              sx={{
                p: 0,
                minWidth: 0,
                fontSize: "0.78rem",
                fontWeight: 700,
                textTransform: "none",
                verticalAlign: "baseline",
                color: editorial.pmwBlueDark,
                "&:hover": { backgroundColor: "transparent", textDecoration: "underline" },
              }}
            >
              Sign out
            </Button>
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}

/**
 * THESIS: A guest member's home is a receipt, not a dashboard — what you sent,
 * what came of it, and who we think you are. Refuses the tile grid of empty
 * widgets the category ships for a person with three rows of data.
 * OWN-WORLD: The inherited PMW product world — Inter, `--pmw-*` blue, 1px
 * `#DDE4EC` hairlines, white panels over the admin's live background photo.
 * STORY: I applied for something. What happened to it? And is my learning
 * access sorted yet?
 * FIRST VIEWPORT: One column, max 760px. Who you are, then learning status,
 * then the list of what you have sent.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { fadeInUp } from "../theme";
import { editorial, editorialHairline, editorialShadow } from "../theme/editorial";
import {
  fetchDepartments,
  fetchMySubmissions,
  fetchOwnMember,
  saveOwnProfile,
  type GuestMemberSummary,
  type GuestSubmission,
} from "../utils/guestMemberService";

const PRIMARY_BLUE = editorial.pmwBlueDark;

interface GuestMemberPageProps {
  token: string;
  member: GuestMemberSummary;
  onMemberChanged: (member: GuestMemberSummary) => void;
  onSignOut: () => void;
}

const panelSx = {
  backgroundColor: editorial.white,
  borderRadius: "12px",
  border: editorialHairline,
  boxShadow: editorialShadow,
  px: { xs: 2.5, sm: 3.5 },
  py: { xs: 2.5, sm: 3 },
} as const;

function formatDate(value: string): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "—";
  return new Date(parsed).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function GuestMemberPage({
  token,
  member,
  onMemberChanged,
  onSignOut,
}: GuestMemberPageProps) {
  const [submissions, setSubmissions] = useState<GuestSubmission[] | null>(null);
  const [submissionsError, setSubmissionsError] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchMySubmissions(token)
      .then((rows) => {
        if (!cancelled) setSubmissions(rows);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSubmissions([]);
        setSubmissionsError(
          error instanceof Error ? error.message : "Could not load your submissions.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Approval happens on somebody else's screen, so the state shown here can go
  // stale while this page sits open. Re-read on returning to the tab: a member
  // waiting to be approved will check by switching back to it.
  const refreshMember = useCallback(() => {
    void fetchOwnMember(token)
      .then(onMemberChanged)
      .catch(() => undefined);
  }, [token, onMemberChanged]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshMember();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshMember]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        px: 2,
        py: { xs: 3, sm: 5 },
        background:
          "var(--app-bg, var(--app-bg-fallback, linear-gradient(180deg, #BFDDF4 0%, #DCECF8 48%, #F7F5EF 100%)))",
        backgroundAttachment: "fixed",
      }}
    >
      <Container
        maxWidth="sm"
        disableGutters
        sx={{
          maxWidth: 760,
          animation: `${fadeInUp} 0.45s cubic-bezier(0.16, 1, 0.3, 1) both`,
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        <Stack spacing={2.5}>
          <ProfilePanel
            token={token}
            member={member}
            editing={editing}
            onEditingChange={setEditing}
            onMemberChanged={onMemberChanged}
            onSignOut={onSignOut}
          />

          <LearningPanel approved={member.learningApproved} />

          <Box sx={panelSx}>
            <Typography
              component="h2"
              sx={{ fontSize: "1.0625rem", fontWeight: 700, color: editorial.ink, mb: 0.5 }}
            >
              What you have sent
            </Typography>
            <Typography sx={{ fontSize: "0.845rem", color: editorial.muted, mb: 2 }}>
              Job applications and HR forms submitted with this account.
            </Typography>

            {submissionsError ? (
              <Alert severity="warning" sx={{ borderRadius: "12px", mb: 2, fontSize: "0.845rem" }}>
                {submissionsError}
              </Alert>
            ) : null}

            {submissions === null ? (
              <Stack sx={{ alignItems: "center", py: 3 }}>
                <CircularProgress size={22} />
              </Stack>
            ) : submissions.length === 0 ? (
              <Typography sx={{ fontSize: "0.875rem", color: editorial.muted, py: 1.5 }}>
                Nothing yet. Anything you apply for or submit from now on will appear here.
              </Typography>
            ) : (
              <Stack divider={<Divider sx={{ borderColor: editorial.border }} />}>
                {submissions.map((row, index) => (
                  <Stack
                    key={`${row.kind}-${row.reference}-${index}`}
                    direction={{ xs: "column", sm: "row" }}
                    sx={{ py: 1.5, gap: 1, alignItems: { sm: "center" } }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        sx={{ fontSize: "0.9375rem", fontWeight: 700, color: editorial.ink }}
                      >
                        {row.title}
                      </Typography>
                      <Typography sx={{ fontSize: "0.78rem", color: editorial.muted }}>
                        {row.kind === "job-application" ? "Job application" : "Form"}
                        {row.reference ? ` · ${row.reference}` : ""} · {formatDate(row.submittedAt)}
                      </Typography>
                    </Box>
                    <Chip
                      label={row.status}
                      size="small"
                      sx={{
                        fontWeight: 700,
                        fontSize: "0.78rem",
                        backgroundColor: editorial.blueWash,
                        color: editorial.pmwBlueDark,
                      }}
                    />
                  </Stack>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}

/**
 * The learning hub's state, said plainly.
 *
 * "Waiting for HR" is not an error and is deliberately not styled as one — it
 * is the ordinary condition of a member who signed up five minutes ago, and a
 * red banner would tell them something has gone wrong when nothing has.
 *
 * The notice about the access log lives here, and this is the only place it can
 * live. A portal account holder used to be told about the log out loud, by the
 * person handing them their password. A member who signed themselves up has had
 * no such conversation, and Act 709's notice-and-choice principle expects them
 * to know the record exists before they start opening material.
 */
function LearningPanel({ approved }: { approved: boolean }) {
  return (
    <Box sx={panelSx}>
      <Stack direction="row" sx={{ alignItems: "center", gap: 1.25, mb: 1 }}>
        <Typography component="h2" sx={{ fontSize: "1.0625rem", fontWeight: 700, color: editorial.ink }}>
          Learning materials
        </Typography>
        <Chip
          label={approved ? "Access granted" : "Being reviewed"}
          size="small"
          sx={{
            fontWeight: 700,
            fontSize: "0.72rem",
            backgroundColor: approved ? editorial.blueWash : "#F3F1EA",
            color: approved ? editorial.pmwBlueDark : editorial.muted,
          }}
        />
      </Stack>

      {approved ? (
        <>
          <Typography sx={{ fontSize: "0.875rem", color: editorial.muted, lineHeight: 1.6 }}>
            You can open the learning hub.
          </Typography>
          <Typography
            sx={{ mt: 1.25, fontSize: "0.78rem", color: editorial.muted, lineHeight: 1.6, textWrap: "pretty" }}
          >
            Your name, position, department and the material you open are recorded in an access log
            that HR can read. This is how PMW evidences that training material was received.
          </Typography>
          <Button
            href="/learning"
            variant="contained"
            disableElevation
            sx={{
              mt: 2,
              px: 2.5,
              py: 1,
              borderRadius: "12px",
              fontSize: "0.875rem",
              fontWeight: 700,
              textTransform: "none",
              backgroundColor: PRIMARY_BLUE,
              "&:hover": { backgroundColor: "#004A82" },
            }}
          >
            Open the learning hub
          </Button>
        </>
      ) : (
        <Typography sx={{ fontSize: "0.875rem", color: editorial.muted, lineHeight: 1.6, textWrap: "pretty" }}>
          HR is reviewing your access. Everything else on the site works in the meantime — you can
          browse jobs, apply, and submit forms. If you opened the learning hub and were sent back
          here, this is why.
        </Typography>
      )}
    </Box>
  );
}

function ProfilePanel({
  token,
  member,
  editing,
  onEditingChange,
  onMemberChanged,
  onSignOut,
}: {
  token: string;
  member: GuestMemberSummary;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onMemberChanged: (member: GuestMemberSummary) => void;
  onSignOut: () => void;
}) {
  const [fullName, setFullName] = useState(member.fullName);
  const [position, setPosition] = useState(member.position);
  const [department, setDepartment] = useState(member.department);
  const [departments, setDepartments] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    void fetchDepartments(token)
      .then((list) => {
        if (!cancelled) setDepartments(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [editing, token]);

  function startEditing() {
    setFullName(member.fullName);
    setPosition(member.position);
    setDepartment(member.department);
    setError("");
    onEditingChange(true);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveOwnProfile({ fullName, position, department }, token);
      onMemberChanged(saved);
      onEditingChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={panelSx}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: "1.15rem", fontWeight: 700, color: editorial.ink }}>
            {member.fullName || member.googleName || member.email}
          </Typography>
          <Typography sx={{ fontSize: "0.845rem", color: editorial.muted }}>{member.email}</Typography>
        </Box>
        <Button
          onClick={onSignOut}
          sx={{
            flexShrink: 0,
            fontSize: "0.845rem",
            fontWeight: 700,
            textTransform: "none",
            color: editorial.muted,
            "&:hover": { backgroundColor: "transparent", textDecoration: "underline" },
          }}
        >
          Sign out
        </Button>
      </Stack>

      <Divider sx={{ my: 2, borderColor: editorial.border }} />

      {editing ? (
        <Stack spacing={1.75}>
          <TextField
            label="Full name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            disabled={saving}
            fullWidth
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
          />
          <TextField
            label="Position"
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            disabled={saving}
            fullWidth
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
          />
          <TextField
            select={departments.length > 0}
            label="Department"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            disabled={saving}
            fullWidth
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
          >
            {departments.map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </TextField>

          {error ? (
            <Alert severity="error" role="alert" sx={{ borderRadius: "12px", fontSize: "0.845rem" }}>
              {error}
            </Alert>
          ) : null}

          {/*
            Editing is allowed, and the audit trail is not rewritten by it: every
            access log row already holds the name, position and department that
            were current when that material was opened.
          */}
          <Stack direction="row" spacing={1}>
            <Button
              onClick={save}
              variant="contained"
              disableElevation
              disabled={saving}
              sx={{
                px: 2.5,
                borderRadius: "12px",
                fontWeight: 700,
                textTransform: "none",
                backgroundColor: PRIMARY_BLUE,
                "&:hover": { backgroundColor: "#004A82" },
              }}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              onClick={() => onEditingChange(false)}
              disabled={saving}
              sx={{ borderRadius: "12px", fontWeight: 700, textTransform: "none", color: editorial.muted }}
            >
              Cancel
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Stack direction="row" sx={{ gap: 3, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Box>
            <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: editorial.softMuted }}>
              Position
            </Typography>
            <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, color: editorial.ink }}>
              {member.position || "—"}
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: editorial.softMuted }}>
              Department
            </Typography>
            <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, color: editorial.ink }}>
              {member.department || "—"}
            </Typography>
          </Box>
          <Button
            onClick={startEditing}
            sx={{
              ml: "auto",
              fontSize: "0.845rem",
              fontWeight: 700,
              textTransform: "none",
              color: editorial.pmwBlueDark,
              "&:hover": { backgroundColor: "transparent", textDecoration: "underline" },
            }}
          >
            Edit details
          </Button>
        </Stack>
      )}
    </Box>
  );
}

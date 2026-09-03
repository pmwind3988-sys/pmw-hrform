/**
 * THESIS: This screen used to be a credential factory — generate a password,
 * read it out, never see it again. It is now a queue of decisions: who signed
 * up, and who may read the library. One question per row, answered in one click.
 * OWN-WORLD: The inherited PMW admin world — Inter, `--pmw-*` blue, 1px
 * `#DDE4EC` hairlines, white panels on the app background.
 * STORY: Someone new signed up. Should they see the training material?
 * FIRST VIEWPORT: Search, then the member list newest-first, each row carrying
 * its own approve switch.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { editorial, editorialHairline, editorialShadow } from "../theme/editorial";
import {
  ensureGuestMembersSchema,
  fetchGuestAccessLog,
  listGuestMembers,
  setGuestLearningApproval,
  setGuestMemberStatus,
  type GuestAccessLogEntry,
  type GuestMemberSummary,
  type GuestMembersSnapshot,
} from "../utils/guestMemberService";
import { useMsal } from "@azure/msal-react";
import { acquireAccessTokenSilentOrRedirect } from "../utils/authRecovery";
import { loginRequest } from "../auth/msalConfig";

const panelSx = {
  backgroundColor: editorial.white,
  borderRadius: "12px",
  border: editorialHairline,
  boxShadow: editorialShadow,
  px: { xs: 2, sm: 3 },
  py: { xs: 2, sm: 2.5 },
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

export default function AdminGuestMembersPage() {
  const { instance } = useMsal();
  const [snapshot, setSnapshot] = useState<GuestMembersSnapshot | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyEmail, setBusyEmail] = useState("");
  const [logOpen, setLogOpen] = useState(false);

  /**
   * The admin's own delegated SharePoint token. Every one of these actions is
   * re-checked against HR Forms Owner membership on the server — this token is
   * how it knows who is asking, not permission in itself.
   */
  const getToken = useCallback(async () => {
    const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
    return acquireAccessTokenSilentOrRedirect(instance, {
      scopes: loginRequest.scopes,
      account: account ?? undefined,
    });
  }, [instance]);

  const load = useCallback(
    async (nextSearch: string, nextPage: number) => {
      setLoading(true);
      setError("");
      try {
        const token = await getToken();
        const data = await listGuestMembers(
          { search: nextSearch, skip: nextPage * 50, take: 50 },
          token,
        );
        setSnapshot(data);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load guest members.");
      } finally {
        setLoading(false);
      }
    },
    [getToken],
  );

  /*
    One effect for both the page and the search term, rather than one each.
    Two effects would each fire on mount and load the list twice — the second
    request overwriting the first with identical data.

    The delay is what keeps typing from costing a SharePoint read per keystroke.
    It applies to a page change too, where 350ms is imperceptible.
  */
  useEffect(() => {
    const timer = window.setTimeout(() => void load(search, page), 350);
    return () => window.clearTimeout(timer);
  }, [search, page, load]);

  // Typing filters the whole list, so it has to start again from the first page
  // — otherwise a search matching three people shows page four of nothing.
  useEffect(() => {
    setPage(0);
  }, [search]);

  async function withMember(email: string, work: (token: string) => Promise<void>) {
    setBusyEmail(email);
    setError("");
    try {
      const token = await getToken();
      await work(token);
      await load(search, page);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That change could not be saved.");
    } finally {
      setBusyEmail("");
    }
  }

  async function provision() {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      await ensureGuestMembersSchema(token);
      await load(search, page);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not set up guest member storage.");
      setLoading(false);
    }
  }

  const members = snapshot?.members ?? [];
  const total = snapshot?.total ?? 0;

  return (
    <Box sx={{ minHeight: "100vh", px: 2, py: { xs: 3, sm: 4 } }}>
      <Container maxWidth="lg" disableGutters>
        <Typography component="h1" sx={{ fontSize: "1.5rem", fontWeight: 700, color: editorial.ink }}>
          Guest members
        </Typography>
        <Typography sx={{ fontSize: "0.875rem", color: editorial.muted, mt: 0.5, mb: 3, maxWidth: 720 }}>
          Anyone with a Google account can sign in and become a permanent member. They can browse
          jobs, apply, and submit forms straight away. The learning hub stays closed to them until
          you approve it here.
        </Typography>

        {error ? (
          <Alert severity="error" sx={{ borderRadius: "12px", mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        {snapshot && !snapshot.provisioned ? (
          <Box sx={{ ...panelSx, mb: 2 }}>
            <Typography sx={{ fontWeight: 700, color: editorial.ink, mb: 0.5 }}>
              Storage is not set up yet
            </Typography>
            <Typography sx={{ fontSize: "0.875rem", color: editorial.muted, mb: 2 }}>
              This creates the member list and the learning access log in SharePoint.
            </Typography>
            <Button variant="contained" disableElevation onClick={() => void provision()}>
              Set up
            </Button>
          </Box>
        ) : null}

        {snapshot && snapshot.provisioned && !snapshot.googleConfigured ? (
          <Alert severity="warning" sx={{ borderRadius: "12px", mb: 2 }}>
            Google sign-in is switched off because <code>GOOGLE_CLIENT_ID</code> is not set. Nobody
            can sign in as a guest until it is.
          </Alert>
        ) : null}

        {snapshot && snapshot.provisioned && !snapshot.sessionsConfigured ? (
          <Alert severity="warning" sx={{ borderRadius: "12px", mb: 2 }}>
            Guest sign-in is switched off because <code>INTERNAL_SESSION_SECRET</code> is not set,
            or is shorter than 32 characters.
          </Alert>
        ) : null}

        <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 1.5, mb: 2, alignItems: "center" }}>
          <TextField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, position or department"
            size="small"
            fullWidth
            sx={{ maxWidth: 420, "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
          />
          <Typography sx={{ fontSize: "0.845rem", color: editorial.muted, whiteSpace: "nowrap" }}>
            {total === 0 ? "No members" : `Showing ${members.length} of ${total}`}
          </Typography>
          <Button
            onClick={() => setLogOpen(true)}
            sx={{ ml: { sm: "auto" }, fontWeight: 700, textTransform: "none" }}
          >
            View access log
          </Button>
        </Stack>

        <Box sx={{ ...panelSx, px: 0, py: 0, overflowX: "auto" }}>
          {loading && !snapshot ? (
            <Stack sx={{ alignItems: "center", py: 6 }}>
              <CircularProgress size={26} />
            </Stack>
          ) : members.length === 0 ? (
            <Typography sx={{ p: 4, textAlign: "center", color: editorial.muted }}>
              {search ? "Nobody matches that search." : "Nobody has signed in with Google yet."}
            </Typography>
          ) : (
            <Table size="small" sx={{ minWidth: 860 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Member</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Position</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Joined</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Learning</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    Account
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {members.map((member) => (
                  <MemberRow
                    key={member.email}
                    member={member}
                    busy={busyEmail === member.email}
                    onApproval={(approved) =>
                      void withMember(member.email, (token) =>
                        setGuestLearningApproval(member.email, approved, token),
                      )
                    }
                    onStatus={(status) =>
                      void withMember(member.email, (token) =>
                        setGuestMemberStatus(member.email, status, token),
                      )
                    }
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </Box>

        {total > 50 ? (
          <Stack direction="row" sx={{ gap: 1, mt: 2, justifyContent: "center" }}>
            <Button disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Previous
            </Button>
            <Button
              disabled={(page + 1) * 50 >= total || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </Stack>
        ) : null}
      </Container>

      <AccessLogDialog open={logOpen} onClose={() => setLogOpen(false)} getToken={getToken} />
    </Box>
  );
}

function MemberRow({
  member,
  busy,
  onApproval,
  onStatus,
}: {
  member: GuestMemberSummary;
  busy: boolean;
  onApproval: (approved: boolean) => void;
  onStatus: (status: "active" | "disabled") => void;
}) {
  const disabled = member.status === "disabled";
  return (
    <TableRow sx={{ opacity: disabled ? 0.55 : 1 }}>
      <TableCell>
        <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", color: editorial.ink }}>
          {member.fullName || member.googleName || "—"}
        </Typography>
        <Typography sx={{ fontSize: "0.78rem", color: editorial.muted }}>{member.email}</Typography>
        {!member.profileComplete ? (
          <Chip
            label="Profile not completed"
            size="small"
            sx={{ mt: 0.5, fontSize: "0.72rem", fontWeight: 700, backgroundColor: "#F3F1EA" }}
          />
        ) : null}
      </TableCell>
      <TableCell sx={{ fontSize: "0.845rem" }}>{member.position || "—"}</TableCell>
      <TableCell sx={{ fontSize: "0.845rem" }}>{member.department || "—"}</TableCell>
      <TableCell sx={{ fontSize: "0.845rem" }}>{formatDate(member.joinedAt)}</TableCell>
      <TableCell>
        {/*
          Approval is withheld until the member has said who they are — granting
          the library to a row with no name and no department defeats the point
          of the access log it will be written into.
        */}
        <Switch
          checked={member.learningApproved}
          disabled={busy || disabled || !member.profileComplete}
          onChange={(event) => onApproval(event.target.checked)}
          slotProps={{ input: { "aria-label": `Learning access for ${member.email}` } }}
        />
      </TableCell>
      <TableCell align="right">
        <Button
          size="small"
          disabled={busy}
          onClick={() => onStatus(disabled ? "active" : "disabled")}
          sx={{ fontWeight: 700, textTransform: "none", color: disabled ? editorial.pmwBlueDark : "#B3261E" }}
        >
          {disabled ? "Re-enable" : "Disable"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

/**
 * The named trail, read-only. Nothing on this screen can edit or delete a row —
 * an audit trail editable from the screen that displays it is not evidence.
 */
function AccessLogDialog({
  open,
  onClose,
  getToken,
}: {
  open: boolean;
  onClose: () => void;
  getToken: () => Promise<string>;
}) {
  const [entries, setEntries] = useState<GuestAccessLogEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setEntries(null);
    setError("");

    void (async () => {
      try {
        const token = await getToken();
        const rows = await fetchGuestAccessLog(token);
        if (!cancelled) setEntries(rows);
      } catch (caught) {
        if (cancelled) return;
        setEntries([]);
        setError(caught instanceof Error ? caught.message : "Could not load the access log.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, getToken]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Learning access log</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: "0.845rem", color: editorial.muted, mb: 2 }}>
          Every material a guest member has opened. Names, positions and departments are recorded as
          they were at the time of the view, so a later profile edit cannot change what this says.
        </Typography>
        <Divider sx={{ mb: 2 }} />

        {error ? (
          <Alert severity="error" sx={{ borderRadius: "12px", mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        {entries === null ? (
          <Stack sx={{ alignItems: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Stack>
        ) : entries.length === 0 ? (
          <Typography sx={{ py: 3, textAlign: "center", color: editorial.muted }}>
            Nothing recorded yet.
          </Typography>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Who</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Role at the time</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Material</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Opened</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((entry, index) => (
                  <TableRow key={`${entry.email}-${entry.materialId}-${index}`}>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700, fontSize: "0.845rem" }}>
                        {entry.viewerName || "—"}
                      </Typography>
                      <Typography sx={{ fontSize: "0.78rem", color: editorial.muted }}>
                        {entry.email}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.845rem" }}>
                      {[entry.viewerPosition, entry.viewerDepartment].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.845rem" }}>{entry.materialName}</TableCell>
                    <TableCell sx={{ fontSize: "0.845rem", whiteSpace: "nowrap" }}>
                      {formatDate(entry.viewedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

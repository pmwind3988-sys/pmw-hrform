/**
 * THESIS: This screen used to be a credential factory — generate a password,
 * read it out, never see it again. It is now a queue of decisions: who signed
 * up, and who may read the library. One question per row, answered in one click.
 * STORY: Someone new signed up. Should they see the training material?
 * FIRST VIEWPORT: "Waiting for you" — people with a finished profile and no
 * learning access yet — each row carrying its own Approve button.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Search as SearchIcon } from "@mui/icons-material";
import { editorial, si, siType } from "../theme/editorial";
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
import StatusPanel, { FailurePanel } from "../components/common/StatusPanel";
import Card from "../components/common/Card";
import PageHeader from "../components/common/PageHeader";
import PillTabs from "../components/common/PillTabs";
import { statusFromError } from "../utils/friendlyError";

type MemberView = "waiting" | "approved" | "disabled" | "all";

function isWaiting(member: GuestMemberSummary): boolean {
  return member.profileComplete && !member.learningApproved && member.status !== "disabled";
}

function inView(member: GuestMemberSummary, view: MemberView): boolean {
  switch (view) {
    case "waiting":
      return isWaiting(member);
    case "approved":
      return member.learningApproved && member.status !== "disabled";
    case "disabled":
      return member.status === "disabled";
    default:
      return true;
  }
}

const EMPTY_VIEW_TEXT: Record<MemberView, string> = {
  waiting: "Nobody is waiting for you.",
  approved: "Nobody has been approved for learning on this page.",
  disabled: "No accounts are disabled.",
  all: "Nobody to show.",
};

function initialsOf(member: GuestMemberSummary): string {
  const name = (member.fullName || member.googleName || "").trim();
  if (!name) return (member.email[0] ?? "?").toUpperCase();
  const parts = name.split(/\s+/);
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "")).toUpperCase();
}

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
  const [view, setView] = useState<MemberView>("waiting");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // A failed approve/disable is not a failed load: the list is still good, so
  // it stays on screen and the failure is said above it. Only a failed LOAD
  // replaces the list.
  const [actionError, setActionError] = useState("");
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
    setActionError("");
    try {
      const token = await getToken();
      await work(token);
      await load(search, page);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "That change could not be saved.");
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
  const visibleMembers = members.filter((member) => inView(member, view));
  const showTabs = Boolean(snapshot && snapshot.provisioned && !error && (members.length > 0 || search));

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Guest members"
        description="Anyone with a Google account can sign in and become a permanent member. They can browse jobs, apply, and submit forms straight away. The learning hub stays closed to them until you approve it here."
        secondary={[{ label: "View access log", onClick: () => setLogOpen(true) }]}
      />

      {actionError && !error ? (
        <Alert severity="warning" onClose={() => setActionError("")} sx={{ mb: 2 }}>
          That change wasn&apos;t saved. Try again; if it keeps failing, reload the page.
          {statusFromError(actionError) ? ` (Reference: HTTP ${statusFromError(actionError)})` : ""}
        </Alert>
      ) : null}

      {error ? (
        <Box sx={{ mb: 2 }}>
          <FailurePanel
            what="guest members"
            error={error}
            onRetry={() => void load(search, page)}
          />
        </Box>
      ) : null}

      {snapshot && !snapshot.provisioned ? (
        <Card sx={{ mb: 2 }}>
          <Typography sx={{ ...siType.cardTitle, color: editorial.ink, mb: 0.5 }}>
            Storage is not set up yet
          </Typography>
          <Typography sx={{ ...siType.body, color: editorial.muted, mb: 2 }}>
            This creates the member list and the learning access log in SharePoint.
          </Typography>
          <Button variant="contained" disableElevation onClick={() => void provision()}>
            Set up
          </Button>
        </Card>
      ) : null}

      {snapshot && snapshot.provisioned && !snapshot.googleConfigured ? (
        <Alert severity="warning" sx={{ borderRadius: `${si.radius}px`, mb: 2 }}>
          Google sign-in is switched off because <code>GOOGLE_CLIENT_ID</code> is not set. Nobody
          can sign in as a guest until it is.
        </Alert>
      ) : null}

      {snapshot && snapshot.provisioned && !snapshot.sessionsConfigured ? (
        <Alert severity="warning" sx={{ borderRadius: `${si.radius}px`, mb: 2 }}>
          Guest sign-in is switched off because <code>INTERNAL_SESSION_SECRET</code> is not set,
          or is shorter than 32 characters.
        </Alert>
      ) : null}

      {error ? null : (
        <TextField
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email, position or department"
          size="small"
          fullWidth
          sx={{
            maxWidth: 420,
            mb: 2,
            "& .MuiOutlinedInput-root": { borderRadius: "999px", backgroundColor: editorial.skySoft },
            "& .MuiOutlinedInput-notchedOutline": { border: "none" },
          }}
          slotProps={{
            htmlInput: { "aria-label": "Search guest members" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: editorial.muted, fontSize: 20 }} />
                </InputAdornment>
              ),
            },
          }}
        />
      )}

      {showTabs ? (
        <>
          <PillTabs
            aria-label="Guest member groups"
            value={view}
            onChange={setView}
            tabs={[
              { value: "waiting", label: "Waiting for you", count: members.filter((m) => inView(m, "waiting")).length },
              { value: "approved", label: "Approved", count: members.filter((m) => inView(m, "approved")).length },
              { value: "disabled", label: "Disabled", count: members.filter((m) => inView(m, "disabled")).length },
              { value: "all", label: "All", count: members.length },
            ]}
          />
          {total > members.length ? (
            <Typography sx={{ ...siType.subtext, color: editorial.muted, mt: -1, mb: 2 }}>
              Counts cover the {members.length} people on this page, out of {total} members.
            </Typography>
          ) : null}
        </>
      ) : null}

      {error ? null : snapshot && snapshot.provisioned && members.length === 0 && !search ? (
        <StatusPanel
          tone="empty"
          title="No guest members yet"
          body="People appear here after they sign in with Google."
        />
      ) : (
        <Card pad="none" clip>
          {loading && !snapshot ? (
            <Stack sx={{ alignItems: "center", py: 6 }}>
              <CircularProgress size={26} />
            </Stack>
          ) : members.length === 0 ? (
            <Typography sx={{ p: 4, textAlign: "center", color: editorial.muted }}>
              {search ? "Nobody matches that search." : "Nobody has signed in with Google yet."}
            </Typography>
          ) : visibleMembers.length === 0 ? (
            <Typography sx={{ p: 4, textAlign: "center", color: editorial.muted }}>
              {EMPTY_VIEW_TEXT[view]}
            </Typography>
          ) : (
            <Box sx={{ p: 1 }}>
              {visibleMembers.map((member) => (
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
            </Box>
          )}
        </Card>
      )}

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
  const name = member.fullName || member.googleName || "";
  const details = [
    member.position,
    member.department,
    member.profileComplete ? "Profile done" : "Profile not finished",
    disabled ? "Account disabled" : "",
  ].filter(Boolean);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 1.5,
        px: 1,
        py: 1.25,
        borderRadius: `${si.radius}px`,
        opacity: disabled ? 0.65 : 1,
        "&:hover": { backgroundColor: editorial.blueSoft },
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          backgroundColor: member.profileComplete ? editorial.blueWash : editorial.skySoft,
          color: member.profileComplete ? editorial.navyDeep : editorial.muted,
          ...siType.subtext,
          fontWeight: 700,
        }}
      >
        {initialsOf(member)}
      </Box>
      <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
        <Typography noWrap sx={{ ...siType.cardTitle, color: editorial.ink }}>
          {name || member.email}
        </Typography>
        <Typography noWrap sx={{ ...siType.subtext, color: editorial.muted }}>
          {name ? `${member.email} · ` : ""}
          {details.join(" · ")}
          {member.joinedAt ? ` · Joined ${formatDate(member.joinedAt)}` : ""}
        </Typography>
      </Box>

      {/*
        Approval is withheld until the member has said who they are — granting
        the library to a row with no name and no department defeats the point
        of the access log it will be written into.
      */}
      {!member.profileComplete ? (
        <Typography sx={{ ...siType.subtext, color: editorial.muted }}>
          Can&apos;t approve yet: profile not finished
        </Typography>
      ) : member.learningApproved ? (
        <Button
          size="small"
          disabled={busy || disabled}
          onClick={() => onApproval(false)}
          sx={{ color: editorial.muted }}
        >
          Revoke learning
        </Button>
      ) : (
        <Button
          size="small"
          variant="contained"
          disableElevation
          disabled={busy || disabled}
          onClick={() => onApproval(true)}
          aria-label={`Approve learning access for ${member.email}`}
        >
          Approve
        </Button>
      )}
      <Button
        size="small"
        disabled={busy}
        onClick={() => onStatus(disabled ? "active" : "disabled")}
        sx={{ fontWeight: 600, color: disabled ? editorial.pmwBlueDark : editorial.error }}
      >
        {disabled ? "Re-enable" : "Disable"}
      </Button>
    </Box>
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
          <FailurePanel what="the access log" error={error} />
        ) : entries === null ? (
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

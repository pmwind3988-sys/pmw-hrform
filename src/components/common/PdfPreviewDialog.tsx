import { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import {
  CloseOutlined,
  DownloadOutlined,
  OpenInNewOutlined,
  PictureAsPdfOutlined,
} from "@mui/icons-material";
import { useMsal } from "@azure/msal-react";
import { acquireAccessTokenSilentOrRedirect } from "../../utils/authRecovery";
import { sharePointManageScope } from "../../utils/sharePointScope";
import { fetchPdfBlob } from "../../utils/fetchPdfBlob";
import { editorial, si, siType } from "../../theme/editorial";

export interface PdfPreviewDialogProps {
  open: boolean;
  /** Absolute SharePoint URL of the stored PDF. */
  url: string;
  /** Shown as the dialog's title and used as the download filename. */
  filename: string;
  /** The site the file lives on, for the token scope. */
  siteUrl?: string;
  onClose: () => void;
}

/**
 * Shows a stored PDF inside the app, instead of throwing the user into a new
 * browser tab and hoping they find their way back.
 *
 * WHY IT CAN STILL SEND YOU TO A TAB. The file has to be fetched with a bearer
 * token and shown as a blob, and that fetch is not guaranteed: measured against
 * the live site, the browser refused one with "Redirect is not allowed for a
 * preflight request", which is a property of how SharePoint serves the file
 * rather than of the file being missing. So a failed preview is an ordinary
 * outcome, and it falls back to exactly what this dialog replaced — opening the
 * PDF in a tab. Nothing is ever less reachable than it was before the preview
 * existed. See `fetchPdfBlob`.
 *
 * The object URL is revoked whenever the source changes or the dialog closes.
 * Without that, every preview would hold its whole PDF in memory until a reload
 * — and these are generated documents with signature images in them.
 */
export default function PdfPreviewDialog({
  open,
  url,
  filename,
  siteUrl,
  onClose,
}: PdfPreviewDialogProps) {
  const { instance, accounts } = useMsal();
  const [objectUrl, setObjectUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !url) return;

    let cancelled = false;
    let created = "";

    void (async () => {
      // Set inside the async body rather than in the effect itself: a
      // synchronous setState during an effect schedules a second render before
      // the first has painted, which is what react-hooks/set-state-in-effect
      // warns about.
      setLoading(true);
      setError("");
      try {
        const token = await acquireAccessTokenSilentOrRedirect(instance, {
          scopes: [sharePointManageScope(siteUrl)],
          account: accounts[0],
        });
        const result = await fetchPdfBlob(url, token, fetch, siteUrl);
        if (cancelled) return;
        if (!result.ok) {
          setError(result.reason);
          return;
        }
        created = URL.createObjectURL(result.blob);
        setObjectUrl(created);
      } catch {
        if (!cancelled) {
          setError(
            "The preview could not be loaded from SharePoint. You can still open or download the file.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
      setObjectUrl("");
    };
  }, [open, url, siteUrl, instance, accounts]);

  const actionSx = {
    borderRadius: `${si.radius}px`,
    minHeight: si.touchTarget,
    px: 2,
    textTransform: "none" as const,
    fontWeight: 700,
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      sx={{ zIndex: si.zDialog }}
      slotProps={{
        paper: {
          sx: {
            borderRadius: `${si.radius}px`,
            boxShadow: si.shadowRaised,
            height: "min(88vh, 900px)",
          },
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 2 }}>
        <Box
          sx={{
            width: 38,
            height: 38,
            flexShrink: 0,
            borderRadius: `${si.radiusSm}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: editorial.errorSoft,
            color: editorial.error,
          }}
        >
          <PictureAsPdfOutlined sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ ...siType.subsectionTitle, color: editorial.ink }}>
            {filename || "Document"}
          </Typography>
          <Typography sx={{ ...siType.subtext, color: editorial.muted }}>
            Check it here before downloading.
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{ p: 0, backgroundColor: editorial.appSurface, display: "flex", minHeight: 0 }}
      >
        {loading && (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1.5,
            }}
          >
            <CircularProgress size={26} />
            <Typography sx={{ ...siType.subtext, color: editorial.muted }}>
              Loading the document…
            </Typography>
          </Box>
        )}

        {!loading && error && (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              px: 4,
              textAlign: "center",
            }}
          >
            <Typography sx={{ ...siType.cardTitle, color: editorial.ink }}>
              Preview unavailable
            </Typography>
            <Typography sx={{ ...siType.body, color: editorial.muted, maxWidth: 420 }}>
              {error}
            </Typography>
          </Box>
        )}

        {!loading && !error && objectUrl && (
          <Box
            component="iframe"
            src={objectUrl}
            title={filename || "PDF preview"}
            sx={{ flex: 1, width: "100%", border: "none" }}
          />
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 2, gap: 1 }}>
        {/* Present whether or not the preview loaded: this is the behaviour the
            dialog replaced, and it is what makes a failed preview a nuisance
            rather than a dead end. */}
        <Button
          component="a"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          startIcon={<OpenInNewOutlined />}
          sx={{ ...actionSx, color: editorial.muted }}
        >
          Open in new tab
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} startIcon={<CloseOutlined />} sx={{ ...actionSx, color: editorial.muted }}>
          Close
        </Button>
        <Button
          variant="contained"
          component="a"
          href={objectUrl || url}
          download={filename || true}
          startIcon={<DownloadOutlined />}
          disabled={loading}
          sx={actionSx}
        >
          Download
        </Button>
      </DialogActions>
    </Dialog>
  );
}

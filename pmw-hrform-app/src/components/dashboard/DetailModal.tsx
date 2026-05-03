import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Close as CloseIcon,
  Lock as LockIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  AccessTime as AccessTimeIcon,
} from "@mui/icons-material";
import type { Submission, ApprovalLayer } from "../../types";
import StatusBadge from "./StatusBadge";

const SKIP = new Set([
  "Id", "_authorEmail", "AuthorId", "EditorId", "FormVersion", "FormStatus",
  "TrainingNeedsHtml", "ContentsHtml", "EffectivenessHtml",
  "HodSignature", "ApplicantSignature", "EmployeeSignature",
  "L1_Status", "L1_Email", "L1_SignedAt", "L1_Rejection", "L1_Signature",
  "L2_Status", "L2_Email", "L2_SignedAt", "L2_Rejection", "L2_Signature",
  "L3_Status", "L3_Email", "L3_SignedAt", "L3_Rejection", "L3_Signature",
  "odata.type", "odata.id", "odata.etag", "odata.editLink",
  "FileSystemObjectType", "ServerRedirectedEmbedUri", "ServerRedirectedEmbedUrl",
  "ContentTypeId", "OData__UIVersionString", "Attachments", "GUID",
  "OData__ColorTag", "ComplianceAssetId",
]);

interface DetailModalProps {
  item: Submission | null;
  onClose: () => void;
}

function formatFieldName(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Detect ISO/SharePoint date strings and format them. */
function formatDateValue(value: string): string | null {
  // ISO 8601: "2024-01-15T10:30:00Z" or SharePoint variant
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?$/i.test(value)) {
    try {
      return new Date(value).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Render any SharePoint field value as meaningful display text.
 * Handles: dates, user objects, lookup objects, booleans, arrays, HTML.
 */
function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "N/A";

  // Boolean
  if (typeof value === "boolean") return value ? "Yes" : "No";

  // Array (multi-choice, multi-user)
  if (Array.isArray(value)) {
    return value.map((v) => formatFieldValue(v)).join(", ");
  }

  // Object (user field, lookup field)
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    // User field: { Email, Title, Id }
    if ("Email" in obj || "Title" in obj) {
      return (obj.Email as string) || (obj.Title as string) || String(obj.Id || "Unknown");
    }

    // Lookup field: { Value, Id }
    if ("Value" in obj) {
      return String(obj.Value ?? "");
    }

    // Fallback: JSON (shouldn't normally reach here)
    try {
      return JSON.stringify(value);
    } catch {
      return "N/A";
    }
  }

  const str = String(value);

  // Date string
  const formatted = formatDateValue(str);
  if (formatted) return formatted;

  return str;
}

function ApprovalCard({
  layer,
  index,
}: {
  layer: ApprovalLayer | null;
  index: number;
}) {
  if (!layer) return null;

  const isSigned = layer.status === "approved" || layer.status === "signed";
  const isRejected = layer.status === "rejected";

  let borderColor = "#a855f7";
  let bgColor = "rgba(168,85,247,0.04)";
  let iconColor = "#a855f7";
  let statusIcon = <AccessTimeIcon sx={{ fontSize: 20 }} />;
  let statusLabel = "Awaiting";

  if (isSigned) {
    borderColor = "#16a34a";
    bgColor = "rgba(22,163,74,0.04)";
    iconColor = "#16a34a";
    statusIcon = <CheckCircleIcon sx={{ fontSize: 20 }} />;
    statusLabel = "Signed";
  } else if (isRejected) {
    borderColor = "#dc2626";
    bgColor = "rgba(220,38,38,0.04)";
    iconColor = "#dc2626";
    statusIcon = <CancelIcon sx={{ fontSize: 20 }} />;
    statusLabel = "Rejected";
  }

  return (
    <Paper
      elevation={0}
      sx={{
        border: `1px solid ${borderColor}20`,
        backgroundColor: bgColor,
        borderRadius: "12px",
        p: 2,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            backgroundColor: `${iconColor}15`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: iconColor,
          }}
        >
          {statusIcon}
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 600, color: "#1a1a2e" }}>
          Level {index + 1}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: iconColor, fontWeight: 500, ml: "auto" }}
        >
          {statusLabel}
        </Typography>
      </Box>

      {layer.email && (
        <Typography variant="body2" sx={{ color: "rgba(0,0,0,0.55)", mb: 0.5 }}>
          {layer.email}
        </Typography>
      )}

      {layer.signedAt && (
        <Typography variant="caption" sx={{ color: "rgba(0,0,0,0.35)" }}>
          {new Date(layer.signedAt).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Typography>
      )}

      {layer.rejectionReason && (
        <Typography
          variant="body2"
          sx={{ color: "#dc2626", mt: 1, fontStyle: "italic" }}
        >
          Reason: {layer.rejectionReason}
        </Typography>
      )}

      {layer.signature && (
        <Box
          component="img"
          src={layer.signature}
          alt="Signature"
          sx={{
            maxHeight: 60,
            mt: 1,
            borderRadius: "8px",
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        />
      )}
    </Paper>
  );
}

export default function DetailModal({ item, onClose }: DetailModalProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const htmlFields = ["TrainingNeedsHtml", "ContentsHtml", "EffectivenessHtml"];

  const visibleFields = Object.entries(item?.submissionData ?? {}).filter(
    ([key]) => !SKIP.has(key)
  ) as [string, string | number | boolean | null][];

  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="lg"
      slotProps={{
        paper: {
          sx: {
            borderRadius: isMobile ? 0 : "20px",
            overflow: "hidden",
          },
        },
      }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          background: "linear-gradient(135deg, #7C3AED, #5B21B6)",
          color: "#ffffff",
          py: 3,
          px: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 300, letterSpacing: "-0.02em" }}>
            {item?.title}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.8, mt: 0.5 }}>
            Submission Details
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: "#ffffff" }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 4 }}>
        {item && (
          <Stack spacing={4}>
            {/* Meta strip */}
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 2,
                alignItems: "center",
              }}
            >
              <StatusBadge status={item.formStatus} />
              {item.submittedAt && (
                <Typography variant="body2" sx={{ color: "rgba(0,0,0,0.55)" }}>
                  Submitted:{" "}
                  {new Date(item.submittedAt).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </Typography>
              )}
              <Typography
                variant="caption"
                sx={{
                  fontFamily: "monospace",
                  backgroundColor: "rgba(98,100,167,0.08)",
                  color: "#6264A7",
                  px: 1.5,
                  py: 0.5,
                  borderRadius: "6px",
                }}
              >
                SP ID: {item.id}
              </Typography>
              <Typography variant="body2" sx={{ color: "rgba(0,0,0,0.45)", ml: "auto" }}>
                {item.submittedByEmail}
              </Typography>
            </Box>

            <Divider />

            {/* Field grid */}
            {visibleFields.length > 0 && (
              <>
                <Grid container spacing={2}>
                  {visibleFields.map(([key, value]) => {
                    if (htmlFields.includes(key) && typeof value === "string") {
                      return (
                        <Grid size={{ xs: 12 }} key={key}>
                          <Box>
                            <Typography
                              variant="caption"
                              sx={{
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                color: "rgba(0,0,0,0.45)",
                                fontWeight: 600,
                                fontSize: "0.7rem",
                                display: "block",
                                mb: 0.5,
                              }}
                            >
                              {formatFieldName(key)}
                            </Typography>
                            <Box
                              sx={{
                                backgroundColor: "#ffffff",
                                border: "1px solid rgba(0,0,0,0.08)",
                                borderRadius: "10px",
                                p: 2,
                                "& table": {
                                  width: "100%",
                                  borderCollapse: "collapse",
                                },
                                "& td, & th": {
                                  border: "1px solid rgba(0,0,0,0.1)",
                                  padding: "8px 12px",
                                  fontSize: "0.875rem",
                                },
                                "& th": {
                                  backgroundColor: "rgba(0,0,0,0.02)",
                                  fontWeight: 600,
                                },
                              }}
                              dangerouslySetInnerHTML={{ __html: value }}
                            />
                          </Box>
                        </Grid>
                      );
                    }

                    return (
                      <Grid size={{ xs: 12, sm: 6 }} key={key}>
                        <Box>
                          <Typography
                            variant="caption"
                            sx={{
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              color: "rgba(0,0,0,0.45)",
                              fontWeight: 600,
                              fontSize: "0.7rem",
                              display: "block",
                              mb: 0.5,
                            }}
                          >
                            {formatFieldName(key)}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              backgroundColor: "#ffffff",
                              border: "1px solid rgba(0,0,0,0.08)",
                              borderRadius: "10px",
                              p: 1.5,
                              color: "#1a1a2e",
                              wordBreak: "break-word",
                            }}
                          >
                            {formatFieldValue(value)}
                          </Typography>
                        </Box>
                      </Grid>
                    );
                  })}
                </Grid>
                <Divider />
              </>
            )}

            {/* Signature images */}
            {!!item.submissionData?.HodSignature && (
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "rgba(0,0,0,0.45)",
                    fontWeight: 600,
                    fontSize: "0.7rem",
                    display: "block",
                    mb: 0.5,
                  }}
                >
                  HOD Signature
                </Typography>
                <Box
                  component="img"
                  src={item.submissionData.HodSignature as string}
                  alt="HOD Signature"
                  sx={{
                    maxHeight: 80,
                    borderRadius: "10px",
                    border: "1px solid rgba(0,0,0,0.06)",
                  }}
                />
              </Box>
            )}

            {!!item.submissionData?.ApplicantSignature && (
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "rgba(0,0,0,0.45)",
                    fontWeight: 600,
                    fontSize: "0.7rem",
                    display: "block",
                    mb: 0.5,
                  }}
                >
                  Applicant Signature
                </Typography>
                <Box
                  component="img"
                  src={item.submissionData.ApplicantSignature as string}
                  alt="Applicant Signature"
                  sx={{
                    maxHeight: 80,
                    borderRadius: "10px",
                    border: "1px solid rgba(0,0,0,0.06)",
                  }}
                />
              </Box>
            )}

            {/* Approval chain */}
            {item.layers && item.layers.length > 0 && (
              <>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 600,
                    color: "#1a1a2e",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Approval Chain
                </Typography>
                <Stack spacing={1.5}>
                  {item.layers.map(
                    (layer, i) =>
                      layer && <ApprovalCard key={i} layer={layer} index={i} />
                  )}
                </Stack>
              </>
            )}
          </Stack>
        )}
      </DialogContent>

      {/* Footer */}
      <DialogActions sx={{ px: 4, py: 2 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            color: "rgba(0,0,0,0.35)",
            fontSize: "0.8rem",
          }}
        >
          <LockIcon sx={{ fontSize: 16 }} />
          Read-only view — submissions cannot be modified from the dashboard.
        </Box>
        <Button
          onClick={onClose}
          variant="contained"
          sx={{
            backgroundColor: "#0078D4",
            borderRadius: "10px",
            textTransform: "none",
            "&:hover": { backgroundColor: "#005A9E" },
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

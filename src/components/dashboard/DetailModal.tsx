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
  Chip,
} from "@mui/material";
import {
  Close as CloseIcon,
  Lock as LockIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  AccessTime as AccessTimeIcon,
} from "@mui/icons-material";
import type { Submission, ApprovalLayer, ApprovalLayerResult, EvaluationLayerResult } from "../../types";
import StatusBadge from "./StatusBadge";
import EvaluationSummary from "../builder/EvaluationSummary";
import DOMPurify from "dompurify";
import { editorial, editorialHairline } from "../../theme/editorial";

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
  "CurrentLayer", "EvaluationData", "PDPAConsent", "PDPANoticeVersion", "PDPAConsentAt", "RetentionUntil",
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

function LayerProgression({
  totalLayers,
  currentLayer,
  enhancedLayers,
}: {
  totalLayers: number;
  currentLayer?: number;
  enhancedLayers?: (ApprovalLayerResult | EvaluationLayerResult | null)[];
}) {
  if (totalLayers <= 0) return null;

  return (
    <Box sx={{ mb: 3 }}>
      <Typography
        variant="h6"
        sx={{ fontWeight: 800, color: editorial.ink, letterSpacing: 0, mb: 2 }}
      >
        Layer Progression
      </Typography>
      <Stack spacing={1.5}>
        {Array.from({ length: totalLayers }, (_, i) => {
          const layerNum = i + 1;
          const enhanced = enhancedLayers?.[i];
          const isActive = currentLayer === layerNum;

          let borderColor: string = editorial.border;
          let bgColor: string = editorial.paperSoft;
          let statusIcon = <AccessTimeIcon sx={{ fontSize: 16 }} />;
          let statusLabel = "Waiting";
          let iconColor: string = editorial.muted;

          if (enhanced?.status === "approved" || enhanced?.status === "confirmed") {
            borderColor = editorial.success;
            bgColor = "rgba(16, 124, 16, 0.06)";
            statusIcon = <CheckCircleIcon sx={{ fontSize: 16 }} />;
            statusLabel = enhanced.status === "confirmed" ? "Confirmed" : "Approved";
            iconColor = editorial.success;
          } else if (enhanced?.status === "rejected") {
            borderColor = editorial.error;
            bgColor = "rgba(198, 40, 40, 0.06)";
            statusIcon = <CancelIcon sx={{ fontSize: 16 }} />;
            statusLabel = "Rejected";
            iconColor = editorial.error;
          } else if (isActive) {
            borderColor = editorial.pmwPurple;
            bgColor = editorial.purpleWash;
            statusIcon = <AccessTimeIcon sx={{ fontSize: 16 }} />;
            statusLabel = enhanced?.type === "evaluation" ? "Pending Evaluation" : "Pending Approval";
            iconColor = editorial.pmwPurpleDark;
          }

          return (
            <Paper
              key={i}
              elevation={0}
              sx={{
                border: `1px solid ${borderColor}`,
                backgroundColor: bgColor,
                borderRadius: "10px",
                p: 2,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                boxShadow: isActive ? `0 0 0 3px ${editorial.pmwPurpleSoft}` : "none",
              }}
            >
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "8px",
                  backgroundColor: `${iconColor}14`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: iconColor,
                  fontSize: 14,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {statusIcon}
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 800, color: editorial.ink }}>
                  Layer {layerNum}
                  {enhanced?.type === "evaluation" && (
                    <Typography component="span" variant="caption" sx={{ color: editorial.muted, ml: 1 }}>
                      (Evaluation)
                    </Typography>
                  )}
                </Typography>
                <Typography variant="caption" sx={{ color: iconColor, fontWeight: 500 }}>
                  {statusLabel}
                </Typography>
              </Box>
              {enhanced?.email && (
                <Typography variant="caption" sx={{ color: editorial.muted, textAlign: "right" }}>
                  {enhanced.email}
                </Typography>
              )}
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
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

  let borderColor: string = editorial.pmwPurple;
  let bgColor: string = editorial.purpleWash;
  let iconColor: string = editorial.pmwPurpleDark;
  let statusIcon = <AccessTimeIcon sx={{ fontSize: 20 }} />;
  let statusLabel = "Awaiting";

  if (isSigned) {
    borderColor = editorial.success;
    bgColor = "rgba(16, 124, 16, 0.06)";
    iconColor = editorial.success;
    statusIcon = <CheckCircleIcon sx={{ fontSize: 20 }} />;
    statusLabel = "Signed";
  } else if (isRejected) {
    borderColor = editorial.error;
    bgColor = "rgba(198, 40, 40, 0.06)";
    iconColor = editorial.error;
    statusIcon = <CancelIcon sx={{ fontSize: 20 }} />;
    statusLabel = "Rejected";
  }

  return (
    <Paper
      elevation={0}
      sx={{
        border: `1px solid ${borderColor}33`,
        backgroundColor: bgColor,
        borderRadius: "12px",
        p: 2.5,
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
        "&:hover": {
          borderColor,
          boxShadow: "0 8px 20px rgba(16, 16, 16, 0.06)",
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: "10px",
            backgroundColor: `${iconColor}15`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: iconColor,
          }}
        >
          {statusIcon}
        </Box>
        <Typography variant="body1" sx={{ fontWeight: 800, color: editorial.ink }}>
          Layer {index + 1}
        </Typography>
        <Chip
          label={statusLabel}
          size="small"
          sx={{
            backgroundColor: `${iconColor}15`,
            color: iconColor,
            fontWeight: 600,
            fontSize: "0.7rem",
            height: 24,
            ml: "auto",
          }}
        />
      </Box>

      {layer.email && (
        <Typography variant="body2" sx={{ color: editorial.muted, mb: 0.5 }}>
          {layer.email}
        </Typography>
      )}

      {layer.signedAt && (
        <Typography variant="caption" sx={{ color: editorial.muted }}>
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
          sx={{ color: editorial.error, mt: 1, fontStyle: "italic" }}
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
            maxHeight: 100,
            mt: 1.5,
            borderRadius: "8px",
            border: editorialHairline,
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
            borderRadius: isMobile ? 0 : "12px",
            border: isMobile ? 0 : editorialHairline,
            overflow: "hidden",
            animation: "fadeInUp 0.3s ease-out",
            "@keyframes fadeInUp": {
              "0%": {
                opacity: 0,
                transform: "translateY(20px)",
              },
              "100%": {
                opacity: 1,
                transform: "translateY(0)",
              },
            },
            "@media (prefers-reduced-motion: reduce)": {
              animation: "none",
            },
          },
        },
      }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          background: `linear-gradient(135deg, ${editorial.pmwBlue}, ${editorial.pmwPurpleDark})`,
          color: "#ffffff",
          py: 3,
          px: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: 0 }}>
            {item?.title}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.8, mt: 0.5 }}>
            Submission Details
          </Typography>
        </Box>
        <IconButton
          aria-label="Close submission details"
          onClick={onClose}
          size="small"
          sx={{
            color: "#ffffff",
            backgroundColor: "rgba(255, 255, 255, 0.14)",
            border: "1px solid rgba(255, 255, 255, 0.28)",
            "&:hover": {
              backgroundColor: "rgba(255, 255, 255, 0.22)",
            },
          }}
        >
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
                <Chip
                  label={`Submitted: ${new Date(item.submittedAt).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}`}
                  size="small"
                  sx={{
                    backgroundColor: editorial.blueSoft,
                    color: editorial.pmwBlueDark,
                    border: `1px solid ${editorial.pmwBlueSoft}`,
                    fontWeight: 800,
                  }}
                />
              )}
              <Chip
                label={`SP ID: ${item.id}`}
                size="small"
                sx={{
                  backgroundColor: editorial.purpleWash,
                  color: editorial.pmwPurpleDark,
                  border: `1px solid ${editorial.pmwPurpleSoft}`,
                  fontWeight: 800,
                  fontFamily: "monospace",
                }}
              />
              <Typography variant="body2" sx={{ color: editorial.muted, ml: "auto" }}>
                {item.submittedByEmail}
              </Typography>
            </Box>

            <Divider />

            {/* Field grid */}
            {visibleFields.length > 0 && (
              <>
                <Grid container spacing={3}>
                  {visibleFields.map(([key, value]) => {
                    if (htmlFields.includes(key) && typeof value === "string") {
                      return (
                        <Grid size={{ xs: 12 }} key={key}>
                          <Box>
                            <Typography
                              variant="caption"
                              sx={{
                                textTransform: "uppercase",
                                letterSpacing: 0,
                                color: editorial.muted,
                                fontWeight: 600,
                                fontSize: "0.75rem",
                                display: "block",
                                mb: 1,
                              }}
                            >
                              {formatFieldName(key)}
                            </Typography>
                            <Box
                              sx={{
                                backgroundColor: "#ffffff",
                                border: editorialHairline,
                                borderRadius: "12px",
                                p: 2,
                                "& table": {
                                  width: "100%",
                                  borderCollapse: "collapse",
                                },
                                "& td, & th": {
                                  border: editorialHairline,
                                  padding: "10px 14px",
                                  fontSize: "0.875rem",
                                },
                                "& th": {
                                  backgroundColor: editorial.blueSoft,
                                  fontWeight: 600,
                                },
                                "& tr:nth-of-type(even)": {
                                  backgroundColor: "rgba(0,0,0,0.02)",
                                },
                              }}
                              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value) }}
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
                              letterSpacing: 0,
                              color: editorial.muted,
                              fontWeight: 600,
                              fontSize: "0.75rem",
                              display: "block",
                              mb: 1,
                            }}
                          >
                            {formatFieldName(key)}
                          </Typography>
                          <Box
                            sx={{
                              backgroundColor: "#ffffff",
                              border: editorialHairline,
                              borderRadius: "12px",
                              p: 2,
                              color: editorial.ink,
                              wordBreak: "break-word",
                            }}
                          >
                            <Typography variant="body2">
                              {formatFieldValue(value)}
                            </Typography>
                          </Box>
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
                    letterSpacing: 0,
                    color: editorial.muted,
                    fontWeight: 600,
                    fontSize: "0.75rem",
                    display: "block",
                    mb: 1,
                  }}
                >
                  HOD Signature
                </Typography>
                <Box
                  component="img"
                  src={item.submissionData.HodSignature as string}
                  alt="HOD Signature"
                  sx={{
                    maxHeight: 100,
                    borderRadius: "8px",
                    border: editorialHairline,
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
                    letterSpacing: 0,
                    color: editorial.muted,
                    fontWeight: 600,
                    fontSize: "0.75rem",
                    display: "block",
                    mb: 1,
                  }}
                >
                  Applicant Signature
                </Typography>
                <Box
                  component="img"
                  src={item.submissionData.ApplicantSignature as string}
                  alt="Applicant Signature"
                  sx={{
                    maxHeight: 100,
                    borderRadius: "8px",
                    border: editorialHairline,
                  }}
                />
              </Box>
            )}

            {/* Layer Progression */}
            {(item.totalLayers > 0) && (
              <>
                <LayerProgression
                  totalLayers={item.totalLayers}
                  currentLayer={item.currentLayer}
                  enhancedLayers={item.enhancedLayers}
                />
                <Divider sx={{ my: 2 }} />

                {/* Enhanced layer results */}
                {item.enhancedLayers && item.enhancedLayers.length > 0 && (
                  <>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 800, color: editorial.ink, letterSpacing: 0, mb: 2 }}
                    >
                      Layer Results
                    </Typography>
                    <Stack spacing={2}>
                      {item.enhancedLayers.map((layer, i) => {
                        if (!layer) return null;
                        if (layer.type === "evaluation") {
                          return (
                            <EvaluationSummary
                              key={i}
                              result={layer}
                              layerTitle={`Layer ${layer.layerNumber}`}
                            />
                          );
                        }
                        return (
                          <ApprovalCard
                            key={i}
                            layer={{
                              status: layer.status,
                              outcome: layer.outcome,
                              email: layer.email,
                              signedAt: layer.signedAt,
                              rejectionReason: layer.rejectionReason,
                              signature: layer.signature,
                            }}
                            index={layer.layerNumber - 1}
                          />
                        );
                      })}
                    </Stack>
                  </>
                )}

                {/* Fallback for old-format layers */}
                {(!item.enhancedLayers || item.enhancedLayers.length === 0) && item.layers && item.layers.length > 0 && (
                  <>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 800, color: editorial.ink, letterSpacing: 0 }}
                    >
                      Approval Chain
                    </Typography>
                    <Stack spacing={2}>
                      {item.layers.map(
                        (layer, i) => layer && <ApprovalCard key={i} layer={layer} index={i} />
                      )}
                    </Stack>
                  </>
                )}
              </>
            )}
          </Stack>
        )}
      </DialogContent>

      {/* Footer */}
      <DialogActions sx={{ px: 4, py: 2.5, borderTop: editorialHairline, backgroundColor: editorial.blueSoft }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            color: editorial.muted,
            fontSize: "0.8rem",
          }}
        >
          <LockIcon sx={{ fontSize: 16 }} />
          Read-only view — submissions cannot be modified from the dashboard.
        </Box>
        <Button
          onClick={onClose}
          variant="contained"
          startIcon={<CloseIcon />}
          sx={{
            backgroundColor: editorial.pmwBlue,
            borderRadius: "12px",
            textTransform: "none",
            fontWeight: 800,
            px: 3,
            py: 1,
            "&:hover": { backgroundColor: editorial.pmwBlueDark },
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

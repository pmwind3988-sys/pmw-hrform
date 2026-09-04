import { useState, useEffect, useRef } from "react";
import { Link as RouterLink, useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Container,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  IconButton,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormHelperText,
  Checkbox,
  FormControlLabel,
  Link,
  Skeleton,
} from "@mui/material";
import {
  UploadFile,
  CheckCircle,
  Description,
  Close,
  LocationOn,
  Work,
  Business,
  AssignmentInd,
  AttachFile,
  PrivacyTip,
  Send,
} from "@mui/icons-material";
import { useReactiveForm, required, email, phone } from "../hooks/useReactiveForm";
import { useUserProfile } from "../hooks/useUserProfile";
import { useHrFormsOwner } from "../hooks/useHrFormsOwner";
import { useMsal } from "@azure/msal-react";
import {
  acquireCareerPortalToken,
  fetchJob,
  submitApplication,
  ensureJobApplicationColumns,
  fetchMyApplications,
  isCareerPortalPrivateError,
} from "../utils/careersService";
import CareerPortalPrivateGate from "../components/careers/CareerPortalPrivateGate";
import type { JobListing, CustomFieldDefinition } from "../types";
import { acquireAccessTokenSilentOrRedirect } from "../utils/authRecovery";
import { getPdpaNoticeVersion, getPdpaRetentionUntil } from "../utils/pdpa";
import { usePdpaLocale } from "../hooks/usePdpaLocale";
import PdpaLanguageToggle from "../components/PdpaLanguageToggle";
import CareerPortalHeader from "../components/careers/CareerPortalHeader";
import { CareerErrorState, careerActionButtonSx, careerPageSx, careerPanelSx, getCareerErrorMessage } from "../components/careers/careerUi";
import { editorial } from "../theme/editorial";
import { isJobApplicationSubmitDisabled } from "./jobApplySubmitState";

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
interface FormValues extends Record<string, unknown> {
  name: string;
  email: string;
  phone: string;
  currentPosition: string;
  currentDepartment: string;
  coverLetter: string;
  resume: FileEntry | null;
  supportingDocs: FileEntry[];
}

interface FileEntry {
  name: string;
  content: string;
  contentType: string;
  role?: "resume" | "supporting" | "applicationPdf";
  /** File size in bytes (only for display/validation) */
  size: number;
}

const COUNTRY_CODES = [
  { code: "+60", flag: "🇲🇾", label: "Malaysia" },
  { code: "+65", flag: "🇸🇬", label: "Singapore" },
  { code: "+62", flag: "🇮🇩", label: "Indonesia" },
  { code: "+66", flag: "🇹🇭", label: "Thailand" },
  { code: "+63", flag: "🇵🇭", label: "Philippines" },
  { code: "+84", flag: "🇻🇳", label: "Vietnam" },
  { code: "+86", flag: "🇨🇳", label: "China" },
  { code: "+1", flag: "🇺🇸", label: "USA" },
  { code: "+44", flag: "🇬🇧", label: "UK" },
  { code: "+61", flag: "🇦🇺", label: "Australia" },
  { code: "+91", flag: "🇮🇳", label: "India" },
] as const;

const MAX_SUPPORTING_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
];

function SuccessView({
  submissionRef,
  onBrowseMore,
}: {
  submissionRef: string;
  onBrowseMore: () => void;
}) {
  return (
    <Box sx={{ textAlign: "center", py: 6 }}>
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          backgroundColor: editorial.successSoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mx: "auto",
          mb: 3,
        }}
      >
        <CheckCircle sx={{ fontSize: 40, color: editorial.success }} />
      </Box>
      <Typography variant="h3" sx={{ fontWeight: 700, color: editorial.ink, mb: 1, textWrap: "balance" }}>
        Application submitted
      </Typography>
      <Typography variant="body1" sx={{ color: editorial.muted, mb: 3, fontWeight: 600 }}>
        Your application has been received.
      </Typography>
      <Paper
        variant="outlined"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 1.5,
          px: 3,
          py: 2,
          borderRadius: "12px",
          borderColor: editorial.pmwBlueSoft,
          backgroundColor: editorial.blueWash,
          mb: 4,
        }}
      >
        <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 700 }}>
          Reference No.
        </Typography>
        <Typography
          variant="h6"
          sx={{ fontWeight: 700, color: editorial.ink, letterSpacing: 0, fontFamily: "monospace" }}
        >
          {submissionRef}
        </Typography>
      </Paper>
      <Typography variant="body2" sx={{ color: editorial.muted, mb: 4 }}>
        We will review your application and get back to you via email.
      </Typography>
      <Button
        variant="outlined"
        startIcon={<Work />}
        onClick={onBrowseMore}
        sx={{
          ...careerActionButtonSx,
          fontWeight: 700,
          px: 4,
          py: 1.2,
        }}
      >
        Browse opportunities
      </Button>
    </Box>
  );
}

function JobSummarySkeleton() {
  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width="88%" height={28} />
          <Skeleton variant="text" width="54%" height={18} />
        </Box>
        <Skeleton variant="rounded" width={36} height={36} sx={{ borderRadius: "12px" }} />
      </Box>
      <Skeleton variant="rounded" width={96} height={24} sx={{ borderRadius: "12px", mb: 1.5 }} />
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1.5 }}>
        <Skeleton variant="text" width="46%" height={20} />
        <Skeleton variant="rounded" width={92} height={24} sx={{ borderRadius: "12px" }} />
      </Box>
    </>
  );
}

function ApplicationFormSkeleton() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Skeleton variant="rounded" width="100%" height={56} sx={{ borderRadius: "12px" }} />
      <Skeleton variant="rounded" width="100%" height={56} sx={{ borderRadius: "12px" }} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "120px 1fr" }, gap: 1.5 }}>
        <Skeleton variant="rounded" width="100%" height={56} sx={{ borderRadius: "12px" }} />
        <Skeleton variant="rounded" width="100%" height={56} sx={{ borderRadius: "12px" }} />
      </Box>
      <Divider />
      <Skeleton variant="rounded" width="100%" height={92} sx={{ borderRadius: "12px" }} />
      <Skeleton variant="rounded" width="100%" height={92} sx={{ borderRadius: "12px" }} />
      <Skeleton variant="rounded" width="100%" height={120} sx={{ borderRadius: "12px" }} />
      <Skeleton variant="rounded" width={180} height={42} sx={{ borderRadius: "12px", alignSelf: "flex-end" }} />
    </Box>
  );
}

function FormSectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.25, mb: 0.5 }}>
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: "12px",
          backgroundColor: editorial.blueWash,
          color: editorial.pmwBlueDark,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          "& .MuiSvgIcon-root": { fontSize: 19 },
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ color: editorial.ink, fontWeight: 700, lineHeight: 1.2 }}>
          {title}
        </Typography>
        <Typography variant="body2" sx={{ color: editorial.muted, lineHeight: 1.45, textWrap: "pretty" }}>
          {description}
        </Typography>
      </Box>
    </Box>
  );
}

function FileUploadArea({
  files,
  onAdd,
  onRemove,
  maxFiles = 5,
  maxFileSize = MAX_FILE_SIZE,
  acceptTypes = ACCEPTED_TYPES,
  label = "Upload Files",
  hint,
  singleFile = false,
}: {
  files: FileEntry[];
  onAdd: (entries: FileEntry[]) => void;
  onRemove: (index: number) => void;
  maxFiles?: number;
  maxFileSize?: number;
  acceptTypes?: string[];
  label?: string;
  hint?: string;
  singleFile?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setSizeError(null);
    setReading(true);
    const newEntries: FileEntry[] = [];
    const remaining = maxFiles - files.length;

    if (remaining <= 0) {
      setSizeError(`You can upload up to ${maxFiles} file${maxFiles !== 1 ? "s" : ""}.`);
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (selectedFiles.length > remaining) {
      setSizeError(`Only ${remaining} more file${remaining !== 1 ? "s" : ""} can be added.`);
    }

    for (const file of selectedFiles.slice(0, remaining)) {
      if (file.size > maxFileSize) {
        setSizeError(`"${file.name}" exceeds ${Math.round(maxFileSize / 1024 / 1024)} MB limit`);
        continue;
      }
      if (file.type && !acceptTypes.includes(file.type)) {
        setSizeError(`"${file.name}" is not an accepted file type.`);
        continue;
      }
      try {
        const content = await readFileAsBase64(file);
        newEntries.push({ name: file.name, content, contentType: file.type, size: file.size });
      } catch (err) {
        setSizeError(getCareerErrorMessage(err, `Could not read "${file.name}". Please try again.`));
      }
    }

    onAdd(newEntries);
    setReading(false);
  };

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    await handleFiles(Array.from(fileList));
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 700, color: editorial.ink, mb: 0.5 }}>
        {label}
        {!singleFile && <Typography variant="caption" sx={{ color: editorial.softMuted, fontWeight: 400, ml: 0.5 }}>(Max {maxFiles} files)</Typography>}
      </Typography>
      {hint && (
        <Typography variant="caption" sx={{ color: editorial.softMuted, display: "block", mb: 1.5 }}>
          {hint}
        </Typography>
      )}

      {(!singleFile || files.length === 0) && (
        <>
          {/* Drop zone */}
          <Paper
            variant="outlined"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void handleFiles(Array.from(event.dataTransfer.files));
            }}
            role="button"
            tabIndex={0}
            aria-label={singleFile ? `Upload ${label}` : `Upload ${label} files`}
            sx={{
              borderStyle: "dashed",
              borderColor: sizeError ? editorial.error : dragging ? editorial.pmwBlue : editorial.pmwBlueSoft,
              borderRadius: "12px",
              p: 3,
              textAlign: "center",
              cursor: "pointer",
              transition: "background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
              backgroundColor: dragging ? editorial.blueWash : "rgba(255,255,255,0.72)",
              "&:hover": {
                borderColor: editorial.pmwBlue,
                backgroundColor: editorial.blueWash,
              },
              "&:focus-visible": {
                outline: `3px solid ${editorial.pmwBlueSoft}`,
                outlineOffset: 2,
              },
              "&:active": {
                transform: "scale(0.99)",
              },
              opacity: reading ? 0.6 : 1,
            }}
          >
            <input
              ref={inputRef}
              type="file"
              multiple={!singleFile}
              accept={acceptTypes.join(",")}
              onChange={handleSelect}
              style={{ display: "none" }}
            />
            {reading ? (
              <CircularProgress size={24} sx={{ color: editorial.ink }} />
            ) : (
              <>
                <UploadFile sx={{ fontSize: 32, color: editorial.pmwBlue, mb: 1 }} />
                <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 700 }}>
                  {dragging ? "Drop files here" : singleFile ? "Click to upload" : "Click or drop files here"}
                </Typography>
                <Typography variant="caption" sx={{ color: editorial.muted, display: "block", mt: 0.5 }}>
                  PDF, DOC, DOCX, JPEG, PNG (max {Math.round(maxFileSize / 1024 / 1024)} MB)
                </Typography>
              </>
            )}
          </Paper>
          {sizeError && (
            <Typography variant="caption" sx={{ color: editorial.error, mt: 0.5, display: "block" }}>
              {sizeError}
            </Typography>
          )}
        </>
      )}

      {/* File list */}
      {files.length > 0 && (
        <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
          {files.map((file, i) => (
            <Paper
              key={i}
              variant="outlined"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1.5,
                py: 1,
                borderRadius: "12px",
                borderColor: editorial.border,
              }}
            >
              <Description sx={{ fontSize: 18, color: editorial.muted, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ color: editorial.ink, fontSize: "0.78rem" }} noWrap>
                  {file.name}
                </Typography>
                {file.size > 0 && (
                  <Typography variant="caption" sx={{ color: editorial.muted }}>
                    {file.size < 1024 * 1024
                      ? `${Math.round(file.size / 1024)} KB`
                      : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
                  </Typography>
                )}
              </Box>
              {!singleFile && (
                <IconButton size="small" onClick={() => onRemove(i)} sx={{ color: editorial.softMuted }}>
                  <Close sx={{ fontSize: 16 }} />
                </IconButton>
              )}
            </Paper>
          ))}
          {singleFile && (
            <Button size="small" onClick={() => onRemove(0)} sx={{ alignSelf: "flex-start", borderRadius: "12px", textTransform: "none", color: editorial.error, fontSize: "0.78rem", mt: -0.5 }}>
              Remove file
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:...;base64, prefix if present
      const base64 = result.includes("base64,") ? result.split("base64,")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export default function JobApplyPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { locale: pdpaLocale, setLocale: setPdpaLocale, content: pdpa } = usePdpaLocale();
  const profile = useUserProfile();
  const { instance, accounts } = useMsal();
  const activeAccount = instance.getActiveAccount() ?? accounts[0];
  // MSAL rebuilds AccountInfo on every read, so `activeAccount` has a new object
  // identity each render. Effects must key on this stable string - depending on
  // the object re-runs them every render, and any effect that then sets state
  // re-renders into an unbounded fetch loop. Signed out the value is a stable
  // undefined, which is why only signed-in sessions spin.
  const accountKey = activeAccount?.homeAccountId || activeAccount?.username || "";
  const overrideRequested = searchParams.get("override") === "1";

  const [job, setJob] = useState<JobListing | null>(null);
  const [jobLoading, setJobLoading] = useState(true);
  const [jobLoadError, setJobLoadError] = useState<string | null>(null);
  const [restrictedMessage, setRestrictedMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submissionRef, setSubmissionRef] = useState("");
  const [customAnswers, setCustomAnswers] = useState<Record<string, unknown>>({});
  const [customFieldErrors, setCustomFieldErrors] = useState<Record<string, string>>({});
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [duplicateBlocked, setDuplicateBlocked] = useState(false);
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [duplicateChecking, setDuplicateChecking] = useState(true);
  const [phoneCountryCode, setPhoneCountryCode] = useState("+60");
  const [pdpaAccepted, setPdpaAccepted] = useState(false);
  const [pdpaTouched, setPdpaTouched] = useState(false);
  const isSignedIn = Boolean(activeAccount);
  const isAdmin = useHrFormsOwner();
  const adminOverrideMode = alreadyApplied && isAdmin && overrideRequested;
  const nameLockedFromProfile = !profile.loading && !profile.error && !!profile.displayName;
  const emailLockedFromProfile = !profile.loading && !profile.error && !!profile.email;

  // Fetch job details for summary
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setJobLoading(true);
      setJobLoadError(null);
      try {
        // Re-read rather than closing over the render-time object.
        const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
        const accessToken = await acquireCareerPortalToken(instance, account);
        const found = jobId ? await fetchJob(jobId, { accessToken }) : null;
        if (!cancelled) setJob(found);
      } catch (err) {
        if (cancelled) return;
        setJob(null);
        if (isCareerPortalPrivateError(err)) {
          setRestrictedMessage(err instanceof Error ? err.message : "");
        } else {
          setJobLoadError(getCareerErrorMessage(err, "Could not load this opportunity."));
        }
      } finally {
        if (!cancelled) setJobLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [jobId, instance, accountKey]);

  useEffect(() => {
    let cancelled = false;
    async function checkDuplicate() {
      // Re-read rather than closing over the render-time object.
      const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
      const email = account?.username?.toLowerCase() || "";
      if (!jobId || !email) {
        setDuplicateChecking(false);
        return;
      }
      setDuplicateChecking(true);
      try {
        if (!account) throw new Error("No signed-in account");
        const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
        const accessToken = await acquireAccessTokenSilentOrRedirect(instance, {
          scopes: [`${new URL(SP_SITE_URL).origin}/AllSites.Manage`],
          account,
        });
        const applications = await fetchMyApplications(email, { accessToken });
        if (!cancelled) {
          const applied = applications.some((app) => app.jobListingId === jobId);
          setAlreadyApplied(applied);
          setDuplicateBlocked(applied && !adminOverrideMode);
          setSubmitError(applied && !adminOverrideMode
            ? "You have already applied for this position. Multiple applications are not allowed."
            : null);
        }
      } catch {
        if (!cancelled) {
          setAlreadyApplied(false);
        }
      } finally {
        if (!cancelled) setDuplicateChecking(false);
      }
    }
    void checkDuplicate();
    return () => { cancelled = true; };
  }, [jobId, accountKey, adminOverrideMode, instance]);

  const form = useReactiveForm<FormValues>({
    name: { value: "", validators: [required] },
    email: { value: "", validators: [required, email] },
    phone: { value: "+60 ", validators: [required, phone] },
    currentPosition: { value: "" },
    currentDepartment: { value: "" },
    coverLetter: { value: "" },
    resume: { value: null },
    supportingDocs: { value: [] },
  });

  // Pre-fill from profile once loaded
  useEffect(() => {
    if (!profile.loading && !profile.error) {
      let phoneVal = profile.phone || form.value.phone;
      // Detect country code from profile phone
      if (profile.phone) {
        for (const cc of COUNTRY_CODES) {
          if (profile.phone.startsWith(cc.code.replace("+", "")) || profile.phone.startsWith(cc.code)) {
            setPhoneCountryCode(cc.code);
            break;
          }
        }
      }
      // Ensure phone has country code prefix
      if (profile.phone && !profile.phone.startsWith("+")) {
        phoneVal = `${phoneCountryCode} ${profile.phone}`;
      }
      form.setValue({
        name: profile.displayName || form.value.name,
        email: profile.email || form.value.email,
        phone: phoneVal,
        currentPosition: profile.jobTitle || form.value.currentPosition,
        currentDepartment: profile.department || form.value.currentDepartment,
      });
    }
    // Only run when profile loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.loading, profile.error]);

  const setCustomAnswer = (name: string, value: unknown) => {
    setCustomAnswers((prev) => ({ ...prev, [name]: value }));
  };

  const doSubmit = async (values: FormValues, forceApply = false) => {
    if (!jobId || !job) return;
    setSubmitting(true);
    setSubmitError(null);
    setDuplicateBlocked(false);

    if (alreadyApplied && !forceApply) {
      setDuplicateBlocked(true);
      setSubmitError("You have already applied for this position. Multiple applications are not allowed.");
      setSubmitting(false);
      return;
    }

    if (!pdpaAccepted) {
      setPdpaTouched(true);
      setSubmitError("Please read and accept the Privacy Notice before submitting your application.");
      setSubmitting(false);
      return;
    }

    // Validate resume
    if (!values.resume) {
      setResumeError("A resume or CV is required");
      setSubmitting(false);
      return;
    }
    setResumeError(null);

    // Validate required custom fields
    const errs: Record<string, string> = {};
    let hasCustomErr = false;
    if (job.customFields) {
      for (const field of job.customFields) {
        if (field.required && !customAnswers[field.name]) {
          errs[field.name] = "This field is required";
          hasCustomErr = true;
        }
      }
    }
    setCustomFieldErrors(errs);
    if (hasCustomErr) {
      setSubmitting(false);
      return;
    }

    try {
      // A Public Respondent applies without signing in and has no delegated token —
      // the API writes those through the app-only SharePoint principal instead. Only
      // a signed-in applicant acquires a token here, which keeps their own identity
      // on the SharePoint item.
      const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL || "").replace(/\/$/, "");
      let accessToken = "";
      if (activeAccount && SP_SITE_URL) {
        try {
          accessToken = await acquireAccessTokenSilentOrRedirect(instance, {
            scopes: [`${new URL(SP_SITE_URL).origin}/AllSites.Manage`],
            account: activeAccount,
          });
        } catch {
          setSubmitError("Could not get your SharePoint permission token. Please sign in again and retry.");
          setSubmitting(false);
          return;
        }
      }

      // Generate submission ref once — used for both the PDF and the API submission
      const submissionRef = `JOB-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // Generate PDF
      let pdfBase64 = "";
      try {
        const [{ pdf }, { default: JobApplyPdfDocument }] = await Promise.all([
          import("@react-pdf/renderer"),
          import("../utils/JobApplyPdfDocument"),
        ]);
        const pdfBlob = await pdf(
          JobApplyPdfDocument({
            data: {
              jobTitle: job.title,
              company: job.company,
              applicantName: values.name,
              applicantEmail: values.email,
              applicantPhone: values.phone,
              currentPosition: values.currentPosition,
              currentDepartment: values.currentDepartment,
              submissionRef,
              submittedAt: new Date().toISOString(),
              reasoning: values.coverLetter,
              customAnswers,
            },
          }),
        ).toBlob();
        pdfBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.includes("base64,") ? result.split("base64,")[1] : result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(pdfBlob);
        });
      } catch {
        // PDF generation failed — submit without it
      }

      // Ensure all SharePoint columns exist — blocks submission if provisioning fails.
      // Needs Manage rights, so only a signed-in applicant can run it; for a Public
      // Respondent the API provisions server-side before writing.
      if (accessToken) {
        try {
          await ensureJobApplicationColumns(accessToken, SP_SITE_URL);
        } catch (err) {
          setSubmitError(getCareerErrorMessage(err, "Required application storage could not be prepared. Please retry or contact HR."));
          setSubmitting(false);
          return;
        }
      }

      // Combine resume + supporting docs + generated PDF
      const allFiles: FileEntry[] = [];
      if (values.resume) allFiles.push({ ...values.resume, role: "resume" });
      allFiles.push(...values.supportingDocs.map((file) => ({ ...file, role: "supporting" as const })));
      if (pdfBase64) {
        allFiles.push({
          name: "CareerAdvancementApplication.pdf",
          content: pdfBase64,
          contentType: "application/pdf",
          role: "applicationPdf",
          size: 0,
        });
      }

      // Separate from the SharePoint token above: this only proves the applicant
      // is signed in, which is what a portal closed to the public checks. Staff
      // with no SharePoint site access have one but not the other.
      const identityToken = await acquireCareerPortalToken(instance, activeAccount ?? null);

      const result = await submitApplication({
        jobListingId: jobId,
        jobTitle: job.title,
        company: job.company,
        applicantName: values.name,
        applicantEmail: values.email,
        applicantPhone: values.phone,
        currentPosition: values.currentPosition,
        currentDepartment: values.currentDepartment,
        coverLetter: values.coverLetter,
        files: allFiles,
        customAnswers,
        accessToken: accessToken || undefined,
        submittedByEmail: activeAccount?.username || "",
        forceApply,
        submissionRef,
        pdpaConsent: true,
        pdpaNoticeVersion: getPdpaNoticeVersion(pdpaLocale),
        pdpaConsentedAt: new Date().toISOString(),
        retentionUntil: getPdpaRetentionUntil(),
      }, { accessToken: identityToken });
      setSubmissionRef(result.submissionRef);
      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // An admin can close the portal between opening this form and submitting it.
      if (isCareerPortalPrivateError(err)) {
        setRestrictedMessage(msg);
        return;
      }
      // Detect duplicate rejection (409)
      if (msg.includes("already applied")) {
        setDuplicateBlocked(true);
      }
      setSubmitError(getCareerErrorMessage(err, msg || "Application could not be submitted. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = form.submit((values) => {
    setResumeError(null);
    setCustomFieldErrors({});
    const hasCustomErr = job?.customFields?.some((f) => f.required && !customAnswers[f.name]);
    if (!values.resume || hasCustomErr) {
      if (!values.resume) setResumeError("A resume or CV is required");
      if (hasCustomErr) {
        const errs: Record<string, string> = {};
        for (const field of (job?.customFields || [])) {
          if (field.required && !customAnswers[field.name]) {
            errs[field.name] = "This field is required";
          }
        }
        setCustomFieldErrors(errs);
      }
      return;
    }
    void doSubmit(values, adminOverrideMode);
  });

  if (restrictedMessage !== null) {
    return <CareerPortalPrivateGate message={restrictedMessage} />;
  }

  if (submitted) {
    return (
      <Box sx={careerPageSx}>
        <Container maxWidth="sm" sx={{ py: 8 }}>
          <SuccessView submissionRef={submissionRef} onBrowseMore={() => navigate("/career-portal", { replace: true })} />
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={careerPageSx}>
      <CareerPortalHeader
        title="Apply for role"
        subtitle={job ? job.title : "Complete your internal opportunity application."}
        activeSection="apply"
        backPath="/career-portal"
        backLabel="Back to opportunities"
        maxWidth="md"
        showSectionNav={false}
      />

      <Container maxWidth="md" sx={{ py: 4 }}>
        <Grid container spacing={3}>
          {/* Job Summary */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper
              sx={{
                p: 2.5,
                borderRadius: "12px",
                border: `1px solid ${editorial.border}`,
                boxShadow: "none",
                position: "sticky",
                top: 88,
              }}
            >
              {jobLoading ? (
                <JobSummarySkeleton />
              ) : job ? (
                <>
                  {/* Row 1: Title left · Icon right (vertically centered) */}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: editorial.ink, fontSize: "0.9375rem", flex: 1, lineHeight: 1.3 }}>
                      {job.title}
                    </Typography>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        backgroundColor: editorial.blueWash,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Work sx={{ fontSize: 18, color: editorial.ink }} />
                    </Box>
                  </Box>

                  {/* Row 2: Department chip alone */}
                  <Box sx={{ mb: 1.5 }}>
                    {job.company && (
                      <Chip
                        icon={<Business sx={{ fontSize: 14 }} />}
                        label={job.company}
                        size="small"
                        sx={{
                          mr: 0.75,
                          mb: 0.75,
                          backgroundColor: editorial.blueWash,
                          color: editorial.pmwBlueDark,
                          fontWeight: 700,
                          fontSize: "0.72rem",
                          borderRadius: "999px",
                          "& .MuiChip-icon": { color: editorial.pmwBlue },
                        }}
                      />
                    )}
                    <Chip
                      label={job.department}
                      size="small"
                      sx={{ backgroundColor: editorial.purpleWash, color: editorial.pmwPurpleDark, fontWeight: 700, fontSize: "0.72rem", borderRadius: "999px", border: `1px solid ${editorial.pmwPurpleSoft}` }}
                    />
                  </Box>

                  {/* Row 3: Location ↔ Employment type, spaced apart */}
                  {job.location ? (
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
                        <LocationOn sx={{ fontSize: 14, color: editorial.muted, flexShrink: 0 }} />
                        <Typography variant="body2" sx={{ color: editorial.muted, fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {job.location}
                        </Typography>
                      </Box>
                      <Chip
                        label={job.employmentType}
                        size="small"
                        variant="outlined"
                        sx={{ borderRadius: "999px", fontSize: "0.72rem", borderColor: editorial.border, color: editorial.muted, flexShrink: 0 }}
                      />
                    </Box>
                  ) : (
                    <Chip
                      label={job.employmentType}
                      size="small"
                      variant="outlined"
                      sx={{ borderRadius: "999px", fontSize: "0.72rem", borderColor: editorial.border, color: editorial.muted }}
                    />
                  )}
                </>
              ) : jobLoadError ? (
                <CareerErrorState message={jobLoadError} />
              ) : (
                <Typography variant="body2" sx={{ color: editorial.muted }}>
                  Opportunity not found.
                </Typography>
              )}
            </Paper>
          </Grid>

          {/* Application Form */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Paper sx={{ ...careerPanelSx, p: { xs: 2.25, sm: 3 }, borderRadius: "12px" }}>
              {/* Profile prefill only applies to a signed-in applicant. A Public
                  Respondent has no profile to load, so neither state is an event
                  worth reporting to them — they just fill the form in. */}
              {isSignedIn && profile.loading && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                  <CircularProgress size={14} sx={{ color: editorial.ink }} />
                  <Typography variant="caption" sx={{ color: editorial.muted }}>
                    Loading your profile...
                  </Typography>
                </Box>
              )}
              {isSignedIn && profile.error && (
                <Alert severity="warning" sx={{ mb: 2, borderRadius: "12px" }}>
                  Could not load profile. Please fill in your details manually.
                </Alert>
              )}

              {jobLoading ? (
                <ApplicationFormSkeleton />
              ) : (
              <form onSubmit={handleSubmit}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                  <FormSectionHeader
                    icon={<AssignmentInd />}
                    title="Applicant details"
                    description={
                      isSignedIn
                        ? "Confirm your profile details so HR can reach you about this role."
                        : "Tell us how HR can reach you about this role."
                    }
                  />
                  {/* Name */}
                  <TextField
                    label="Full Name"
                    value={form.controls.name.value}
                    onChange={(e) => form.controls.name.setValue(e.target.value)}
                    onBlur={form.controls.name.onBlur}
                    error={form.controls.name.touched && !!form.controls.name.errors.required}
                    helperText={
                      form.controls.name.touched && form.controls.name.errors.required
                        ? "Name is required"
                        : nameLockedFromProfile
                          ? "From your Microsoft profile"
                          : ""
                    }
                    fullWidth
                    required
                    variant="outlined"
                    slotProps={{
                      input: {
                        readOnly: nameLockedFromProfile,
                        sx: {
                          borderRadius: "12px",
                          ...(nameLockedFromProfile ? { backgroundColor: editorial.paperSoft } : {}),
                        },
                      },
                    }}
                  />

                  {/* Email */}
                  <TextField
                    label="Email Address"
                    type="email"
                    value={form.controls.email.value}
                    onChange={(e) => form.controls.email.setValue(e.target.value)}
                    onBlur={form.controls.email.onBlur}
                    error={form.controls.email.touched && !!(form.controls.email.errors.required || form.controls.email.errors.email)}
                    helperText={
                      form.controls.email.touched && form.controls.email.errors.required
                        ? "Email is required"
                        : form.controls.email.touched && form.controls.email.errors.email
                          ? "Please enter a valid email"
                          : emailLockedFromProfile
                            ? "From your Microsoft profile"
                            : ""
                    }
                    fullWidth
                    required
                    variant="outlined"
                    slotProps={{
                      input: {
                        readOnly: emailLockedFromProfile,
                        sx: {
                          borderRadius: "12px",
                          ...(emailLockedFromProfile ? { backgroundColor: editorial.paperSoft } : {}),
                        },
                      },
                    }}
                  />

                  {/* Phone */}
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: editorial.ink, mb: 0.5 }}>
                      Phone Number <span style={{ color: editorial.error }}>*</span>
                    </Typography>
                    <Grid container spacing={1}>
                      <Grid size={{ xs: 4, sm: 3 }}>
                        <FormControl fullWidth error={form.controls.phone.touched && !!(form.controls.phone.errors.required || form.controls.phone.errors.phone)}>
                          <Select
                            value={phoneCountryCode}
                            onChange={(e) => {
                              setPhoneCountryCode(e.target.value);
                              const num = form.controls.phone.value.replace(/^\+?\d{1,3}[\s-]?/, "").trim();
                              form.controls.phone.setValue(`${e.target.value} ${num}`);
                            }}
                            variant="outlined"
                            sx={{ borderRadius: "12px" }}
                          >
                            {COUNTRY_CODES.map((cc) => (
                              <MenuItem key={cc.code} value={cc.code}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                  <span>{cc.flag}</span>
                                  <span>{cc.code}</span>
                                </Box>
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid size={{ xs: 8, sm: 9 }}>
                        <TextField
                          value={form.controls.phone.value.replace(/^\+?\d{1,3}\s?/, "")}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/[^\d\s-]/g, "");
                            form.controls.phone.setValue(`${phoneCountryCode} ${digits}`);
                          }}
                          onBlur={form.controls.phone.onBlur}
                          error={form.controls.phone.touched && !!(form.controls.phone.errors.required || form.controls.phone.errors.phone)}
                          helperText={
                            form.controls.phone.touched && form.controls.phone.errors.required
                              ? "Phone number is required"
                              : form.controls.phone.touched && form.controls.phone.errors.phone
                                ? "Please enter a valid phone number (default: Malaysia)"
                                : ""
                          }
                          fullWidth
                          placeholder="e.g. 12-345 6789"
                          variant="outlined"
                          slotProps={{
                            input: { sx: { borderRadius: "12px" } },
                          }}
                        />
                      </Grid>
                    </Grid>
                  </Box>

                  {/* Current Position */}
                  <TextField
                    label="Current Position"
                    value={form.controls.currentPosition.value}
                    onChange={(e) => form.controls.currentPosition.setValue(e.target.value)}
                    fullWidth
                    variant="outlined"
                    placeholder="e.g. Senior Engineer"
                    slotProps={{
                      input: { sx: { borderRadius: "12px" } },
                    }}
                  />

                  {/* Current Department */}
                  <TextField
                    label="Current Department"
                    value={form.controls.currentDepartment.value}
                    onChange={(e) => form.controls.currentDepartment.setValue(e.target.value)}
                    fullWidth
                    variant="outlined"
                    placeholder="e.g. Information Technology"
                    slotProps={{
                      input: { sx: { borderRadius: "12px" } },
                    }}
                  />

                  {/* Reasoning */}
                  <TextField
                    label="Reasoning (Optional)"
                    value={form.controls.coverLetter.value}
                    onChange={(e) => form.controls.coverLetter.setValue(e.target.value)}
                    fullWidth
                    multiline
                    rows={5}
                    variant="outlined"
                    placeholder="Explain your interest in this position and why you'd be a great fit..."
                    slotProps={{
                      input: { sx: { borderRadius: "12px" } },
                    }}
                  />

                  <Divider sx={{ my: 1.5 }} />

                  <FormSectionHeader
                    icon={<AttachFile />}
                    title="Documents"
                    description="Attach your resume first, then add any supporting files that strengthen your application."
                  />

                  {/* Resume Upload (Required) */}
                  <FileUploadArea
                    files={form.controls.resume.value ? [form.controls.resume.value] : []}
                    onAdd={(newFiles) => {
                      if (newFiles.length > 0) form.controls.resume.setValue(newFiles[0]);
                    }}
                    onRemove={() => form.controls.resume.setValue(null)}
                    maxFiles={1}
                    singleFile
                    label="Resume / CV"
                    hint="Required. Upload your current resume or CV."
                  />
                  {resumeError && (
                    <Typography variant="caption" sx={{ color: editorial.error, fontWeight: 500, display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                      {resumeError}
                    </Typography>
                  )}

                  <Box sx={{ mt: 2.5 }}>
                    {/* Supporting Documents (Optional) */}
                    <FileUploadArea
                      files={form.controls.supportingDocs.value}
                      onAdd={(newFiles) => {
                        const current = form.controls.supportingDocs.value;
                        form.controls.supportingDocs.setValue([...current, ...newFiles].slice(0, MAX_SUPPORTING_FILES));
                      }}
                      onRemove={(index) => {
                        const current = form.controls.supportingDocs.value;
                        form.controls.supportingDocs.setValue(current.filter((_, i) => i !== index));
                      }}
                      maxFiles={MAX_SUPPORTING_FILES}
                      label="Supporting Documents"
                      hint="Optional. Certificates, cover letter, portfolio, etc."
                    />
                  </Box>
                  {/* Dynamic Custom Fields */}
                  {job?.customFields && job.customFields.length > 0 && (
                    <>
                      <Divider sx={{ my: 1.5 }} />
                      <FormSectionHeader
                        icon={<Description />}
                        title="Additional questions"
                        description="Answer the role-specific questions requested by HR."
                      />
                      {job.customFields.map((field: CustomFieldDefinition) => {
                        const fieldError = customFieldErrors[field.name];
                        const hasError = !!fieldError;
                        return (
                          <Box key={field.name}>
                            {field.type === "choice" ? (
                              <FormControl fullWidth error={hasError}>
                                <InputLabel>{field.label}{field.required ? " *" : ""}</InputLabel>
                                <Select
                                  value={String(customAnswers[field.name] ?? "")}
                                  label={`${field.label}${field.required ? " *" : ""}`}
                                  onChange={(e) => { setCustomAnswer(field.name, e.target.value); setCustomFieldErrors((prev) => { const n = { ...prev }; delete n[field.name]; return n; }); }}
                                  sx={{ borderRadius: "12px" }}
                                >
                                  {(field.choices || []).map((opt) => (
                                    <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                                  ))}
                                </Select>
                                {hasError && <FormHelperText error>{fieldError}</FormHelperText>}
                              </FormControl>
                            ) : field.type === "textarea" ? (
                              <TextField
                                label={`${field.label}${field.required ? " *" : ""}`}
                                value={String(customAnswers[field.name] ?? "")}
                                onChange={(e) => { setCustomAnswer(field.name, e.target.value); setCustomFieldErrors((prev) => { const n = { ...prev }; delete n[field.name]; return n; }); }}
                                fullWidth
                                multiline
                                rows={3}
                                variant="outlined"
                                error={hasError}
                                helperText={hasError ? fieldError : undefined}
                                slotProps={{ input: { sx: { borderRadius: "12px" } } }}
                              />
                            ) : field.type === "number" ? (
                              <TextField
                                label={`${field.label}${field.required ? " *" : ""}`}
                                type="number"
                                value={String(customAnswers[field.name] ?? "")}
                                onChange={(e) => { setCustomAnswer(field.name, e.target.value); setCustomFieldErrors((prev) => { const n = { ...prev }; delete n[field.name]; return n; }); }}
                                fullWidth
                                variant="outlined"
                                error={hasError}
                                helperText={hasError ? fieldError : undefined}
                                slotProps={{ input: { sx: { borderRadius: "12px" } } }}
                              />
                            ) : field.type === "date" ? (
                              <TextField
                                label={`${field.label}${field.required ? " *" : ""}`}
                                type="date"
                                value={String(customAnswers[field.name] ?? "")}
                                onChange={(e) => { setCustomAnswer(field.name, e.target.value); setCustomFieldErrors((prev) => { const n = { ...prev }; delete n[field.name]; return n; }); }}
                                fullWidth
                                variant="outlined"
                                error={hasError}
                                helperText={hasError ? fieldError : undefined}
                                slotProps={{
                                  input: { sx: { borderRadius: "12px" } },
                                  inputLabel: { shrink: true },
                                }}
                              />
                            ) : (
                              <TextField
                                label={`${field.label}${field.required ? " *" : ""}`}
                                value={String(customAnswers[field.name] ?? "")}
                                onChange={(e) => { setCustomAnswer(field.name, e.target.value); setCustomFieldErrors((prev) => { const n = { ...prev }; delete n[field.name]; return n; }); }}
                                fullWidth
                                variant="outlined"
                                error={hasError}
                                helperText={hasError ? fieldError : undefined}
                                slotProps={{ input: { sx: { borderRadius: "12px" } } }}
                              />
                            )}
                          </Box>
                        );
                      })}
                    </>
                  )}

                  {/* Error */}
                  {submitError && (
                    <Alert
                      severity={duplicateBlocked ? "warning" : "error"}
                      sx={{
                        borderRadius: "12px",
                        fontWeight: 700,
                        fontSize: "0.845rem",
                        ...(duplicateBlocked ? {} : {
                          backgroundColor: editorial.errorSoft,
                          color: editorial.error,
                          "& .MuiAlert-icon": { color: editorial.error },
                        }),
                      }}
                    >
                      {submitError}
                    </Alert>
                  )}

                  {adminOverrideMode && (
                    <Alert severity="warning" sx={{ borderRadius: "12px", fontWeight: 700, fontSize: "0.845rem" }}>
                      You already applied for this position. Admin override mode is active and will create a duplicate test application.
                    </Alert>
                  )}

                  {/* Test Submit (admin only — bypasses duplicate check) */}
                  {duplicateBlocked && isAdmin && (
                    <Button
                      variant="outlined"
                      fullWidth
                      disabled={submitting || duplicateChecking}
                      onClick={() => setSearchParams({ override: "1" })}
                      sx={{
                        ...careerActionButtonSx,
                        fontWeight: 600,
                        fontSize: "0.875rem",
                        py: 1.3,
                        borderColor: editorial.accent,
                        color: editorial.accent,
                        "&:hover": { borderColor: editorial.accentText, backgroundColor: "rgba(230, 118, 53, 0.06)" },
                      }}
                    >
                      Enable Override Apply
                    </Button>
                  )}

                  <Divider sx={{ my: 1.5 }} />
                  <FormSectionHeader
                    icon={<PrivacyTip />}
                    title="Privacy consent"
                    description="Review the notice and confirm consent before submitting this application."
                  />

                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      borderRadius: "12px",
                      borderColor: pdpaTouched && !pdpaAccepted ? editorial.error : editorial.pmwBlueSoft,
                      backgroundColor: editorial.blueSoft,
                    }}
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={pdpaAccepted}
                          onChange={(e) => {
                            setPdpaAccepted(e.target.checked);
                            setPdpaTouched(true);
                          }}
                          sx={{ color: editorial.pmwBlue, "&.Mui-checked": { color: editorial.pmwBlue } }}
                        />
                      }
                      sx={{ alignItems: "flex-start", m: 0 }}
                      label={
                        <Box sx={{ pt: 0.5 }} lang={pdpaLocale}>
                          <Box sx={{ mb: 0.75 }}>
                            <PdpaLanguageToggle
                              locale={pdpaLocale}
                              onChange={setPdpaLocale}
                              color={editorial.pmwBlue}
                              mutedColor={editorial.muted}
                            />
                          </Box>
                          <Typography variant="body2" sx={{ color: editorial.ink, fontWeight: 700, lineHeight: 1.6 }}>
                            {pdpa.consentLabel}
                          </Typography>
                          <Typography variant="caption" sx={{ color: editorial.muted, display: "block", mt: 0.5, lineHeight: 1.7 }}>
                            {pdpa.summary}{" "}
                            <Link component={RouterLink} to="/privacy" target="_blank" rel="noopener noreferrer" sx={{ fontWeight: 700 }}>
                              {pdpa.ui.viewNotice}
                            </Link>
                          </Typography>
                          {/* Clause F(2): the applicant is the one who has to have asked their referees. */}
                          <Typography variant="caption" sx={{ color: editorial.muted, display: "block", mt: 0.5, lineHeight: 1.7 }}>
                            {pdpa.thirdPartyConfirmation}
                          </Typography>
                          {pdpaTouched && !pdpaAccepted && (
                            <Typography variant="caption" sx={{ color: editorial.error, display: "block", mt: 0.75, fontWeight: 700 }}>
                              {pdpa.ui.consentRequired}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </Paper>

                  {/* Submit */}
                  <Button
                    type="submit"
                    variant="contained"
                    fullWidth
                    startIcon={submitting ? undefined : <Send />}
                    disabled={isJobApplicationSubmitDisabled({
                      submitting,
                      alreadyApplied,
                      adminOverrideMode,
                    })}
                    sx={{
                      ...careerActionButtonSx,
                      borderRadius: "12px",
                      backgroundColor: editorial.pmwBlue,
                      fontWeight: 700,
                      fontSize: "0.9375rem",
                      py: 1.5,
                      boxShadow: "none",
                      "&:hover": {
                        backgroundColor: editorial.pmwBlueDark,
                        boxShadow: "none",
                      },
                      "&:disabled": {
                        backgroundColor: editorial.softMuted,
                      },
                    }}
                  >
                    {submitting ? (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <CircularProgress size={18} sx={{ color: editorial.white }} />
                        <span>Submitting...</span>
                      </Box>
                    ) : adminOverrideMode ? (
                      "Submit Duplicate Test Application"
                    ) : (
                      "Submit Application"
                    )}
                  </Button>

                  <Typography variant="caption" sx={{ color: editorial.muted, textAlign: "center" }}>
                    {pdpa.ui.consentRecordNote(getPdpaNoticeVersion(pdpaLocale))}
                  </Typography>
                </Box>
              </form>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

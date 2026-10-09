/**
 * AdminFormImportPage — /admin/forms/import[?site=<key>]. Publishes many new
 * forms in one go from definition files, each the way the builder's publish
 * would, with one approval step (e.g. "Checking By") given to all of them.
 * Forms already on the site are listed and left alone. See utils/formImport.ts.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ChangeEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import PageHeader from "../components/common/PageHeader";
import Card from "../components/common/Card";
import { validateLayerConfig } from "../components/builder/layerValidation";
import { acquireAccessTokenSilentOrRedirect } from "../utils/authRecovery";
import { createSpClient } from "../utils/sharepointClient";
import { SP_STATIC } from "../utils/spConfig";
import { availableSites, HOME_SITE_KEY, isSiteKey, resolveSite, siteAppOrigin, type SiteKey } from "../config/sites";
import { getAllFormConfigs, resetActiveBuilderSite, setActiveBuilderSite } from "../utils/formBuilderSP";
import { planImport, publishPlannedForm, singleApprovalLayer, type ExistingForm, type ImportFile } from "../utils/formImport";

type RowResult = { state: "publishing" } | { state: "done" } | { state: "failed"; error: string };

export default function AdminFormImportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("site") || HOME_SITE_KEY;
  const siteKey: SiteKey = isSiteKey(requested) ? requested : HOME_SITE_KEY;
  const site = useMemo(() => { try { return resolveSite(siteKey); } catch { return null; } }, [siteKey]);
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [siteReady, setSiteReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [denied, setDenied] = useState("");
  const [error, setError] = useState("");
  const [existing, setExisting] = useState<ExistingForm[] | null>(null);
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [layerTitle, setLayerTitle] = useState("Checking By");
  const [assignees, setAssignees] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [results, setResults] = useState<Record<string, RowResult>>({});
  const [busy, setBusy] = useState(false);

  // Bind the SharePoint layer to the chosen site before anything reads it, as the builder does.
  useLayoutEffect(() => {
    setSiteReady(false);
    try {
      setActiveBuilderSite(siteKey);
      setSiteReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    return () => { resetActiveBuilderSite(); };
  }, [siteKey]);

  useEffect(() => {
    if (!isAuthenticated || inProgress !== InteractionStatus.None || !site || !siteReady) return;
    let cancelled = false;
    setToken(null);
    setExisting(null);
    setDenied("");
    const isSecondary = site.key !== HOME_SITE_KEY;
    const home = createSpClient(instance, accounts);
    const target = isSecondary ? createSpClient(instance, accounts, site.url) : home;
    Promise.all([
      home.isGroupMember(SP_STATIC.formBuilderSuperuserGroup),
      isSecondary && site.adminGroup ? target.isGroupMember(site.adminGroup).catch(() => false) : Promise.resolve(true),
    ]).then(async ([superuser, mayUseSite]) => {
      if (cancelled) return;
      if (!superuser || !mayUseSite) {
        setDenied(`Publishing on ${site.label} needs membership of ${!superuser ? `"${SP_STATIC.formBuilderSuperuserGroup}"` : `"${site.adminGroup}" on ${site.label}`}.`);
        return;
      }
      const origin = new URL(site.url).origin;
      const t = await acquireAccessTokenSilentOrRedirect(instance, { scopes: [`${origin}/AllSites.Manage`], account: accounts[0] });
      if (cancelled) return;
      setToken(t);
      setExisting(await getAllFormConfigs(t));
    }).catch((e) => { if (!cancelled) setError(`Could not reach ${site.label}: ${e instanceof Error ? e.message : String(e)}`); });
    return () => { cancelled = true; };
  }, [isAuthenticated, inProgress, instance, accounts, site, siteReady]);

  const plans = useMemo(() => (existing ? planImport(files, existing) : []), [files, existing]);
  const ready = plans.filter((p) => p.status === "ready");
  const layerConfig = useMemo(() => singleApprovalLayer(layerTitle, assignees), [layerTitle, assignees]);
  const layerProblem = assignees.trim() && !layerConfig
    ? "Enter at least one email address."
    : validateLayerConfig(layerConfig, []).errors[0] ?? "";
  const toPublish = ready.filter((p) => results[p.fileName]?.state !== "done");

  const pickFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    const read = await Promise.all(list.map(async (f) => ({ name: f.name, text: await f.text() })));
    setFiles(read.sort((a, b) => a.name.localeCompare(b.name)));
    setResults({});
  };

  const publish = useCallback(async (only?: string[]) => {
    if (!token || !site) return;
    const queue = toPublish.filter((p) => !only || only.includes(p.fileName));
    setBusy(true);
    for (const plan of queue) {
      setResults((r) => ({ ...r, [plan.fileName]: { state: "publishing" } }));
      try {
        await publishPlannedForm(token, plan, { layerConfig, isPublic, changedBy: accounts[0]?.username || "admin" });
        setResults((r) => ({ ...r, [plan.fileName]: { state: "done" } }));
      } catch (e) {
        setResults((r) => ({ ...r, [plan.fileName]: { state: "failed", error: e instanceof Error ? e.message : String(e) } }));
      }
    }
    // What is on the site now decides the next plan, so a file picked again
    // after this batch shows as already published instead of publishing twice.
    try { setExisting(await getAllFormConfigs(token)); } catch { /* keep the last list */ }
    setBusy(false);
  }, [token, site, toPublish, layerConfig, isPublic, accounts]);

  const failed = toPublish.filter((p) => results[p.fileName]?.state === "failed").map((p) => p.fileName);
  const doneCount = ready.length - toPublish.length;
  const sites = availableSites();

  const statusText = (fileName: string, status: string, reason?: string) => {
    const result = results[fileName];
    if (result?.state === "publishing") return "Publishing…";
    if (result?.state === "done") return "Published";
    if (result?.state === "failed") return `Failed — ${result.error}`;
    if (status === "ready") return "Ready";
    return reason ?? "";
  };

  return (
    <Box>
      <PageHeader
        title="Import forms"
        description="Publish new forms from definition files in one go. Forms already on the site are skipped, never overwritten."
        primary={{
          label: busy ? "Publishing…" : `Publish ${toPublish.length} ${toPublish.length === 1 ? "form" : "forms"}`,
          onClick: () => { void publish(); },
          disabled: busy || !token || toPublish.length === 0 || !!layerProblem,
        }}
      />
      <Stack spacing={2.5}>
        {denied && <Alert severity="warning">{denied}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}

        <Card>
          <Stack spacing={2}>
            {sites.length > 1 && (
              <TextField
                select
                size="small"
                label="Site"
                value={siteKey}
                disabled={busy}
                onChange={(e) => { setSearchParams(e.target.value === HOME_SITE_KEY ? {} : { site: e.target.value }); setFiles([]); setResults({}); }}
                sx={{ maxWidth: 320 }}
              >
                {sites.map((s) => <MenuItem key={s.key} value={s.key}>{s.label}</MenuItem>)}
              </TextField>
            )}
            <Box>
              <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} disabled={!existing || busy}>
                Choose definition files
                <input hidden type="file" accept=".json,application/json" multiple onChange={pickFiles} />
              </Button>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                One form per file, named after its address: <code>f1-drilling.form.json</code> publishes at /form/f1-drilling.
              </Typography>
            </Box>
          </Stack>
        </Card>

        <Card>
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Approval step for every form</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField size="small" label="Step name" value={layerTitle} onChange={(e) => setLayerTitle(e.target.value)} disabled={busy} sx={{ minWidth: 200 }} />
              <TextField
                size="small"
                fullWidth
                label="Who signs (email)"
                placeholder="qc.checker@company.com"
                helperText={layerProblem || "Several addresses, separated by commas, let any one of them sign. Leave empty for no approval step. Each form's checker can be changed in the builder afterwards."}
                error={!!layerProblem}
                value={assignees}
                onChange={(e) => setAssignees(e.target.value)}
                disabled={busy}
              />
            </Stack>
            <FormControlLabel
              control={<Checkbox checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} disabled={busy} />}
              label="Anyone with the link can open these forms without signing in"
            />
          </Stack>
        </Card>

        {plans.length > 0 && (
          <Card pad="none" clip>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Form</TableCell>
                  <TableCell>Address</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {plans.map((p) => {
                  const done = results[p.fileName]?.state === "done";
                  return (
                    <TableRow key={p.fileName}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.title || p.fileName}</Typography>
                        <Typography variant="caption" color="text.secondary">{p.fileName}</Typography>
                      </TableCell>
                      <TableCell>
                        {done && site
                          ? <a href={`${siteAppOrigin(site)}/form/${p.slug}`} target="_blank" rel="noreferrer">/form/{p.slug}</a>
                          : `/form/${p.slug}`}
                      </TableCell>
                      <TableCell sx={{ color: results[p.fileName]?.state === "failed" || p.status === "invalid" ? "error.main" : p.status === "exists" ? "text.secondary" : undefined }}>
                        {statusText(p.fileName, p.status, p.reason)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}

        {plans.length > 0 && (
          <Typography variant="body2" color="text.secondary" role="status" aria-live="polite">
            {ready.length} new · {plans.filter((p) => p.status === "exists").length} already on the site · {plans.filter((p) => p.status === "invalid").length} not readable
            {doneCount > 0 && ` · ${doneCount} published`}
            {failed.length > 0 && !busy && (
              <Button size="small" sx={{ ml: 1 }} onClick={() => { void publish(failed); }} disabled={!!layerProblem}>
                Retry {failed.length} failed
              </Button>
            )}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

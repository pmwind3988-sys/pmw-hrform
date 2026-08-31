import { validateApiKey, setCorsHeaders } from "./_utils/auth.js";
import { getGraphToken, getSharePointToken, queryListItems, queryListItemById, queryMasterFormBySlug, queryMasterFormByTitle, queryWebFormVersion, updateListItemFields } from "./_utils/graphClient.js";
import { logError, logWarn } from "./_utils/logger.js";
import { resolveApplicantName } from "./_utils/applicantName.js";
import {
  buildWorkflowActionEmail,
  buildLayerNeedsRoutingEmail,
  buildManualPaperWorkflowEmail,
  getApplicationBaseUrl,
  scheduleOrDeliverWorkflowEmail,
  type WorkflowEmailScheduleConfig,
} from "./_utils/workflowEmail.js";
import { buildWorkflowReviewLink, routePrefixAllowsLayerType } from "./_utils/workflowLink.js";
import { REFERENCE_NO_FIELD } from "./_utils/referenceNumber.js";
import { isLayerActor, joinEmailList, parseValidEmailList, writeLayerRecipientFields } from "./_utils/layerRecipients.js";
import {
  resolveLayerAssignee as resolveSharedLayerAssignee,
  type ResolvableLayer,
} from "./_utils/resolveAssignee.js";
import { createApprovalDirectoryReader } from "./_utils/approvalDirectory.js";
import { resolveDepartmentApproverFromList } from "./_utils/departmentApproverLookup.js";
import { expandDistributionList } from "./_utils/groupMembers.js";
import {
  denyLayerItemAccess,
} from "./_utils/layerItemAccess.js";
import { linkTokenField, mintLinkToken, readLinkToken } from "./_utils/linkToken.js";
import { reissueReviewLink } from "./_utils/linkReissue.js";
import { isTestRow, readTestRunRedirect } from "./_utils/testRun.js";
import { requireSignedInViewer } from "./_utils/viewerIdentity.js";
import { recordTestRunSteps, type TestRunStepDeps } from "./_utils/testRunActions.js";
import type { TestRunStep } from "./_utils/testRunTrail.js";

/**
 * What an old link is told. Deliberately the same answer whether the
 * submission exists, sits at another layer, or was never the clicker's to
 * see — a reply that varied would restore the id-counting this replaced.
 */
const LINK_REPLACED_MESSAGE =
  "This review link has been replaced. A fresh link has been sent to the address this review was assigned to — please use the newest email."; 

/** What a link that does not belong to the submission it named is told. */
const LINK_MISMATCH_MESSAGE = "This review link does not open this submission.";

const LINK_EXPIRED_MESSAGE = "This review link has expired.";

/** Query values arrive as string | string[] depending on the runtime. */
/**
 * The layer a signed-in reviewer is asking for, honouring the branch the
 * submission was routed down.
 *
 * A public link names its layer with the token, so the public path never needs
 * this. A signed-in link carries the layer *number*, which on a branched form
 * can describe a different step per branch — so the number alone is not enough.
 */
export function pickLayerByNumber(
  config: { layers?: Record<string, unknown>[]; manualBranches?: { name?: string; label?: string; layers?: Record<string, unknown>[] }[] } | null,
  selectedBranch: string,
  layerNumber: number,
): Record<string, unknown> | null {
  if (!config || !layerNumber) return null;
  const branchKey = selectedBranch.trim().toLowerCase();
  if (branchKey && config.manualBranches?.length) {
    const branch = config.manualBranches.find((entry) =>
      [entry.name, entry.label].some((candidate) =>
        typeof candidate === "string" && candidate.trim().toLowerCase() === branchKey));
    const onBranch = branch?.layers?.find((layer) => Number(layer.layerNumber) === layerNumber);
    if (onBranch) return onBranch;
  }
  return (config.layers ?? []).find((layer) => Number(layer.layerNumber) === layerNumber) ?? null;
}

function firstQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() : "";
  return typeof value === "string" ? value.trim() : "";
}

const SP_SITE_URL = (process.env.VITE_SP_SITE_URL || process.env.SP_SITE_URL || "").replace(/\/$/, "");

interface ApiRequest {
  body: Record<string, unknown>;
  query: Record<string, string | string[]>;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: Record<string, unknown>): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

function rejectedAtLayerStatus(layerNumber: number): string {
  return `Rejected at Layer ${layerNumber}`;
}

const SYSTEM_FIELDS = new Set([
  "id", "Id", "Title", "SubmittedBy", "SubmittedAt", "Status", "CurrentApprovalLayer",
  "FormVersion", "PublishKey", "FormID", "RawJSON", "CurrentLayer", "FormStatus", "EvaluationData", "WorkflowAssignmentData", "WorkflowEmailLog", "WorkflowEmailSchedule",
  "PDPAConsent", "PDPANoticeVersion", "PDPAConsentAt", "RetentionUntil",
  "Author", "Editor", "Created", "Modified", "ContentType", "PermMask",
  "SelectedBranch", REFERENCE_NO_FIELD,
]);

function isWorkflowField(key: string): boolean {
  return SYSTEM_FIELDS.has(key) || /^L\d+_/.test(key);
}

function isManualPaperLayerStatus(value: unknown): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "manual evaluation required" || normalized === "manual approval required";
}

function isNeedsRoutingLayerStatus(value: unknown): boolean {
  return String(value || "").trim().toLowerCase() === "needs routing";
}

/** The parked reason recorded for one layer, for the routing notice to quote. */
function routingReasonForLayer(fields: Record<string, unknown>, layerNumber: number): string {
  const prefix = `Layer ${layerNumber}: `;
  const line = String(fields.RoutingNotes || "")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(prefix));
  return line ? line.slice(prefix.length) : "the layer could not be routed automatically";
}

function layerSurveyElements(layer: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(layer.surveyElements)
    ? layer.surveyElements.filter((element): element is Record<string, unknown> =>
        typeof element === "object" && element !== null && !Array.isArray(element)
      )
    : [];
}

function parseVersionPayload(raw: unknown): { surveyJson: unknown; meta: Record<string, unknown>; layerConfig: Record<string, unknown> | null } {
  if (typeof raw !== "string" || !raw.trim()) return { surveyJson: null, meta: {}, layerConfig: null };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      surveyJson: parsed.surveyJson || parsed,
      meta: isRecord(parsed.meta) ? parsed.meta : {},
      layerConfig: isRecord(parsed.layerConfig) ? parsed.layerConfig : null,
    };
  } catch {
    return { surveyJson: null, meta: {}, layerConfig: null };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectMediaFieldNames(surveyJson: unknown): Set<string> {
  const names = new Set<string>();
  const root = isRecord(surveyJson) && isRecord(surveyJson.surveyJson) ? surveyJson.surveyJson : surveyJson;
  const walk = (elements: unknown): void => {
    if (!Array.isArray(elements)) return;
    for (const element of elements) {
      if (!isRecord(element)) continue;
      const type = typeof element.type === "string" ? element.type : "";
      const name = typeof element.name === "string" ? element.name : "";
      if (name && ["signaturepad", "imageupload", "file"].includes(type)) names.add(name);
      walk(element.elements);
      walk(element.templateElements);
    }
  };
  if (isRecord(root) && Array.isArray(root.pages)) {
    for (const page of root.pages) {
      if (isRecord(page)) walk(page.elements);
    }
  }
  return names;
}

function normalizeMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function toAbsoluteSharePointUrl(value: string): string {
  if (!value || value.startsWith("http") || value.startsWith("data:")) return value;
  if (!value.startsWith("/")) return value;
  try {
    return `${new URL(SP_SITE_URL).origin}${value}`;
  } catch {
    return value;
  }
}

/**
 * Resolves a layer that could not be resolved at submit time and writes its
 * actors onto the item, returning the delivery list.
 *
 * Only runs when the layer has no actors yet, so a layer resolved at submit
 * time keeps exactly the people it was given — re-resolving here would let a
 * directory edit made after submission silently redirect a live workflow.
 *
 * Answers null when there was nothing to do, or when resolution produced
 * nobody: the caller then falls back to whatever is stored, and a layer with
 * no recipients simply sends no mail rather than failing the approval that
 * just succeeded.
 */
async function resolveDeferredNextLayer(params: {
  graphToken: string;
  responseListName: string;
  responseItemId: string;
  nextLayer: Record<string, unknown>;
  item: Record<string, unknown>;
  actedBy: string;
  previousLayerNumber: number;
  formTitle: string;
}): Promise<string[] | null> {
  const { graphToken, nextLayer, item, actedBy, previousLayerNumber } = params;
  const layerNumber = Number(nextLayer.layerNumber);

  const existing = parseValidEmailList(
    item[`L${layerNumber}_Emails`] || item[`L${layerNumber}_Email`],
  );
  if (existing.length > 0) return null;

  const assignee = nextLayer.assignee as { type?: string } | undefined;
  if (!assignee?.type) return null;

  try {
    const directory = createApprovalDirectoryReader(graphToken);
    const resolved = await resolveSharedLayerAssignee(
      nextLayer as unknown as ResolvableLayer,
      item,
      {
        lookupDepartmentApprover: (target, submittedData) =>
          resolveDepartmentApproverFromList(
            graphToken,
            target.assignee as never,
            submittedData,
            String(target.title || `Layer ${target.layerNumber}`),
          ),
        expandDistributionList: (_target, address) => expandDistributionList(graphToken, address),
        lookupPerson: directory.lookupPerson,
        lookupRoleHolder: directory.lookupRoleHolder,
      },
      {
        context: {
          submitterEmail: String(item.SubmittedBy || ""),
          // Whoever just acted. Falls back to the address the layer was
          // assigned to, for the public and paper paths that close without
          // recording an actor.
          previousActorEmail: actedBy || String(item[`L${previousLayerNumber}_Email`] || ""),
        },
      },
    );

    if (resolved.error || resolved.parked || resolved.emails.length === 0) {
      if (resolved.parked) {
        const patch: Record<string, unknown> = {
          [`L${layerNumber}_Status`]: "Needs Routing",
          RoutingNotes: `Layer ${layerNumber}: ${resolved.parked.reason}`,
        };
        // No actors, but a list that could not be expanded is still worth
        // telling. Notify-only, so nobody gains the right to act.
        const deliverTo = parseValidEmailList(resolved.deliverTo);
        if (deliverTo.length > 0) {
          patch[`L${layerNumber}_NotifyEmails`] = joinEmailList(deliverTo);
        }
        await updateListItemFields(graphToken, params.responseListName, params.responseItemId, patch)
          .catch(() => {
            // RoutingNotes is absent on lists provisioned before it existed.
            // The status alone still surfaces the layer for an admin.
            logWarn("api:evaluate", "Could not record routing note", { formTitle: params.formTitle });
          });
      }
      return null;
    }

    const patch: Record<string, unknown> = {};
    const delivery = writeLayerRecipientFields(
      patch,
      nextLayer as unknown as { layerNumber: number },
      resolved.emails,
    );
    await updateListItemFields(graphToken, params.responseListName, params.responseItemId, patch);
    return delivery;
  } catch (error) {
    // A failure here must not undo the approval that already succeeded.
    logWarn("api:evaluate", "Late layer resolution failed", {
      formTitle: params.formTitle,
      layerNumber,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function extractImageSrcFromHtml(value: string): string {
  return value.match(/<img\b[^>]*\bsrc=(["'])(.*?)\1/i)?.[2]?.trim() ?? "";
}

function splitSharePointUrlFieldValue(value: string): string {
  const separatorIndex = value.search(/,\s+/);
  return separatorIndex === -1 ? value : value.slice(0, separatorIndex).trim();
}

function linkFromRecord(record: Record<string, unknown>): string {
  for (const key of ["Url", "url", "webUrl", "WebUrl", "LinkingUrl", "linkingUrl", "ServerRelativeUrl", "serverRelativeUrl"]) {
    const next = record[key];
    if (typeof next === "string" && next.trim()) return toAbsoluteSharePointUrl(next.trim());
  }
  const serverUrl = record.serverUrl || record.ServerUrl;
  const relativeUrl = record.serverRelativeUrl || record.ServerRelativeUrl;
  if (typeof serverUrl === "string" && typeof relativeUrl === "string") {
    return `${serverUrl.replace(/\/$/, "")}${relativeUrl}`;
  }
  return "";
}

function mediaSourcesFromValue(value: unknown): string[] {
  const normalized = normalizeMaybeJson(value);
  if (Array.isArray(normalized)) return normalized.flatMap(mediaSourcesFromValue);
  if (isRecord(normalized)) {
    const link = linkFromRecord(normalized);
    return link ? [link] : [];
  }
  if (typeof normalized !== "string") return [];
  const trimmed = normalized.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("data:image/")) return [trimmed];
  const htmlSrc = extractImageSrcFromHtml(trimmed);
  const candidate = splitSharePointUrlFieldValue(htmlSrc || trimmed);
  if (/^(https?:\/\/|\/)/i.test(candidate)) return [toAbsoluteSharePointUrl(candidate)];
  return [];
}

function encodeServerRelativePathParam(serverRelativeUrl: string): string {
  return encodeURIComponent(serverRelativeUrl.replace(/'/g, "''")).replace(/%2F/gi, "/");
}

function serverRelativePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:")) return "";
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const siteUrl = new URL(SP_SITE_URL);
      const mediaUrl = new URL(trimmed);
      if (siteUrl.origin.toLowerCase() !== mediaUrl.origin.toLowerCase()) return "";
      return decodeURIComponent(mediaUrl.pathname);
    }
  } catch {
    return "";
  }
  return trimmed.startsWith("/") ? decodeURIComponent(trimmed.split(/[?#]/)[0] ?? trimmed) : "";
}

function sharePointFileValueUrl(value: string): string {
  const serverPath = serverRelativePath(value);
  if (!serverPath) return "";
  return `${SP_SITE_URL}/_api/web/getFileByServerRelativePath(decodedurl='${encodeServerRelativePathParam(serverPath)}')/$value`;
}

async function sourceToDataUrl(token: string, source: string): Promise<string> {
  if (source.startsWith("data:image/")) return source;
  const requestUrl = sharePointFileValueUrl(source) || source;
  const response = await fetch(requestUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error(`Media fetch failed: ${response.status}`);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (!contentType.startsWith("image/")) return source;
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function buildMediaSrcByField(surveyJson: unknown, fields: Record<string, unknown>): Promise<Record<string, string | string[]>> {
  const mediaFields = collectMediaFieldNames(surveyJson);
  if (mediaFields.size === 0) return {};
  let spToken = "";
  const result: Record<string, string | string[]> = {};

  for (const fieldName of mediaFields) {
    const sources = mediaSourcesFromValue(fields[fieldName]);
    if (sources.length === 0) continue;
    const converted: string[] = [];
    for (const source of sources) {
      try {
        if (!spToken) spToken = await getSharePointToken();
        converted.push(await sourceToDataUrl(spToken, source));
      } catch {
        converted.push(source);
      }
    }
    result[fieldName] = converted.length === 1 ? converted[0] : converted;
  }

  return result;
}

async function handleGet(req: ApiRequest, res: ApiResponse) {
  const { token } = req.query as { token?: string };
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Missing token query parameter" });
  }

  try {
    const graphToken = await getGraphToken();

    let foundToken: Record<string, unknown> | null = null;
    let foundFormTitle = "";
    let foundLayerNumber = 0;
    let layerConfig: { layers: Record<string, unknown>[]; manualBranches?: { name?: string; label?: string; layers?: Record<string, unknown>[] }[] } | null = null;

    /**
     * The signed-in shape of this request: `?slug=&responseItemId=&layerNumber=`
     * with a bearer naming the caller, rather than a public layer token.
     *
     * It exists so the reviewer page can stop reading SharePoint from the
     * browser. Everything below the resolution is deliberately shared with the
     * public path — the same access gate, the same field filtering — because
     * two copies of "what may this person see" is how they drift apart.
     */
    const slug = firstQueryValue(req.query.slug);
    const signedInMode = !!slug;
    let viewerEmail = "";
    if (signedInMode) {
      const viewer = await requireSignedInViewer(req.headers, graphToken);
      // Portal accounts never review workflow steps; only staff do.
      if (viewer?.kind !== "m365") {
        return res.status(401).json({ error: "Sign in with your work account to open this request." });
      }
      viewerEmail = viewer.id;

      const form = await queryMasterFormBySlug(graphToken, slug);
      if (!form) return res.status(404).json({ error: "This form no longer exists." });
      foundFormTitle = String(form.fields.Title || "");
      foundLayerNumber = Number(firstQueryValue(req.query.layerNumber) || 0);
      try {
        layerConfig = JSON.parse(String(form.fields.LayerConfig || "")) as typeof layerConfig;
      } catch { layerConfig = null; }
      // Corrected below against the submission's own branch, once it is read.
      foundToken = pickLayerByNumber(layerConfig, "", foundLayerNumber);
    }

    // Find the token in all Master Form items
    const masterItems = signedInMode ? [] : await queryListItems(graphToken, "Master Form", { top: 500 });

    for (const form of masterItems) {
      const rawLayerConfig = form.fields.LayerConfig as string | undefined;
      if (!rawLayerConfig) continue;
      try {
        const parsed = JSON.parse(rawLayerConfig) as { layers: Record<string, unknown>[]; manualBranches?: { name?: string; label?: string; layers?: Record<string, unknown>[] }[] };
        const searchableLayers = [
          ...(parsed.layers ?? []),
          ...((parsed.manualBranches ?? []).flatMap((branch) => branch.layers ?? [])),
        ];
        for (const layer of searchableLayers) {
          if (layer.publicToken === token) {
            foundToken = layer;
            foundFormTitle = form.fields.Title as string;
            foundLayerNumber = layer.layerNumber as number;
            layerConfig = parsed;
            break;
          }
        }
      } catch { /* invalid JSON, skip */ }
      if (foundToken) break;
    }

    if (!foundToken && !signedInMode) {
      const versionItems = await queryListItems(graphToken, "Web Form Versions", { top: 500 });
      for (const versionItem of versionItems) {
        const parsedVersion = parseVersionPayload(versionItem.fields.SurveyJSON);
        const parsed = parsedVersion.layerConfig as { layers?: Record<string, unknown>[]; manualBranches?: { name?: string; label?: string; layers?: Record<string, unknown>[] }[] } | null;
        if (!parsed) continue;
        const searchableLayers = [
          ...(parsed.layers ?? []),
          ...((parsed.manualBranches ?? []).flatMap((branch) => branch.layers ?? [])),
        ];
        for (const layer of searchableLayers) {
          if (layer.publicToken === token) {
            foundToken = layer;
            foundFormTitle = String(versionItem.fields.FormTitle || "");
            foundLayerNumber = layer.layerNumber as number;
            layerConfig = { layers: parsed.layers ?? [], manualBranches: parsed.manualBranches };
            break;
          }
        }
        if (foundToken) break;
      }
    }

    if (!foundToken) return res.status(404).json({ error: "Token not found" });
    // Expiry is no longer a property of the layer alone — a layer may read its
    // deadline out of the submission's own answers — so it is settled below,
    // once the record is in hand, by denyLayerItemAccess.

    // The caller must provide the response item ID
    const responseItemId = req.query.responseItemId ? Number(req.query.responseItemId) : undefined;
    if (!responseItemId) return res.status(400).json({ error: "Missing responseItemId query parameter" });

    const responseListName = `${foundFormTitle} Responses`;
    const responseItem = await queryListItemById(graphToken, responseListName, String(responseItemId));
    // A missing record is not answered yet: an old link has to be told the same
    // thing whether or not the id it carried was real.
    const allFields = responseItem?.fields || {};
    const formVersion = String(allFields.FormVersion || "");
    const responsePublishKey = String(allFields.PublishKey || "");
    let parsedResponseVersion = { surveyJson: null as unknown, meta: {} as Record<string, unknown>, layerConfig: null as Record<string, unknown> | null };
    if (formVersion) {
      const versionRow = (await queryWebFormVersion(graphToken, foundFormTitle, formVersion, responsePublishKey || undefined))?.fields;
      parsedResponseVersion = parseVersionPayload(versionRow?.SurveyJSON);
      const responseLayerConfig = parsedResponseVersion.layerConfig as { layers?: Record<string, unknown>[]; manualBranches?: { name?: string; label?: string; layers?: Record<string, unknown>[] }[] } | null;
      if (responseLayerConfig) {
        layerConfig = { layers: responseLayerConfig.layers ?? [], manualBranches: responseLayerConfig.manualBranches };
        const responseLayers = [
          ...(responseLayerConfig.layers ?? []),
          ...((responseLayerConfig.manualBranches ?? []).flatMap((branch) => branch.layers ?? [])),
        ];
        const responseToken = signedInMode
          // The branch is only knowable now, with the submission in hand — and
          // on a branched form it decides which step this number describes.
          ? pickLayerByNumber(
              { layers: responseLayerConfig.layers, manualBranches: responseLayerConfig.manualBranches },
              String(allFields.SelectedBranch || ""),
              foundLayerNumber,
            )
          : responseLayers.find((layer) => layer.publicToken === token);
        if (responseToken) {
          foundToken = responseToken;
          foundLayerNumber = responseToken.layerNumber as number;
        }
      }
    }

    // The token names a layer; the item id arrived beside it in the query
    // string. Nothing tied the two together, so one review link could read
    // every other submission to the same form by counting the id up. Same
    // rule the act path below applies, so a link cannot show what it could
    // not approve.
    // A link minted before review links were bound to their submission carries
    // no `k`, and cannot be given one now. Rather than strand the reviewer, mail
    // a fresh bound link to the address this layer was actually sent to and show
    // the clicker nothing — the id they arrived with is the untrusted part, so it
    // decides only who is written to. Same reply either way; see _utils/linkReissue.ts.
    const linkToken = firstQueryValue(req.query.k);

    // What binds a signed-in link to its record is not a token in the URL but
    // the assignment on the row: the address bar carries the form, the item and
    // the layer, and a reviewer can edit all three. Settled here, on the
    // server, before a single field is filtered — which is the whole point of
    // this path existing.
    if (signedInMode) {
      // A public layer is reached by its own emailed link, whose binding is
      // checked above. Accepting the signed-in shape for one would be a way
      // round that check.
      if (String(foundToken.authMode || "") === "public") {
        return res.status(403).json({ error: "Open this request from the link that was emailed to its reviewer." });
      }
      // Which shape the address used. Self-reported, and that is fine: lying
      // about it only forgoes this barrier, and the assignment check below is
      // untouched by it.
      if (!routePrefixAllowsLayerType(firstQueryValue(req.query.prefix), String(foundToken.type || ""), allFields.Created)) {
        return res.status(403).json({ error: "This link does not match the step it points at. Please use the link that was emailed to you." });
      }
      if (!isLayerActor(viewerEmail, allFields[`L${foundLayerNumber}_Emails`], allFields[`L${foundLayerNumber}_Email`])) {
        logWarn("api:evaluate:get", "Refused a signed-in reviewer a step they are not assigned", {
          layerNumber: foundLayerNumber,
          responseItemId,
        });
        // Same wording whether the row exists, is someone else's, or is not
        // theirs at this layer, so the id cannot be probed for which is which.
        return res.status(403).json({ error: "This request is waiting for someone else." });
      }
    }

    if (!linkToken && !signedInMode) {
      if (responseItem) {
        await reissueReviewLink({
          graphToken,
          responseListName,
          responseItemId: responseItem.id,
          fields: allFields,
          layerNumber: foundLayerNumber,
          layer: foundToken,
          formTitle: foundFormTitle,
          formSlug: "",
          totalLayers: layerConfig?.layers?.length ?? 0,
          baseUrl: getApplicationBaseUrl(),
        });
      }
      return res.status(410).json({ error: LINK_REPLACED_MESSAGE, linkReplaced: true });
    }

    // Past here a record that does not exist and one the link does not cover are
    // told the same thing, so the id cannot be probed for which rows are real.
    const viewDenial = !responseItem
      ? "link-mismatch" as const
      : denyLayerItemAccess({
        layerNumber: foundLayerNumber,
        intent: "read",
        // A sign-in layer never had a link binding minted, and offering one
        // side of a pair without the other reads as a mismatch. The assignment
        // check above is what binds this path.
        linkToken: signedInMode ? undefined : linkToken,
        storedLinkToken: signedInMode ? undefined : readLinkToken(allFields, foundLayerNumber),
        layer: foundToken,
        fields: allFields,
        currentLayer: allFields.CurrentLayer || allFields.CurrentApprovalLayer,
        layerStatus: allFields[`L${foundLayerNumber}_Status`],
        formStatus: allFields.FormStatus || allFields.Status,
      });
    if (viewDenial) {
      logWarn("api:evaluate:get", "Refused a review link for a submission it does not cover", {
        layerNumber: foundLayerNumber,
        responseItemId,
        reason: viewDenial,
      });
      return res.status(403).json({
        error:
          viewDenial === "expired"
            ? LINK_EXPIRED_MESSAGE
            : LINK_MISMATCH_MESSAGE,
      });
    }

    // Filter fields based on layer visibility
    const visibleFields: Record<string, unknown> = {};
    const selectedBranch = typeof allFields.SelectedBranch === "string" ? allFields.SelectedBranch.trim().toLowerCase() : "";
    const activeLayers = (() => {
      if (selectedBranch && layerConfig?.manualBranches?.length) {
        const branch = layerConfig.manualBranches.find((b) =>
          [b.name, b.label].some((candidate) => typeof candidate === "string" && candidate.trim().toLowerCase() === selectedBranch)
        );
        if (branch?.layers?.length) return branch.layers;
      }
      return layerConfig?.layers ?? [];
    })();
    const previousLayerSummaries = activeLayers
      .filter((layer) => Number(layer.layerNumber) < foundLayerNumber)
      .map((layer) => ({
        layerNumber: layer.layerNumber,
        type: layer.type,
        title: typeof layer.title === "string" ? layer.title : "",
        description: typeof layer.description === "string" ? layer.description : "",
        surveyElements: Array.isArray(layer.surveyElements) ? layer.surveyElements : [],
      }));

    // Include submission metadata always
    for (const key of [REFERENCE_NO_FIELD, "Title", "SubmittedBy", "SubmittedAt", "FormVersion", "PublishKey", "FormID", "Status", "FormStatus", "CurrentLayer", "CurrentApprovalLayer"]) {
      if (allFields[key] !== undefined) visibleFields[key] = allFields[key];
    }

    // Include submitted form fields, but not workflow/system columns.
    for (const [key, value] of Object.entries(allFields)) {
      if (!isWorkflowField(key) && value !== null && value !== undefined) {
        visibleFields[key] = value;
      }
    }

    // Include previous layer results (layers < current layer)
    if (activeLayers.length > 0) {
      for (const layer of activeLayers) {
        const n = layer.layerNumber as number;
        if (n < foundLayerNumber) {
          visibleFields[`L${n}_Status`] = allFields[`L${n}_Status`];
          visibleFields[`L${n}_Email`] = allFields[`L${n}_Email`];
          visibleFields[`L${n}_Emails`] = allFields[`L${n}_Emails`];
          visibleFields[`L${n}_ActedBy`] = allFields[`L${n}_ActedBy`];
          visibleFields[`L${n}_SignedAt`] = allFields[`L${n}_SignedAt`];
        } else if (n === foundLayerNumber) {
          // Current layer — include status
          visibleFields[`L${n}_Status`] = allFields[`L${n}_Status`];
          visibleFields[`L${n}_Email`] = allFields[`L${n}_Email`];
          visibleFields[`L${n}_Emails`] = allFields[`L${n}_Emails`];
        }
        // Future layers (n > foundLayerNumber) — HIDDEN
      }

      // Include evaluation data for previous layers only
      const rawEvalData = allFields.EvaluationData as string | undefined;
      if (rawEvalData) {
        try {
          const allEval = JSON.parse(rawEvalData) as Record<string, unknown>;
          const visibleEval: Record<string, unknown> = {};
          for (const layer of activeLayers) {
            const n = layer.layerNumber as number;
            if (n < foundLayerNumber && allEval[String(n)]) {
              visibleEval[String(n)] = allEval[String(n)];
            }
          }
          visibleFields.EvaluationData = JSON.stringify(visibleEval);
        } catch { /* invalid JSON, skip */ }
      }
    }

    let surveyJson: unknown = null;
    let versionMeta: Record<string, unknown> = {};
    if (formVersion) {
      surveyJson = parsedResponseVersion.surveyJson;
      versionMeta = parsedResponseVersion.meta;
    }
    const mediaSrcByField = await buildMediaSrcByField(surveyJson, visibleFields);

    return res.status(200).json({
      success: true,
      data: {
        formTitle: foundFormTitle,
        layerNumber: foundLayerNumber,
        totalLayers: activeLayers.length || 0,
        // Which branch this submission took. A signed-in caller needs it to
        // read the same layer sequence out of the form config that the
        // server just used, rather than guessing at the top-level layers.
        selectedBranch: typeof allFields.SelectedBranch === "string" ? allFields.SelectedBranch : "",
        layerType: foundToken.type || "approval",
        layerTitle: foundToken.title || "",
        layerDescription: foundToken.description || "",
        layerStatus: allFields[`L${foundLayerNumber}_Status`] || "",
        formStatus: allFields.FormStatus || allFields.Status || "",
        surveyElements: Array.isArray(foundToken.surveyElements) ? foundToken.surveyElements : [],
        previousLayerSummaries,
        confirmationLabel: foundToken.confirmationLabel || "",
        confirmationType: foundToken.confirmationType || "",
        surveyJson,
        logoUrl: typeof versionMeta.logoUrl === "string" ? versionMeta.logoUrl : "",
        mediaSrcByField,
        fields: visibleFields,
      },
    });
  } catch (err) {
    logError("api:evaluate:get", "Failed to load public evaluation data", err);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = validateApiKey(req.headers as Record<string, string | string[] | undefined>);
  if (!auth.valid) return res.status(401).json({ error: auth.reason });
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token, layerNumber, formTitle, responseItemId, fields, action, signature, rejection, linkToken } = req.body;
  // The page was opened with `k` in its URL and hands it back here, so acting
  // is held to the same binding as looking. A post without one came from a page
  // loaded before links were bound; it is refused rather than trusted.
  const suppliedLinkToken = typeof linkToken === "string" ? linkToken.trim() : "";
  const safeResponseItemId = Number(responseItemId);
  if (!safeResponseItemId) return res.status(400).json({ error: "Invalid responseItemId" });

  // Validate required fields
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Missing or invalid public token" });
  }
  if (!formTitle || typeof formTitle !== "string") {
    return res.status(400).json({ error: "Missing or invalid formTitle" });
  }
  if (!layerNumber || typeof layerNumber !== "number") {
    return res.status(400).json({ error: "Missing or invalid layerNumber" });
  }
  if (typeof action !== "string" || !["approve", "reject", "confirm"].includes(action)) {
    return res.status(400).json({ error: "action must be 'approve', 'reject', or 'confirm'" });
  }

  try {
    const graphToken = await getGraphToken();

    // 1. Load Master Form to find the layer config + validate token
    const formConfig = (await queryMasterFormByTitle(graphToken, formTitle))?.fields;
    if (!formConfig) return res.status(404).json({ error: "Form not found" });

    // 2. Fetch the response item using Graph API before resolving the workflow
    // config, because same-version profiles can have different layers.
    const responseListName = `${formTitle} Responses`;
    const responseItem = await queryListItemById(graphToken, responseListName, String(safeResponseItemId));
    if (!responseItem) return res.status(404).json({ error: "Response item not found" });
    // A ticket signed at submit time expires in hours; a run can sit at a later
    // layer for days or months. The redirect is therefore recovered off the
    // stored row, never off the request.
    const testRun = readTestRunRedirect(responseItem.fields);
    const trailDeps: TestRunStepDeps = { readItem: queryListItemById, updateFields: updateListItemFields };
    const itemFormVersion = String(responseItem.fields.FormVersion || formConfig.CurrentVersion || "1.0");
    const itemPublishKey = String(responseItem.fields.PublishKey || formConfig.CurrentPublishKey || "");
    const versionRow = itemFormVersion
      ? (await queryWebFormVersion(graphToken, formTitle, itemFormVersion, itemPublishKey || undefined))?.fields
      : null;
    const versionPayload = parseVersionPayload(versionRow?.SurveyJSON);

    // Parse LayerConfig
    let layerConfigParsed: { layers: Record<string, unknown>[]; manualBranches?: { name?: string; label?: string; layers?: Record<string, unknown>[] }[] } | null = null;
    const rawLayerConfig = versionPayload.layerConfig
      ? JSON.stringify(versionPayload.layerConfig)
      : formConfig.LayerConfig as string | undefined;
    if (rawLayerConfig) {
      try { layerConfigParsed = JSON.parse(rawLayerConfig); } catch { /* invalid JSON, fall through */ }
    }
    if (!layerConfigParsed?.layers) return res.status(400).json({ error: "Form has no layer config" });

    // Find the layer by number
    const searchableLayers = [
      ...(layerConfigParsed.layers ?? []),
      ...((layerConfigParsed.manualBranches ?? []).flatMap((branch) => branch.layers ?? [])),
    ];
    const layer = searchableLayers.find((l) => l.layerNumber === layerNumber && l.publicToken === token) as Record<string, unknown> | undefined;
    if (!layer) return res.status(404).json({ error: `Layer ${layerNumber} not found in config` });

    // Expiry may be read from the submission's own answers rather than the
    // layer, so it is settled by denyLayerItemAccess below with the record in hand.

    // Shared with the read path above so what a link may show and what it may
    // approve cannot drift apart. See _utils/layerItemAccess.ts.
    const actDenial = denyLayerItemAccess({
      layerNumber,
      intent: "act",
      linkToken: suppliedLinkToken,
      storedLinkToken: readLinkToken(responseItem.fields, layerNumber),
      layer,
      fields: responseItem.fields,
      currentLayer: responseItem.fields.CurrentLayer || responseItem.fields.CurrentApprovalLayer,
      layerStatus: responseItem.fields[`L${layerNumber}_Status`],
      formStatus: responseItem.fields.FormStatus || responseItem.fields.Status,
    });
    if (actDenial === "link-mismatch") {
      logWarn("api:evaluate", "Refused an action from a link that does not cover this submission", {
        layerNumber,
        responseItemId: safeResponseItemId,
      });
      return res.status(403).json({
        error: suppliedLinkToken ? LINK_MISMATCH_MESSAGE : LINK_REPLACED_MESSAGE,
      });
    }
    if (actDenial === "expired") {
      return res.status(403).json({ error: LINK_EXPIRED_MESSAGE });
    }
    if (actDenial === "already-completed") {
      return res.status(409).json({ error: "This layer has already been completed and cannot be submitted again." });
    }
    if (actDenial === "not-current-layer") {
      return res.status(409).json({ error: "This evaluation link is no longer active for the current workflow layer." });
    }

    const selectedBranch = typeof responseItem.fields.SelectedBranch === "string" ? responseItem.fields.SelectedBranch.trim().toLowerCase() : "";
    const activeLayers = (() => {
      if (selectedBranch && layerConfigParsed?.manualBranches?.length) {
        const branch = layerConfigParsed.manualBranches.find((b) =>
          [b.name, b.label].some((candidate) => typeof candidate === "string" && candidate.trim().toLowerCase() === selectedBranch)
        );
        if (branch?.layers?.length) return branch.layers;
      }
      return layerConfigParsed?.layers ?? [];
    })();

    // 3. Build update payload based on action
    const updates: Record<string, unknown> = {};
    let notificationNextLayer: Record<string, unknown> | undefined;
    // Held out of `updates` deliberately — see the separate patch below.
    let actedByEmail = "";
    const now = new Date().toISOString();

    if (action === "approve" || action === "confirm") {
      updates[`L${layerNumber}_Status`] = action === "approve" ? "Approved" : "Confirmed";
      updates[`L${layerNumber}_SignedAt`] = now;
      if (signature) updates[`L${layerNumber}_Signature`] = signature;

      // Record who acted, so a later layer can route from them. The public
      // token identifies a layer, not a person, so this is only knowable when
      // the layer had exactly one possible actor. With several sharing a layer
      // we cannot tell which of them clicked, and guessing would put a name
      // against a decision they may not have made — leave it blank instead.
      const layerActors = parseValidEmailList(
        responseItem.fields[`L${layerNumber}_Emails`] || responseItem.fields[`L${layerNumber}_Email`],
      );
      if (layerActors.length === 1 && !responseItem.fields[`L${layerNumber}_ActedBy`]) {
        actedByEmail = layerActors[0];
      }

      // For evaluation layers: also write to EvaluationData JSON
      if (layer.type === "evaluation" && fields) {
        // Read existing EvaluationData if any
        let evalData: Record<string, unknown> = {};
        if (responseItem.fields.EvaluationData) {
          try { evalData = JSON.parse(responseItem.fields.EvaluationData as string); } catch { /* invalid JSON, start fresh */ }
        }
        evalData[String(layerNumber)] = {
          confirmerEmail: "SYSTEM",
          confirmerName: null,
          confirmedAt: now,
          status: "confirmed",
          fields: fields,
          signatureUrl: signature || null,
        };
        updates.EvaluationData = JSON.stringify(evalData);
      }

      // Advance to next layer or complete
      const sortedLayers = [...activeLayers].sort((a, b) => Number(a.layerNumber) - Number(b.layerNumber));
      const currentIndex = sortedLayers.findIndex((candidate) => candidate.layerNumber === layerNumber);
      const nextLayer = currentIndex >= 0 ? sortedLayers[currentIndex + 1] : sortedLayers.find((candidate) => Number(candidate.layerNumber) > layerNumber);
      notificationNextLayer = nextLayer;
      if (nextLayer) {
        updates.CurrentLayer = nextLayer.layerNumber;
        updates.CurrentApprovalLayer = nextLayer.layerNumber;
        updates.FormStatus = "In Review";
        // The link the next reviewer is about to be emailed is bound to this
        // submission, so its binding is written in the same breath as the
        // advance — the record can never be waiting at a public layer that has
        // no token for it. Re-minted per layer: finishing one does not open the
        // next.
        if (String(nextLayer.authMode || "") === "public" && String(nextLayer.publicToken || "").trim()) {
          updates[linkTokenField(Number(nextLayer.layerNumber))] = mintLinkToken();
        }
      } else {
        updates.FormStatus = "Completed";
        updates.CurrentLayer = layerNumber;
        updates.CurrentApprovalLayer = layerNumber;
      }
    } else if (action === "reject") {
      updates[`L${layerNumber}_Status`] = "Rejected";
      updates[`L${layerNumber}_SignedAt`] = now;
      if (rejection) updates[`L${layerNumber}_Rejection`] = rejection;
      updates.FormStatus = "Rejected";
      updates.Status = "Rejected";
      updates.CurrentLayer = layerNumber;
      updates.CurrentApprovalLayer = layerNumber;
      for (const futureLayer of activeLayers) {
        const n = Number(futureLayer.layerNumber);
        if (n <= layerNumber) continue;
        updates[`L${n}_Status`] = rejectedAtLayerStatus(layerNumber);
      }
    }

    // 4. Update the response item
    await updateListItemFields(graphToken, responseListName, responseItem.id, updates);

    // Patched on its own, after the decision is safely recorded. `L{n}_ActedBy`
    // is absent from response lists provisioned before multi-actor layers, and
    // Graph fails an entire PATCH over one unknown column — so carrying this in
    // `updates` would turn a missing column into a refused approval, for a form
    // that was working fine yesterday. It stays in memory either way, so the
    // next layer still routes from whoever acted even if the note did not land.
    if (actedByEmail) {
      await updateListItemFields(graphToken, responseListName, responseItem.id, {
        [`L${layerNumber}_ActedBy`]: actedByEmail,
      }).catch((error) => {
        logWarn("api:evaluate", "Could not record who acted on the layer", {
          formTitle,
          layerNumber,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      });
    }

    if (testRun) {
      const decisionSteps: Omit<TestRunStep, "at">[] = [
        {
          step: `layer-${layerNumber}-decision`,
          label: `Layer ${layerNumber} decision recorded`,
          status: "pass",
          detail: `${action} by ${actedByEmail || String(responseItem.fields[`L${layerNumber}_ActedBy`] || "") || "the tester"}`,
          order: 10 * layerNumber + 2,
        },
      ];
      if (!notificationNextLayer) {
        decisionSteps.push({
          step: "final-status",
          label: "Final status set",
          status: "pass",
          detail: String(updates.FormStatus || ""),
          order: 1000,
        });
      }
      await recordTestRunSteps(graphToken, responseListName, String(responseItem.id), decisionSteps, trailDeps);
    }

    if (notificationNextLayer) {
      const nextLayerNumber = Number(notificationNextLayer.layerNumber);
      // A layer routing from the previous layer's actor was left empty at
      // submit time, because nobody had acted yet. Now they have, so resolve it
      // before addressing the mail.
      const lateResolved = await resolveDeferredNextLayer({
        graphToken,
        responseListName,
        responseItemId: responseItem.id,
        nextLayer: notificationNextLayer,
        item: responseItem.fields,
        actedBy: actedByEmail || String(responseItem.fields[`L${layerNumber}_ActedBy`] || ""),
        previousLayerNumber: layerNumber,
        formTitle,
      });
      // The next layer may fan out to several evaluators and/or a shared
      // mailbox; L{n}_Email holds only the primary actor.
      const recipients = lateResolved ?? parseValidEmailList(
        responseItem.fields[`L${nextLayerNumber}_NotifyEmails`]
        || responseItem.fields[`L${nextLayerNumber}_Email`],
      );
      const recipient = recipients.length === 1 ? recipients[0] : recipients;
      if (isTestRow(responseItem.fields) && !testRun) {
        // A test row with no usable redirect address. The alternative —
        // falling back to the real assignee — would mail a real approver from
        // a run the builder believes is a rehearsal, so the mail simply does
        // not go out.
        logWarn("api:evaluate", "Test run has no usable redirect address; refusing to send the next layer's email rather than mailing a real approver", {
          formTitle,
          responseItemId: safeResponseItemId,
          layer: nextLayerNumber,
        });
      } else if (recipients.length > 0) {
        const appBaseUrl = getApplicationBaseUrl();
        const formSlug = String(formConfig.Slug || "").trim();
        const publicToken = String(notificationNextLayer.publicToken || "").trim();
        const reviewLink = buildWorkflowReviewLink({
          baseUrl: appBaseUrl,
          layerType: String(notificationNextLayer.type || ""),
          authMode: String(notificationNextLayer.authMode || ""),
          publicToken,
          formSlug,
          responseItemId: safeResponseItemId,
          layerNumber: nextLayerNumber,
          // Written into `updates` above, so read from there rather than from the
          // copy of the item fetched before the advance.
          linkToken: String(updates[linkTokenField(nextLayerNumber)] || readLinkToken(responseItem.fields, nextLayerNumber)),
        });
        try {
          const layerType = notificationNextLayer.type === "evaluation" ? "evaluation" : "approval";
          const totalLayerCount = activeLayers.length;
          const submittedBy = String(responseItem.fields.SubmittedBy || "Public respondent");
          const referenceNo = String(responseItem.fields[REFERENCE_NO_FIELD] || "");
          // The subject names whoever the form says the request is about, so a
          // reviewer can tell two waiting requests apart from the inbox list.
          const applicantName = resolveApplicantName(responseItem.fields);
          const nextStatus = responseItem.fields[`L${nextLayerNumber}_Status`];
          const manualPaper = isManualPaperLayerStatus(nextStatus);
          await scheduleOrDeliverWorkflowEmail(
            graphToken,
            isNeedsRoutingLayerStatus(nextStatus)
              // Parked: an action link would be refused by the access check the
              // moment anyone clicked it, so say what is actually true.
              ? buildLayerNeedsRoutingEmail({
                  formTitle,
                  submittedBy,
                  responseItemId: safeResponseItemId,
                  layer: nextLayerNumber,
                  totalLayers: totalLayerCount,
                  recipient,
                  layerType,
                  reason: routingReasonForLayer(responseItem.fields, nextLayerNumber),
                  referenceNo,
                  applicantName,
                })
              : manualPaper
              ? buildManualPaperWorkflowEmail({
                  formTitle,
                  submittedBy,
                  responseItemId: safeResponseItemId,
                  layer: nextLayerNumber,
                  totalLayers: totalLayerCount,
                  recipient,
                  layerType,
                  layerTitle: typeof notificationNextLayer.title === "string" ? notificationNextLayer.title : undefined,
                  surveyElements: layerSurveyElements(notificationNextLayer),
                  referenceNo,
                  applicantName,
                })
              : buildWorkflowActionEmail({
                  formTitle,
                  submittedBy,
                  responseItemId: safeResponseItemId,
                  layer: nextLayerNumber,
                  totalLayers: totalLayerCount,
                  recipient,
                  layerType,
                  reviewLink,
                  referenceNo,
                  applicantName,
                }),
            {
              listTitle: responseListName,
              responseItemId: responseItem.id,
              layer: nextLayerNumber,
              testRun,
            },
            notificationNextLayer.type === "evaluation"
              ? notificationNextLayer.emailSchedule as WorkflowEmailScheduleConfig | undefined
              : undefined,
            {
              layer: nextLayerNumber,
              layerType,
              totalLayers: totalLayerCount,
              reviewLink: manualPaper ? "" : reviewLink,
              submittedBy,
            },
          );
        } catch (emailError) {
          logWarn("api:evaluate", "Next workflow email delivery failed", {
            formTitle,
            responseItemId: safeResponseItemId,
            layer: nextLayerNumber,
            errorMessage: emailError instanceof Error ? emailError.message : String(emailError),
          });
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    logError("api:evaluate", "Failed to submit public evaluation action", err);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
}

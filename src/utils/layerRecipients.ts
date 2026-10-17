/**
 * Layer recipient helpers.
 *
 * A workflow layer distinguishes two sets of addresses:
 *   - **actors**    — who may approve/evaluate. Any one of them completes the
 *                     layer; the first to act wins and the rest go stale.
 *   - **recipients** — who receives the notification email. This can include a
 *                     shared mailbox that must NOT be able to act.
 *
 * Kept dependency-free so `api/_utils/layerRecipients.ts` can mirror it verbatim
 * for the serverless routes (same duplication pattern as `workflowLink.ts`).
 */

export type NotifyRecipientMode = "both" | "notify-only";

export interface LayerNotifyConfig {
  /** Mailboxes that receive the layer notification but can never act on it. */
  notifyEmails?: string[];
  /** "both" (default) mails actors + notifyEmails; "notify-only" mails only notifyEmails. */
  notifyRecipientMode?: NotifyRecipientMode;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEPARATORS = /[,;\r\n]+/;

export function isLayerEmail(value: unknown): boolean {
  return typeof value === "string" && EMAIL_RE.test(value.trim());
}

/**
 * Splits a stored/typed address list into normalized addresses.
 * Accepts a delimited string or an array; dedupes case-insensitively while
 * preserving the author's original casing and order.
 */
export function parseEmailList(value: unknown): string[] {
  const raw: string[] = Array.isArray(value)
    ? value.flatMap((entry) => (typeof entry === "string" ? entry.split(SEPARATORS) : []))
    : typeof value === "string"
      ? value.split(SEPARATORS)
      : [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of raw) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/** Same as `parseEmailList` but drops anything that is not a valid address. */
export function parseValidEmailList(value: unknown): string[] {
  return parseEmailList(value).filter(isLayerEmail);
}

/**
 * The delivery list already recorded for a layer, read back from a submission's
 * columns. `L{n}_NotifyEmails` is the address the notice was aimed at — it holds
 * the shared mailbox alone for a "notify-only" layer, so anyone re-sending that
 * layer's mail must address it here rather than to the actor in `L{n}_Email`.
 */
export function readLayerDeliveryRecipients(
  fields: Record<string, unknown> | undefined | null,
  layerNumber: number,
): string[] {
  return parseValidEmailList(fields?.[`L${layerNumber}_NotifyEmails`]);
}

/** Canonical storage form for the `L{n}_Emails` / `L{n}_NotifyEmails` columns. */
export function joinEmailList(emails: readonly string[]): string {
  return emails.join("; ");
}

export function emailListsMatch(a: unknown, b: unknown): boolean {
  const left = parseEmailList(a).map((entry) => entry.toLowerCase()).sort();
  const right = parseEmailList(b).map((entry) => entry.toLowerCase()).sort();
  return left.length === right.length && left.every((entry, i) => entry === right[i]);
}

/**
 * True when `candidate` is allowed to act on a layer whose actor list is
 * `actorEmails`. Falls back to the legacy single `L{n}_Email` value when the
 * multi-actor column is absent on older submissions.
 */
export function isLayerActor(candidate: unknown, actorEmails: unknown, primaryEmail?: unknown): boolean {
  const normalized = typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
  if (!normalized) return false;
  const actors = parseEmailList(actorEmails);
  const pool = actors.length > 0 ? actors : parseEmailList(primaryEmail);
  return pool.some((entry) => entry.toLowerCase() === normalized);
}

/**
 * The mail `to:` list for a layer. Notification-only mailboxes are appended, or
 * replace the actors entirely when the layer is configured "notify-only" — the
 * shared-mailbox case, where the reviewer is reached through the mailbox rather
 * than at their own address.
 */
export function resolveLayerRecipients(
  actorEmails: readonly string[],
  layer: LayerNotifyConfig | undefined,
): string[] {
  const notify = parseEmailList(layer?.notifyEmails);
  const base = layer?.notifyRecipientMode === "notify-only" && notify.length > 0
    ? []
    : parseEmailList(actorEmails as unknown);
  return parseEmailList([...base, ...notify]);
}

/**
 * Writes one layer's actor/recipient columns onto a submission body or patch.
 *
 * `L{n}_Email` stays the single primary actor — every existing reader, the
 * dashboard and the PDF still key off it. The two extra columns carry the
 * any-one-of actor set and where the notification was actually aimed.
 * Returns the delivery list so the caller can address the mail.
 */
export function writeLayerRecipientFields(
  target: Record<string, unknown>,
  layer: { layerNumber: number } & LayerNotifyConfig,
  actorEmails: readonly string[],
  primaryFallback = "",
): string[] {
  const actors = parseEmailList(actorEmails as unknown);
  const recipients = resolveLayerRecipients(actors, layer);
  target[`L${layer.layerNumber}_Email`] = actors[0] ?? primaryFallback;
  target[`L${layer.layerNumber}_Emails`] = joinEmailList(actors);
  target[`L${layer.layerNumber}_NotifyEmails`] = joinEmailList(recipients);
  return recipients;
}

/**
 * Whose behalf a layer was decided on, when it was signed by a stand-in (a PA
 * acting for the CEO). Stored as JSON in the `L{n}_OnBehalfOf` note column at
 * the moment of signing, so a later promotion or a changed directory row never
 * rewrites who the decision was made for.
 */
export interface OnBehalfOfRecord {
  email: string;
  name: string;
  position: string;
}

const ON_BEHALF_FIELD_LIMIT = 200;

export function serializeOnBehalfOf(record: OnBehalfOfRecord): string {
  const clip = (value: string) => value.trim().slice(0, ON_BEHALF_FIELD_LIMIT);
  return JSON.stringify({ email: clip(record.email), name: clip(record.name), position: clip(record.position) });
}

/** The `L{n}_OnBehalfOf` record of a submission, or null when the layer was signed in person. */
export function readOnBehalfOf(
  fields: Record<string, unknown> | undefined | null,
  layerNumber: number,
): OnBehalfOfRecord | null {
  const raw = fields?.[`L${layerNumber}_OnBehalfOf`];
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
    const record = { email: text(parsed.email), name: text(parsed.name), position: text(parsed.position) };
    return record.email || record.name ? record : null;
  } catch {
    return null;
  }
}

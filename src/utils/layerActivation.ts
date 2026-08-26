/**
 * layerActivation.ts — when a workflow layer became the one waiting to be acted on.
 *
 * A delayed evaluation ("send in 3 months") counts from that moment, not from
 * whenever somebody pressed save. It matters when a layer parks because the
 * directory had no approver for the submitter's department: an admin routes it
 * days or weeks later, and the evaluation must still land on the date it would
 * have if the layer had routed itself at submission time. Anchoring on the
 * admin's click instead would let their delay push real evaluation dates around.
 */

/** SharePoint hands dates back as ISO strings, and occasionally as Date objects. */
function parseTimestamp(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * When `layerNumber` went live, given the submission record.
 *
 * The first layer starts at submission. A later one starts when the layer
 * before it was signed, falling back to the submission for the public and paper
 * layers that historically closed without recording a timestamp, and to `now`
 * for a record that carries no usable date at all.
 */
export function resolveLayerActivatedAt(
  item: Record<string, unknown>,
  previousLayerNumber: number | undefined,
  now: Date = new Date(),
): Date {
  const submittedAt = parseTimestamp(item.SubmittedAt);
  if (previousLayerNumber === undefined) return submittedAt ?? now;
  return parseTimestamp(item[`L${previousLayerNumber}_SignedAt`]) ?? submittedAt ?? now;
}

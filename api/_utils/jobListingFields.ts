export function parseJobCustomFields(
  fields: Record<string, unknown>,
  columnName?: string | null,
): Record<string, unknown>[] | undefined {
  const raw = (columnName ? fields[columnName] : undefined)
    ?? fields.CustomFields
    ?? fields.Custom_x0020_Fields
    ?? fields.Custom_x0020_Questions;
  if (!raw || typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as Record<string, unknown>[] : undefined;
  } catch {
    return undefined;
  }
}

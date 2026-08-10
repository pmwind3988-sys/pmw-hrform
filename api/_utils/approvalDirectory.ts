/**
 * approvalDirectory.ts — reads the `Approval Directory` list over Graph.
 *
 * The client-side equivalent is `src/utils/approvalDirectory.ts`, which goes
 * over SharePoint REST. Only the transport differs; both feed the same
 * `lookupPerson` / `lookupRoleHolder` ports on the shared resolver, and the
 * column names come from the mirrored schema module so the two cannot disagree.
 *
 * Every lookup answers `null` rather than throwing when a person or role is
 * missing. That is deliberate: a directory gap parks one submission for an
 * admin to resolve, and must never be the reason a submission is lost.
 */
import { queryListItems, graphFieldEquals } from "./graphClient.js";
import {
  APPROVAL_DIRECTORY_COLUMNS,
  APPROVAL_DIRECTORY_LIST,
  directoryEmailKey,
  toApprovalDirectoryRow,
  type ApprovalDirectoryRow,
} from "./approvalDirectorySchema.js";
import { logWarn } from "./logger.js";

/**
 * One request per distinct address, cached for the life of the invocation.
 * Walking a chain re-reads the same rows (a hop's target becomes the next hop's
 * subject), and a submission with several chain layers walks overlapping paths.
 */
export function createApprovalDirectoryReader(token: string) {
  const people = new Map<string, ApprovalDirectoryRow | null>();

  async function lookupPerson(email: string): Promise<ApprovalDirectoryRow | null> {
    const key = directoryEmailKey(email);
    if (!key) return null;

    const cached = people.get(key);
    if (cached !== undefined) return cached;

    let row: ApprovalDirectoryRow | null = null;
    try {
      const matches = await queryListItems(token, APPROVAL_DIRECTORY_LIST, {
        filter: graphFieldEquals(APPROVAL_DIRECTORY_COLUMNS.personEmail, key),
        top: 2,
        preferNonIndexed: true,
      });
      const active = matches
        .map((match) => toApprovalDirectoryRow(match.fields))
        .filter((candidate) => candidate.isActive);
      row = active[0] ?? null;
    } catch (error) {
      // A missing list is the normal state before anyone sets the directory up.
      // Treat it as "nobody is listed" so chain layers park with a useful
      // message instead of failing the submission outright.
      logWarn("api:approval-directory", "Person lookup failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    people.set(key, row);
    return row;
  }

  async function lookupRoleHolder(
    department: string,
    role: string,
  ): Promise<{ email: string; name: string } | null> {
    const wantedDepartment = department.trim();
    const wantedRole = role.trim();
    if (!wantedDepartment || !wantedRole) return null;

    try {
      const matches = await queryListItems(token, APPROVAL_DIRECTORY_LIST, {
        filter: [
          graphFieldEquals(APPROVAL_DIRECTORY_COLUMNS.department, wantedDepartment),
          graphFieldEquals(APPROVAL_DIRECTORY_COLUMNS.position, wantedRole),
        ].join(" and "),
        top: 2,
        preferNonIndexed: true,
      });
      const holder = matches
        .map((match) => toApprovalDirectoryRow(match.fields))
        .find((candidate) => candidate.isActive && candidate.personEmail);
      return holder ? { email: holder.personEmail, name: holder.personName } : null;
    } catch (error) {
      logWarn("api:approval-directory", "Role holder lookup failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  return {
    lookupPerson: async (email: string) => {
      const row = await lookupPerson(email);
      return row
        ? {
          email: row.personEmail,
          name: row.personName,
          department: row.department,
          position: row.position,
          approverEmail: row.approverEmail,
        }
        : null;
    },
    lookupRoleHolder,
  };
}

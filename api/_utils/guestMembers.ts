import {
  createListItem,
  queryAllListItems,
  queryListItemByFields,
  updateListItemFields,
  type GraphListItem,
} from "./graphClient.js";
import {
  ensureFieldIndexedViaSPRest,
  ensureListViaSPRest,
  ensureTextFieldViaSPRest,
} from "./sharepointRest.js";

/**
 * Guest members — the people who sign in with Google.
 *
 * Anyone with a Google account may become one, and membership never expires.
 * There is deliberately no expiry column: permanence is a property of the
 * schema rather than a date set implausibly far in the future, which is the
 * kind of thing that quietly comes true.
 *
 * This replaces `Internal Accounts`, the HR-issued login-ID identities. No
 * password is stored here and none is ever handled — Google proves who the
 * person is, and what this list holds is who they said they are and what they
 * are allowed to reach.
 *
 * One SharePoint list, all single-line text columns. Text rather than number,
 * boolean and dateTime columns because `ensureTextFieldViaSPRest` is the one
 * column-creating path this tenant permits (the app-only Graph principal is
 * refused), and every value here is short. Numbers, flags and timestamps are
 * parsed on read.
 */
export const GUEST_MEMBERS_LIST = "Guest Members";

/** Title holds the Google email — see `ensureGuestMembersSchema` on indexing it. */
const COLUMN_GOOGLE_NAME = "GoogleName";
const COLUMN_FULL_NAME = "FullName";
const COLUMN_POSITION = "Position";
const COLUMN_DEPARTMENT = "Department";
const COLUMN_PROFILE_COMPLETE = "ProfileComplete";
const COLUMN_LEARNING_APPROVED = "LearningApproved";
const COLUMN_APPROVED_BY = "ApprovedBy";
const COLUMN_STATUS = "MemberStatus";
const COLUMN_TOKEN_VERSION = "TokenVersion";
const COLUMN_JOINED_AT = "JoinedAt";
const COLUMN_LAST_LOGIN = "LastLoginAt";

const MEMBER_COLUMNS = [
  COLUMN_GOOGLE_NAME,
  COLUMN_FULL_NAME,
  COLUMN_POSITION,
  COLUMN_DEPARTMENT,
  COLUMN_PROFILE_COMPLETE,
  COLUMN_LEARNING_APPROVED,
  COLUMN_APPROVED_BY,
  COLUMN_STATUS,
  COLUMN_TOKEN_VERSION,
  COLUMN_JOINED_AT,
  COLUMN_LAST_LOGIN,
] as const;

/**
 * How many members one admin request may pull back.
 *
 * Unlike the portal accounts this replaces, the list grows on its own — anyone
 * may create a row by pressing a button — so the admin screen pages through it
 * rather than loading everybody, and this is the ceiling on a single page.
 */
export const MEMBER_PAGE_SIZE = 50;

/** A hard ceiling on one request, however the caller pages. */
const MAX_MEMBERS_SCANNED = 5000;

// ── Input rules ──────────────────────────────────────────────────────────────

/**
 * Addresses are lowercased and trimmed, because `Ali@gmail.com` and
 * `ali@gmail.com` are one person and must never become two rows.
 */
export function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function validateFullName(raw: unknown): string {
  const fullName = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (fullName.length < 2 || fullName.length > 120) {
    throw new Error("Full name must be 2-120 characters.");
  }
  return fullName;
}

export function validatePosition(raw: unknown): string {
  const position = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (position.length < 2 || position.length > 120) {
    throw new Error("Position must be 2-120 characters.");
  }
  return position;
}

export function validateDepartment(raw: unknown): string {
  const department = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (department.length < 2 || department.length > 120) {
    throw new Error("Select a department.");
  }
  return department;
}

// ── Records ──────────────────────────────────────────────────────────────────

export interface GuestMember {
  itemId: string;
  email: string;
  googleName: string;
  fullName: string;
  position: string;
  department: string;
  /** The blocking first-sign-in form has been completed. */
  profileComplete: boolean;
  /** An HR Forms Owner has granted access to the learning hub. */
  learningApproved: boolean;
  approvedBy: string;
  status: "active" | "disabled";
  tokenVersion: number;
  joinedAt: string;
  lastLoginAt: string;
}

/** Everything except the SharePoint item id — what an admin screen may see. */
export type GuestMemberSummary = Omit<GuestMember, "itemId">;

/** SharePoint has no boolean column here, so flags are the strings "1" and "". */
function toFlag(value: unknown): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}

function fromFlag(value: boolean): string {
  return value ? "1" : "";
}

function toMember(item: GraphListItem): GuestMember {
  const fields = item.fields || {};
  return {
    itemId: item.id,
    email: normalizeEmail(fields.Title),
    googleName: String(fields[COLUMN_GOOGLE_NAME] || ""),
    fullName: String(fields[COLUMN_FULL_NAME] || ""),
    position: String(fields[COLUMN_POSITION] || ""),
    department: String(fields[COLUMN_DEPARTMENT] || ""),
    profileComplete: toFlag(fields[COLUMN_PROFILE_COMPLETE]),
    learningApproved: toFlag(fields[COLUMN_LEARNING_APPROVED]),
    approvedBy: String(fields[COLUMN_APPROVED_BY] || ""),
    status: String(fields[COLUMN_STATUS] || "active") === "disabled" ? "disabled" : "active",
    tokenVersion: Number(fields[COLUMN_TOKEN_VERSION]) || 0,
    joinedAt: String(fields[COLUMN_JOINED_AT] || ""),
    lastLoginAt: String(fields[COLUMN_LAST_LOGIN] || ""),
  };
}

export function toMemberSummary(member: GuestMember): GuestMemberSummary {
  const { itemId: _itemId, ...summary } = member;
  return summary;
}

// ── Provisioning ─────────────────────────────────────────────────────────────

/**
 * Creates the list and its columns with the admin's own delegated token over
 * SharePoint REST. Both halves, not just the columns: the app-only principal is
 * refused list creation on this tenant as well.
 *
 * **Indexing `Title` is not optional here.** SharePoint answers a filtered read
 * against an unindexed column unreliably once a list passes roughly 5,000 items,
 * and the code this replaces coped by falling back to a scan capped at 2,000 —
 * under a comment reading "this is not a list that grows with use". That was
 * true when HR issued accounts by hand. It stopped being true the moment anyone
 * on the internet could create one by pressing a button. Without the index, a
 * registered member is intermittently told they have no account, which looks
 * like a flaky login rather than the capacity limit it is.
 *
 * The index is what makes `findMemberItem` correct at any size, which is why
 * there is no scan fallback below: a scan that cannot cover its own list turns
 * "SharePoint is unreachable" into "you do not exist", and the second is a much
 * worse thing to tell somebody who is standing at the door with a valid Google
 * account.
 */
export async function ensureGuestMembersSchema(delegatedToken: string): Promise<void> {
  await ensureListViaSPRest(delegatedToken, GUEST_MEMBERS_LIST);
  for (const column of MEMBER_COLUMNS) {
    await ensureTextFieldViaSPRest(delegatedToken, GUEST_MEMBERS_LIST, column, column);
  }
  await ensureFieldIndexedViaSPRest(delegatedToken, GUEST_MEMBERS_LIST, "Title");
}

// ── Reads and writes ─────────────────────────────────────────────────────────

/** The list has never been provisioned — the caller's "no such member" is right. */
function isMissingList(error: unknown): boolean {
  return error instanceof Error && error.message.includes(`List "${GUEST_MEMBERS_LIST}" not found`);
}

/**
 * Finds one member's list item, or null if there genuinely is not one.
 *
 * A missing list answers null, because an unprovisioned list holds nobody. Every
 * other failure is raised rather than swallowed: "SharePoint refused" and "no
 * such member" lead to completely different things being said to the person
 * signing in, and a `.catch(() => null)` here would make them indistinguishable.
 */
async function findMemberItem(graphToken: string, email: string): Promise<GraphListItem | null> {
  try {
    return await queryListItemByFields(graphToken, GUEST_MEMBERS_LIST, { Title: email });
  } catch (error) {
    if (isMissingList(error)) return null;
    throw error;
  }
}

export async function readMember(graphToken: string, rawEmail: string): Promise<GuestMember | null> {
  const email = normalizeEmail(rawEmail);
  if (!email) return null;
  const item = await findMemberItem(graphToken, email);
  return item ? toMember(item) : null;
}

/**
 * The member behind a Google sign-in, created on the spot if this is their
 * first. Nobody is refused at the door — what a brand-new member may reach is
 * decided everywhere else, by `profileComplete` and `learningApproved`.
 *
 * Google's name is stored but never overwrites the name the member declared:
 * `FullName` is what HR has on record, and a person who corrected it should not
 * find it reverting because Google still holds the old one.
 */
export async function findOrCreateMember(
  graphToken: string,
  identity: { email: string; name: string },
): Promise<GuestMember> {
  const email = normalizeEmail(identity.email);
  if (!email) throw new Error("Google did not return an email address.");

  const existing = await findMemberItem(graphToken, email);
  const now = new Date().toISOString();

  if (existing) {
    const member = toMember(existing);
    await updateListItemFields(graphToken, GUEST_MEMBERS_LIST, member.itemId, {
      [COLUMN_LAST_LOGIN]: now,
      // Refreshed because a person can change their Google name, and this field
      // is only ever a reference copy of what Google currently says.
      [COLUMN_GOOGLE_NAME]: identity.name || member.googleName,
    });
    return { ...member, lastLoginAt: now, googleName: identity.name || member.googleName };
  }

  const created = await createListItem(graphToken, GUEST_MEMBERS_LIST, {
    Title: email,
    [COLUMN_GOOGLE_NAME]: identity.name,
    [COLUMN_FULL_NAME]: "",
    [COLUMN_POSITION]: "",
    [COLUMN_DEPARTMENT]: "",
    [COLUMN_PROFILE_COMPLETE]: fromFlag(false),
    [COLUMN_LEARNING_APPROVED]: fromFlag(false),
    [COLUMN_APPROVED_BY]: "",
    [COLUMN_STATUS]: "active",
    [COLUMN_TOKEN_VERSION]: "1",
    [COLUMN_JOINED_AT]: now,
    [COLUMN_LAST_LOGIN]: now,
  });

  return {
    itemId: String(created.id),
    email,
    googleName: identity.name,
    fullName: "",
    position: "",
    department: "",
    profileComplete: false,
    learningApproved: false,
    approvedBy: "",
    status: "active",
    tokenVersion: 1,
    joinedAt: now,
    lastLoginAt: now,
  };
}

/**
 * The member's own profile, saved by the member. The blocking first-sign-in
 * form calls this, and so does every later edit from their profile page.
 *
 * The token version is deliberately *not* bumped: this is the person updating
 * their own details, not an administrator revoking anything, and signing
 * somebody out for correcting a typo in their job title would be absurd.
 */
export async function saveMemberProfile(
  graphToken: string,
  rawEmail: string,
  input: { fullName: unknown; position: unknown; department: unknown },
): Promise<GuestMember> {
  const email = normalizeEmail(rawEmail);
  const member = await readMember(graphToken, email);
  if (!member) throw new Error("That member record no longer exists. Sign in again.");

  const fullName = validateFullName(input.fullName);
  const position = validatePosition(input.position);
  const department = validateDepartment(input.department);

  await updateListItemFields(graphToken, GUEST_MEMBERS_LIST, member.itemId, {
    [COLUMN_FULL_NAME]: fullName,
    [COLUMN_POSITION]: position,
    [COLUMN_DEPARTMENT]: department,
    [COLUMN_PROFILE_COMPLETE]: fromFlag(true),
  });
  forgetCachedMemberState(email);

  return { ...member, fullName, position, department, profileComplete: true };
}

/**
 * Grants or revokes the learning hub, by an HR Forms Owner.
 *
 * Revoking bumps the token version, because it has to cut off whoever is
 * already signed in and reading — not merely refuse them the next time they
 * arrive. Granting bumps it too, so the member's next request picks up the new
 * state immediately instead of waiting out the state cache.
 */
export async function setLearningApproval(
  graphToken: string,
  rawEmail: string,
  approved: boolean,
  adminEmail: string,
): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const member = await readMember(graphToken, email);
  if (!member) throw new Error("That member record no longer exists.");

  await updateListItemFields(graphToken, GUEST_MEMBERS_LIST, member.itemId, {
    [COLUMN_LEARNING_APPROVED]: fromFlag(approved),
    [COLUMN_APPROVED_BY]: approved ? adminEmail : "",
    [COLUMN_TOKEN_VERSION]: String(member.tokenVersion + 1),
  });
  forgetCachedMemberState(email);
}

export async function setMemberStatus(
  graphToken: string,
  rawEmail: string,
  status: "active" | "disabled",
): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const member = await readMember(graphToken, email);
  if (!member) throw new Error("That member record no longer exists.");

  await updateListItemFields(graphToken, GUEST_MEMBERS_LIST, member.itemId, {
    [COLUMN_STATUS]: status,
    // Disabling has to cut off whoever is already signed in, not just refuse the
    // next sign-in. Bumping the version is what makes their token stop verifying.
    [COLUMN_TOKEN_VERSION]: String(member.tokenVersion + 1),
  });
  forgetCachedMemberState(email);
}

export interface MemberPage {
  members: GuestMemberSummary[];
  /** Total matching the search, so the screen can say "showing 50 of 812". */
  total: number;
}

/**
 * One page of members, newest first, optionally filtered by a search term.
 *
 * The whole list is read and then paged in memory rather than paged at
 * SharePoint. That is a deliberate trade against `MAX_MEMBERS_SCANNED`: sorting
 * newest-first and searching across name, email, position and department all at
 * once is not something a Graph `$filter` on text columns does well, and this
 * runs on an admin screen a handful of people open, not on a member's request
 * path. Past the ceiling the count is honest about being a ceiling.
 */
export async function listMembers(
  graphToken: string,
  options: { search?: string; skip?: number; take?: number } = {},
): Promise<MemberPage> {
  const items = await queryAllListItems(graphToken, GUEST_MEMBERS_LIST, {
    maxItems: MAX_MEMBERS_SCANNED,
  });

  const search = String(options.search ?? "").trim().toLowerCase();
  const all = items
    .map(toMember)
    .filter((member) => member.email)
    .filter((member) => {
      if (!search) return true;
      return [member.email, member.fullName, member.googleName, member.position, member.department]
        .join(" ")
        .toLowerCase()
        .includes(search);
    })
    .sort((a, b) => (b.joinedAt || "").localeCompare(a.joinedAt || ""));

  const skip = Math.max(0, Number(options.skip) || 0);
  const take = Math.min(Math.max(1, Number(options.take) || MEMBER_PAGE_SIZE), MEMBER_PAGE_SIZE);

  return {
    members: all.slice(skip, skip + take).map(toMemberSummary),
    total: all.length,
  };
}

// ── Departments ──────────────────────────────────────────────────────────────

/** The directory HR already maintains, for routing approvals to the right person. */
const DEPARTMENT_DIRECTORY_LIST = "Department Approver Directory";
const DEPARTMENT_DIRECTORY_COLUMN = "Department";

/**
 * The departments a joining member may pick from.
 *
 * Read from the directory HR already keeps rather than a second list of our
 * own, so the value stored against a member is the same string the approval
 * routing understands — a member's department that no approver directory
 * recognises is a value nobody can act on.
 *
 * Read with the application's token because the person choosing has a guest
 * session and no SharePoint identity of their own. Nothing sensitive leaves:
 * the names of departments, and not the approvers behind them.
 *
 * Worth knowing about, and not fixable here: this directory lists PMW's own
 * departments. A genuinely external guest — a contractor at another company —
 * may find nothing here that describes them and will pick the closest wrong
 * one. If that turns out to be the common case, an "Other, please specify"
 * option is the answer.
 *
 * A missing or unreadable directory answers an empty list rather than throwing.
 * The profile form falls back to a free-text field, which is a worse record than
 * a chosen one but far better than a member who cannot finish signing up.
 */
export async function listDepartments(graphToken: string): Promise<string[]> {
  let items: GraphListItem[];
  try {
    items = await queryAllListItems(graphToken, DEPARTMENT_DIRECTORY_LIST, { maxItems: 2000 });
  } catch {
    return [];
  }

  const seen = new Set<string>();
  for (const item of items) {
    const value = String(item.fields?.[DEPARTMENT_DIRECTORY_COLUMN] ?? "").trim();
    if (value) seen.add(value);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

// ── Live session checks ──────────────────────────────────────────────────────

interface CachedMemberState {
  tokenVersion: number;
  status: "active" | "disabled";
  learningApproved: boolean;
  profileComplete: boolean;
  expiresAt: number;
}

/**
 * A signed token is proof of who someone is, not proof they are still allowed
 * in. Disabling a member or revoking their learning approval bumps the token
 * version, and this is where an already-issued token finds that out.
 *
 * Cached briefly because it runs on every request a guest member makes, while
 * the thing it reads changes when an admin clicks something. The cache is what
 * bounds a revocation to taking effect within a minute rather than immediately —
 * an acceptable trade for not adding a SharePoint round trip to every call.
 */
const MEMBER_STATE_CACHE_MS = 60_000;
const memberStateCache = new Map<string, CachedMemberState>();

async function readMemberState(
  graphToken: string,
  email: string,
): Promise<CachedMemberState | null> {
  const cached = memberStateCache.get(email);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const member = await readMember(graphToken, email);
  if (!member) return null;

  const fresh: CachedMemberState = {
    tokenVersion: member.tokenVersion,
    status: member.status,
    learningApproved: member.learningApproved,
    profileComplete: member.profileComplete,
    expiresAt: Date.now() + MEMBER_STATE_CACHE_MS,
  };
  memberStateCache.set(email, fresh);
  return fresh;
}

/** Still signed in: the record exists, is not disabled, and the token generation matches. */
export async function isGuestSessionCurrent(
  graphToken: string,
  rawEmail: string,
  tokenVersion: number,
): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  if (!email) return false;
  const state = await readMemberState(graphToken, email);
  if (!state) return false;
  return state.status === "active" && state.tokenVersion === tokenVersion;
}

/**
 * What a signed-in guest member is currently allowed to do.
 *
 * Read through the same short cache as the session check, so the two cannot
 * disagree within one request, and so asking both costs one SharePoint read
 * rather than two.
 */
export async function readGuestPermissions(
  graphToken: string,
  rawEmail: string,
): Promise<{ learningApproved: boolean; profileComplete: boolean } | null> {
  const email = normalizeEmail(rawEmail);
  if (!email) return null;
  const state = await readMemberState(graphToken, email);
  if (!state) return null;
  return { learningApproved: state.learningApproved, profileComplete: state.profileComplete };
}

/** Drops the cached state so a change is felt on the very next request. */
function forgetCachedMemberState(email: string): void {
  memberStateCache.delete(normalizeEmail(email));
}

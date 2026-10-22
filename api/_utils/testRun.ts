/**
 * testRun.ts — turning a form's real workflow into a rehearsal.
 *
 * A test run is a genuine submission down the genuine pipeline: the chain walk,
 * the Department Approver Directory lookup and the distribution-list expansion
 * all still happen, and their answers are written to the usual `L{n}_Email`
 * columns so the builder can see who the form *would* have gone to. Only the
 * moment of dispatch is overridden.
 *
 * Test mode is never read from a request body. A public test opens an anonymous
 * page, so the only thing that may switch it on is a ticket signed with
 * `API_SECRET_KEY` by an authenticated Form Builder Superuser. Anything wrong
 * with a ticket — absent, malformed, edited, expired — yields `null`, and the
 * caller then treats the submission as ordinary production traffic. That is the
 * safe direction to fail: the worst case is a real submission, not a silent
 * redirect of real mail.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { joinEmailList, parseValidEmailList } from "./layerRecipients.js";
import type { DirectoryPerson } from "./resolveAssignee.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Long enough to fill in a form at leisure, short enough that a leak dies. */
export const TEST_TICKET_TTL_MS = 4 * 60 * 60 * 1000;

export interface TestTicketPayload {
  slug: string;
  testEmail: string;
  issuedBy: string;
  /**
   * Rehearses a stand-in: every step belongs to this address and the tester
   * acts as their PA. Never mailed, so it may be a made-up address.
   */
  onBehalfOf?: string;
  /** Epoch ms. */
  expiresAt: number;
}

function signingKey(): string {
  const key = process.env.API_SECRET_KEY || "";
  if (!key) throw new Error("API_SECRET_KEY is required to sign a test ticket.");
  return key;
}

function sign(body: string): string {
  return createHmac("sha256", signingKey()).update(body).digest("base64url");
}

export function mintTestTicket(
  payload: Omit<TestTicketPayload, "expiresAt">,
  now: Date = new Date(),
): string {
  const testEmail = payload.testEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(testEmail)) {
    throw new Error("A test run needs a valid email address to redirect to.");
  }
  const onBehalfOf = (payload.onBehalfOf ?? "").trim().toLowerCase();
  if (onBehalfOf && (!EMAIL_RE.test(onBehalfOf) || onBehalfOf === testEmail)) {
    throw new Error("The person a test run stands in for needs an email address other than the tester's.");
  }
  const body = Buffer.from(
    JSON.stringify({
      slug: payload.slug.trim(),
      testEmail,
      issuedBy: payload.issuedBy.trim().toLowerCase(),
      ...(onBehalfOf ? { onBehalfOf } : {}),
      expiresAt: now.getTime() + TEST_TICKET_TTL_MS,
    } satisfies TestTicketPayload),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyTestTicket(
  raw: unknown,
  slug: string,
  now: Date = new Date(),
): TestTicketPayload | null {
  if (typeof raw !== "string" || !raw.includes(".")) return null;
  const [body, signature] = raw.split(".");
  if (!body || !signature) return null;

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return null;
  }
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TestTicketPayload;
    if (typeof parsed?.slug !== "string" || parsed.slug !== slug.trim()) return null;
    if (typeof parsed.testEmail !== "string" || !EMAIL_RE.test(parsed.testEmail)) return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= now.getTime()) return null;
    if (parsed.onBehalfOf !== undefined && (typeof parsed.onBehalfOf !== "string" || !EMAIL_RE.test(parsed.onBehalfOf))) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const TEST_SUBJECT_PREFIX = "TEST – ";

export interface TestRunRedirect {
  testEmail: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Rewrites one outbound message for a test run.
 *
 * The production addresses are not merely dropped — they are printed in the
 * banner. Seeing "would have gone to hod-finance@…" is the single most useful
 * thing a test run tells a builder, and it is the part a redirect would
 * otherwise destroy.
 */
export function redirectTestMessage<T extends { to: string | string[]; subject: string; body: string }>(
  message: T,
  redirect: TestRunRedirect,
): T {
  const intended = (Array.isArray(message.to) ? message.to : [message.to]).filter((entry) => entry.trim());
  const banner =
    `<div style="border:2px solid #b91c1c;background:#fef2f2;color:#7f1d1d;padding:12px;margin:0 0 16px;border-radius:6px;font-family:sans-serif">` +
    `<strong>TEST RUN — this is not a real submission.</strong><br>` +
    `In production this email would have gone to: ${intended.map((entry) => escapeHtml(entry)).join(", ") || "nobody"}.` +
    `</div>`;

  return {
    ...message,
    to: redirect.testEmail,
    subject: message.subject.startsWith(TEST_SUBJECT_PREFIX)
      ? message.subject
      : `${TEST_SUBJECT_PREFIX}${message.subject}`,
    body: `${banner}${message.body}`,
  };
}

export const TEST_FLAG_FIELD = "IsTest";
export const TEST_EMAIL_FIELD = "TestEmail";

/**
 * Every step of a test run is assigned to the tester, whoever the form's real
 * routing would have picked. The tester is then the one person who can open,
 * approve and evaluate each step, and a step that routes from the previous
 * step's actor finds its actors already written and is left alone.
 *
 * With `onBehalfOf`, each step instead belongs to that address and lists the
 * tester as their stand-in, exactly as a CEO's step lists their PA. The mail
 * still reaches only the tester (`redirectTestMessage`).
 *
 * No step is parked and none is sent to paper: a rehearsal that stopped at the
 * first directory gap could never reach its later steps.
 */
export function testRunLayerFields(
  layerNumbers: readonly number[],
  testEmail: string,
  pendingStatus: string,
  onBehalfOf = "",
): Record<string, string> {
  const actors = joinEmailList(onBehalfOf ? [onBehalfOf, testEmail] : [testEmail]);
  const fields: Record<string, string> = {};
  for (const layerNumber of layerNumbers) {
    fields[`L${layerNumber}_Status`] = pendingStatus;
    fields[`L${layerNumber}_Email`] = onBehalfOf || testEmail;
    fields[`L${layerNumber}_Emails`] = actors;
    fields[`L${layerNumber}_NotifyEmails`] = actors;
  }
  return fields;
}

const LAYER_PRIMARY_KEY_RE = /^L(\d+)_Email$/;

/**
 * The people a test-run row has the tester standing in for: each step's
 * primary that is not the tester but lists the tester among its actors. Read
 * off the row, so no column records it and the browser's submit path needs
 * nothing extra.
 */
export function testRunStandInPrincipals(fields: Record<string, unknown> | undefined): string[] {
  const redirect = readTestRunRedirect(fields);
  if (!redirect || !fields) return [];
  const principals = new Set<string>();
  for (const key of Object.keys(fields)) {
    const match = LAYER_PRIMARY_KEY_RE.exec(key);
    if (!match) continue;
    const primary = String(fields[key] ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(primary) || primary === redirect.testEmail) continue;
    const actors = parseValidEmailList(fields[`L${match[1]}_Emails`]).map((entry) => entry.toLowerCase());
    if (actors.includes(redirect.testEmail)) principals.add(primary);
  }
  return [...principals];
}

type PersonPorts = { lookupPerson(email: string): Promise<DirectoryPerson | null> };

/**
 * Directory lookups for a test run that rehearses a stand-in: the person stood
 * in for reads back naming the tester as their PA — under their address, when
 * the directory has never heard of them. Every stand-in helper (the email
 * sentence, the on-behalf stamp at signing) then behaves exactly as it would
 * for a real PA, and nobody's directory row changes.
 */
export function withTestRunStandIn(ports: PersonPorts, tester: string, principals: readonly string[]): PersonPorts {
  const wanted = new Set(principals.map((entry) => entry.trim().toLowerCase()));
  if (!tester || wanted.size === 0) return ports;
  return {
    lookupPerson: async (email: string) => {
      const real = await ports.lookupPerson(email).catch(() => null);
      if (!wanted.has(email.trim().toLowerCase())) return real;
      const base: DirectoryPerson = real ?? { email, name: email, department: "", position: "", approverEmail: "" };
      return { ...base, delegateEmails: [...(base.delegateEmails ?? []), tester] };
    },
  };
}

/** `withTestRunStandIn`, reading the tester and who they stand in for off the row. */
export function withTestRunStandInFor(ports: PersonPorts, fields: Record<string, unknown> | undefined): PersonPorts {
  return withTestRunStandIn(ports, readTestRunRedirect(fields)?.testEmail ?? "", testRunStandInPrincipals(fields));
}

export function testRunFieldsFor(payload: TestTicketPayload): Record<string, string> {
  return { [TEST_FLAG_FIELD]: "true", [TEST_EMAIL_FIELD]: payload.testEmail };
}

export function isTestRow(fields: Record<string, unknown> | undefined): boolean {
  const flag = fields?.[TEST_FLAG_FIELD];
  return flag === true || String(flag ?? "").trim().toLowerCase() === "true";
}

/**
 * A flagged row with no usable address gets no redirect. The alternative —
 * falling back to the real assignee — would mail a real approver from a run the
 * builder believes is a rehearsal, which is the one outcome this feature exists
 * to prevent. The mail simply does not go out, and the trail records why.
 */
export function readTestRunRedirect(
  fields: Record<string, unknown> | undefined,
): TestRunRedirect | undefined {
  if (!isTestRow(fields)) return undefined;
  const testEmail = String(fields?.[TEST_EMAIL_FIELD] ?? "").trim().toLowerCase();
  return EMAIL_RE.test(testEmail) ? { testEmail } : undefined;
}

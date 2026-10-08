/**
 * Turns a failed load into words a person can act on.
 *
 * Every screen used to write its own failure line, and they had drifted into
 * "Something needs attention", "Failed to load learning materials (502)",
 * "Server returned status 502:" and a bare "ERR". Two things went wrong across
 * them: a raw status code was shown as though it were an explanation, and a
 * server outage was described as the reader's fault ("check your connection")
 * or as the thing not existing ("Form not found").
 *
 * This keeps one rule for all of them. The KIND of failure decides the
 * sentence; the status code survives only as a small reference someone can
 * quote to HR, never as the message itself.
 */

export type FailureKind = "offline" | "unreachable" | "not-found" | "gone" | "no-access" | "unknown";

export interface FailureCopy {
  kind: FailureKind;
  title: string;
  body: string;
  /** A short reference for support ("HTTP 502"), or "" when there is none. */
  code: string;
}

interface FailureInput {
  /** The HTTP status when the caller knows it. */
  status?: number | null;
  /** Whatever was thrown or returned. Its message is mined for a status. */
  error?: unknown;
  /** Defaults to `navigator.onLine` in the browser. */
  online?: boolean;
}

/**
 * Pulls an HTTP status out of whatever the caller has.
 *
 * Errors in this codebase carry the status in several shapes — a `status`
 * property, "(502)", "status 502", ": 502" — because each service formats its
 * own. Only 3-digit codes in the 4xx/5xx range count; a bare number elsewhere
 * in a message (a count, a year) must not be mistaken for one.
 */
export function statusFromError(error: unknown): number | null {
  if (error && typeof error === "object" && "status" in error) {
    const value = Number((error as { status: unknown }).status);
    if (Number.isInteger(value) && value >= 400 && value <= 599) return value;
  }
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = /(?:status\s*|\(|:\s*|HTTP\s*)([45]\d\d)\b/i.exec(message);
  return match ? Number(match[1]) : null;
}

function isNetworkFailure(error: unknown): boolean {
  // `fetch` rejects with a TypeError when the request never got an answer.
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /failed to fetch|network\s*error|load failed|networkerror/i.test(message);
}

export function classifyFailure({ status, error, online }: FailureInput): FailureKind {
  const isOnline = online ?? (typeof navigator === "undefined" ? true : navigator.onLine);
  if (!isOnline) return "offline";
  const code = status ?? statusFromError(error);
  if (code === 404) return "not-found";
  // Deliberately closed -- switched off or past its expiry -- not missing.
  if (code === 410) return "gone";
  if (code === 401 || code === 403) return "no-access";
  if (code !== null && code >= 500) return "unreachable";
  if (code === null && isNetworkFailure(error)) return "unreachable";
  return "unknown";
}

function capitalise(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/**
 * The words for one failure.
 *
 * `what` names the thing that did not load, in the reader's terms and in the
 * plural or singular it reads naturally in: "openings", "this form",
 * "your submissions".
 */
export function describeFailure(what: string, input: FailureInput = {}): FailureCopy {
  const kind = classifyFailure(input);
  const status = input.status ?? statusFromError(input.error);
  const code = status ? `HTTP ${status}` : "";
  const subject = capitalise(what);

  switch (kind) {
    case "offline":
      return {
        kind,
        title: "You're offline",
        body: "Check your connection, then try again.",
        code,
      };
    case "unreachable":
      return {
        kind,
        title: `${subject} didn't load`,
        body: "This is on our side, not your connection. Try again in a minute.",
        code,
      };
    case "not-found":
      return {
        kind,
        title: `We couldn't find ${what}`,
        body: "It may have been moved or taken down. Check the link, or start again from your forms.",
        code,
      };
    case "gone":
      return {
        kind,
        title: `${subject} has closed`,
        body: "It was switched off or has passed its closing date. Ask HR for a current link.",
        code,
      };
    case "no-access":
      return {
        kind,
        title: `You don't have access to ${what}`,
        body: "Ask an HR Forms administrator if you think you should.",
        code,
      };
    default:
      return {
        kind,
        title: `${subject} didn't load`,
        body: "Try again. If it keeps happening, tell HR the reference below.",
        code,
      };
  }
}

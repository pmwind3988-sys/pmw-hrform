/**
 * Which deployment a review link points at.
 *
 * This matters because OSHES forms are served by a *different* deployment from
 * HR's. A link built with the wrong origin sends the reviewer to an app where
 * their submission does not exist, and the old hardcoded fallback made that
 * failure completely silent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logger = vi.hoisted(() => ({ logWarn: vi.fn(), logError: vi.fn() }));
vi.mock("./logger.js", () => logger);

const { getApplicationBaseUrl } = await import("./workflowEmail.js");

const KEYS = ["APP_BASE_URL", "VITE_APP_BASE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  logger.logWarn.mockClear();
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("getApplicationBaseUrl", () => {
  it("uses the configured origin, without a trailing slash", () => {
    process.env.APP_BASE_URL = "https://pmw-oshes.vercel.app/";
    expect(getApplicationBaseUrl()).toBe("https://pmw-oshes.vercel.app");
  });

  it("prefers the explicit setting over the platform's own guess", () => {
    process.env.APP_BASE_URL = "https://forms.pmw-group.com";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "pmw-hrform.vercel.app";
    expect(getApplicationBaseUrl()).toBe("https://forms.pmw-group.com");
  });

  it("falls back to the deployment's own production URL", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "pmw-oshes.vercel.app";
    expect(getApplicationBaseUrl()).toBe("https://pmw-oshes.vercel.app");
    expect(logger.logWarn).not.toHaveBeenCalled();
  });

  it("says so when it has nothing to go on and has to guess", () => {
    // Silently guessing "the HR app" is how an OSHES deployment ends up mailing
    // links to a form that only exists somewhere else.
    getApplicationBaseUrl();
    expect(logger.logWarn).toHaveBeenCalled();
    // The message says what happened; the metadata says what to do about it.
    expect(JSON.stringify(logger.logWarn.mock.calls[0])).toMatch(/APP_BASE_URL/);
  });
});

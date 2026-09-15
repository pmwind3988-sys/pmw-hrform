/**
 * contentSecurityPolicy.test.ts — The page's own CSP must not be stricter than
 * the served headers.
 *
 * A browser enforces the INTERSECTION of the `<meta http-equiv>` policy in
 * index.html and the CSP headers from vite.config.ts (dev) and vercel.json
 * (production). A directive the meta tag omits is therefore blocked everywhere,
 * however permissive the headers are — which is how PDF previews came to be
 * blocked in a build whose headers deliberately allowed them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

function directive(policy: string, name: string): string[] {
  const match = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
  return match ? match.slice(name.length).trim().split(/\s+/) : [];
}

function metaPolicy(): string {
  const html = read("index.html");
  const match = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  if (!match) throw new Error("index.html has no Content-Security-Policy meta tag");
  return match[1];
}

describe("index.html content security policy", () => {
  it("frames blob: documents, which is how every PDF preview is displayed", () => {
    expect(directive(metaPolicy(), "frame-src")).toContain("blob:");
  });

  it("is no stricter than the dev server's header for frame-src", () => {
    const served = directive(read("vite.config.ts"), "frame-src");
    const meta = directive(metaPolicy(), "frame-src");
    expect(served.length).toBeGreaterThan(0);
    for (const source of served) expect(meta).toContain(source);
  });

  it("is no stricter than the production header for frame-src", () => {
    const served = directive(read("vercel.json"), "frame-src");
    const meta = directive(metaPolicy(), "frame-src");
    expect(served.length).toBeGreaterThan(0);
    for (const source of served) expect(meta).toContain(source);
  });
});

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Vercel's Hobby plan refuses a deployment with more than 12 serverless
 * functions, and every `api/*.ts` file is one function.
 *
 * This is worth a test because of *when* the limit bites: the build succeeds,
 * the bundle is produced, the log reads "Build Completed", and the deployment
 * then fails afterwards — so nothing local catches it. `tsc`, eslint and the
 * rest of this suite all pass on a thirteenth endpoint. It has already cost one
 * failed deploy.
 *
 * If you need new server-side surface, add an `action` to an existing endpoint
 * rather than a file here — that is why the guest member routes live inside
 * `learning-materials.ts`. Raising the number below is only correct alongside a
 * paid plan that actually allows it.
 */
const MAX_SERVERLESS_FUNCTIONS = 12;

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("Vercel deployment limits", () => {
  it("stays within the serverless function budget", () => {
    // Only files directly in `api/` become functions; `api/_utils/` is shared
    // code that gets bundled into whichever functions import it.
    const functions = readdirSync(apiDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => entry.name)
      .sort();

    expect(
      functions.length,
      `api/ has ${functions.length} serverless functions, over the ${MAX_SERVERLESS_FUNCTIONS} the Hobby plan allows. ` +
        `Fold the new one into an existing endpoint as an action. Current: ${functions.join(", ")}`,
    ).toBeLessThanOrEqual(MAX_SERVERLESS_FUNCTIONS);
  });
});

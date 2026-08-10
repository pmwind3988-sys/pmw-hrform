/**
 * Regenerates the api/_utils copies of the modules shared with src/utils.
 *
 * api/ cannot import from src/, so these modules are mirrored rather than
 * shared — the same arrangement as layerRecipients.ts and workflowLink.ts. Only
 * the header comment differs, naming the other copy. A test fails if any pair
 * drifts, so run this after editing a source file:
 *
 *   node scripts/mirror-shared-modules.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

/** Every module kept in step between the two trees. */
export const MIRRORED_MODULES = ["resolveAssignee.ts", "approvalDirectorySchema.ts"];

const serverHeader = (name) => `\`api/_utils/${name}\` is the server-side copy of this file`;
const clientHeader = (name) => `\`src/utils/${name}\` is the client-side copy of this file`;

export const sourcePath = (name) => `src/utils/${name}`;
export const targetPath = (name) => `api/_utils/${name}`;

function mirror(name) {
  // Normalise endings first: the working tree may hold either depending on how
  // an editor last saved, and a pattern written with \n silently misses CRLF.
  const source = readFileSync(sourcePath(name), "utf8").replace(/\r\n/g, "\n");

  if (!source.includes(serverHeader(name))) {
    console.error(`${sourcePath(name)} is missing its expected header line:\n  ${serverHeader(name)}`);
    process.exitCode = 1;
    return;
  }

  writeFileSync(targetPath(name), source.replace(serverHeader(name), clientHeader(name)));
  console.log(`Mirrored ${sourcePath(name)} -> ${targetPath(name)}`);
}

MIRRORED_MODULES.forEach(mirror);

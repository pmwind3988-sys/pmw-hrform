/**
 * Regenerates api/_utils/resolveAssignee.ts from the src/ copy.
 *
 * api/ cannot import from src/, so the module is mirrored rather than shared —
 * the same arrangement as layerRecipients.ts and workflowLink.ts. Only the
 * header comment differs, naming the other copy. A test fails if the pair ever
 * drifts, so run this after editing the source:
 *
 *   node scripts/mirror-resolve-assignee.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "src/utils/resolveAssignee.ts";
const TARGET = "api/_utils/resolveAssignee.ts";

const FROM = "`api/_utils/resolveAssignee.ts` is the server-side copy of this file";
const TO = "`src/utils/resolveAssignee.ts` is the client-side copy of this file";

// Normalise first: the working tree may hold either ending depending on how a
// given editor last saved, and a pattern written with \n silently misses CRLF.
const source = readFileSync(SOURCE, "utf8").replace(/\r\n/g, "\n");

if (!source.includes(FROM)) {
  console.error(`${SOURCE} no longer contains the expected header line:\n  ${FROM}`);
  process.exit(1);
}

writeFileSync(TARGET, source.replace(FROM, TO));
console.log(`Mirrored ${SOURCE} -> ${TARGET}`);

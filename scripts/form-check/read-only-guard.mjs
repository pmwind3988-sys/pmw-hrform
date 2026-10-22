/**
 * Loaded before anything else. Turns every outgoing request that is not a
 * read into an error, so this check cannot create, change, delete or send
 * anything - including email, which Graph sends with a POST.
 *
 * The one exception is asking Microsoft for an access token, which is a POST
 * to the sign-in service and changes nothing.
 */
import { register } from "node:module";
import { readFileSync, existsSync } from "node:fs";

register("./ts-resolve-hook.mjs", import.meta.url);

for (const file of [".env", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    process.env[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
}

const realFetch = globalThis.fetch;
export const blockedRequests = [];
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = String(init.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
  const isTokenRequest = method === "POST" && new URL(url).hostname === "login.microsoftonline.com";
  if (method !== "GET" && method !== "HEAD" && !isTokenRequest) {
    blockedRequests.push(`${method} ${url}`);
    throw new Error(`Read-only check refused ${method} ${url}`);
  }
  return realFetch(input, init);
};
globalThis.__blockedRequests = blockedRequests;

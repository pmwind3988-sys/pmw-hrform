/**
 * The layer configuration, with the parts that must never leave the server
 * taken out, for `/api/form-config` to hand to whoever loads a public form.
 *
 * That endpoint is reachable with the API key the frontend ships to every
 * browser, so treat its response as public. It used to return `LayerConfig`
 * whole, which carried each layer's `publicToken` — the key that opens the
 * approval link — and the approver mailboxes beside it. Anyone who could load a
 * published form could therefore collect the keys to its submissions.
 *
 * Nothing on the public path needs either: an anonymous submission is routed by
 * `applyLayerConfigWorkflow` in `submit-form.ts`, from the server's own copy,
 * which overwrites whatever the browser sent. Signed-in staff read the master
 * list from SharePoint directly under their own permissions, and where that read
 * fails the page drops its token and submits as a public respondent
 * (`spDirectUnavailableRef` in `DynamicFormPage.tsx`) — so it takes the same
 * server-routed path.
 *
 * A blocklist rather than a whitelist on purpose: an unknown key here is
 * structure the renderer may need, and dropping it would break a form quietly.
 * `publicLayerConfig.test.ts` holds the backstop — a realistic config must come
 * out of here with no address anywhere in it — so a later field carrying a
 * mailbox fails a test rather than shipping.
 */

/** Keys that carry an approval key or a mailbox, at any depth. */
const SENSITIVE_LAYER_KEYS = [
  "publicToken",
  "tokenExpiresAt",
  "assignee",
  "notifyEmails",
  "submitterRoutingRules",
] as const;

interface RawLayerConfig {
  layers?: unknown[];
  manualBranches?: { layers?: unknown[]; [key: string]: unknown }[];
  [key: string]: unknown;
}

function redactLayer(layer: unknown): unknown {
  if (!layer || typeof layer !== "object" || Array.isArray(layer)) return layer;

  const copy = { ...(layer as Record<string, unknown>) };
  for (const key of SENSITIVE_LAYER_KEYS) delete copy[key];
  return copy;
}

function parseConfig(raw: unknown): RawLayerConfig | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as RawLayerConfig;
  if (typeof raw !== "string" || !raw.trim()) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as RawLayerConfig) : null;
  } catch {
    return null;
  }
}

/**
 * Answers the JSON string to serve, or `undefined` when there is no config to
 * read — the same thing the endpoint said before this existed, so a form with
 * no workflow is unaffected.
 */
export function redactLayerConfigForPublic(raw: unknown): string | undefined {
  const config = parseConfig(raw);
  if (!config) return undefined;

  const redacted: RawLayerConfig = { ...config };

  if (Array.isArray(config.layers)) {
    redacted.layers = config.layers.map(redactLayer);
  }

  // A manual branch holds its own layers, each with its own token. Missing
  // these would leave the whole exposure open through any form that has one.
  if (Array.isArray(config.manualBranches)) {
    redacted.manualBranches = config.manualBranches.map((branch) => {
      if (!branch || typeof branch !== "object") return branch;
      return {
        ...branch,
        ...(Array.isArray(branch.layers) ? { layers: branch.layers.map(redactLayer) } : {}),
      };
    });
  }

  return JSON.stringify(redacted);
}

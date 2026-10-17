/**
 * LayerRecipientsPanel.tsx — who each workflow step of a submission goes to,
 * and who may act on whose behalf (a PA standing in for the CEO).
 *
 * Shown on All Submissions beside the email controls, so an admin sees at a
 * glance that a step's email went to two people and why. Stand-ins are read
 * from the Approval Directory, which is where HR sets them; the row itself only
 * records the full set of people allowed to act (`L{n}_Emails`).
 *
 * `StandInHint` is the one-line version for a single address, under the
 * "Send now or resend" box and the reassign form: what the email will now
 * reach, before anybody presses the button.
 */
import { useEffect, useState } from "react";
import type { LayerConfigItem } from "../../types";
import { createApprovalDirectoryReader } from "../../utils/approvalDirectory";
import { parseValidEmailList, readOnBehalfOf } from "../../utils/layerRecipients";
import { standInsOf } from "../../utils/resolveAssignee";
import { onBehalfOfLine } from "../../utils/signOff";
import { C } from "./constants";

type Reader = ReturnType<typeof createApprovalDirectoryReader>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Person {
  email: string;
  name: string;
}

interface StepRecipients {
  layerNumber: number;
  primary: Person | null;
  /** Allowed to act only because the directory names them for `primary`. */
  standIns: Person[];
  /** Everyone else allowed to act — co-assignees, list members. */
  others: string[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function personFor(reader: Reader, email: string): Promise<Person> {
  const row = await reader.lookupPerson(email).catch(() => null);
  return { email, name: row?.name || "" };
}

/** The stand-ins of `primary` who are actually on the step, by name. */
async function standInsOnStep(reader: Reader, primary: string, actors: string[]): Promise<Person[]> {
  const row = await reader.lookupPerson(primary).catch(() => null);
  const onStep = new Set(actors.map((entry) => entry.toLowerCase()));
  const emails = standInsOf(row).filter((email) => onStep.has(email.toLowerCase()));
  return Promise.all(emails.map((email) => personFor(reader, email)));
}

function label(person: Person): string {
  return person.name ? `${person.name} (${person.email})` : person.email;
}

function statusTone(status: string): { bg: string; fg: string; text: string } {
  const value = status.trim().toLowerCase();
  if (value === "approved" || value === "confirmed") return { bg: C.greenPale, fg: C.green, text: status };
  if (value.includes("reject")) return { bg: C.redPale, fg: C.red, text: status };
  return { bg: C.amberPale, fg: C.amber, text: status || "Waiting" };
}

export default function LayerRecipientsPanel({
  token,
  layers,
  fields,
}: {
  token: string;
  layers: LayerConfigItem[];
  /** The submission's `L{n}_*` columns, as read when it was opened. */
  fields: Record<string, unknown>;
}) {
  const [reader] = useState(() => createApprovalDirectoryReader(token));
  const [steps, setSteps] = useState<StepRecipients[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await Promise.all(layers.map(async (layer): Promise<StepRecipients> => {
        const n = layer.layerNumber;
        const primaryEmail = text(fields[`L${n}_Email`]);
        const actors = parseValidEmailList(fields[`L${n}_Emails`] || primaryEmail);
        if (!EMAIL_RE.test(primaryEmail)) return { layerNumber: n, primary: null, standIns: [], others: actors };
        const [primary, standIns] = await Promise.all([
          personFor(reader, primaryEmail),
          standInsOnStep(reader, primaryEmail, actors),
        ]);
        const named = new Set([primaryEmail, ...standIns.map((entry) => entry.email)].map((entry) => entry.toLowerCase()));
        return { layerNumber: n, primary, standIns, others: actors.filter((entry) => !named.has(entry.toLowerCase())) };
      }));
      if (!cancelled) setSteps(resolved);
    })();
    return () => { cancelled = true; };
  }, [reader, layers, fields]);

  if (layers.length === 0) return null;

  return (
    <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: C.white, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.textPrimary }}>Who each step goes to</div>
      {!steps ? (
        <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 6 }}>Checking the Approval Directory…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 9 }}>
          {steps.map((step) => {
            const layer = layers.find((candidate) => candidate.layerNumber === step.layerNumber);
            const status = text(fields[`L${step.layerNumber}_Status`]);
            const tone = statusTone(status);
            const decided = /^(approved|confirmed|rejected)$/i.test(status);
            const actedBy = text(fields[`L${step.layerNumber}_ActedBy`]);
            const onBehalf = onBehalfOfLine(readOnBehalfOf(fields, step.layerNumber));
            const actedByStandIn = step.standIns.find((entry) => entry.email.toLowerCase() === actedBy.toLowerCase());
            return (
              <div key={step.layerNumber} style={{ padding: "9px 11px", borderRadius: 8, background: C.offWhite, display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ color: C.textPrimary }}>
                    Layer {step.layerNumber}{layer?.title ? ` · ${layer.title}` : ""}
                  </strong>
                  <span style={{ padding: "1px 8px", borderRadius: 999, background: tone.bg, color: tone.fg, fontWeight: 700, fontSize: 11 }}>{tone.text}</span>
                </div>
                {step.primary ? (
                  <div style={{ color: C.textPrimary }}>{label(step.primary)}</div>
                ) : (
                  <div style={{ color: C.textMuted }}>Not assigned yet</div>
                )}
                {step.standIns.map((standIn) => (
                  <div key={standIn.email} style={{ color: C.purple, fontWeight: 600 }}>
                    + {label(standIn)}, on {step.primary?.name || "their"}{step.primary?.name ? "'s" : ""} behalf
                  </div>
                ))}
                {step.others.length > 0 && (
                  <div style={{ color: C.textSecond }}>Also allowed to act: {step.others.join(", ")}</div>
                )}
                {decided && actedBy ? (
                  <div style={{ color: C.textSecond }}>
                    {status} by {actedByStandIn ? label(actedByStandIn) : actedBy}
                    {onBehalf ? ` — ${onBehalf.charAt(0).toLowerCase()}${onBehalf.slice(1)}` : ""}
                  </div>
                ) : step.standIns.length > 0 ? (
                  <div style={{ color: C.textSecond }}>Any one of them can act; the first to do so completes the step.</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * What an address will reach once it is the step's person: their stand-ins
 * come with them, and anyone on the step now who is not in the new set loses
 * access. Nothing at all for an address that is not one yet.
 */
export function StandInHint({
  token,
  email,
  currentActors = [],
  intro = "Also goes to",
}: {
  token: string;
  email: string;
  /** Everyone allowed to act on the step today, to say who drops off. */
  currentActors?: string[];
  intro?: string;
}) {
  const [reader] = useState(() => createApprovalDirectoryReader(token));
  const [result, setResult] = useState<{ for: string; standIns: Person[]; name: string } | null>(null);
  const address = email.trim();

  useEffect(() => {
    if (!EMAIL_RE.test(address)) return;
    let cancelled = false;
    void (async () => {
      const row = await reader.lookupPerson(address).catch(() => null);
      const standIns = await Promise.all(standInsOf(row).map((entry) => personFor(reader, entry)));
      if (!cancelled) setResult({ for: address.toLowerCase(), standIns, name: row?.name || address });
    })();
    return () => { cancelled = true; };
  }, [reader, address]);

  if (!EMAIL_RE.test(address) || result?.for !== address.toLowerCase()) return null;

  const kept = new Set([address, ...result.standIns.map((entry) => entry.email)].map((entry) => entry.toLowerCase()));
  const dropped = currentActors.filter((entry) => !kept.has(entry.trim().toLowerCase()));

  return (
    <div style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.5, color: C.textPrimary }}>
      {result.standIns.length > 0 ? (
        <div>
          {intro} <strong>{result.standIns.map((entry) => entry.name || entry.email).join(", ")}</strong>, who can act on {result.name}'s behalf.
        </div>
      ) : (
        <div style={{ color: C.textSecond }}>Nobody acts on {result.name}'s behalf, so only they are asked.</div>
      )}
      {dropped.length > 0 && (
        <div style={{ color: C.textSecond }}>{dropped.join(", ")} will no longer have access to this step.</div>
      )}
    </div>
  );
}

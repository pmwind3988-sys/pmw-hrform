/**
 * DirectoryHarvestPanel.tsx — the form builder's switch for feeding the
 * Approval Directory from this form's evaluations.
 *
 * Off for every form until somebody turns it on here. That is the point: a
 * form nobody has vouched for should not be adding people to the list that
 * decides where appraisals go.
 *
 * Turning it on offers a guess at which questions hold the person's name,
 * staff number and department, and lets the admin correct it. The guess is
 * shown rather than applied silently, because harvesting the evaluator's name
 * instead of the subject's would be invisible until somebody's appraisal went
 * to the wrong desk.
 */
import { useMemo, useState } from "react";
import type { DirectoryHarvestSettings } from "../../types";
import {
  harvestFieldGuesses,
  type HarvestFieldOption,
} from "../../utils/directoryHarvest";
import type { FormProfileRef } from "../../utils/directoryHarvestProfile";

interface Props {
  /** The form's stored settings, or undefined on a form never switched on. */
  settings: DirectoryHarvestSettings | undefined;
  onChange: (next: DirectoryHarvestSettings) => void;
  /** Every question on the form, for the dropdowns. */
  options: HarvestFieldOption[];
  /**
   * The form's live profiles. A submission reads its workflow from the profile
   * it came in on, so the setting has to be written into those rather than
   * waiting for the next publish.
   */
  profiles?: FormProfileRef[];
  /** Writes the setting into the ticked profiles. Absent on an unsaved form. */
  onApplyToProfiles?: (profiles: FormProfileRef[]) => void;
  applying?: boolean;
}

const FIELD_ROWS: Array<{
  key: "nameField" | "employeeIdField" | "departmentField" | "companyField" | "positionField" | "emailField";
  label: string;
  hint: string;
}> = [
  {
    key: "nameField",
    label: "Name",
    hint: "The person the evaluation is about — not the evaluator's name.",
  },
  {
    key: "employeeIdField",
    label: "Employee ID",
    hint: "Their staff number. Leave blank if the form does not ask for one.",
  },
  {
    key: "departmentField",
    label: "Department",
    hint: "Used to guess their superior: the HOD listed for that department.",
  },
  {
    key: "companyField",
    label: "Company",
    hint: "Optional. Left blank, the company they picked on the form is used.",
  },
  {
    key: "positionField",
    label: "Position",
    hint: "Their job title. Worth setting — it is what a “whoever holds a role” layer matches on.",
  },
  {
    key: "emailField",
    label: "Email address",
    hint: "Optional. Left blank, the address they signed in with is used instead.",
  },
];

export default function DirectoryHarvestPanel({
  settings,
  onChange,
  options,
  profiles = [],
  onApplyToProfiles,
  applying = false,
}: Props) {
  const enabled = !!settings?.enabled;

  /**
   * Which live profiles to write the setting into. Nothing is ticked to begin
   * with: this writes to a form staff are submitting right now, so it should
   * be a thing an admin chose, never a default they did not notice.
   */
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  // Off profiles cannot be submitted, so switching harvesting on for one would
  // change nothing and only invite the question of why it is listed.
  const liveProfiles = useMemo(
    () => profiles.filter((profile) => profile.publishStatus === "active"),
    [profiles],
  );

  const toggleProfile = (publishKey: string): void => {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(publishKey)) next.delete(publishKey);
      else next.add(publishKey);
      return next;
    });
  };

  const guess = useMemo(() => harvestFieldGuesses(options), [options]);

  /**
   * Switching on fills the three dropdowns with the guess, so the admin
   * corrects an answer rather than starting from four empty selects. Switching
   * off keeps whatever they chose: turning it back on should not throw their
   * corrections away.
   */
  const setEnabled = (next: boolean): void => {
    if (!next) {
      onChange({ ...(settings ?? {}), enabled: false });
      return;
    }
    const hasMapping = !!(settings?.nameField || settings?.employeeIdField || settings?.departmentField);
    onChange(hasMapping
      ? { ...settings, enabled: true }
      : {
        enabled: true,
        nameField: guess.nameField || undefined,
        employeeIdField: guess.employeeIdField || undefined,
        departmentField: guess.departmentField || undefined,
        companyField: guess.companyField || undefined,
        positionField: guess.positionField || undefined,
        emailField: guess.emailField || undefined,
      });
  };

  type FieldKey = (typeof FIELD_ROWS)[number]["key"];

  const setField = (key: FieldKey, value: string): void => {
    onChange({ ...(settings ?? { enabled: true }), enabled: true, [key]: value || undefined });
  };

  const mapsNothing = enabled
    && !settings?.nameField
    && !settings?.employeeIdField
    && !settings?.departmentField;

  return (
    <>
      <p className="bx-lede" style={{ fontSize: 14, marginBottom: 14 }}>
        When somebody submits this form and is not in the Approval Directory yet, they are added to it
        automatically — name, staff number, department, company and job title read off their answers, and
        their superior guessed from their department's HOD. The new row is marked <strong>unconfirmed</strong> and their submission
        waits for you on the Approvals screen, so nothing routes on a guess until you have checked it on the
        Approval routing page.
      </p>

      <label className="bx-check">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        <span>
          <span style={{ display: "block" }}>Add submitters to the Approval Directory</span>
          <span className="bx-check-hint">
            Existing people are never changed. Nothing is harvested from submissions made before you switch
            this on — use “Scan evaluation submissions” on the Approval routing page for those.
          </span>
        </span>
      </label>

      {enabled && (
        <>
          {FIELD_ROWS.map((row) => (
            <div className="bx-field" key={row.key}>
              <label htmlFor={`harvest-${row.key}`}>{row.label}</label>
              <select
                id={`harvest-${row.key}`}
                className="bx-input"
                style={{ height: 40 }}
                value={settings?.[row.key] ?? ""}
                onChange={(event) => setField(row.key, event.target.value)}
              >
                <option value="">— not on this form —</option>
                {options.map((option) => (
                  <option key={option.name} value={option.name}>
                    {option.title || option.name}
                    {option.name === guess[row.key] ? "  (best guess)" : ""}
                  </option>
                ))}
              </select>
              <div className="bx-meta" style={{ marginTop: 5 }}>{row.hint}</div>
            </div>
          ))}

          {mapsNothing && (
            <div className="bx-meta" style={{ marginTop: 12, color: "var(--bx-warn)" }}>
              None of name, employee ID or department is mapped, so nothing can be harvested. Pick at least
              one of those.
            </div>
          )}

          {onApplyToProfiles && liveProfiles.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--bx-line, #e3e3e3)" }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                Apply to the live form
              </div>
              <p className="bx-meta" style={{ marginBottom: 12 }}>
                A submission reads its workflow from the profile it arrived on, so this setting only takes
                effect once it is written into one. This writes just this setting — the questions, the publish
                status and the expiry of each profile are left exactly as they are, and nothing is republished.
              </p>

              {liveProfiles.map((profile) => (
                <label className="bx-check" key={`${profile.version}|${profile.publishKey}`}>
                  <input
                    type="checkbox"
                    checked={ticked.has(profile.publishKey)}
                    disabled={applying || mapsNothing}
                    onChange={() => toggleProfile(profile.publishKey)}
                  />
                  <span>
                    <span style={{ display: "block" }}>
                      {profile.publishLabel || profile.publishKey}
                      <span className="bx-meta" style={{ marginLeft: 8 }}>v{profile.version}</span>
                    </span>
                    <span className="bx-check-hint">{profile.publishKey}</span>
                  </span>
                </label>
              ))}

              <button
                type="button"
                className="bx-btn bx-btn-secondary"
                style={{ marginTop: 12 }}
                disabled={applying || mapsNothing || ticked.size === 0}
                onClick={() => onApplyToProfiles(
                  liveProfiles.filter((profile) => ticked.has(profile.publishKey)),
                )}
              >
                {applying
                  ? "Applying…"
                  : `Apply to ${ticked.size || "no"} ${ticked.size === 1 ? "profile" : "profiles"}`}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

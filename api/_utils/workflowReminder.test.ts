import { describe, expect, it } from "vitest";

import type { QueueForm } from "./reviewQueue.js";
import { buildWorkflowDigestEmail } from "./workflowDigest.js";
import { followUpMessageFields, recordWorkflowEmailAttempt } from "./workflowEmail.js";
import {
  buildWorkflowReminderEmail,
  calendarDaysBetween,
  recordReminder,
  reminderDueFor,
  reminderScheduleEntry,
} from "./workflowReminder.js";

const HOD = "hod@pmw-group.com";
// 09:30 in Malaysia on Monday 2 November.
const SENT = "2026-11-02T01:30:00.000Z";
/** The daily run, 08:00 in Malaysia, on the given November date. */
const run = (day: number) => new Date(Date.UTC(2026, 10, day, 0, 0, 0));

const form: QueueForm = {
  title: "Training Evaluation",
  slug: "training-evaluation",
  layerConfig: {
    layers: [
      { layerNumber: 1, type: "approval", authMode: "365", title: "Supervisor" },
      { layerNumber: 2, type: "evaluation", authMode: "365", title: "HOD evaluation" },
    ],
  },
};

function log(entry: Record<string, unknown> = {}) {
  return JSON.stringify({ 2: { layer: 2, recipient: HOD, status: "sent", attempts: 1, lastAttemptAt: SENT, sentAt: SENT, ...entry } });
}

function row(fields: Record<string, unknown> = {}) {
  return {
    id: "42",
    fields: {
      CurrentLayer: 2,
      L1_Status: "Approved",
      L1_SignedAt: "2026-11-01T00:00:00.000Z",
      L2_Status: "Pending",
      L2_Email: HOD,
      SubmittedBy: "trainee@pmw-group.com",
      WorkflowEmailLog: log(),
      ...fields,
    },
  };
}

describe("calendarDaysBetween", () => {
  it("counts Malaysian calendar days, not 24-hour periods", () => {
    // 17:00 Monday to 08:00 Thursday is under three full days, but three mornings on.
    expect(calendarDaysBetween(new Date("2026-11-02T09:00:00Z"), run(5))).toBe(3);
    // 07:30 Tuesday in Malaysia is still Monday in UTC.
    expect(calendarDaysBetween(new Date("2026-11-02T23:30:00Z"), run(5))).toBe(2);
  });
});

describe("reminderDueFor", () => {
  it("sends nothing before the third morning", () => {
    expect(reminderDueFor(form, row(), run(4))).toBeNull();
  });

  it("sends the first reminder on day 3, to the step's link and people", () => {
    const due = reminderDueFor(form, row(), run(5));
    expect(due).toMatchObject({ layer: 2, number: 1, daysWaiting: 3, recipients: [HOD], totalLayers: 2 });
    expect(due?.step.link).toBe("/eval/training-evaluation/42/2");
  });

  it("sends the second on day 7 and never a third", () => {
    expect(reminderDueFor(form, row({ WorkflowEmailLog: log({ reminders: 1, lastReminderAt: run(5).toISOString() }) }), run(8))).toBeNull();
    expect(reminderDueFor(form, row({ WorkflowEmailLog: log({ reminders: 1, lastReminderAt: run(5).toISOString() }) }), run(9)))
      .toMatchObject({ number: 2, daysWaiting: 7 });
    expect(reminderDueFor(form, row({ WorkflowEmailLog: log({ reminders: 2 }) }), run(30))).toBeNull();
  });

  it("keeps two days between reminders when the first went out late", () => {
    const late = log({ reminders: 1, lastReminderAt: run(8).toISOString() });
    expect(reminderDueFor(form, row({ WorkflowEmailLog: late }), run(9))).toBeNull();
    expect(reminderDueFor(form, row({ WorkflowEmailLog: late }), run(10))).toMatchObject({ number: 2 });
  });

  it("goes to where the request email went, shared mailbox included", () => {
    const due = reminderDueFor(form, row({ L2_NotifyEmails: "hr.inbox@pmw-group.com" }), run(5));
    expect(due?.recipients).toEqual(["hr.inbox@pmw-group.com"]);
    const several = reminderDueFor(form, row({ L2_Emails: `${HOD}; pa@pmw-group.com` }), run(5));
    expect(several?.recipients).toEqual([HOD, "pa@pmw-group.com"]);
  });

  it("never reminds about a decided, parked, closed or failed step", () => {
    expect(reminderDueFor(form, row({ L2_Status: "Confirmed" }), run(5))).toBeNull();
    expect(reminderDueFor(form, row({ L2_Status: "Needs Routing" }), run(5))).toBeNull();
    expect(reminderDueFor(form, row({ FormStatus: "Rejected" }), run(5))).toBeNull();
    expect(reminderDueFor(form, row({ WorkflowEmailLog: log({ status: "failed" }) }), run(5))).toBeNull();
    expect(reminderDueFor(form, row({ WorkflowEmailLog: "" }), run(5))).toBeNull();
  });

  it("never reminds about an email for a step the submission has moved past", () => {
    expect(reminderDueFor(form, row({ CurrentLayer: 3 }), run(5))).toBeNull();
  });

  it("leaves public steps alone, since a reminder could not carry their key", () => {
    const publicForm: QueueForm = {
      ...form,
      layerConfig: { layers: [form.layerConfig!.layers![0], { layerNumber: 2, type: "evaluation", authMode: "public" }] },
    };
    expect(reminderDueFor(publicForm, row(), run(5))).toBeNull();
  });

  it("ignores requests sent before reminders existed", () => {
    const old = log({ sentAt: "2026-10-01T01:00:00.000Z" });
    expect(reminderDueFor(form, row({ WorkflowEmailLog: old }), run(5))).toBeNull();
  });

  it("judges a test run as a real one, but no real row on a test-only form", () => {
    expect(reminderDueFor(form, row({ IsTest: true, TestEmail: HOD }), run(5))).toMatchObject({ number: 1 });
    expect(reminderDueFor({ ...form, title: "ZZ TEST RUN" }, row(), run(5))).toBeNull();
  });
});

describe("recordReminder", () => {
  it("counts the reminder on the step's entry and keeps the rest", () => {
    const next = recordReminder(log(), 2, run(5));
    expect(next[2]).toMatchObject({ status: "sent", sentAt: SENT, reminders: 1, lastReminderAt: run(5).toISOString() });
    expect(recordReminder(JSON.stringify(next), 2, run(9))[2].reminders).toBe(2);
  });

  it("is reset by a fresh send of the step's email", () => {
    const counted = recordReminder(log(), 2, run(5));
    const resent = recordWorkflowEmailAttempt(JSON.stringify(counted), {
      layer: 2, recipient: HOD, status: "sent", attemptedAt: run(6).toISOString(),
    });
    expect(resent[2].reminders).toBeUndefined();
    expect(resent[2].sentAt).toBe(run(6).toISOString());
  });
});

describe("reminder emails", () => {
  const due = reminderDueFor(form, row({ ApplicantName: "Ali" }), run(5))!;

  it("goes out alone flagged, with the signed-in link", () => {
    const message = buildWorkflowReminderEmail({ due, reviewLink: "https://app/eval/training-evaluation/42/2", submittedBy: "trainee@pmw-group.com" });
    expect(message.subject).toMatch(/^Reminder: Training Evaluation/);
    expect(message.followUp).toBe(true);
    expect(message.body).toContain("https://app/eval/training-evaluation/42/2");
    expect(message.body).toContain("3 days");
  });

  it("joins a daily summary, which says it is a reminder", () => {
    const entry = reminderScheduleEntry(due, "https://app/", "trainee@pmw-group.com", run(5));
    expect(entry.reviewLink).toBe("https://app/eval/training-evaluation/42/2");
    const digest = buildWorkflowDigestEmail({
      recipient: HOD,
      baseUrl: "https://app",
      candidates: [
        { formTitle: form.title, itemId: "42", entry, referenceNo: "", applicantName: "Ali", reminder: { number: 1, daysWaiting: 3 } },
        { formTitle: form.title, itemId: "43", entry: { ...entry, reviewLink: "" }, referenceNo: "", applicantName: "Siti" },
      ],
    });
    expect(digest.subject).toMatch(/^Action Required:/);
    expect(digest.body).toContain("waiting 3 days");
    expect(digest.body).toContain("One of these has");
    expect(digest.followUp).toBe(true);
  });
});

describe("followUpMessageFields", () => {
  it("marks the email high importance and flags it due in three days", () => {
    expect(followUpMessageFields(new Date("2026-11-02T01:30:00.000Z"))).toEqual({
      importance: "high",
      flag: {
        flagStatus: "flagged",
        startDateTime: { dateTime: "2026-11-02T01:30:00.000", timeZone: "UTC" },
        dueDateTime: { dateTime: "2026-11-05T01:30:00.000", timeZone: "UTC" },
      },
    });
  });
});

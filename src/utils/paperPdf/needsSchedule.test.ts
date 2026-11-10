import { describe, expect, it } from "vitest";
import { formatSchedule, isScheduleColumn, malaysiaParts, readSchedule, scheduleColumns, scheduleProblem, scheduleValues } from "./needsSchedule";

const columns = [
  { name: "Employee_ID" },
  { name: "Tentative_Date", title: "Tentative Date" },
  { name: "Tentative_Start", title: "Tentative Start" },
  { name: "Tentative_End", title: "Tentative End" },
  { name: "Tentative_Days", title: "Tentative Days" },
];

describe("Training Needs Analysis schedule", () => {
  it("finds the four schedule columns by name", () => {
    const cols = scheduleColumns(columns);
    expect(cols.firstDay?.name).toBe("Tentative_Date");
    expect(cols.start?.name).toBe("Tentative_Start");
    expect(cols.end?.name).toBe("Tentative_End");
    expect(cols.days?.name).toBe("Tentative_Days");
    expect(isScheduleColumn(columns[2], columns)).toBe(true);
    expect(isScheduleColumn(columns[1], columns)).toBe(false);
  });

  it("stores the date and the days, and no start or end time", () => {
    expect(scheduleValues({ firstDay: "2027-02-27", days: 3 })).toEqual({ firstDay: "2027-02-27", start: "", end: "", days: 3 });
  });

  it("says what a half-filled schedule is missing", () => {
    expect(scheduleProblem({ firstDay: "2027-02-15", days: null, from: "", to: "" })).toBe("Enter how many days.");
    expect(scheduleProblem({ firstDay: "", days: 2, from: "", to: "" })).toBe("Pick the date.");
    expect(scheduleProblem({ firstDay: "2027-02-15", days: 1, from: "", to: "" })).toBe("");
    expect(scheduleProblem({ firstDay: "", days: null, from: "", to: "" })).toBe("");
  });

  it("reads a row filled in without times", () => {
    expect(readSchedule({ Tentative_Date: "2027-02-14T16:00:00Z", Tentative_Days: 3 }, scheduleColumns(columns))).toEqual({ firstDay: "2027-02-15", days: 3, from: "", to: "" });
  });

  it("reads SharePoint's UTC values back as Malaysia time", () => {
    expect(malaysiaParts("2027-02-15T01:00:00Z")).toEqual({ date: "2027-02-15", time: "09:00" });
    expect(malaysiaParts("2027-02-14T16:30:00Z")).toEqual({ date: "2027-02-15", time: "00:30" });
    expect(readSchedule(
      { Tentative_Date: "2027-02-14T16:00:00Z", Tentative_Start: "2027-02-15T01:00:00Z", Tentative_End: "2027-02-17T09:00:00Z", Tentative_Days: 3 },
      scheduleColumns(columns),
    )).toEqual({ firstDay: "2027-02-15", days: 3, from: "09:00", to: "17:00" });
  });

  it("prints the dates and days, with the times only on a row submitted with them", () => {
    expect(formatSchedule({ firstDay: "2027-02-15", days: 3, from: "", to: "" })).toBe("15/02/2027 – 17/02/2027\n3 days");
    expect(formatSchedule({ firstDay: "2027-02-27", days: 3, from: "", to: "" })).toBe("27/02/2027 – 01/03/2027\n3 days");
    expect(formatSchedule({ firstDay: "2027-04-01", days: 1, from: "", to: "" })).toBe("01/04/2027\n1 day");
    expect(formatSchedule({ firstDay: "2027-02-15", days: 3, from: "09:00", to: "17:00" })).toBe("15/02/2027 – 17/02/2027\n3 days · 9:00 AM – 5:00 PM");
    expect(formatSchedule({ firstDay: "2027-04-01", days: 1, from: "08:30", to: "12:30" })).toBe("01/04/2027\n1 day · 8:30 AM – 12:30 PM");
    expect(formatSchedule(readSchedule({ Tentative_Date: "2027-04-01" }, scheduleColumns(columns)))).toBe("01/04/2027");
  });
});

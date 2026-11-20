import { describe, expect, it } from "vitest";
import { parseForm } from "../../native/schema";
import { TRAINING_REQUISITION_SAMPLE } from "../../utils/paperPdf/trainingFormSamples";
import { requisitionQuestions } from "./PaperRequisitionInput";

describe("requisitionQuestions", () => {
  it("places every question of the published Requisition form on its paper-form line", () => {
    const q = requisitionQuestions(parseForm(TRAINING_REQUISITION_SAMPLE.surveyJson));
    expect(q.company?.name).toBe("company");
    expect(q.employeeName?.name).toBe("employeeName");
    expect(q.position?.name).toBe("position");
    expect(q.department?.name).toBe("department");
    expect(q.manager?.name).toBe("reportingManager");
    expect(q.course?.name).toBe("courseName");
    expect(q.objective?.name).toBe("trainingObjective");
    expect(q.provider?.name).toBe("trainingProvider");
    expect(q.venue?.name).toBe("trainingVenue");
    expect(q.start?.name).toBe("startDateTime");
    expect(q.end?.name).toBe("endDateTime");
    expect(q.costs.map((c) => c.element?.name)).toEqual([
      "trainingFee",
      "mileageTransportationFees",
      "mealsAllowanceXDaysOfTraining",
      "accomodation",
      "otherCostTollParking",
    ]);
    expect(q.total?.name).toBe("totalCost");
    expect(q.hrdc?.name).toBe("hRDCClaimable");
    expect(q.signature?.name).toBe("applicantSignature");
    expect(q.others).toEqual([]);
  });
});

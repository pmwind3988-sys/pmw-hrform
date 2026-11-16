import { describe, expect, it } from "vitest";

import { workflowEmailHoldMessage } from "./workflowEmailHoldMessage";

describe("workflowEmailHoldMessage", () => {
  it("names the routing reason and says the step waits for routing", () => {
    expect(workflowEmailHoldMessage({ reason: "No HOD is set for Finance on the Routing page.", checkFailed: false }))
      .toBe("Not sent: No HOD is set for Finance on the Routing page. The step is on hold until routing is set.");
  });

  it("still reads as a sentence when the server gave no reason", () => {
    expect(workflowEmailHoldMessage({ reason: "", checkFailed: false }))
      .toBe("Not sent: routing has no answer for this step. The step is on hold until routing is set.");
  });

  it("says a check that could not run is retried on the next daily run", () => {
    expect(workflowEmailHoldMessage({ reason: "Directory unreadable", checkFailed: true }))
      .toBe("Not sent: the routing check could not run. It will be retried on the next daily run.");
  });
});

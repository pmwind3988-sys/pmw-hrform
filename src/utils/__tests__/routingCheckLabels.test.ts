import { describe, expect, it } from "vitest";

import { isHeldRoutingOutcome, routingCheckOutcomeLabel, routingCheckTriggerLabel } from "../routingCheckLabels";

describe("routingCheckLabels", () => {
  it("words every outcome for an admin", () => {
    expect(routingCheckOutcomeLabel("match")).toBe("Matches routing");
    expect(routingCheckOutcomeLabel("corrected")).toBe("Corrected");
    expect(routingCheckOutcomeLabel("left-alone")).toBe("Set by hand, left alone");
    expect(routingCheckOutcomeLabel("not-checkable")).toBe("Not checked yet");
    expect(routingCheckOutcomeLabel("held-no-routing")).toBe("On hold: routing has no answer");
    expect(routingCheckOutcomeLabel("held-check-failed")).toBe("On hold: could not check, will retry");
  });

  it("words every trigger", () => {
    expect(routingCheckTriggerLabel("submission")).toBe("submission");
    expect(routingCheckTriggerLabel("step-advanced")).toBe("after the previous step");
    expect(routingCheckTriggerLabel("daily-run")).toBe("daily run");
    expect(routingCheckTriggerLabel("reminder")).toBe("reminder");
    expect(routingCheckTriggerLabel("send-selected")).toBe("send selected now");
    expect(routingCheckTriggerLabel("send-now")).toBe("send now");
    expect(routingCheckTriggerLabel("link-reissue")).toBe("new link request");
  });

  it("flags only the two hold outcomes as held", () => {
    expect(isHeldRoutingOutcome("held-no-routing")).toBe(true);
    expect(isHeldRoutingOutcome("held-check-failed")).toBe(true);
    expect(isHeldRoutingOutcome("corrected")).toBe(false);
    expect(isHeldRoutingOutcome("match")).toBe(false);
  });
});

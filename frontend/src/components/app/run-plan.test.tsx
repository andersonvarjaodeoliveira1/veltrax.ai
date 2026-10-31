import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RunPlanCard } from "./run-plan";
import { estimateRun, formatDuration } from "@/lib/run-metrics";

describe("run metrics", () => {
  it("counts images, animations and minutes", () => {
    const plan = estimateRun(3, 4, 2);
    expect(plan.images).toBe(12);
    expect(plan.animations).toBe(24);
    expect(plan.minutes).toBeGreaterThan(1);
  });
  it("formats durations", () => {
    expect(formatDuration(45_000)).toBe("45 s");
    expect(formatDuration(125_000)).toBe("2 min 5 s");
    expect(formatDuration(180_000)).toBe("3 min");
  });
  it("shows the plan and the last run", () => {
    render(<RunPlanCard videos={2} scenes={3} lastRun={{ ms: 90_000, videos: 2 }} />);
    expect(screen.getByText("Imagens").nextSibling?.textContent).toBe("6");
    expect(screen.getByTestId("last-run").textContent).toContain("1 min 30 s");
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TourTooltip } from "./Tooltip";

describe("TourTooltip", () => {
  it("renders label, heading, body, and Next/Skip buttons", () => {
    render(
      <div>
        <div data-tour-target="smoke-target">Target</div>
        <TourTooltip
          targetId="smoke-target"
          label="STEP 01 / 02"
          heading="Test heading"
          body="Test body copy."
          placement="bottom"
          onNext={vi.fn()}
          onSkip={vi.fn()}
          isLastStep={false}
          open={true}
        />
      </div>,
    );

    expect(screen.getByText("STEP 01 / 02")).toBeInTheDocument();
    expect(screen.getByText("Test heading")).toBeInTheDocument();
    expect(screen.getByText("Test body copy.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });

  it("calls onNext when Next is clicked", async () => {
    const onNext = vi.fn();
    render(
      <div>
        <div data-tour-target="smoke-target">Target</div>
        <TourTooltip
          targetId="smoke-target"
          label="STEP 01 / 02"
          heading="Test heading"
          body="Test body copy."
          placement="bottom"
          onNext={onNext}
          onSkip={vi.fn()}
          isLastStep={false}
          open={true}
        />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("shows Done instead of Next on the last step", () => {
    render(
      <div>
        <div data-tour-target="smoke-target">Target</div>
        <TourTooltip
          targetId="smoke-target"
          label="STEP 02 / 02"
          heading="Last"
          body="Final step."
          placement="bottom"
          onNext={vi.fn()}
          onSkip={vi.fn()}
          isLastStep={true}
          open={true}
        />
      </div>,
    );
    expect(screen.getByRole("button", { name: /done/i })).toBeInTheDocument();
  });
});

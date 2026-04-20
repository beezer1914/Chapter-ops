import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";

interface TourTooltipProps {
  targetId: string;
  label: string;
  heading: string;
  body: string;
  placement: "top" | "bottom" | "left" | "right";
  onNext: () => void;
  onSkip: () => void;
  isLastStep: boolean;
  open: boolean;
}

export function TourTooltip({
  targetId,
  label,
  heading,
  body,
  placement,
  onNext,
  onSkip,
  isLastStep,
  open,
}: TourTooltipProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const anchorRef = useRef<HTMLElement>(null as unknown as HTMLElement);

  useEffect(() => {
    if (!open) return;
    const el = document.querySelector<HTMLElement>(
      `[data-tour-target="${targetId}"]`,
    );
    if (el) {
      el.setAttribute("data-tour-active", "true");
      anchorRef.current = el;
      setAnchor(el);
    }
    return () => {
      if (el) el.removeAttribute("data-tour-active");
    };
  }, [targetId, open]);

  if (!open || !anchor) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/35 z-[90]" aria-hidden />
      <Popover.Root open>
        <Popover.Anchor virtualRef={anchorRef} />
        <Popover.Portal>
          <Popover.Content
            side={placement}
            sideOffset={12}
            collisionPadding={16}
            className="z-[100] w-[300px] bg-[var(--color-bg-deep)] border border-[var(--color-border)] border-t-[3px] border-t-[var(--color-text-heading)] p-[18px] shadow-lg outline-none"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted">
              {label}
            </div>
            <h4 className="font-heading font-black tracking-tight text-[20px] text-content-heading mt-1.5 mb-2">
              {heading}
            </h4>
            <p className="text-[13px] leading-relaxed text-content-secondary mb-4">
              {body}
            </p>
            <div className="flex justify-between items-center gap-2">
              <button
                type="button"
                onClick={onSkip}
                className="text-[11px] font-semibold uppercase tracking-[0.1em] text-content-muted hover:text-content-primary px-2 py-1"
              >
                Skip tour
              </button>
              <button
                type="button"
                onClick={onNext}
                className="text-[11px] font-semibold uppercase tracking-[0.1em] bg-[var(--color-text-heading)] text-[var(--color-bg-deep)] hover:opacity-90 px-4 py-2"
              >
                {isLastStep ? "Done" : "Next \u2192"}
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}

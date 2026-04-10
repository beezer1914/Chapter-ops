import { useNavigate } from "react-router-dom";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { CheckCircle, Circle, ArrowRight } from "lucide-react";

const STEPS = [
  {
    label: "Create your chapter",
    description: "Done — your chapter is live.",
    done: true,
    to: null,
    cta: null,
  },
  {
    label: "Configure your billing period",
    description: "Set up your first semester or fiscal year so dues tracking makes sense.",
    done: false,
    to: "/settings",
    cta: "Go to Settings → Chapter",
  },
  {
    label: "Set your dues amounts",
    description: "Add fee types (chapter dues, national/regional dues) with default amounts.",
    done: false,
    to: "/settings",
    cta: "Go to Settings → Chapter",
  },
  {
    label: "Add your chapter branding",
    description: "Upload a logo, set your org colors, and make it yours.",
    done: false,
    to: "/settings",
    cta: "Go to Settings → Branding",
  },
  {
    label: "Connect Stripe to accept online payments",
    description: "Enable card payments so members can pay dues without writing checks.",
    done: false,
    to: "/settings",
    cta: "Go to Settings → Payments",
  },
  {
    label: "Invite your officers and members",
    description: "Send invite codes to your executive board first, then open it to the chapter.",
    done: false,
    to: "/invites",
    cta: "Go to Invites",
  },
];

export default function SuccessStep() {
  const navigate = useNavigate();
  const { selectedOrganization, selectedRegion, reset } = useOnboardingStore();

  function goTo(path: string | null) {
    reset();
    navigate(path ?? "/dashboard");
  }

  return (
    <div className="bg-[var(--color-bg-card-solid)] border border-[var(--color-border)]">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b-2 border-content-heading">
        <p className="text-[10px] font-body font-semibold uppercase tracking-[0.2em] text-content-muted mb-2">
          {selectedOrganization?.name}
          {selectedRegion ? ` · ${selectedRegion.name}` : ""}
        </p>
        <h2 className="font-heading text-3xl font-black text-content-heading leading-tight">
          Your chapter is ready.
        </h2>
        <p className="text-sm text-content-secondary mt-2">
          Here's what to set up first to get your chapter fully operational.
        </p>
      </div>
      <div className="border-t border-[var(--color-border)] mt-[-1px]" />

      {/* Getting started checklist */}
      <div className="divide-y divide-[var(--color-border)]">
        {STEPS.map((step, i) => (
          <div
            key={i}
            className={`flex items-start gap-4 px-8 py-5 ${
              step.to && !step.done ? "hover:bg-[var(--color-bg-card-hover)] cursor-pointer group" : ""
            }`}
            onClick={step.to && !step.done ? () => goTo(step.to) : undefined}
          >
            <div className="shrink-0 mt-0.5">
              {step.done ? (
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              ) : (
                <Circle className="w-5 h-5 text-content-muted" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-semibold leading-snug ${step.done ? "text-content-muted line-through" : "text-content-primary"}`}>
                {step.label}
              </p>
              {!step.done && (
                <p className="text-xs text-content-muted mt-0.5 leading-relaxed">{step.description}</p>
              )}
            </div>
            {step.to && !step.done && (
              <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-brand-primary-dark opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 whitespace-nowrap">
                {step.cta}
                <ArrowRight className="w-3 h-3" />
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Footer CTA */}
      <div className="px-8 py-6 border-t border-[var(--color-border)] flex items-center justify-between gap-4">
        <p className="text-xs text-content-muted">
          You can complete these steps any time from Settings.
        </p>
        <button
          onClick={() => goTo("/dashboard")}
          className="shrink-0 px-5 py-2.5 text-sm font-semibold text-white bg-brand-primary-main hover:bg-brand-primary-dark transition-colors"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

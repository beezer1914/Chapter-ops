import type { Role } from "@/types/tour";

interface WelcomeModalProps {
  role: Role;
  chapterName: string;
  onDismiss: () => void;
}

const ROLE_PITCH: Record<Role, string> = {
  member: "Here's where you'll pay dues, RSVP to events, and stay connected with your chapter.",
  secretary: "You'll manage records, track attendance, and help keep the chapter running smoothly.",
  treasurer: "You're the financial lead \u2014 track dues, approve expenses, and keep the books clean.",
  vice_president:
    "You'll keep officer transitions smooth and support the president across all operations.",
  president:
    "You lead the chapter. This platform brings dues, members, events, and comms into one place so you can focus on leading.",
  admin: "Full platform access. Use the side menu to navigate any org, chapter, or setting.",
};

export function WelcomeModal({ role, chapterName, onDismiss }: WelcomeModalProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
      <div
        role="dialog"
        aria-labelledby="welcome-heading"
        className="bg-[var(--color-bg-deep)] border border-[var(--color-border)] border-t-[3px] border-t-[var(--color-text-heading)] max-w-md w-full mx-4 p-8 shadow-xl"
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-content-muted">
          Welcome to {chapterName}
        </div>
        <h2
          id="welcome-heading"
          className="font-heading font-black tracking-tight text-[32px] text-content-heading leading-tight mt-2 mb-4"
        >
          Let's get you oriented.
        </h2>
        <p className="text-[14px] leading-relaxed text-content-secondary mb-6">{ROLE_PITCH[role]}</p>
        <p className="text-[13px] leading-relaxed text-content-muted mb-6">
          As you visit pages for the first time, short tooltips will point out the important things.
          You can skip them anytime.
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="w-full text-[11px] font-semibold uppercase tracking-[0.1em] bg-[var(--color-text-heading)] text-[var(--color-bg-deep)] hover:opacity-90 px-4 py-3"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

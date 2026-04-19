import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { useAuthStore } from "@/stores/authStore";
import { useConfigStore } from "@/stores/configStore";
import { useTourStore } from "@/stores/tourStore";
import type { Role, TourDefinition } from "@/types/tour";
import { shouldShowTour } from "./shouldShowTour";
import { TOUR_DEFINITIONS } from "./tourDefinitions";
import { TourTooltip } from "./Tooltip";
import { WelcomeModal } from "./WelcomeModal";
import { TourContext, type TourContextValue } from "./useTour";

const ROUTE_DELAY_MS = 500;
const TARGET_ABORT_MS = 2000;

function useCurrentRole(): Role | null {
  const memberships = useAuthStore((s) => s.memberships);
  const user = useAuthStore((s) => s.user);
  const active = memberships.find((m) => m.chapter_id === user?.active_chapter_id && m.active);
  return (active?.role as Role | undefined) ?? null;
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isAuthed = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const role = useCurrentRole();
  const chapter = useConfigStore((s) => s.chapter);
  const chapterName = chapter?.name ?? "ChapterOps";

  const seen = useTourStore((s) => s.seen);
  const loaded = useTourStore((s) => s.loaded);
  const loadSeen = useTourStore((s) => s.loadSeen);
  const markSeen = useTourStore((s) => s.markSeen);
  const reset = useTourStore((s) => s.reset);

  const [activeTour, setActiveTour] = useState<TourDefinition | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);

  const lastEvaluatedRoute = useRef<string | null>(null);

  useEffect(() => {
    if (isAuthed && !loaded) void loadSeen();
  }, [isAuthed, loaded, loadSeen]);

  useEffect(() => {
    if (!isAuthed || !loaded || !role || !user?.active_chapter_id) return;
    if (!seen["welcome"]) setShowWelcome(true);
  }, [isAuthed, loaded, role, seen, user?.active_chapter_id]);

  const dismissWelcome = useCallback(() => {
    if (!role) return;
    setShowWelcome(false);
    void markSeen("welcome", role);
  }, [markSeen, role]);

  useEffect(() => {
    if (!isAuthed || !loaded || !role) return;
    if (showWelcome) return;
    if (lastEvaluatedRoute.current === location.pathname) return;
    lastEvaluatedRoute.current = location.pathname;

    const tour = TOUR_DEFINITIONS.find((t) => {
      if (!new RegExp(t.route).test(location.pathname)) return false;
      if (t.matcher && !t.matcher()) return false;
      return shouldShowTour(t, role, seen);
    });

    if (!tour) {
      setActiveTour(null);
      return;
    }

    const timer = setTimeout(() => {
      const firstStep = tour.steps[0];
      if (!firstStep) return;
      const firstTargetEl = document.querySelector(`[data-tour-target="${firstStep.target}"]`);
      if (!firstTargetEl) {
        void markSeen(tour.id, role);
        return;
      }
      setActiveTour(tour);
      setActiveStepIndex(0);
    }, ROUTE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isAuthed, loaded, role, location.pathname, seen, showWelcome, markSeen]);

  useEffect(() => {
    if (!activeTour) return;
    const target = activeTour.steps[activeStepIndex]?.target;
    if (!target) return;

    const exists = () => !!document.querySelector(`[data-tour-target="${target}"]`);
    if (exists()) return;

    const abort = setTimeout(() => {
      if (!exists() && role) {
        void markSeen(activeTour.id, role);
        setActiveTour(null);
      }
    }, TARGET_ABORT_MS);

    return () => clearTimeout(abort);
  }, [activeTour, activeStepIndex, markSeen, role]);

  const next = useCallback(() => {
    if (!activeTour || !role) return;
    if (activeStepIndex >= activeTour.steps.length - 1) {
      void markSeen(activeTour.id, role);
      setActiveTour(null);
      setActiveStepIndex(0);
    } else {
      setActiveStepIndex((i) => i + 1);
    }
  }, [activeTour, activeStepIndex, markSeen, role]);

  const skip = useCallback(() => {
    if (!activeTour || !role) return;
    void markSeen(activeTour.id, role);
    setActiveTour(null);
    setActiveStepIndex(0);
  }, [activeTour, markSeen, role]);

  const replay = useCallback(async () => {
    await reset();
    lastEvaluatedRoute.current = null;
    setShowWelcome(true);
  }, [reset]);

  const value: TourContextValue = useMemo(
    () => ({ activeTour, activeStepIndex, next, skip, replay }),
    [activeTour, activeStepIndex, next, skip, replay],
  );

  const currentStep = activeTour?.steps[activeStepIndex];
  const isLastStep = activeTour ? activeStepIndex === activeTour.steps.length - 1 : false;

  return (
    <TourContext.Provider value={value}>
      {children}
      {showWelcome && role && (
        <WelcomeModal role={role} chapterName={chapterName} onDismiss={dismissWelcome} />
      )}
      {activeTour && currentStep && (
        <TourTooltip
          key={`${activeTour.id}-${activeStepIndex}`}
          targetId={currentStep.target}
          label={currentStep.label}
          heading={currentStep.heading}
          body={currentStep.body}
          placement={currentStep.placement ?? "bottom"}
          onNext={next}
          onSkip={skip}
          isLastStep={isLastStep}
          open
        />
      )}
    </TourContext.Provider>
  );
}

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
const TARGET_POLL_MS = 100;

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
  const [domTick, setDomTick] = useState(0);

  const lastEvaluatedKey = useRef<string | null>(null);

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
    lastEvaluatedKey.current = null;
    void markSeen("welcome", role);
  }, [markSeen, role]);

  useEffect(() => {
    if (!isAuthed || !loaded) return;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as Element;
          if (el.matches?.("[data-tour-target]") || el.querySelector?.("[data-tour-target]")) {
            setDomTick((t) => t + 1);
            return;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isAuthed, loaded]);

  useEffect(() => {
    if (!isAuthed || !loaded || !role) return;
    if (showWelcome || !seen["welcome"]) return;
    if (activeTour) return;
    const key = `${location.pathname}:${domTick}`;
    if (lastEvaluatedKey.current === key) return;
    lastEvaluatedKey.current = key;

    const tour = TOUR_DEFINITIONS.find((t) => {
      if (!new RegExp(t.route).test(location.pathname)) return false;
      if (t.matcher && !t.matcher()) return false;
      return shouldShowTour(t, role, seen);
    });

    if (!tour) {
      setActiveTour(null);
      return;
    }

    const firstStep = tour.steps[0];
    if (!firstStep) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startTimer = setTimeout(() => {
      const deadline = Date.now() + TARGET_ABORT_MS;
      const selector = `[data-tour-target="${firstStep.target}"]`;
      const tryStart = () => {
        if (document.querySelector(selector)) {
          if (intervalId) clearInterval(intervalId);
          setActiveTour(tour);
          setActiveStepIndex(0);
        } else if (Date.now() >= deadline) {
          if (intervalId) clearInterval(intervalId);
          void markSeen(tour.id, role);
        }
      };
      tryStart();
      intervalId = setInterval(tryStart, TARGET_POLL_MS);
    }, ROUTE_DELAY_MS);

    return () => {
      clearTimeout(startTimer);
      if (intervalId) clearInterval(intervalId);
    };
  }, [isAuthed, loaded, role, location.pathname, seen, showWelcome, markSeen, domTick, activeTour]);

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
    lastEvaluatedKey.current = null;
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

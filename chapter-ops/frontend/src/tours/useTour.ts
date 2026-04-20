import { createContext, useContext } from "react";
import type { TourDefinition } from "@/types/tour";

export interface TourContextValue {
  activeTour: TourDefinition | null;
  activeStepIndex: number;
  next: () => void;
  skip: () => void;
  replay: () => Promise<void>;
}

export const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

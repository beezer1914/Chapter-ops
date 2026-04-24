import { create } from "zustand";
import type {
  WorkflowTemplateWithStats,
  WorkflowTemplateDetail,
  WorkflowInstance,
  WorkflowInstanceDetail,
} from "@/types";
import {
  fetchTemplates,
  fetchTemplateDetail,
  fetchInstances,
  fetchInstanceDetail,
} from "@/services/workflowService";

interface WorkflowState {
  templates: WorkflowTemplateWithStats[];
  selectedTemplate: WorkflowTemplateDetail | null;
  instances: WorkflowInstance[];
  selectedInstance: WorkflowInstanceDetail | null;
  loading: boolean;
  error: string | null;

  loadTemplates: () => Promise<void>;
  loadTemplateDetail: (templateId: string) => Promise<void>;
  loadInstances: () => Promise<void>;
  loadInstanceDetail: (instanceId: string) => Promise<void>;
  clearSelected: () => void;
  clearError: () => void;
  reset: () => void;
}

const INITIAL_STATE = {
  templates: [],
  selectedTemplate: null,
  instances: [],
  selectedInstance: null,
  loading: false,
  error: null,
};

export const useWorkflowStore = create<WorkflowState>((set) => ({
  ...INITIAL_STATE,

  loadTemplates: async () => {
    set({ loading: true, error: null });
    try {
      const templates = await fetchTemplates();
      set({ templates, loading: false });
    } catch {
      set({ error: "Failed to load workflow templates.", loading: false });
    }
  },

  loadTemplateDetail: async (templateId) => {
    set({ loading: true, error: null });
    try {
      const template = await fetchTemplateDetail(templateId);
      set({ selectedTemplate: template, loading: false });
    } catch {
      set({ error: "Failed to load template details.", loading: false });
    }
  },

  loadInstances: async () => {
    set({ loading: true, error: null });
    try {
      const instances = await fetchInstances();
      set({ instances, loading: false });
    } catch {
      set({ error: "Failed to load workflow instances.", loading: false });
    }
  },

  loadInstanceDetail: async (instanceId) => {
    set({ loading: true, error: null });
    try {
      const instance = await fetchInstanceDetail(instanceId);
      set({ selectedInstance: instance, loading: false });
    } catch {
      set({ error: "Failed to load instance details.", loading: false });
    }
  },

  clearSelected: () => set({ selectedTemplate: null, selectedInstance: null }),
  clearError: () => set({ error: null }),
  reset: () => set(INITIAL_STATE),
}));

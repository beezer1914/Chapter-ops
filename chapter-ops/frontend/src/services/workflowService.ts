import api from "@/lib/api";
import type {
  WorkflowTemplateWithStats,
  WorkflowTemplateDetail,
  WorkflowInstance,
  WorkflowInstanceDetail,
  WorkflowStep,
  CreateWorkflowTemplateRequest,
  UpdateWorkflowTemplateRequest,
  AddWorkflowStepRequest,
  UpdateWorkflowStepRequest,
  ReorderStepsRequest,
  StartWorkflowRequest,
  StepActionRequest,
} from "@/types";

// ── Templates ─────────────────────────────────────────────────────────────────

export async function fetchTemplates(): Promise<WorkflowTemplateWithStats[]> {
  const res = await api.get("/workflows/templates");
  return res.data.templates;
}

export async function fetchTemplateDetail(
  id: string,
): Promise<WorkflowTemplateDetail> {
  const res = await api.get(`/workflows/templates/${id}`);
  return res.data.template;
}

export async function createTemplate(
  data: CreateWorkflowTemplateRequest,
): Promise<WorkflowTemplateDetail> {
  const res = await api.post("/workflows/templates", data);
  return res.data.template;
}

export async function updateTemplate(
  id: string,
  data: UpdateWorkflowTemplateRequest,
): Promise<WorkflowTemplateDetail> {
  const res = await api.put(`/workflows/templates/${id}`, data);
  return res.data.template;
}

export async function deleteTemplate(id: string): Promise<void> {
  await api.delete(`/workflows/templates/${id}`);
}

// ── Steps ─────────────────────────────────────────────────────────────────────

export async function addStep(
  templateId: string,
  data: AddWorkflowStepRequest,
): Promise<WorkflowStep> {
  const res = await api.post(`/workflows/templates/${templateId}/steps`, data);
  return res.data.step;
}

export async function updateStep(
  templateId: string,
  stepId: string,
  data: UpdateWorkflowStepRequest,
): Promise<WorkflowStep> {
  const res = await api.put(
    `/workflows/templates/${templateId}/steps/${stepId}`,
    data,
  );
  return res.data.step;
}

export async function deleteStep(
  templateId: string,
  stepId: string,
): Promise<void> {
  await api.delete(`/workflows/templates/${templateId}/steps/${stepId}`);
}

export async function reorderSteps(
  templateId: string,
  data: ReorderStepsRequest,
): Promise<WorkflowStep[]> {
  const res = await api.patch(
    `/workflows/templates/${templateId}/steps/reorder`,
    data,
  );
  return res.data.steps;
}

// ── My Tasks ──────────────────────────────────────────────────────────────────

export interface WorkflowTask {
  id: string;
  instance_id: string;
  step_id: string;
  status: string;
  assigned_to_role: string | null;
  assigned_to_user_id: string | null;
  trigger_title: string;
  trigger_type: string;
  created_at: string;
  step: { name: string; description: string | null } | null;
}

export async function fetchMyWorkflowTasks(): Promise<WorkflowTask[]> {
  const res = await api.get("/workflows/my-tasks");
  return res.data.tasks;
}

// ── Instances ─────────────────────────────────────────────────────────────────

export async function fetchInstances(): Promise<WorkflowInstance[]> {
  const res = await api.get("/workflows/instances");
  return res.data.instances;
}

export async function fetchInstanceDetail(
  id: string,
): Promise<WorkflowInstanceDetail> {
  const res = await api.get(`/workflows/instances/${id}`);
  return res.data.instance;
}

export async function startWorkflow(
  data: StartWorkflowRequest,
): Promise<WorkflowInstance> {
  const res = await api.post("/workflows/instances", data);
  return res.data.instance;
}

export async function submitStepAction(
  instanceId: string,
  stepInstanceId: string,
  data: StepActionRequest,
): Promise<WorkflowInstanceDetail> {
  const res = await api.post(
    `/workflows/instances/${instanceId}/steps/${stepInstanceId}/action`,
    data,
  );
  return res.data.instance;
}

export async function cancelInstance(
  instanceId: string,
): Promise<WorkflowInstance> {
  const res = await api.post(`/workflows/instances/${instanceId}/cancel`);
  return res.data.instance;
}

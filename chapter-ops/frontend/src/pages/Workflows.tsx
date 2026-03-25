import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { useWorkflowStore } from "@/stores/workflowStore";
import { useAuthStore } from "@/stores/authStore";
import type {
  WorkflowTemplateWithStats,
  WorkflowTemplateDetail,
  WorkflowStep,
  WorkflowInstance,
  WorkflowInstanceDetail,
  WorkflowStepInstance,
  WorkflowStatus,
  WorkflowStepStatus,
  WorkflowTriggerType,
  WorkflowApproverType,
  MemberRole,
} from "@/types";
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  addStep,
  updateStep,
  deleteStep,
  reorderSteps,
  startWorkflow,
  submitStepAction,
  cancelInstance,
} from "@/services/workflowService";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<WorkflowStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const STEP_STATUS_COLORS: Record<WorkflowStepStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  waiting: "bg-gray-100 text-gray-500",
  in_progress: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  skipped: "bg-yellow-50 text-yellow-600",
};

const TRIGGER_LABELS: Record<WorkflowTriggerType, string> = {
  document: "Document",
  expense: "Expense Request",
  event: "Event Proposal",
  member_application: "Member Application",
};

const ROLE_HIERARCHY: Record<string, number> = {
  member: 0,
  secretary: 1,
  treasurer: 2,
  vice_president: 3,
  president: 4,
  admin: 5,
  regional_director: 6,
  regional_1st_vice: 7,
};

function hasRole(userRole: string, requiredRole: string): boolean {
  return (ROLE_HIERARCHY[userRole] ?? -1) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Workflows() {
  const {
    templates,
    selectedTemplate,
    instances,
    selectedInstance,
    loading,
    error,
    loadTemplates,
    loadTemplateDetail,
    loadInstances,
    loadInstanceDetail,
    clearSelected,
    clearError,
  } = useWorkflowStore();

  const { user, memberships } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"templates" | "activity">(
    "templates",
  );
  const [showCreateModal, setShowCreateModal] = useState(false);

  const activeChapterId = user?.active_chapter_id;
  const currentMembership = memberships.find(
    (m) => m.chapter_id === activeChapterId,
  );
  const currentRole = currentMembership?.role ?? "member";
  const canManageTemplates = hasRole(currentRole, "treasurer");

  // Auto-open an instance when ?instance=<id> is present (e.g. from Events page)
  const instanceParam = searchParams.get("instance");
  useEffect(() => {
    if (instanceParam) {
      setActiveTab("activity");
      loadInstanceDetail(instanceParam);
      setSearchParams({}, { replace: true });
    }
  }, [instanceParam, loadInstanceDetail, setSearchParams]);

  useEffect(() => {
    if (activeTab === "templates") {
      loadTemplates();
    } else {
      loadInstances();
    }
  }, [activeTab, loadTemplates, loadInstances]);

  function handleTabSwitch(tab: "templates" | "activity") {
    clearSelected();
    setActiveTab(tab);
  }

  // ── Detail views ───────────────────────────────────────────────────────────

  if (selectedTemplate) {
    return (
      <TemplateBuilderView
        template={selectedTemplate}
        canManage={canManageTemplates}
        onBack={() => {
          clearSelected();
          loadTemplates();
        }}
        onRefresh={() => loadTemplateDetail(selectedTemplate.id)}
      />
    );
  }

  if (selectedInstance) {
    return (
      <InstanceDetailView
        instance={selectedInstance}
        currentRole={currentRole}
        currentUserId={user?.id ?? ""}
        onBack={() => {
          clearSelected();
          loadInstances();
        }}
        onRefresh={() => loadInstanceDetail(selectedInstance.id)}
      />
    );
  }

  // ── List views ─────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          {activeTab === "templates" && canManageTemplates && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-brand-primary text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-primary-dark transition"
            >
              + New Template
            </button>
          )}
          {activeTab === "activity" && (
            <StartWorkflowButton
              templates={templates.filter((t) => t.is_active)}
              onStarted={() => loadInstances()}
            />
          )}
        </div>

        {/* Tab bar */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-6">
            {(["templates", "activity"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabSwitch(tab)}
                className={`pb-3 text-sm font-medium border-b-2 transition capitalize ${
                  activeTab === tab
                    ? "border-brand-primary text-brand-primary"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab === "activity" ? "Activity" : "Templates"}
              </button>
            ))}
          </nav>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start justify-between">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={clearError}
              className="text-red-400 hover:text-red-600 ml-4 text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <p className="text-sm text-gray-500">Loading...</p>
        )}

        {/* Templates tab */}
        {!loading && activeTab === "templates" && (
          <>
            {templates.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg font-medium mb-1">No workflow templates yet</p>
                {canManageTemplates && (
                  <p className="text-sm">
                    Create a template to start automating your approval processes.
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((t) => (
                  <WorkflowTemplateCard
                    key={t.id}
                    template={t}
                    onClick={() => loadTemplateDetail(t.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Activity tab */}
        {!loading && activeTab === "activity" && (
          <>
            {instances.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg font-medium mb-1">No workflow activity</p>
                <p className="text-sm">Start a workflow to begin an approval process.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {instances.map((inst) => (
                  <WorkflowInstanceCard
                    key={inst.id}
                    instance={inst}
                    onClick={() => loadInstanceDetail(inst.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Template Modal */}
      {showCreateModal && (
        <CreateTemplateModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => {
            setShowCreateModal(false);
            loadTemplateDetail(id);
          }}
        />
      )}
    </Layout>
  );
}

// ── List cards ────────────────────────────────────────────────────────────────

function WorkflowTemplateCard({
  template,
  onClick,
}: {
  template: WorkflowTemplateWithStats;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-lg shadow p-5 text-left hover:shadow-md border border-gray-200 transition w-full"
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-gray-900 truncate pr-2">{template.name}</h3>
        <span
          className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
            template.is_active
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {template.is_active ? "Active" : "Inactive"}
        </span>
      </div>
      <p className="text-xs text-gray-500 capitalize mb-1">
        Trigger: {TRIGGER_LABELS[template.trigger_type]}
      </p>
      {template.chapter_id === null && (
        <p className="text-xs text-brand-primary font-medium mb-1">Org-wide</p>
      )}
      {template.description && (
        <p className="text-xs text-gray-500 mb-2 line-clamp-2">
          {template.description}
        </p>
      )}
      <div className="mt-2 text-sm text-gray-600">
        {template.step_count} step{template.step_count !== 1 ? "s" : ""} &bull;{" "}
        {template.active_instance_count} active
      </div>
    </button>
  );
}

function WorkflowInstanceCard({
  instance,
  onClick,
}: {
  instance: WorkflowInstance;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-lg shadow px-5 py-4 text-left hover:shadow-md border border-gray-200 transition w-full flex items-center justify-between"
    >
      <div>
        <p className="text-sm font-medium text-gray-900 capitalize">
          {TRIGGER_LABELS[instance.trigger_type]} — {instance.trigger_title || instance.trigger_id}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          Started {new Date(instance.created_at).toLocaleDateString()}
        </p>
      </div>
      <span
        className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[instance.status]}`}
      >
        {instance.status.replace("_", " ")}
      </span>
    </button>
  );
}

// ── Template Builder View ─────────────────────────────────────────────────────

function TemplateBuilderView({
  template,
  canManage,
  onBack,
  onRefresh,
}: {
  template: WorkflowTemplateDetail;
  canManage: boolean;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [showAddStep, setShowAddStep] = useState(false);
  const [editingStep, setEditingStep] = useState<WorkflowStep | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline editing state
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [triggerType, setTriggerType] = useState(template.trigger_type);
  const [isActive, setIsActive] = useState(template.is_active);

  async function handleSaveHeader() {
    setSaving(true);
    setError(null);
    try {
      await updateTemplate(template.id, {
        name,
        description: description || undefined,
        trigger_type: triggerType,
        is_active: isActive,
      });
      setEditMode(false);
      onRefresh();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? "Failed to save template.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    setSaving(true);
    setError(null);
    try {
      await deleteTemplate(template.id);
      onBack();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? "Failed to deactivate template.",
      );
      setSaving(false);
    }
  }

  async function handleMoveStep(stepId: string, direction: "up" | "down") {
    const steps = [...template.steps].sort((a, b) => a.step_order - b.step_order);
    const idx = steps.findIndex((s) => s.id === stepId);
    if (idx === -1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= steps.length) return;

    const swapStepOrder = steps[swapIdx]!.step_order;
    const idxStepOrder = steps[idx]!.step_order;
    const newSteps = steps.map((s, i) => {
      if (i === idx) return { id: s.id, step_order: swapStepOrder };
      if (i === swapIdx) return { id: s.id, step_order: idxStepOrder };
      return { id: s.id, step_order: s.step_order };
    });

    try {
      await reorderSteps(template.id, { steps: newSteps });
      onRefresh();
    } catch {
      setError("Failed to reorder steps.");
    }
  }

  async function handleDeleteStep(stepId: string) {
    try {
      await deleteStep(template.id, stepId);
      onRefresh();
    } catch {
      setError("Failed to delete step.");
    }
  }

  const sortedSteps = [...template.steps].sort(
    (a, b) => a.step_order - b.step_order,
  );

  return (
    <Layout>
      <div className="space-y-6">
        {/* Back + header */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            ← Back
          </button>
          <span className="text-gray-300">|</span>
          <h1 className="text-xl font-bold text-gray-900">{template.name}</h1>
          {template.chapter_id === null && (
            <span className="text-xs bg-brand-primary-light text-brand-primary-dark px-2 py-0.5 rounded-full">
              Org-wide
            </span>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start justify-between">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 ml-4 text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Template info section */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">
              Template Details
            </h2>
            {canManage && !editMode && (
              <button
                onClick={() => setEditMode(true)}
                className="text-sm text-brand-primary hover:text-brand-primary-dark"
              >
                Edit
              </button>
            )}
          </div>

          {editMode ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Trigger Type
                </label>
                <select
                  value={triggerType}
                  onChange={(e) =>
                    setTriggerType(e.target.value as WorkflowTriggerType)
                  }
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="document">Document</option>
                  <option value="expense">Expense Request</option>
                  <option value="event">Event Proposal</option>
                  <option value="member_application">Member Application</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">
                  Active
                </label>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSaveHeader}
                  disabled={saving}
                  className="bg-brand-primary text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-primary-dark disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-gray-500">Trigger</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {TRIGGER_LABELS[template.trigger_type]}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Status</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {template.is_active ? "Active" : "Inactive"}
                </dd>
              </div>
              {template.description && (
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500">Description</dt>
                  <dd className="text-sm text-gray-700">{template.description}</dd>
                </div>
              )}
            </dl>
          )}

          {canManage && !editMode && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={handleDeactivate}
                disabled={saving}
                className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                Deactivate template
              </button>
            </div>
          )}
        </div>

        {/* Steps section */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">
              Steps ({template.step_count})
            </h2>
            {canManage && (
              <button
                onClick={() => setShowAddStep(true)}
                className="text-sm text-brand-primary hover:text-brand-primary-dark font-medium"
              >
                + Add Step
              </button>
            )}
          </div>

          {sortedSteps.length === 0 ? (
            <p className="text-sm text-gray-500">
              No steps yet. Add a step to define who needs to approve.
            </p>
          ) : (
            <div className="space-y-3">
              {sortedSteps.map((step, idx) => (
                <StepCard
                  key={step.id}
                  step={step}
                  isFirst={idx === 0}
                  isLast={idx === sortedSteps.length - 1}
                  canManage={canManage}
                  onMoveUp={() => handleMoveStep(step.id, "up")}
                  onMoveDown={() => handleMoveStep(step.id, "down")}
                  onEdit={() => setEditingStep(step)}
                  onDelete={() => handleDeleteStep(step.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Step Modal */}
      {(showAddStep || editingStep) && (
        <StepModal
          templateId={template.id}
          existingStep={editingStep}
          nextOrder={sortedSteps.length + 1}
          onClose={() => {
            setShowAddStep(false);
            setEditingStep(null);
          }}
          onSaved={() => {
            setShowAddStep(false);
            setEditingStep(null);
            onRefresh();
          }}
        />
      )}
    </Layout>
  );
}

// ── Step card ─────────────────────────────────────────────────────────────────

function StepCard({
  step,
  isFirst,
  isLast,
  canManage,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: {
  step: WorkflowStep;
  isFirst: boolean;
  isLast: boolean;
  canManage: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg bg-gray-50">
      {/* Order number */}
      <div className="shrink-0 w-7 h-7 rounded-full bg-brand-primary-light text-brand-primary-dark text-xs font-bold flex items-center justify-center mt-0.5">
        {step.step_order}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{step.name}</p>
        {step.description && (
          <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
        )}
        <div className="flex flex-wrap gap-2 mt-2">
          {/* Approver badge */}
          {step.approver_type === "role" && step.approver_role && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {step.approver_role}
            </span>
          )}
          {step.approver_type === "specific_user" && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              Specific user
            </span>
          )}
          {/* Parallel group badge */}
          {step.parallel_group && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              Parallel: {step.parallel_group}
            </span>
          )}
          {/* Condition badge */}
          {step.condition_json && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              Conditional
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {canManage && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
            title="Move up"
          >
            ▲
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
            title="Move down"
          >
            ▼
          </button>
          <button
            onClick={onEdit}
            className="text-xs text-brand-primary hover:text-brand-primary-dark px-2"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="text-xs text-red-500 hover:text-red-700 px-2"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Instance Detail View ──────────────────────────────────────────────────────

function InstanceDetailView({
  instance,
  currentRole,
  currentUserId,
  onBack,
  onRefresh,
}: {
  instance: WorkflowInstanceDetail;
  currentRole: string;
  currentUserId: string;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setCancelling(true);
    setError(null);
    try {
      await cancelInstance(instance.id);
      onBack();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? "Failed to cancel workflow.",
      );
      setCancelling(false);
    }
  }

  const canCancel =
    hasRole(currentRole, "treasurer") &&
    (instance.status === "in_progress" || instance.status === "pending");

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back
          </button>
          <span className="text-gray-300">|</span>
          <h1 className="text-xl font-bold text-gray-900">Workflow Instance</h1>
          <span
            className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[instance.status]}`}
          >
            {instance.status.replace("_", " ")}
          </span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start justify-between">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 ml-4 text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Trigger info */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">
            Trigger Information
          </h2>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-gray-500">Type</dt>
              <dd className="text-sm font-medium text-gray-900">
                {TRIGGER_LABELS[instance.trigger_type]}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Subject</dt>
              <dd className="text-sm text-gray-700 truncate">
                {instance.trigger_title || instance.trigger_id}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Template</dt>
              <dd className="text-sm text-gray-900">{instance.template.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Started</dt>
              <dd className="text-sm text-gray-700">
                {new Date(instance.created_at).toLocaleString()}
              </dd>
            </div>
            {instance.completed_at && (
              <div>
                <dt className="text-xs text-gray-500">Completed</dt>
                <dd className="text-sm text-gray-700">
                  {new Date(instance.completed_at).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>

          {canCancel && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Cancel workflow"}
              </button>
            </div>
          )}
        </div>

        {/* Step timeline */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">
            Approval Steps
          </h2>
          <div className="space-y-4">
            {instance.step_instances.map((si) => (
              <StepInstanceRow
                key={si.id}
                stepInstance={si}
                instanceId={instance.id}
                currentRole={currentRole}
                currentUserId={currentUserId}
                onActionTaken={onRefresh}
              />
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ── Step instance row ─────────────────────────────────────────────────────────

function StepInstanceRow({
  stepInstance,
  instanceId,
  currentRole,
  currentUserId,
  onActionTaken,
}: {
  stepInstance: WorkflowStepInstance;
  instanceId: string;
  currentRole: string;
  currentUserId: string;
  onActionTaken: () => void;
}) {
  const [comments, setComments] = useState("");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);

  const step = stepInstance.step;
  const isSkipped = stepInstance.status === "skipped";
  const isInProgress = stepInstance.status === "in_progress";

  // Can the current user act on this step?
  const canAct = isInProgress && (() => {
    if (stepInstance.assigned_to_user_id) {
      return stepInstance.assigned_to_user_id === currentUserId;
    }
    if (stepInstance.assigned_to_role) {
      return currentRole === stepInstance.assigned_to_role;
    }
    return false;
  })();

  async function handleAction(action: "approve" | "reject") {
    setActing(true);
    setError(null);
    try {
      await submitStepAction(instanceId, stepInstance.id, {
        action,
        comments: comments.trim() || undefined,
      });
      onActionTaken();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? "Action failed.",
      );
      setActing(false);
    }
  }

  return (
    <div
      className={`border rounded-lg p-4 ${
        isSkipped ? "opacity-50 border-dashed border-gray-300 bg-gray-50" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900">
              {step?.name ?? `Step ${stepInstance.step_id.slice(0, 8)}`}
            </p>
            {stepInstance.assigned_to_role && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                {stepInstance.assigned_to_role}
              </span>
            )}
            {stepInstance.step?.parallel_group && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                Parallel: {stepInstance.step.parallel_group}
              </span>
            )}
          </div>

          {isSkipped && (
            <p className="text-xs text-gray-400 italic mt-1">
              Skipped (condition not met)
            </p>
          )}

          {stepInstance.comments && (
            <div
              className={`mt-2 p-2 rounded text-xs ${
                stepInstance.status === "rejected"
                  ? "bg-red-50 text-red-700"
                  : "bg-gray-50 text-gray-600"
              }`}
            >
              <span className="font-medium">Note: </span>
              {stepInstance.comments}
            </div>
          )}

          {stepInstance.action_taken_at && (
            <p className="text-xs text-gray-400 mt-1">
              {new Date(stepInstance.action_taken_at).toLocaleString()}
            </p>
          )}
        </div>

        <span
          className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${STEP_STATUS_COLORS[stepInstance.status]}`}
        >
          {stepInstance.status.replace("_", " ")}
        </span>
      </div>

      {/* Action buttons */}
      {canAct && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

          {showComments && (
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Optional comments..."
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
            />
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleAction("approve")}
              disabled={acting}
              className="bg-green-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {acting ? "..." : "Approve"}
            </button>
            <button
              onClick={() => handleAction("reject")}
              disabled={acting}
              className="bg-red-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {acting ? "..." : "Reject"}
            </button>
            <button
              onClick={() => setShowComments((v) => !v)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              {showComments ? "Hide comments" : "Add comment"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modals ────────────────────────────────────────────────────────────────────

function CreateTemplateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (templateId: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>("document");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const template = await createTemplate({
        name: name.trim(),
        description: description.trim() || undefined,
        trigger_type: triggerType,
      });
      onCreated(template.id);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? "Failed to create template.",
      );
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          New Workflow Template
        </h2>

        {error && (
          <p className="text-sm text-red-600 mb-3">{error}</p>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Document Review Process"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Trigger Type
            </label>
            <select
              value={triggerType}
              onChange={(e) =>
                setTriggerType(e.target.value as WorkflowTriggerType)
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="document">Document</option>
              <option value="expense">Expense Request (coming soon)</option>
              <option value="event">Event Proposal</option>
              <option value="member_application">Member Application</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleCreate}
            disabled={saving}
            className="bg-brand-primary text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-primary-dark disabled:opacity-50 flex-1"
          >
            {saving ? "Creating..." : "Create Template"}
          </button>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function StepModal({
  templateId,
  existingStep,
  nextOrder,
  onClose,
  onSaved,
}: {
  templateId: string;
  existingStep: WorkflowStep | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = existingStep !== null;

  const [stepName, setStepName] = useState(existingStep?.name ?? "");
  const [stepDesc, setStepDesc] = useState(existingStep?.description ?? "");
  const [approverType, setApproverType] = useState<WorkflowApproverType>(
    existingStep?.approver_type ?? "role",
  );
  const [approverRole, setApproverRole] = useState<MemberRole>(
    (existingStep?.approver_role as MemberRole) ?? "treasurer",
  );
  const [parallelGroup, setParallelGroup] = useState(
    existingStep?.parallel_group ?? "",
  );
  const [condField, setCondField] = useState(
    existingStep?.condition_json?.field ?? "",
  );
  const [condOp, setCondOp] = useState(
    existingStep?.condition_json?.operator ?? ">",
  );
  const [condValue, setCondValue] = useState(
    String(existingStep?.condition_json?.value ?? ""),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!stepName.trim()) {
      setError("Step name is required.");
      return;
    }

    // Build condition only if all three fields are filled
    const condition_json =
      condField.trim() && condOp && condValue.trim()
        ? {
            field: condField.trim(),
            operator: condOp as WorkflowCondition["operator"],
            value: isNaN(Number(condValue)) ? condValue : Number(condValue),
          }
        : null;

    const payload = {
      name: stepName.trim(),
      description: stepDesc.trim() || undefined,
      approver_type: approverType,
      approver_role: approverType === "role" ? approverRole : null,
      parallel_group: parallelGroup.trim() || null,
      condition_json,
    };

    setSaving(true);
    setError(null);
    try {
      if (isEditing && existingStep) {
        await updateStep(templateId, existingStep.id, payload);
      } else {
        await addStep(templateId, {
          ...payload,
          step_order: nextOrder,
        });
      }
      onSaved();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? "Failed to save step.",
      );
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4 max-h-screen overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {isEditing ? "Edit Step" : "Add Step"}
        </h2>

        {error && (
          <p className="text-sm text-red-600 mb-3">{error}</p>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Step Name *
            </label>
            <input
              value={stepName}
              onChange={(e) => setStepName(e.target.value)}
              placeholder="e.g. Treasurer Approval"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Description
            </label>
            <input
              value={stepDesc}
              onChange={(e) => setStepDesc(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Approver Type
            </label>
            <select
              value={approverType}
              onChange={(e) =>
                setApproverType(e.target.value as WorkflowApproverType)
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="role">By Role</option>
              <option value="specific_user">Specific User</option>
            </select>
          </div>

          {approverType === "role" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Required Role
              </label>
              <select
                value={approverRole}
                onChange={(e) => setApproverRole(e.target.value as MemberRole)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="member">Member</option>
                <option value="secretary">Secretary</option>
                <option value="treasurer">Treasurer</option>
                <option value="vice_president">Vice President</option>
                <option value="president">President</option>
                <optgroup label="Regional Officers">
                  <option value="regional_director">Regional Director</option>
                  <option value="regional_1st_vice">Regional 1st Vice</option>
                </optgroup>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Parallel Group{" "}
              <span className="text-gray-400 font-normal">
                (optional — steps sharing a group run simultaneously)
              </span>
            </label>
            <input
              value={parallelGroup}
              onChange={(e) => setParallelGroup(e.target.value)}
              placeholder="e.g. group-a"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Condition builder */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Condition{" "}
              <span className="text-gray-400 font-normal">
                (optional — skip this step when condition is false)
              </span>
            </label>
            <div className="flex gap-2">
              <input
                value={condField}
                onChange={(e) => setCondField(e.target.value)}
                placeholder="field"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <select
                value={condOp}
                onChange={(e) => setCondOp(e.target.value as WorkflowCondition["operator"])}
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
              >
                {[">", "<", ">=", "<=", "==", "!="].map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              <input
                value={condValue}
                onChange={(e) => setCondValue(e.target.value)}
                placeholder="value"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Leave all three blank for no condition.
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-brand-primary text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-primary-dark disabled:opacity-50 flex-1"
          >
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Add Step"}
          </button>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function StartWorkflowButton({
  templates,
  onStarted,
}: {
  templates: WorkflowTemplateWithStats[];
  onStarted: () => void;
}) {
  const [showModal, setShowModal] = useState(false);

  if (templates.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="bg-brand-primary text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-primary-dark transition"
      >
        Start Workflow
      </button>
      {showModal && (
        <StartWorkflowModal
          templates={templates}
          onClose={() => setShowModal(false)}
          onStarted={() => {
            setShowModal(false);
            onStarted();
          }}
        />
      )}
    </>
  );
}

function StartWorkflowModal({
  templates,
  onClose,
  onStarted,
}: {
  templates: WorkflowTemplateWithStats[];
  onClose: () => void;
  onStarted: () => void;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [triggerId, setTriggerId] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  async function handleStart() {
    if (!triggerId.trim()) {
      setError("Trigger ID is required.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      await startWorkflow({
        template_id: templateId,
        trigger_type: selectedTemplate?.trigger_type ?? "document",
        trigger_id: triggerId.trim(),
      });
      onStarted();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } }).response?.data
          ?.error ?? "Failed to start workflow.",
      );
      setStarting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Start Workflow
        </h2>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Workflow Template
            </label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({TRIGGER_LABELS[t.trigger_type]})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Trigger ID
            </label>
            <input
              value={triggerId}
              onChange={(e) => setTriggerId(e.target.value)}
              placeholder="ID of the document or item being reviewed"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              In Phase 2 this will be a document picker. For now, paste the
              item's ID.
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleStart}
            disabled={starting}
            className="bg-brand-primary text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-primary-dark disabled:opacity-50 flex-1"
          >
            {starting ? "Starting..." : "Start"}
          </button>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Type import needed inside StepModal
type WorkflowCondition = import("@/types").WorkflowCondition;

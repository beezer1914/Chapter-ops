import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useOnboardingStore } from "@/stores/onboardingStore";
import type { Region } from "@/types";

const createRegionSchema = z.object({
  name: z.string().min(1, "Region name is required"),
  abbreviation: z.string().max(10, "Max 10 characters").optional(),
  description: z.string().max(500, "Max 500 characters").optional(),
});

type CreateRegionFormData = z.infer<typeof createRegionSchema>;

export default function RegionStep() {
  const {
    selectedOrganization,
    regions,
    isLoading,
    error,
    setStep,
    loadRegions,
    selectRegion,
    submitNewRegion,
    clearError,
  } = useOnboardingStore();

  const [mode, setMode] = useState<"select" | "create">("select");
  const [search, setSearch] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors: formErrors },
  } = useForm<CreateRegionFormData>({
    resolver: zodResolver(createRegionSchema),
    defaultValues: {
      name: "",
      abbreviation: "",
      description: "",
    },
  });

  useEffect(() => {
    if (selectedOrganization) {
      loadRegions(selectedOrganization.id);
    }
  }, [selectedOrganization, loadRegions]);

  const filteredRegions = regions.filter((region) => {
    const q = search.toLowerCase();
    return (
      region.name.toLowerCase().includes(q) ||
      (region.abbreviation && region.abbreviation.toLowerCase().includes(q))
    );
  });

  const handleSelectRegion = (region: Region) => {
    selectRegion(region);
  };

  const onCreateSubmit = async (data: CreateRegionFormData) => {
    if (!selectedOrganization) return;
    clearError();
    try {
      await submitNewRegion({
        organization_id: selectedOrganization.id,
        name: data.name,
        abbreviation: data.abbreviation || undefined,
        description: data.description || undefined,
      });
    } catch {
      // Error handled by store
    }
  };

  return (
    <div className="bg-surface-card-solid rounded-lg shadow-glass p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Select Your Region</h2>
      <p className="text-sm text-content-muted mb-6">
        Choose the region your chapter belongs to, or create a new one.
      </p>

      {/* Selected org banner */}
      <div className="mb-6 p-3 bg-white/5 border border-[var(--color-border)] rounded-md flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">{selectedOrganization?.name}</p>
          <p className="text-xs text-content-muted">{selectedOrganization?.abbreviation}</p>
        </div>
        <button
          type="button"
          onClick={() => setStep(1)}
          className="text-sm text-primary-600 hover:underline font-medium"
        >
          Change
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Mode tabs */}
      <div className="flex border-b border-[var(--color-border)] mb-6">
        <button
          type="button"
          onClick={() => { setMode("select"); clearError(); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            mode === "select"
              ? "border-primary-600 text-primary-600"
              : "border-transparent text-content-muted hover:text-content-secondary"
          }`}
        >
          Select Existing
        </button>
        <button
          type="button"
          onClick={() => { setMode("create"); clearError(); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            mode === "create"
              ? "border-primary-600 text-primary-600"
              : "border-transparent text-content-muted hover:text-content-secondary"
          }`}
        >
          Create New
        </button>
      </div>

      {mode === "select" ? (
        <div>
          <input
            type="text"
            placeholder="Search regions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-4 block w-full rounded-md border border-[var(--color-border)] bg-surface-input px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />

          {isLoading ? (
            <p className="text-content-muted text-sm py-8 text-center">Loading regions...</p>
          ) : filteredRegions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-content-muted text-sm">
                {search ? "No regions match your search." : "No regions yet for this organization."}
              </p>
              <button
                type="button"
                onClick={() => setMode("create")}
                className="mt-2 text-sm text-primary-600 hover:underline font-medium"
              >
                Create a new region
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredRegions.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => handleSelectRegion(region)}
                  className="w-full text-left p-4 rounded-md border border-[var(--color-border)] hover:border-primary-500 hover:bg-white/5 transition"
                >
                  <div>
                    <p className="font-medium text-gray-900">{region.name}</p>
                    {region.description && (
                      <p className="text-sm text-content-muted mt-1">{region.description}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full bg-surface-card-solid text-content-secondary py-2 px-4 rounded-md border border-[var(--color-border)] hover:bg-white/5 transition"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-4">
          <div>
            <label htmlFor="region_name" className="block text-sm font-medium text-content-secondary">
              Region Name
            </label>
            <input
              id="region_name"
              type="text"
              placeholder="e.g., Southern Region"
              {...register("name")}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-surface-input px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {formErrors.name && (
              <p className="mt-1 text-xs text-red-600">{formErrors.name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="abbreviation" className="block text-sm font-medium text-content-secondary">
              Abbreviation <span className="text-content-muted font-normal">(optional)</span>
            </label>
            <input
              id="abbreviation"
              type="text"
              placeholder="e.g., SR"
              {...register("abbreviation")}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-surface-input px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {formErrors.abbreviation && (
              <p className="mt-1 text-xs text-red-600">{formErrors.abbreviation.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-content-secondary">
              Description <span className="text-content-muted font-normal">(optional)</span>
            </label>
            <textarea
              id="description"
              rows={3}
              placeholder="Brief description of this region..."
              {...register("description")}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-surface-input px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {formErrors.description && (
              <p className="mt-1 text-xs text-red-600">{formErrors.description.message}</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 bg-surface-card-solid text-content-secondary py-2 px-4 rounded-md border border-[var(--color-border)] hover:bg-white/5 transition"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Creating..." : "Create Region"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

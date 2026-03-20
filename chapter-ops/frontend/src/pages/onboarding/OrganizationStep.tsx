import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useOnboardingStore } from "@/stores/onboardingStore";
import type { Organization } from "@/types";

const createOrgSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
  abbreviation: z.string().min(1, "Abbreviation is required").max(10, "Max 10 characters"),
  org_type: z.enum(["fraternity", "sorority"], {
    required_error: "Please select fraternity or sorority",
  }),
  greek_letters: z.string().optional(),
  council: z.string().optional(),
  founded_year: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === "") return undefined;
      return val;
    })
    .pipe(
      z
        .string()
        .regex(/^\d{4}$/, "Must be a 4-digit year")
        .optional()
    ),
  motto: z.string().optional(),
  website: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === "") return undefined;
      return val;
    })
    .pipe(z.string().url("Must be a valid URL").optional()),
});

type CreateOrgFormData = z.infer<typeof createOrgSchema>;

const councils = ["NPHC", "NPC", "IFC", "Multicultural", "Independent", "Other"];

export default function OrganizationStep() {
  const { organizations, isLoading, error, loadOrganizations, selectOrganization, submitNewOrganization, clearError } =
    useOnboardingStore();
  const [mode, setMode] = useState<"select" | "create">("select");
  const [search, setSearch] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors: formErrors },
  } = useForm<CreateOrgFormData>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: {
      name: "",
      abbreviation: "",
      org_type: undefined,
      greek_letters: "",
      council: "",
      founded_year: "",
      motto: "",
      website: "",
    },
  });

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  const filteredOrgs = organizations.filter((org) => {
    const q = search.toLowerCase();
    return (
      org.name.toLowerCase().includes(q) ||
      org.abbreviation.toLowerCase().includes(q) ||
      (org.greek_letters && org.greek_letters.toLowerCase().includes(q))
    );
  });

  const handleSelectOrg = (org: Organization) => {
    selectOrganization(org);
  };

  const onCreateSubmit = async (data: CreateOrgFormData) => {
    clearError();
    try {
      await submitNewOrganization({
        name: data.name,
        abbreviation: data.abbreviation,
        org_type: data.org_type,
        greek_letters: data.greek_letters || undefined,
        council: data.council || undefined,
        founded_year: data.founded_year ? parseInt(data.founded_year) : undefined,
        motto: data.motto || undefined,
        website: data.website || undefined,
      });
    } catch {
      // Error handled by store
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Select Your Organization</h2>
      <p className="text-sm text-gray-500 mb-6">
        Choose your Greek letter organization or create a new one.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Mode tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          type="button"
          onClick={() => { setMode("select"); clearError(); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            mode === "select"
              ? "border-primary-600 text-primary-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
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
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Create New
        </button>
      </div>

      {mode === "select" ? (
        <div>
          <input
            type="text"
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-4 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />

          {isLoading ? (
            <p className="text-gray-500 text-sm py-8 text-center">Loading organizations...</p>
          ) : filteredOrgs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">
                {search ? "No organizations match your search." : "No organizations yet."}
              </p>
              <button
                type="button"
                onClick={() => setMode("create")}
                className="mt-2 text-sm text-primary-600 hover:underline font-medium"
              >
                Create a new organization
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredOrgs.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => handleSelectOrg(org)}
                  className="w-full text-left p-4 rounded-md border border-gray-200 hover:border-primary-500 hover:bg-primary-50 transition"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{org.name}</p>
                      <p className="text-sm text-gray-500">
                        {org.abbreviation}
                        {org.greek_letters && ` \u2022 ${org.greek_letters}`}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        org.org_type === "fraternity"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-purple-100 text-purple-700"
                      }`}
                    >
                      {org.org_type === "fraternity" ? "Fraternity" : "Sorority"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-4">
          <div>
            <label htmlFor="org_name" className="block text-sm font-medium text-gray-700">
              Organization Name
            </label>
            <input
              id="org_name"
              type="text"
              placeholder="e.g., Alpha Beta Gamma Fraternity, Inc."
              {...register("name")}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {formErrors.name && (
              <p className="mt-1 text-xs text-red-600">{formErrors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="abbreviation" className="block text-sm font-medium text-gray-700">
                Abbreviation
              </label>
              <input
                id="abbreviation"
                type="text"
                placeholder="e.g., ABG"
                {...register("abbreviation")}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              {formErrors.abbreviation && (
                <p className="mt-1 text-xs text-red-600">{formErrors.abbreviation.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="greek_letters" className="block text-sm font-medium text-gray-700">
                Greek Letters <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="greek_letters"
                type="text"
                placeholder="e.g., \u0391\u0392\u0393"
                {...register("greek_letters")}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="fraternity"
                  {...register("org_type")}
                  className="text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Fraternity</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="sorority"
                  {...register("org_type")}
                  className="text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Sorority</span>
              </label>
            </div>
            {formErrors.org_type && (
              <p className="mt-1 text-xs text-red-600">{formErrors.org_type.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="council" className="block text-sm font-medium text-gray-700">
                Council <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                id="council"
                {...register("council")}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">Select council</option>
                {councils.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="founded_year" className="block text-sm font-medium text-gray-700">
                Founded Year <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="founded_year"
                type="text"
                placeholder="e.g., 1920"
                {...register("founded_year")}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              {formErrors.founded_year && (
                <p className="mt-1 text-xs text-red-600">{formErrors.founded_year.message}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="motto" className="block text-sm font-medium text-gray-700">
              Motto <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="motto"
              type="text"
              {...register("motto")}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label htmlFor="website" className="block text-sm font-medium text-gray-700">
              Website <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="website"
              type="text"
              placeholder="https://..."
              {...register("website")}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {formErrors.website && (
              <p className="mt-1 text-xs text-red-600">{formErrors.website.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Creating..." : "Create Organization"}
          </button>
        </form>
      )}
    </div>
  );
}

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useOnboardingStore } from "@/stores/onboardingStore";

const chapterSchema = z.object({
  name: z.string().min(1, "Chapter name is required"),
  chapter_type: z.enum(["undergraduate", "graduate"], {
    required_error: "Please select a chapter type",
  }),
  designation: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().default("United States"),
  timezone: z.string().default("America/New_York"),
});

type ChapterFormData = z.infer<typeof chapterSchema>;

const usStates = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming", "District of Columbia",
];

const timezones = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

const timezoneLabels: Record<string, string> = {
  "America/New_York": "Eastern",
  "America/Chicago": "Central",
  "America/Denver": "Mountain",
  "America/Los_Angeles": "Pacific",
  "America/Anchorage": "Alaska",
  "Pacific/Honolulu": "Hawaii",
};

export default function ChapterStep() {
  const { selectedOrganization, selectedRegion, isLoading, error, setStep, submitChapter, clearError } =
    useOnboardingStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChapterFormData>({
    resolver: zodResolver(chapterSchema),
    defaultValues: {
      name: "",
      chapter_type: undefined,
      designation: "",
      city: "",
      state: "",
      country: "United States",
      timezone: "America/New_York",
    },
  });

  const onSubmit = async (data: ChapterFormData) => {
    if (!selectedOrganization || !selectedRegion) return;
    clearError();
    try {
      await submitChapter({
        organization_id: selectedOrganization.id,
        region_id: selectedRegion.id,
        name: data.name,
        chapter_type: data.chapter_type,
        designation: data.designation || undefined,
        city: data.city || undefined,
        state: data.state || undefined,
        country: data.country,
        timezone: data.timezone,
      });
    } catch {
      // Error handled by store
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Create Your Chapter</h2>
      <p className="text-sm text-gray-500 mb-6">
        Set up your chapter under {selectedOrganization?.name}.
      </p>

      {/* Selected org + region banner */}
      <div className="mb-6 p-3 bg-gray-50 border border-gray-200 rounded-md flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">{selectedOrganization?.name}</p>
          <p className="text-xs text-gray-500">
            {selectedOrganization?.abbreviation} &middot; {selectedRegion?.name}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStep(2)}
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="chapter_name" className="block text-sm font-medium text-gray-700">
              Chapter Name
            </label>
            <input
              id="chapter_name"
              type="text"
              placeholder="e.g., Alpha Gamma Chapter"
              {...register("name")}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="designation" className="block text-sm font-medium text-gray-700">
              Designation <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="designation"
              type="text"
              placeholder="e.g., AG"
              {...register("designation")}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Chapter Type</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="undergraduate"
                {...register("chapter_type")}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Undergraduate</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="graduate"
                {...register("chapter_type")}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Graduate</span>
            </label>
          </div>
          {errors.chapter_type && (
            <p className="mt-1 text-xs text-red-600">{errors.chapter_type.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-gray-700">
              City <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="city"
              type="text"
              {...register("city")}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label htmlFor="state" className="block text-sm font-medium text-gray-700">
              State <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              id="state"
              {...register("state")}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">Select state</option>
              {usStates.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="country" className="block text-sm font-medium text-gray-700">
              Country
            </label>
            <input
              id="country"
              type="text"
              {...register("country")}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-gray-700">
              Timezone
            </label>
            <select
              id="timezone"
              {...register("timezone")}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {timezoneLabels[tz]} ({tz})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => setStep(2)}
            className="flex-1 bg-white text-gray-700 py-2 px-4 rounded-md border border-gray-300 hover:bg-gray-50 transition"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Creating..." : "Create Chapter"}
          </button>
        </div>
      </form>
    </div>
  );
}

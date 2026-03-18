import { useNavigate } from "react-router-dom";
import { useOnboardingStore } from "@/stores/onboardingStore";

export default function SuccessStep() {
  const navigate = useNavigate();
  const { selectedOrganization, selectedRegion, reset } = useOnboardingStore();

  const handleGoToDashboard = () => {
    reset();
    navigate("/dashboard");
  };

  return (
    <div className="bg-white rounded-lg shadow p-8 text-center">
      <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
        <svg
          className="w-8 h-8 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-gray-900 mb-2">You're all set!</h2>
      <p className="text-gray-600 mb-8 max-w-sm mx-auto">
        Your chapter has been created under {selectedOrganization?.name} in the {selectedRegion?.name}. As chapter president, you
        can now invite members and manage your chapter.
      </p>

      <button
        onClick={handleGoToDashboard}
        className="bg-primary-600 text-white py-2 px-6 rounded-md hover:bg-primary-700 transition"
      >
        Go to Dashboard
      </button>
    </div>
  );
}

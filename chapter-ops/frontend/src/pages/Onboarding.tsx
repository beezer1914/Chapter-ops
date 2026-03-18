import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useOnboardingStore } from "@/stores/onboardingStore";
import OrganizationStep from "@/pages/onboarding/OrganizationStep";
import RegionStep from "@/pages/onboarding/RegionStep";
import ChapterStep from "@/pages/onboarding/ChapterStep";
import SuccessStep from "@/pages/onboarding/SuccessStep";

const steps = ["Organization", "Region", "Chapter", "Complete"];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center">
      {steps.map((label, index) => {
        const stepNum = index + 1;
        const isCompleted = currentStep > stepNum;
        const isCurrent = currentStep === stepNum;

        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition ${
                  isCompleted
                    ? "bg-primary-600 text-white"
                    : isCurrent
                      ? "border-2 border-primary-600 text-primary-600"
                      : "border-2 border-gray-300 text-gray-400"
                }`}
              >
                {isCompleted ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              <span
                className={`mt-1 text-xs font-medium ${
                  isCurrent ? "text-primary-600" : isCompleted ? "text-gray-700" : "text-gray-400"
                }`}
              >
                {label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-16 h-0.5 mx-2 mb-5 ${
                  currentStep > stepNum ? "bg-primary-600" : "bg-gray-300"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Onboarding() {
  const { currentStep } = useOnboardingStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // If user already has a chapter, redirect to dashboard
  useEffect(() => {
    if (user?.active_chapter_id && currentStep !== 4) {
      navigate("/dashboard", { replace: true });
    }
  }, [user?.active_chapter_id, currentStep, navigate]);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">ChapterOps</h1>
          <span className="text-sm text-gray-500">{user?.full_name}</span>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 pt-8 pb-4">
        <StepIndicator currentStep={currentStep} />
      </div>

      <div className="max-w-xl mx-auto px-4 pb-12">
        {currentStep === 1 && <OrganizationStep />}
        {currentStep === 2 && <RegionStep />}
        {currentStep === 3 && <ChapterStep />}
        {currentStep === 4 && <SuccessStep />}
      </div>
    </div>
  );
}

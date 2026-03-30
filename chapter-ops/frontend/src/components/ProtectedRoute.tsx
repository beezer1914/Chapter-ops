import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireChapter?: boolean;
}

export default function ProtectedRoute({ children, requireChapter = true }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-content-muted">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireChapter && !user?.active_chapter_id) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

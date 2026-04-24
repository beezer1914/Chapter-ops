import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useModuleAccess } from "@/lib/permissions";
import type { ModuleKey } from "@/types";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireChapter?: boolean;
  module?: ModuleKey;
  requirePlatformAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireChapter = true, module, requirePlatformAdmin }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, isPlatformAdmin, user } = useAuthStore();
  const canAccess = useModuleAccess();

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

  if (module && !canAccess(module)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requirePlatformAdmin && !isPlatformAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

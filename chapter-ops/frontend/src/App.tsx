import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { refreshCsrfToken } from "@/lib/api";
import ProtectedRoute from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Members from "@/pages/Members";
import Invites from "@/pages/Invites";
import Payments from "@/pages/Payments";
import Donations from "@/pages/Donations";
import Regions from "@/pages/Regions";
import RegionDashboard from "@/pages/RegionDashboard";
import Workflows from "@/pages/Workflows";
import Settings from "@/pages/Settings";
import Events from "@/pages/Events";
import Communications from "@/pages/Communications";
import Documents from "@/pages/Documents";
import KnowledgeBase from "@/pages/KnowledgeBase";
import EventPublic from "@/pages/EventPublic";
import Invoices from "@/pages/Invoices";
import Intake from "@/pages/Intake";
import Expenses from "@/pages/Expenses";
import Lineage from "@/pages/Lineage";
import Landing from "@/pages/Landing";
import LegalPage from "@/pages/LegalPage";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import StripeCallback from "@/pages/StripeCallback";
import IHQDashboard from "@/pages/IHQDashboard";
import MyDues from "@/pages/MyDues";
import TreasurerDues from "@/pages/TreasurerDues";
import Analytics from "@/pages/Analytics";
import Incidents from "@/pages/Incidents";

export default function App() {
  const { initializeAuth, isLoading } = useAuthStore();

  useEffect(() => {
    // Fetch CSRF token first, then initialize auth state.
    // The token is stored in api.ts and injected on all non-GET requests.
    refreshCsrfToken().catch(() => {
      // Non-fatal — if the backend is unreachable the rest of the app will
      // surface the error naturally.
    });
    initializeAuth();
  }, [initializeAuth]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-deep">
        <div className="text-content-muted text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/legal/:doc" element={<LegalPage />} />

        {/* Protected: requires auth but NOT a chapter */}
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute requireChapter={false}>
              <Onboarding />
            </ProtectedRoute>
          }
        />

        {/* Protected: requires auth AND a chapter */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/members"
          element={
            <ProtectedRoute module="members">
              <Members />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invites"
          element={
            <ProtectedRoute module="invites">
              <Invites />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dues"
          element={
            <ProtectedRoute>
              <MyDues />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chapter-dues"
          element={
            <ProtectedRoute module="payments">
              <TreasurerDues />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <Analytics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payments"
          element={
            <ProtectedRoute module="payments">
              <Payments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/donations"
          element={
            <ProtectedRoute module="donations">
              <Donations />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices"
          element={
            <ProtectedRoute module="invoices">
              <Invoices />
            </ProtectedRoute>
          }
        />
        <Route
          path="/regions"
          element={
            <ProtectedRoute requireChapter={false} module="regions">
              <Regions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/region-dashboard"
          element={
            <ProtectedRoute requireChapter={false}>
              <RegionDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workflows"
          element={
            <ProtectedRoute module="workflows">
              <Workflows />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />

        <Route
          path="/events"
          element={
            <ProtectedRoute module="events">
              <Events />
            </ProtectedRoute>
          }
        />

        <Route
          path="/communications"
          element={
            <ProtectedRoute module="communications">
              <Communications />
            </ProtectedRoute>
          }
        />

        <Route
          path="/documents"
          element={
            <ProtectedRoute module="documents">
              <Documents />
            </ProtectedRoute>
          }
        />

        <Route
          path="/knowledge-base"
          element={
            <ProtectedRoute module="knowledge_base">
              <KnowledgeBase />
            </ProtectedRoute>
          }
        />

        <Route
          path="/intake"
          element={
            <ProtectedRoute module="intake">
              <Intake />
            </ProtectedRoute>
          }
        />

        <Route
          path="/expenses"
          element={
            <ProtectedRoute module="expenses">
              <Expenses />
            </ProtectedRoute>
          }
        />

        <Route
          path="/lineage"
          element={
            <ProtectedRoute module="lineage">
              <Lineage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/ihq"
          element={
            <ProtectedRoute requireChapter={false}>
              <IHQDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/incidents"
          element={
            <ProtectedRoute requireChapter={false}>
              <Incidents />
            </ProtectedRoute>
          }
        />

        {/* Public event page — no auth required */}
        <Route path="/e/:slug" element={<EventPublic />} />

        {/* Stripe Connect OAuth callback — no chapter context required */}
        <Route path="/stripe/callback" element={<StripeCallback />} />

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

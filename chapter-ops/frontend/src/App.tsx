import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
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
import Landing from "@/pages/Landing";
import StripeCallback from "@/pages/StripeCallback";

export default function App() {
  const { initializeAuth, isLoading } = useAuthStore();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-gray-500 text-lg">Loading...</div>
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
            <ProtectedRoute>
              <Members />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invites"
          element={
            <ProtectedRoute>
              <Invites />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payments"
          element={
            <ProtectedRoute>
              <Payments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/donations"
          element={
            <ProtectedRoute>
              <Donations />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices"
          element={
            <ProtectedRoute>
              <Invoices />
            </ProtectedRoute>
          }
        />
        <Route
          path="/regions"
          element={
            <ProtectedRoute requireChapter={false}>
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
            <ProtectedRoute>
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
            <ProtectedRoute>
              <Events />
            </ProtectedRoute>
          }
        />

        <Route
          path="/communications"
          element={
            <ProtectedRoute>
              <Communications />
            </ProtectedRoute>
          }
        />

        <Route
          path="/documents"
          element={
            <ProtectedRoute>
              <Documents />
            </ProtectedRoute>
          }
        />

        <Route
          path="/knowledge-base"
          element={
            <ProtectedRoute>
              <KnowledgeBase />
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

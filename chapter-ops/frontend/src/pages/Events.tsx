import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { useAuthStore } from "@/stores/authStore";
import {
  fetchEvents,
  createEvent,
  updateEvent,
  cancelEvent,
  fetchEventAttendees,
  rsvpToEvent,
  cancelRsvp,
  toggleCheckIn,
  createEventCheckout,
} from "@/services/eventService";
import type {
  ChapterEvent,
  EventAttendance,
  CreateEventRequest,
  EventType,
  RsvpStatus,
  MemberRole,
} from "@/types";
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  Plus,
  X,
  ExternalLink,
  CheckCircle,
  Circle,
  ChevronLeft,
  Copy,
  Check,
} from "lucide-react";

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  member: 0, secretary: 1, treasurer: 2, vice_president: 3, president: 4, admin: 5,
};

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  social: "Social",
  fundraiser: "Fundraiser",
  community_service: "Community Service",
};

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  social: "bg-purple-100 text-purple-700",
  fundraiser: "bg-green-100 text-green-700",
  community_service: "bg-blue-100 text-blue-700",
};

const RSVP_LABELS: Record<RsvpStatus, string> = {
  going: "Going",
  not_going: "Not Going",
  maybe: "Maybe",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Tab = "upcoming" | "past" | "my_rsvps";

export default function Events() {
  const { memberships, user } = useAuthStore();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [events, setEvents] = useState<ChapterEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stripeToast, setStripeToast] = useState<"success" | "cancelled" | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detail/check-in view
  const [selectedEvent, setSelectedEvent] = useState<ChapterEvent | null>(null);
  const [attendees, setAttendees] = useState<EventAttendance[]>([]);
  const [attendeesLoading, setAttendeesLoading] = useState(false);

  // Create/edit form
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ChapterEvent | null>(null);
  const [formData, setFormData] = useState<Partial<CreateEventRequest>>({
    event_type: "social",
    is_paid: false,
    is_public: false,
    status: "published",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Copy slug feedback
  const [copiedSlug, setCopiedSlug] = useState(false);

  const currentMembership = memberships.find((m) => m.chapter_id === user?.active_chapter_id);
  const currentRole = currentMembership?.role ?? "member";
  const isOfficer = ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY["secretary"];

  // ── Stripe toast handling ────────────────────────────────────────────────────
  useEffect(() => {
    if (searchParams.get("stripe_success") === "1") {
      setStripeToast("success");
      searchParams.delete("stripe_success");
      setSearchParams(searchParams, { replace: true });
    } else if (searchParams.get("stripe_cancelled") === "1") {
      setStripeToast("cancelled");
      searchParams.delete("stripe_cancelled");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  useEffect(() => {
    if (stripeToast) {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setStripeToast(null), 5000);
    }
  }, [stripeToast]);

  // ── Load events ──────────────────────────────────────────────────────────────
  async function loadEvents(past = false) {
    setLoading(true);
    try {
      const data = await fetchEvents({ past });
      setEvents(data);
    } catch {
      setError("Failed to load events.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents(tab === "past");
  }, [tab, user?.active_chapter_id]);

  // ── Attendees ────────────────────────────────────────────────────────────────
  async function openEventDetail(event: ChapterEvent) {
    setSelectedEvent(event);
    if (isOfficer) {
      setAttendeesLoading(true);
      try {
        const data = await fetchEventAttendees(event.id);
        setAttendees(data);
      } catch {
        setAttendees([]);
      } finally {
        setAttendeesLoading(false);
      }
    }
  }

  async function handleToggleCheckIn(eventId: string, attendanceId: string) {
    try {
      const updated = await toggleCheckIn(eventId, attendanceId);
      setAttendees((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a))
      );
    } catch {
      // ignore
    }
  }

  // ── RSVP ─────────────────────────────────────────────────────────────────────
  async function handleRsvp(event: ChapterEvent, status: RsvpStatus) {
    if (event.is_paid) {
      try {
        const { checkout_url } = await createEventCheckout(event.id);
        window.location.href = checkout_url;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to start checkout.";
        setError(msg);
      }
      return;
    }
    try {
      const attendance = await rsvpToEvent(event.id, status);
      const updater = (e: ChapterEvent) =>
        e.id === event.id
          ? {
              ...e,
              my_attendance: attendance,
              attendee_count:
                (e.attendee_count ?? 0) +
                (status === "going" && !e.my_attendance ? 1 : 0),
            }
          : e;
      setEvents((prev) => prev.map(updater));
      setSelectedEvent((prev) => (prev?.id === event.id ? updater(prev) : prev));
    } catch {
      setError("Failed to update RSVP.");
    }
  }

  async function handleCancelRsvp(event: ChapterEvent) {
    try {
      await cancelRsvp(event.id);
      const updater = (e: ChapterEvent) =>
        e.id === event.id
          ? { ...e, my_attendance: null, attendee_count: Math.max(0, (e.attendee_count ?? 1) - 1) }
          : e;
      setEvents((prev) => prev.map(updater));
      setSelectedEvent((prev) => (prev?.id === event.id ? updater(prev) : prev));
    } catch {
      setError("Failed to cancel RSVP.");
    }
  }

  // ── Create / Edit ────────────────────────────────────────────────────────────
  function openCreateForm() {
    setEditingEvent(null);
    setFormData({ event_type: "social", is_paid: false, is_public: false, status: "published" });
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(event: ChapterEvent) {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description ?? "",
      event_type: event.event_type,
      start_datetime: event.start_datetime.slice(0, 16),
      end_datetime: event.end_datetime?.slice(0, 16) ?? "",
      location: event.location ?? "",
      capacity: event.capacity ?? undefined,
      is_paid: event.is_paid,
      ticket_price: event.ticket_price ? parseFloat(event.ticket_price) : undefined,
      is_public: event.is_public,
      status: event.status,
      service_hours: event.service_hours ? parseFloat(event.service_hours) : undefined,
    });
    setFormError(null);
    setShowForm(true);
  }

  async function handleSaveEvent() {
    if (!formData.title?.trim() || !formData.event_type || !formData.start_datetime) {
      setFormError("Title, type, and start date are required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload: CreateEventRequest = {
        title: formData.title.trim(),
        description: formData.description?.trim() || undefined,
        event_type: formData.event_type as EventType,
        start_datetime: new Date(formData.start_datetime).toISOString(),
        end_datetime: formData.end_datetime
          ? new Date(formData.end_datetime).toISOString()
          : undefined,
        location: formData.location?.trim() || undefined,
        capacity: formData.capacity || undefined,
        is_paid: formData.is_paid,
        ticket_price: formData.is_paid ? formData.ticket_price : undefined,
        is_public: formData.is_public,
        status: formData.status,
        service_hours:
          formData.event_type === "community_service" ? formData.service_hours : undefined,
      };

      if (editingEvent) {
        const updated = await updateEvent(editingEvent.id, payload);
        setEvents((prev) => prev.map((e) => (e.id === updated.id ? { ...updated, attendee_count: e.attendee_count } : e)));
        if (selectedEvent?.id === updated.id) setSelectedEvent(updated);
      } else {
        const created = await createEvent(payload);
        if (tab === "upcoming") setEvents((prev) => [created, ...prev]);
      }
      setShowForm(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save event.";
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelEvent(event: ChapterEvent) {
    if (!confirm(`Cancel "${event.title}"? This cannot be undone.`)) return;
    try {
      await cancelEvent(event.id);
      setEvents((prev) => prev.filter((e) => e.id !== event.id));
      if (selectedEvent?.id === event.id) setSelectedEvent(null);
    } catch {
      setError("Failed to cancel event.");
    }
  }

  function copyPublicLink(event: ChapterEvent) {
    const url = `${window.location.origin}/e/${event.public_slug}`;
    void navigator.clipboard.writeText(url);
    setCopiedSlug(true);
    setTimeout(() => setCopiedSlug(false), 2000);
  }

  // ── Filtered events ──────────────────────────────────────────────────────────
  const displayedEvents =
    tab === "my_rsvps"
      ? events.filter((e) => e.my_attendance !== null)
      : events;

  // ── Render: Event detail / check-in ─────────────────────────────────────────
  if (selectedEvent) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Back */}
          <button
            onClick={() => setSelectedEvent(null)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Events
          </button>

          {/* Event header card */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-glass border border-white/40 p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${EVENT_TYPE_COLORS[selectedEvent.event_type]}`}>
                    {EVENT_TYPE_LABELS[selectedEvent.event_type]}
                  </span>
                  {selectedEvent.is_paid && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
                      ${parseFloat(selectedEvent.ticket_price ?? "0").toFixed(2)} ticket
                    </span>
                  )}
                  {selectedEvent.status === "draft" && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                      Pending Approval
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-gray-900">{selectedEvent.title}</h1>
                {selectedEvent.description && (
                  <p className="mt-2 text-gray-600">{selectedEvent.description}</p>
                )}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="w-4 h-4 text-gray-400" />
                    {formatDateTime(selectedEvent.start_datetime)}
                    {selectedEvent.end_datetime && ` – ${formatDateTime(selectedEvent.end_datetime)}`}
                  </div>
                  {selectedEvent.location && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      {selectedEvent.location}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="w-4 h-4 text-gray-400" />
                    {selectedEvent.attendee_count ?? 0} attending
                    {selectedEvent.capacity && ` / ${selectedEvent.capacity} capacity`}
                  </div>
                </div>
              </div>

              {isOfficer && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {selectedEvent.is_public && selectedEvent.public_slug && (
                    <button
                      onClick={() => copyPublicLink(selectedEvent)}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      {copiedSlug ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      {copiedSlug ? "Copied!" : "Copy Link"}
                    </button>
                  )}
                  <button
                    onClick={() => openEditForm(selectedEvent)}
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void handleCancelEvent(selectedEvent)}
                    className="px-3 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    Cancel Event
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Officer's own RSVP */}
          {selectedEvent.status !== "cancelled" && (
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-glass border border-white/40 px-6 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-800">Your RSVP</p>
                {selectedEvent.my_attendance ? (
                  <p className="text-xs text-gray-500 mt-0.5">
                    You are marked as{" "}
                    <span className={`font-medium ${selectedEvent.my_attendance.rsvp_status === "going" ? "text-green-600" : selectedEvent.my_attendance.rsvp_status === "maybe" ? "text-yellow-600" : "text-gray-500"}`}>
                      {RSVP_LABELS[selectedEvent.my_attendance.rsvp_status]}
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-0.5">You haven't RSVPed yet</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedEvent.my_attendance ? (
                  <button
                    onClick={() => void handleCancelRsvp(selectedEvent)}
                    className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    Cancel RSVP
                  </button>
                ) : selectedEvent.is_paid ? (
                  <button
                    onClick={() => void handleRsvp(selectedEvent, "going")}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-brand-primary-main rounded-lg hover:bg-brand-primary-dark transition-colors"
                  >
                    Buy Ticket — ${parseFloat(selectedEvent.ticket_price ?? "0").toFixed(2)}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => void handleRsvp(selectedEvent, "going")}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                    >
                      Going
                    </button>
                    <button
                      onClick={() => void handleRsvp(selectedEvent, "maybe")}
                      className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Maybe
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Attendees table (officers only) */}
          {isOfficer && (
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-glass border border-white/40 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">
                  Attendees ({attendees.length})
                </h2>
              </div>
              {attendeesLoading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="w-6 h-6 border-4 border-brand-primary-light border-t-brand-primary-main rounded-full animate-spin" />
                </div>
              ) : attendees.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">No RSVPs yet.</div>
              ) : (
                <table className="min-w-full">
                  <thead className="bg-gray-50/80">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Attendee</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">RSVP</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Payment</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Check-In</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {attendees.map((attendance) => (
                      <tr key={attendance.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            {attendance.user?.profile_picture_url ? (
                              <img
                                src={attendance.user.profile_picture_url}
                                alt={attendance.user.full_name}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-primary-light to-brand-primary-main flex items-center justify-center text-white text-xs font-bold">
                                {(attendance.user?.full_name ?? attendance.attendee_name ?? "?")[0]}
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {attendance.user?.full_name ?? attendance.attendee_name ?? "Unknown"}
                              </p>
                              <p className="text-xs text-gray-500">
                                {attendance.user?.email ?? attendance.attendee_email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            attendance.rsvp_status === "going" ? "bg-green-100 text-green-700" :
                            attendance.rsvp_status === "maybe" ? "bg-yellow-100 text-yellow-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>
                            {RSVP_LABELS[attendance.rsvp_status]}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {selectedEvent.is_paid ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              attendance.payment_status === "paid" ? "bg-green-100 text-green-700" :
                              attendance.payment_status === "pending" ? "bg-yellow-100 text-yellow-700" :
                              "bg-gray-100 text-gray-600"
                            }`}>
                              {attendance.payment_status.charAt(0).toUpperCase() + attendance.payment_status.slice(1)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Free</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => void handleToggleCheckIn(selectedEvent.id, attendance.id)}
                            className="flex items-center gap-1.5 text-sm transition-colors"
                          >
                            {attendance.checked_in ? (
                              <>
                                <CheckCircle className="w-5 h-5 text-green-500" />
                                <span className="text-green-600 font-medium">Checked In</span>
                              </>
                            ) : (
                              <>
                                <Circle className="w-5 h-5 text-gray-300" />
                                <span className="text-gray-400">Not Checked In</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Edit form modal */}
        {showForm && <EventFormModal {...{ formData, setFormData, formError, saving, editingEvent, onSave: handleSaveEvent, onClose: () => setShowForm(false) }} />}
      </Layout>
    );
  }

  // ── Render: Events list ──────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 font-heading">Events</h1>
            <p className="text-gray-500 mt-1">Manage chapter events and attendance.</p>
          </div>
          {isOfficer && (
            <button
              onClick={openCreateForm}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary-main text-white font-semibold rounded-xl shadow-md ring-1 ring-brand-primary-dark/20 hover:bg-brand-primary-dark transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Event
            </button>
          )}
        </div>

        {/* Stripe toast */}
        {stripeToast && (
          <div className={`rounded-xl p-4 text-sm font-medium ${stripeToast === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-yellow-50 text-yellow-700 border border-yellow-200"}`}>
            {stripeToast === "success" ? "Your ticket purchase was successful!" : "Ticket purchase cancelled."}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {(isOfficer
            ? [["upcoming", "Upcoming"], ["past", "Past"]]
            : [["upcoming", "Upcoming"], ["my_rsvps", "My RSVPs"]]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value as Tab)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Events list */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 border-4 border-brand-primary-light border-t-brand-primary-main rounded-full animate-spin" />
          </div>
        ) : displayedEvents.length === 0 ? (
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-glass border border-white/40 p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              {tab === "my_rsvps" ? "You haven't RSVP'd to any events yet." : "No events found."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {displayedEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                isOfficer={isOfficer}
                onOpen={() => void openEventDetail(event)}
                onRsvp={(status) => void handleRsvp(event, status)}
                onCancelRsvp={() => void handleCancelRsvp(event)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create form modal */}
      {showForm && (
        <EventFormModal
          formData={formData}
          setFormData={setFormData}
          formError={formError}
          saving={saving}
          editingEvent={editingEvent}
          onSave={handleSaveEvent}
          onClose={() => setShowForm(false)}
        />
      )}
    </Layout>
  );
}

// ── Event Card ────────────────────────────────────────────────────────────────

function EventCard({
  event,
  isOfficer,
  onOpen,
  onRsvp,
  onCancelRsvp,
}: {
  event: ChapterEvent;
  isOfficer: boolean;
  onOpen: () => void;
  onRsvp: (status: RsvpStatus) => void;
  onCancelRsvp: () => void;
}) {
  const navigate = useNavigate();
  const myStatus = event.my_attendance?.rsvp_status;

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-glass border border-white/40 p-5 flex flex-col gap-4 hover:shadow-lg transition-shadow">
      {/* Type badge + title */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${EVENT_TYPE_COLORS[event.event_type]}`}>
            {EVENT_TYPE_LABELS[event.event_type]}
          </span>
          {event.is_paid && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
              ${parseFloat(event.ticket_price ?? "0").toFixed(2)}
            </span>
          )}
          {event.status === "draft" && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
              Pending Approval
            </span>
          )}
          {event.is_public && (
            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
          )}
        </div>
        <h3 className="font-semibold text-gray-900 text-base leading-snug">{event.title}</h3>
      </div>

      {/* Meta */}
      <div className="space-y-1.5 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          {formatDateShort(event.start_datetime)}
        </div>
        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          {event.attendee_count ?? 0} attending
          {event.capacity && ` / ${event.capacity}`}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-gray-100">
        {isOfficer ? (
          <div className="flex items-center gap-2 flex-1">
            {event.status === "draft" && event.workflow_instance_id && (
              <button
                onClick={() => navigate(`/workflows?instance=${event.workflow_instance_id}`)}
                className="flex-1 text-center px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
              >
                Review & Approve
              </button>
            )}
            <button
              onClick={onOpen}
              className="flex-1 text-center px-4 py-2 text-sm font-medium bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              {event.status === "draft" ? "View Details" : "Manage"}
            </button>
          </div>
        ) : (
          <>
            {myStatus ? (
              <div className="flex items-center gap-2 flex-1">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  myStatus === "going" ? "bg-green-100 text-green-700" :
                  myStatus === "maybe" ? "bg-yellow-100 text-yellow-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {RSVP_LABELS[myStatus]}
                </span>
                {myStatus !== "going" ? (
                  <button onClick={() => onRsvp("going")} className="text-xs text-brand-primary-dark hover:underline">
                    Change to Going
                  </button>
                ) : null}
                <button onClick={onCancelRsvp} className="ml-auto text-xs text-red-500 hover:underline">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <button
                  onClick={() => onRsvp("going")}
                  className="flex-1 px-3 py-2 text-sm font-medium bg-brand-primary-main text-white rounded-lg hover:bg-brand-primary-dark transition-colors"
                >
                  {event.is_paid ? `Buy Ticket` : "Going"}
                </button>
                {!event.is_paid && (
                  <button
                    onClick={() => onRsvp("maybe")}
                    className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Maybe
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Event Form Modal ──────────────────────────────────────────────────────────

function EventFormModal({
  formData,
  setFormData,
  formError,
  saving,
  editingEvent,
  onSave,
  onClose,
}: {
  formData: Partial<CreateEventRequest>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<CreateEventRequest>>>;
  formError: string | null;
  saving: boolean;
  editingEvent: ChapterEvent | null;
  onSave: () => void;
  onClose: () => void;
}) {
  function set(field: keyof CreateEventRequest, value: unknown) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {editingEvent ? "Edit Event" : "Create Event"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={formData.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30"
              placeholder="Spring Formal, Community Clean-Up..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event Type *</label>
            <select
              value={formData.event_type ?? "social"}
              onChange={(e) => set("event_type", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30"
            >
              <option value="social">Social</option>
              <option value="fundraiser">Fundraiser</option>
              <option value="community_service">Community Service</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date & Time *</label>
              <input
                type="datetime-local"
                value={formData.start_datetime ?? ""}
                onChange={(e) => set("start_datetime", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date & Time</label>
              <input
                type="datetime-local"
                value={formData.end_datetime ?? ""}
                onChange={(e) => set("end_datetime", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input
              type="text"
              value={formData.location ?? ""}
              onChange={(e) => set("location", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30"
              placeholder="Address or venue name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30 resize-none"
              placeholder="Event details..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Capacity (optional)</label>
              <input
                type="number"
                min={1}
                value={formData.capacity ?? ""}
                onChange={(e) => set("capacity", e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30"
                placeholder="Unlimited"
              />
            </div>
            {formData.event_type === "community_service" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Hours</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={formData.service_hours ?? ""}
                  onChange={(e) => set("service_hours", e.target.value ? parseFloat(e.target.value) : undefined)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30"
                  placeholder="0"
                />
              </div>
            )}
          </div>

          {/* Paid event toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700">Paid Event</p>
              <p className="text-xs text-gray-500">Require ticket purchase via Stripe</p>
            </div>
            <button
              type="button"
              onClick={() => set("is_paid", !formData.is_paid)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.is_paid ? "bg-brand-primary-main" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.is_paid ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          {formData.is_paid && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ticket Price ($) *</label>
              <input
                type="number"
                min={0.50}
                step={0.01}
                value={formData.ticket_price ?? ""}
                onChange={(e) => set("ticket_price", e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main/30"
                placeholder="0.00"
              />
            </div>
          )}

          {/* Public event toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700">Public Event Page</p>
              <p className="text-xs text-gray-500">Generate a shareable link for non-members</p>
            </div>
            <button
              type="button"
              onClick={() => set("is_public", !formData.is_public)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.is_public ? "bg-brand-primary-main" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.is_public ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-5 py-2.5 text-sm font-medium text-white bg-brand-primary-main rounded-xl hover:bg-brand-primary-dark disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : editingEvent ? "Save Changes" : "Create Event"}
          </button>
        </div>
      </div>
    </div>
  );
}

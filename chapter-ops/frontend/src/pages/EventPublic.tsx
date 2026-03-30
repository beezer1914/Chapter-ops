import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Calendar, MapPin, Users, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { fetchPublicEvent, rsvpPublicEvent, createPublicCheckout } from "@/services/eventService";
import type { ChapterEvent } from "@/types";

const EVENT_TYPE_LABELS: Record<string, string> = {
  social: "Social",
  fundraiser: "Fundraiser",
  community_service: "Community Service",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  social: "bg-blue-900/30 text-blue-400",
  fundraiser: "bg-green-900/30 text-green-400",
  community_service: "bg-purple-900/30 text-purple-400",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EventPublic() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();

  const [event, setEvent] = useState<ChapterEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // RSVP form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rsvpSuccess, setRsvpSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const stripeSuccess = searchParams.get("stripe_success") === "1";
  const stripeCancelled = searchParams.get("stripe_cancelled") === "1";

  useEffect(() => {
    if (!slug) return;
    fetchPublicEvent(slug)
      .then(setEvent)
      .catch(() => setError("Event not found or no longer available."))
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleFreeRsvp(e: React.FormEvent) {
    e.preventDefault();
    if (!slug) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await rsvpPublicEvent(slug, { name, email });
      setRsvpSuccess(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(msg || "Failed to RSVP. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePaidCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (!slug) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const { checkout_url } = await createPublicCheckout(slug, { name, email });
      window.location.href = checkout_url;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(msg || "Failed to create checkout. Please try again.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white/5 flex items-center justify-center">
        <div className="text-content-muted text-lg">Loading event...</div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-white/5 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-content-primary mb-2">Event Not Found</h2>
          <p className="text-content-secondary">{error || "This event is not available."}</p>
        </div>
      </div>
    );
  }

  const isCancelled = event.status === "cancelled";
  const isPast = event.end_datetime
    ? new Date(event.end_datetime) < new Date()
    : new Date(event.start_datetime) < new Date();
  const isFull =
    event.capacity != null &&
    event.attendee_count != null &&
    event.attendee_count >= event.capacity;

  return (
    <div className="min-h-screen bg-white/5">
      {/* Header bar */}
      <div className="bg-[#0a1526] text-white py-4 px-6 text-center">
        <p className="text-sm text-content-muted">
          {event.chapter_name || "Chapter"} — Powered by ChapterOps
        </p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Stripe success/cancelled banners */}
        {stripeSuccess && (
          <div className="mb-6 p-4 bg-green-900/30 border border-[var(--color-border)] rounded-xl flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
            <div>
              <p className="font-semibold text-green-400">You're registered!</p>
              <p className="text-sm text-green-400">Your ticket purchase was successful. See you there!</p>
            </div>
          </div>
        )}
        {stripeCancelled && (
          <div className="mb-6 p-4 bg-yellow-900/30 border border-[var(--color-border)] rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0" />
            <p className="text-yellow-400">Checkout was cancelled. You can try again below.</p>
          </div>
        )}

        {/* Event Card */}
        <div className="bg-surface-card-solid rounded-2xl shadow-glass overflow-hidden mb-6">
          {event.banner_image_url && (
            <img
              src={event.banner_image_url}
              alt={event.title}
              className="w-full h-48 object-cover"
            />
          )}
          <div className="p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h1 className="text-2xl font-bold text-content-primary leading-tight">{event.title}</h1>
              <span
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${EVENT_TYPE_COLORS[event.event_type] ?? "bg-white/10 text-content-secondary"}`}
              >
                {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}
              </span>
            </div>

            {isCancelled && (
              <div className="mb-4 px-3 py-2 bg-red-900/30 border border-[var(--color-border)] rounded-lg text-red-400 text-sm font-medium">
                This event has been cancelled.
              </div>
            )}

            {event.description && (
              <p className="text-content-secondary mb-5 leading-relaxed">{event.description}</p>
            )}

            <div className="space-y-3 text-sm text-content-secondary">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-content-muted shrink-0" />
                <span>{formatDateTime(event.start_datetime)}</span>
              </div>
              {event.end_datetime && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-content-muted shrink-0" />
                  <span>Ends {formatDateTime(event.end_datetime)}</span>
                </div>
              )}
              {event.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-content-muted shrink-0" />
                  <span>{event.location}</span>
                </div>
              )}
              {event.capacity != null && (
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-content-muted shrink-0" />
                  <span>
                    {event.attendee_count ?? 0} / {event.capacity} spots
                    {isFull && <span className="ml-2 text-red-400 font-medium">· Full</span>}
                  </span>
                </div>
              )}
              {event.is_paid && event.ticket_price != null && (
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 text-content-muted shrink-0 text-center font-bold">$</span>
                  <span className="font-semibold text-content-primary">
                    ${Number(event.ticket_price).toFixed(2)} per ticket
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RSVP / Ticket section */}
        {!isCancelled && !isPast && !stripeSuccess && (
          <div className="bg-surface-card-solid rounded-2xl shadow-glass p-6">
            {isFull ? (
              <div className="text-center py-4">
                <Users className="w-10 h-10 text-content-muted mx-auto mb-3" />
                <p className="text-content-secondary font-medium">This event is at capacity.</p>
              </div>
            ) : rsvpSuccess ? (
              <div className="text-center py-4">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="text-lg font-semibold text-content-primary">You're on the list!</p>
                <p className="text-content-secondary text-sm mt-1">We'll see you there.</p>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-content-primary mb-4">
                  {event.is_paid ? `Get Your Ticket — $${Number(event.ticket_price).toFixed(2)}` : "RSVP for Free"}
                </h2>

                {formError && (
                  <div className="mb-4 p-3 bg-red-900/30 border border-[var(--color-border)] rounded-lg text-red-400 text-sm">
                    {formError}
                  </div>
                )}

                <form onSubmit={event.is_paid ? handlePaidCheckout : handleFreeRsvp} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1">Full Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Jane Smith"
                      className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="jane@example.com"
                      className="w-full px-3 py-2 border border-[var(--color-border-brand)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary-main"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 px-4 bg-brand-primary-main hover:bg-brand-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                  >
                    {submitting
                      ? "Please wait..."
                      : event.is_paid
                      ? `Buy Ticket — $${Number(event.ticket_price).toFixed(2)}`
                      : "RSVP"}
                  </button>
                </form>
              </>
            )}
          </div>
        )}

        {isPast && !isCancelled && (
          <div className="bg-surface-card-solid rounded-2xl shadow-glass p-6 text-center text-content-muted">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>This event has already taken place.</p>
          </div>
        )}

        <p className="text-center text-xs text-content-muted mt-8">
          Powered by <span className="font-semibold">ChapterOps</span>
        </p>
      </div>
    </div>
  );
}

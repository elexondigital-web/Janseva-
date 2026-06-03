import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
// react-qr-scanner has no types shipped; import untyped.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import QrReader from 'react-qr-scanner';
import { useAuthStore } from '../store/auth.store';
import { eventsApi, type EventListItem } from '../api/events.api';
import {
  attendanceApi,
  type MarkResult,
  type EventAttendee,
} from '../api/attendance.api';
import { peopleApi, type PersonListItem } from '../api/people.api';
import { AttendanceMethod, EventType, AdminRole } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  probeStatus,
  capture as mantraCapture,
  fakeCapture,
  MantraError,
  type ScannerInfo,
} from '../lib/mantra';
import {
  IconSearch,
  IconUser,
  IconX,
  IconActivity,
  IconCheckCircle,
  IconAlertTriangle,
  IconQrCode,
  IconFingerprint,
  IconPlus,
  IconTrash,
} from '../components/ui/Icon';

const DEBOUNCE_MS = 300;

const EVENT_TYPE_LABEL: Record<EventType, string> = {
  RALLY: 'Rally',
  MEETING: 'Meeting',
  FUNCTION: 'Function',
  GET_TOGETHER: 'Get-together',
};

export default function Attendance() {
  const user = useAuthStore((s) => s.user);
  usePageTitle('Attendance');
  const [searchParams, setSearchParams] = useSearchParams();

  // Events pane ------------------------------------------------------------
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventFilter, setEventFilter] = useState<'upcoming' | 'past' | ''>(
    'upcoming',
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    searchParams.get('eventId'),
  );

  // New-event modal
  const [showCreate, setShowCreate] = useState(false);

  // Live marking pane ------------------------------------------------------
  const [mode, setMode] = useState<'qr' | 'manual' | 'fingerprint'>('qr');
  const [recent, setRecent] = useState<MarkResult[]>([]);
  // Attendee list (refreshed after each successful mark).
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [attendeeCount, setAttendeeCount] = useState(0);
  const [attendeesLoading, setAttendeesLoading] = useState(false);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  // ---- Fetch events ----
  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const res = await eventsApi.list({
        when: eventFilter || undefined,
        limit: 50,
      });
      setEvents(res.items);
      // Auto-select the first upcoming event if nothing is selected yet.
      if (!selectedEventId && res.items.length > 0) {
        setSelectedEventId(res.items[0].id);
        setSearchParams({ eventId: res.items[0].id }, { replace: true });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to load events');
    } finally {
      setEventsLoading(false);
    }
  }, [eventFilter, selectedEventId, setSearchParams]);

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventFilter]);

  // ---- Load attendees when event changes ----
  const reloadAttendees = useCallback(async () => {
    if (!selectedEventId) {
      setAttendees([]);
      setAttendeeCount(0);
      return;
    }
    setAttendeesLoading(true);
    try {
      const res = await attendanceApi.listForEvent(selectedEventId, {
        limit: 50,
      });
      setAttendees(res.items);
      setAttendeeCount(res.total);
    } catch {
      setAttendees([]);
      setAttendeeCount(0);
    } finally {
      setAttendeesLoading(false);
    }
  }, [selectedEventId]);

  useEffect(() => {
    reloadAttendees();
    setRecent([]);
  }, [reloadAttendees]);

  // ---- QR handler (debounced against duplicates) ----
  const lastQrRef = useRef<{ data: string; at: number } | null>(null);
  const onQrScan = useCallback(
    async (result: any) => {
      if (!result || !selectedEventId) return;
      const text =
        typeof result === 'string' ? result : result?.text ?? result?.data ?? '';
      if (!text) return;

      // 2-second dedupe window so a camera pointed at one card doesn't spam.
      const now = Date.now();
      if (lastQrRef.current && lastQrRef.current.data === text && now - lastQrRef.current.at < 2000) {
        return;
      }
      lastQrRef.current = { data: text, at: now };

      try {
        const { data, message } = await attendanceApi.markQr(
          selectedEventId,
          text,
        );
        setRecent((prev) => [data, ...prev].slice(0, 10));
        if (data.alreadyMarked) {
          toast(message, { icon: 'ℹ️' });
        } else {
          toast.success(`${data.person.fullName} marked`);
          reloadAttendees();
        }
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? 'Scan failed');
      }
    },
    [selectedEventId, reloadAttendees],
  );

  const onQrError = useCallback((err: any) => {
    // camera errors happen on permission denial / no camera
    // eslint-disable-next-line no-console
    console.error('[QR]', err);
  }, []);

  // ---- Manual marking ----
  const [manualInput, setManualInput] = useState('');
  const [manualQuery, setManualQuery] = useState('');
  const [manualSuggest, setManualSuggest] = useState<PersonListItem[]>([]);
  const [showManualSuggest, setShowManualSuggest] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(
      () => setManualQuery(manualInput.trim()),
      DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [manualInput]);
  useEffect(() => {
    if (!manualQuery) {
      setManualSuggest([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await peopleApi.search({ q: manualQuery, limit: 6 });
        if (!cancelled) setManualSuggest(res.items);
      } catch {
        if (!cancelled) setManualSuggest([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manualQuery]);

  async function onManualMark(person: PersonListItem) {
    if (!selectedEventId) return;
    try {
      const data = await attendanceApi.markManual(selectedEventId, person.id);
      setRecent((prev) => [data, ...prev].slice(0, 10));
      setManualInput('');
      setManualQuery('');
      setManualSuggest([]);
      setShowManualSuggest(false);
      toast.success(`${data.person.fullName} marked`);
      reloadAttendees();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Mark failed');
    }
  }

  async function onUnmark(attendee: EventAttendee) {
    if (!selectedEventId) return;
    if (!window.confirm(`Remove ${attendee.person.fullName} from attendance?`))
      return;
    try {
      await attendanceApi.unmark(selectedEventId, attendee.personId);
      toast.success('Removed');
      reloadAttendees();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Unmark failed');
    }
  }

  // Can this user create events?
  const canCreateEvents =
    user?.role === AdminRole.SUPER_ADMIN ||
    user?.role === AdminRole.BLOCK_ADMIN ||
    user?.role === AdminRole.WARD_ADMIN;

  return (
    <div className="min-h-screen bg-surface px-6 py-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-navy tracking-tight">
              Attendance
            </h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Mark presence at rallies, meetings and functions. Scan QR codes on
              members' ID cards or search manually.
            </p>
          </div>
          {canCreateEvents && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark transition-colors"
            >
              <IconPlus size={14} /> New event
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ============ Events pane (left, 1/3) ============ */}
          <div className="space-y-4">
            <div className="bg-white border border-border rounded shadow-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">
                  Events
                </h2>
                <div className="text-[11px] text-text-muted">
                  {events.length} shown
                </div>
              </div>
              <div className="flex gap-1 mb-3 text-xs">
                {(['upcoming', 'past', ''] as const).map((k) => (
                  <button
                    key={k || 'all'}
                    onClick={() => setEventFilter(k)}
                    className={`px-2.5 py-1 rounded border transition-colors ${
                      eventFilter === k
                        ? 'bg-primary text-white border-primary'
                        : 'border-border text-text-secondary hover:bg-surface-subtle'
                    }`}
                  >
                    {k === '' ? 'All' : k === 'upcoming' ? 'Upcoming' : 'Past'}
                  </button>
                ))}
              </div>

              {eventsLoading ? (
                <div className="py-8 text-center text-xs text-text-muted">
                  Loading events…
                </div>
              ) : events.length === 0 ? (
                <div className="py-8 flex flex-col items-center text-text-muted">
                  <IconActivity size={28} />
                  <div className="mt-2 text-xs">No events yet</div>
                </div>
              ) : (
                <ul className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
                  {events.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEventId(e.id);
                          setSearchParams(
                            { eventId: e.id },
                            { replace: true },
                          );
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded border transition-colors ${
                          selectedEventId === e.id
                            ? 'bg-primary/10 border-primary'
                            : 'border-border hover:bg-surface-subtle'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-sm text-navy truncate">
                            {e.name}
                          </div>
                          <span className="text-[10px] uppercase bg-surface-subtle px-1.5 py-0.5 rounded text-text-secondary shrink-0">
                            {EVENT_TYPE_LABEL[e.type]}
                          </span>
                        </div>
                        <div className="text-[11px] text-text-muted mt-0.5">
                          {new Date(e.date).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        <div className="text-[11px] text-text-secondary mt-1 flex items-center gap-2">
                          {e.location && <span>📍 {e.location}</span>}
                          <span className="ml-auto inline-flex items-center gap-1 text-primary font-semibold">
                            <IconCheckCircle size={10} />
                            {e._count.attendances}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ============ Live marking + attendee list (right, 2/3) ============ */}
          <div className="lg:col-span-2 space-y-4">
            {!selectedEvent ? (
              <div className="bg-white border border-border rounded shadow-card p-10 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-surface-subtle flex items-center justify-center text-text-muted">
                  <IconActivity size={20} />
                </div>
                <div className="mt-3 text-sm font-semibold text-navy">
                  Pick an event to start marking attendance.
                </div>
              </div>
            ) : (
              <>
                <div className="bg-white border border-border rounded shadow-card p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-text-muted">
                        Event
                      </div>
                      <div className="text-lg font-bold text-navy">
                        {selectedEvent.name}
                      </div>
                      <div className="text-[11px] text-text-secondary mt-0.5">
                        {new Date(selectedEvent.date).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {selectedEvent.location && ` · ${selectedEvent.location}`}
                      </div>
                    </div>
                    <Link
                      to={`/attendance/${selectedEvent.id}/report`}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      View report →
                    </Link>
                  </div>

                  {/* Mode tabs */}
                  <div className="flex border border-border rounded overflow-hidden mb-4 text-sm">
                    {(
                      [
                        { k: 'qr', label: 'QR Scan', icon: <IconQrCode size={14} /> },
                        { k: 'manual', label: 'Manual', icon: <IconSearch size={14} /> },
                        {
                          k: 'fingerprint',
                          label: 'Fingerprint',
                          icon: <IconFingerprint size={14} />,
                        },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.k}
                        onClick={() => setMode(t.k)}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 font-semibold transition-colors ${
                          mode === t.k
                            ? 'bg-primary text-white'
                            : 'bg-white text-text-secondary hover:bg-surface-subtle'
                        }`}
                      >
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>

                  {mode === 'qr' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded overflow-hidden border border-border bg-black/90">
                        <QrReader
                          onScan={onQrScan}
                          onError={onQrError}
                          delay={300}
                          style={{ width: '100%' }}
                          constraints={{
                            video: { facingMode: 'environment' },
                          }}
                        />
                      </div>
                      <div className="text-[12px] text-text-secondary leading-relaxed space-y-2">
                        <p>
                          Point the camera at the QR code on any issued ID card.
                          Scans are deduplicated for 2 seconds so one card won't
                          be marked twice.
                        </p>
                        <p className="text-text-muted">
                          Allow camera permission if this is your first visit.
                          Use HTTPS or <code className="font-mono">localhost</code>
                          {' '}— browsers block camera over plain HTTP.
                        </p>
                      </div>
                    </div>
                  )}

                  {mode === 'manual' && (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
                        <IconSearch size={16} />
                      </span>
                      <input
                        type="search"
                        value={manualInput}
                        onChange={(e) => {
                          setManualInput(e.target.value);
                          setShowManualSuggest(true);
                        }}
                        onFocus={() => setShowManualSuggest(true)}
                        onBlur={() =>
                          window.setTimeout(
                            () => setShowManualSuggest(false),
                            150,
                          )
                        }
                        placeholder="Search member by name, phone, ID…"
                        className="w-full pl-9 pr-10 py-2.5 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
                      />
                      {manualInput && (
                        <button
                          type="button"
                          onClick={() => {
                            setManualInput('');
                            setManualQuery('');
                            setManualSuggest([]);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-navy"
                          aria-label="Clear"
                        >
                          <IconX size={14} />
                        </button>
                      )}

                      {showManualSuggest && manualSuggest.length > 0 && (
                        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded shadow-lg overflow-hidden max-h-80 overflow-y-auto">
                          {manualSuggest.map((p) => (
                            <li
                              key={p.id}
                              onMouseDown={() => onManualMark(p)}
                              className="px-3 py-2 text-sm cursor-pointer hover:bg-surface-subtle flex items-center gap-2"
                            >
                              <div className="w-7 h-7 shrink-0 rounded-full bg-surface-subtle border border-border overflow-hidden flex items-center justify-center text-text-muted">
                                {p.photoUrl ? (
                                  <img
                                    src={p.photoUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <IconUser size={12} />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-navy truncate">
                                  {p.fullName}
                                </div>
                                <div className="text-[11px] text-text-muted font-mono">
                                  {p.uniqueId} · {p.phone}
                                </div>
                              </div>
                              <span className="text-[11px] text-primary font-semibold">
                                Mark →
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {mode === 'fingerprint' && (
                    <FingerprintMode
                      eventId={selectedEvent.id}
                      onMarked={(r) => {
                        setRecent((prev) => [r, ...prev].slice(0, 10));
                        if (!r.alreadyMarked) reloadAttendees();
                      }}
                    />
                  )}
                </div>

                {/* Recent check-ins (live) */}
                {recent.length > 0 && (
                  <div className="bg-white border border-border rounded shadow-card p-4">
                    <div className="text-[11px] uppercase tracking-wider text-text-muted font-semibold mb-2">
                      Recent check-ins (this session)
                    </div>
                    <ul className="space-y-1.5">
                      {recent.map((r, i) => (
                        <li
                          key={`${r.attendance.id}-${i}`}
                          className="flex items-center gap-2.5 py-1.5 px-2 rounded hover:bg-surface-subtle text-sm"
                        >
                          <div className="w-7 h-7 shrink-0 rounded-full bg-surface-subtle border border-border overflow-hidden flex items-center justify-center text-text-muted">
                            {r.person.photoUrl ? (
                              <img
                                src={r.person.photoUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <IconUser size={12} />
                            )}
                          </div>
                          <div className="font-semibold text-navy">
                            {r.person.fullName}
                          </div>
                          <div className="text-[11px] text-text-muted font-mono">
                            {r.person.uniqueId}
                          </div>
                          <div className="ml-auto text-[11px] text-status-green font-semibold inline-flex items-center gap-1">
                            {r.alreadyMarked ? (
                              <>
                                <IconAlertTriangle size={10} />
                                already in
                              </>
                            ) : (
                              <>
                                <IconCheckCircle size={10} />
                                marked
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Attendee list */}
                <div className="bg-white border border-border rounded shadow-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-navy uppercase tracking-wide">
                      Attendees
                    </h2>
                    <div className="text-xs text-text-secondary">
                      {attendeeCount} marked
                    </div>
                  </div>
                  {attendeesLoading ? (
                    <div className="py-8 text-center text-xs text-text-muted">
                      Loading…
                    </div>
                  ) : attendees.length === 0 ? (
                    <div className="py-8 text-center text-xs text-text-muted">
                      No one marked yet. Scan a card or search to mark the first
                      attendee.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {attendees.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center gap-2.5 py-2 text-sm"
                        >
                          <div className="w-7 h-7 shrink-0 rounded-full bg-surface-subtle border border-border overflow-hidden flex items-center justify-center text-text-muted">
                            {a.person.photoUrl ? (
                              <img
                                src={a.person.photoUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <IconUser size={12} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-navy truncate">
                              {a.person.fullName}
                            </div>
                            <div className="text-[11px] text-text-muted">
                              {a.person.ward?.name ?? '—'} ·{' '}
                              {a.person.booth?.name ?? '—'}
                            </div>
                          </div>
                          <div className="ml-auto flex items-center gap-2">
                            <MethodBadge method={a.method} />
                            <div className="text-[11px] text-text-muted">
                              {new Date(a.markedAt).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                            <button
                              onClick={() => onUnmark(a)}
                              className="text-text-muted hover:text-status-red"
                              aria-label="Unmark"
                              title="Remove"
                            >
                              <IconTrash size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateEventModal
          onClose={() => setShowCreate(false)}
          onCreated={(ev) => {
            setShowCreate(false);
            setEvents((prev) => [ev, ...prev]);
            setSelectedEventId(ev.id);
            setSearchParams({ eventId: ev.id }, { replace: true });
            toast.success('Event created');
          }}
        />
      )}
    </div>
  );
}

function MethodBadge({ method }: { method: AttendanceMethod }) {
  const cfg =
    method === AttendanceMethod.QR
      ? { label: 'QR', bg: 'bg-primary/10', fg: 'text-primary' }
      : method === AttendanceMethod.FINGERPRINT
        ? { label: 'FP', bg: 'bg-status-amber-bg', fg: 'text-status-amber' }
        : { label: 'Manual', bg: 'bg-surface-subtle', fg: 'text-text-secondary' };
  return (
    <span
      className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.fg}`}
    >
      {cfg.label}
    </span>
  );
}

/**
 * Fingerprint capture sub-panel. Shows a live "Scanner Status" pill
 * (re-probed every 5s while idle), a large pulsing fingerprint icon
 * during capture, and a simple action row.
 *
 * Phase 3 contract: we capture from the local Mantra RD Service and
 * POST { fingerprintTemplate, eventId, uniqueId? } to the backend. The
 * backend either matches the template against an enrolled person OR
 * accepts a uniqueId as a hint. In this prototype we resolve solely by
 * uniqueId from a small companion search so admins can fall back to
 * "type the JS-id, then place finger" — useful when the SDK matching
 * layer isn't wired yet.
 */
function FingerprintMode({
  eventId,
  onMarked,
}: {
  eventId: string;
  onMarked: (r: MarkResult) => void;
}) {
  const [info, setInfo] = useState<ScannerInfo | null>(null);
  const [probing, setProbing] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastTemplatePreview, setLastTemplatePreview] = useState<string | null>(
    null,
  );

  // Optional hint: typing a uniqueId lets the backend resolve the person
  // when there's no biometric matcher behind /attendance/fingerprint.
  const [hintInput, setHintInput] = useState('');
  const [hintQuery, setHintQuery] = useState('');
  const [hintSuggest, setHintSuggest] = useState<PersonListItem[]>([]);
  const [pickedPerson, setPickedPerson] = useState<PersonListItem | null>(null);

  // Probe loop while idle.
  useEffect(() => {
    let cancelled = false;
    let tid: number | undefined;
    const tick = async () => {
      if (cancelled) return;
      setProbing(true);
      const s = await probeStatus();
      if (cancelled) return;
      setInfo(s);
      setProbing(false);
      if (!capturing) tid = window.setTimeout(tick, 5000);
    };
    tick();
    return () => {
      cancelled = true;
      if (tid) window.clearTimeout(tid);
    };
  }, [capturing]);

  // Hint search debounce.
  useEffect(() => {
    const t = window.setTimeout(
      () => setHintQuery(hintInput.trim()),
      DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [hintInput]);
  useEffect(() => {
    if (!hintQuery) {
      setHintSuggest([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await peopleApi.search({ q: hintQuery, limit: 5 });
        if (!cancelled) setHintSuggest(res.items);
      } catch {
        if (!cancelled) setHintSuggest([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hintQuery]);

  const onCapture = useCallback(async (mode: 'real' | 'demo' = 'real') => {
    if (capturing) return;
    setErrorMsg(null);
    setCapturing(true);
    try {
      // Demo mode bypasses the local RD service and uses a synthetic
      // template — useful for showing the flow when no scanner is
      // attached. Requires a pre-selected person so the backend can
      // resolve who to mark.
      if (mode === 'demo' && !pickedPerson) {
        throw new MantraError(
          'Pick a member in the right panel first — demo capture has no biometric matcher.',
          'CANCELLED',
        );
      }
      const cap =
        mode === 'demo' ? fakeCapture() : await mantraCapture({ timeoutMs: 10000 });
      setLastTemplatePreview(cap.fingerprintTemplate.slice(0, 32) + '…');

      const { data, message } = await attendanceApi.markFingerprint(eventId, {
        uniqueId: pickedPerson?.uniqueId,
        personId: pickedPerson?.id,
        fingerprintTemplate: cap.fingerprintTemplate,
      });
      onMarked(data);
      if (data.alreadyMarked) toast(message, { icon: 'ℹ️' });
      else toast.success(`${data.person.fullName} marked${mode === 'demo' ? ' (demo)' : ''}`);
      // Keep the pickedPerson cleared so the next placement isn't
      // accidentally attributed to the same person.
      setPickedPerson(null);
      setHintInput('');
      setHintQuery('');
      setHintSuggest([]);
    } catch (err: any) {
      if (err instanceof MantraError) {
        if (err.code === 'NOT_RUNNING') {
          setErrorMsg(
            'Mantra RD Service is not running. Install the driver and retry.',
          );
        } else if (err.code === 'TIMEOUT' || err.code === 'NO_FINGER') {
          setErrorMsg('No finger detected. Place finger firmly and retry.');
        } else {
          setErrorMsg(err.message);
        }
      } else if (err?.response?.status === 404) {
        setErrorMsg(
          'Member not found — fall back to QR or pick a member below.',
        );
      } else {
        setErrorMsg(err?.response?.data?.message ?? 'Capture/mark failed');
      }
    } finally {
      setCapturing(false);
    }
  }, [capturing, eventId, onMarked, pickedPerson]);

  const ready = info?.available && !capturing;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* Capture column */}
      <div className="flex flex-col items-center text-center">
        <div className="flex items-center gap-1.5 mb-3 text-[11px] font-semibold">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              probing
                ? 'bg-text-muted animate-pulse'
                : info?.available
                  ? 'bg-status-green'
                  : 'bg-status-red'
            }`}
          />
          {probing
            ? 'Checking scanner…'
            : info?.available
              ? `${info.deviceModel ?? 'Mantra MFS100'} · port ${info.port}`
              : 'Scanner disconnected'}
        </div>

        <div
          className={`w-32 h-32 rounded-full flex items-center justify-center transition-colors ${
            capturing
              ? 'bg-primary text-white animate-pulse'
              : ready
                ? 'bg-primary-bg text-primary'
                : 'bg-surface-subtle text-text-muted'
          }`}
        >
          <IconFingerprint size={56} />
        </div>

        <div className="mt-3 text-sm font-semibold text-navy">
          {capturing
            ? 'Place finger on scanner…'
            : ready
              ? 'Ready — press Capture'
              : 'Scanner not ready'}
        </div>
        {errorMsg && (
          <div className="mt-2 text-[11px] text-status-red max-w-sm">
            {errorMsg}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onCapture('real')}
            disabled={!ready}
            className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50 transition-colors inline-flex items-center gap-2"
          >
            <IconFingerprint size={14} />
            {capturing ? 'Capturing…' : 'Capture & Mark'}
          </button>
          {/* Demo capture works without the RD service. Greyed out
              until a member has been picked in the right column. */}
          <button
            type="button"
            onClick={() => onCapture('demo')}
            disabled={capturing || !pickedPerson}
            title={
              pickedPerson
                ? 'Simulate a fingerprint capture for the picked member'
                : 'Pick a member in the right panel to enable demo capture'
            }
            className="px-3 py-2 text-xs font-semibold border border-border rounded hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            Demo capture
          </button>
        </div>

        {!info?.available && !probing && (
          <div className="mt-3 text-[11px] text-text-muted text-center max-w-xs">
            <a
              href="https://mantratecapp.com/MFS100Device.html"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Install Mantra RD Service
            </a>{' '}
            for real captures, or pick a member and use{' '}
            <strong>Demo capture</strong> to simulate the flow.
          </div>
        )}

        {lastTemplatePreview && (
          <div className="mt-3 text-[10px] text-text-muted font-mono break-all max-w-xs">
            Last template: {lastTemplatePreview}
          </div>
        )}
      </div>

      {/* Hint / fallback column */}
      <div className="text-[12px] text-text-secondary leading-relaxed space-y-3">
        <p>
          The scanner captures a fingerprint and sends the ISO/IEC 19794-2
          template to the backend, which matches it against the member's
          enrolled template.
        </p>
        <div className="bg-surface-subtle border border-border rounded p-3">
          <div className="text-[11px] font-semibold text-navy mb-1.5">
            Optional: pre-select a member
          </div>
          <div className="text-[11px] text-text-muted mb-2">
            Useful when biometric matching isn't enabled on this server, or
            for first-time scans where you want to confirm identity before
            marking.
          </div>
          {pickedPerson ? (
            <div className="flex items-center gap-2 bg-white border border-border rounded px-2 py-1.5">
              <div className="w-7 h-7 shrink-0 rounded-full bg-surface-subtle border border-border overflow-hidden flex items-center justify-center text-text-muted">
                {pickedPerson.photoUrl ? (
                  <img
                    src={pickedPerson.photoUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <IconUser size={12} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-navy truncate">
                  {pickedPerson.fullName}
                </div>
                <div className="text-[10px] text-text-muted font-mono">
                  {pickedPerson.uniqueId}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPickedPerson(null)}
                className="text-text-muted hover:text-status-red"
                aria-label="Clear hint"
              >
                <IconX size={14} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
                <IconSearch size={14} />
              </span>
              <input
                type="search"
                value={hintInput}
                onChange={(e) => setHintInput(e.target.value)}
                placeholder="Search by name or JS-id…"
                className="w-full pl-8 pr-2 py-1.5 text-xs border border-border rounded bg-white focus:outline-none focus:border-primary"
              />
              {hintSuggest.length > 0 && (
                <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-border rounded shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                  {hintSuggest.map((p) => (
                    <li
                      key={p.id}
                      onMouseDown={() => {
                        setPickedPerson(p);
                        setHintInput('');
                        setHintQuery('');
                        setHintSuggest([]);
                      }}
                      className="px-2 py-1.5 text-xs cursor-pointer hover:bg-surface-subtle flex items-center gap-2"
                    >
                      <div className="w-6 h-6 shrink-0 rounded-full bg-surface-subtle border border-border overflow-hidden flex items-center justify-center text-text-muted">
                        {p.photoUrl ? (
                          <img
                            src={p.photoUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <IconUser size={10} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-navy truncate">
                          {p.fullName}
                        </div>
                        <div className="text-[10px] text-text-muted font-mono">
                          {p.uniqueId}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Create Event modal ------------------------------------------------
function CreateEventModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (ev: EventListItem) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [name, setName] = useState('');
  const [type, setType] = useState<EventType>(EventType.MEETING);
  const [date, setDate] = useState(
    new Date(Date.now() + 3600_000).toISOString().slice(0, 16),
  );
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.blockId && user?.role !== AdminRole.SUPER_ADMIN) {
      toast.error('No block assigned — cannot create event.');
      return;
    }
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSubmitting(true);
    try {
      const ev = await eventsApi.create({
        name: name.trim(),
        type,
        date: new Date(date).toISOString(),
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        blockId: user?.blockId ?? '',
        wardId: user?.wardId ?? undefined,
        boothId: user?.boothId ?? undefined,
      });
      // Backend returns an EventListItem-shaped object with _count may be missing,
      // so defensively backfill _count if not present.
      onCreated({
        ...ev,
        _count: (ev as any)._count ?? { attendances: 0 },
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Create failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded shadow-lg w-full max-w-md overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-navy">New event</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-navy"
            aria-label="Close"
          >
            <IconX size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
              placeholder="e.g. Ward Rally - Oct 10"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as EventType)}
                className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
              >
                {Object.values(EventType).map((t) => (
                  <option key={t} value={t}>
                    {EVENT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                When
              </label>
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
              Location (optional)
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
              placeholder="Community Hall, Ward 3"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="px-5 py-3 bg-surface-subtle flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm font-semibold text-text-secondary hover:text-navy"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

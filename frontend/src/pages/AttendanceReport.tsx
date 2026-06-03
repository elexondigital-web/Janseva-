import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  attendanceApi,
  type AttendanceStats,
  type EventAttendee,
} from '../api/attendance.api';
import { eventsApi, type EventDetail } from '../api/events.api';
import { AttendanceMethod, EventType } from '../types';
import {
  IconActivity,
  IconCheckCircle,
  IconAlertTriangle,
  IconDownload,
  IconUser,
  IconMapPin,
  IconUsers,
} from '../components/ui/Icon';

const EVENT_TYPE_LABEL: Record<EventType, string> = {
  RALLY: 'Rally',
  MEETING: 'Meeting',
  FUNCTION: 'Function',
  GET_TOGETHER: 'Get-together',
};

export default function AttendanceReport() {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [ev, st, att] = await Promise.all([
          eventsApi.get(eventId),
          attendanceApi.stats(eventId),
          attendanceApi.listForEvent(eventId, { limit: 500 }),
        ]);
        if (cancelled) return;
        setEvent(ev);
        setStats(st);
        setAttendees(att.items);
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? 'Failed to load report');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const maxWard = useMemo(
    () => Math.max(1, ...(stats?.byWard.map((w) => w.count) ?? [1])),
    [stats],
  );
  const maxBooth = useMemo(
    () => Math.max(1, ...(stats?.byBooth.map((b) => b.count) ?? [1])),
    [stats],
  );

  function onExportCsv() {
    if (!attendees.length || !event) return;
    const rows = [
      ['Name', 'Unique ID', 'Phone', 'Ward', 'Booth', 'Method', 'Marked at'],
      ...attendees.map((a) => [
        a.person.fullName,
        a.person.uniqueId,
        a.person.phone,
        a.person.ward?.name ?? '',
        a.person.booth?.name ?? '',
        a.method,
        new Date(a.markedAt).toISOString(),
      ]),
    ];
    const csv = rows
      .map((r) =>
        r
          .map((c) => {
            const s = String(c ?? '');
            return s.includes(',') || s.includes('"')
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(','),
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${event.name.replace(/[^a-z0-9]+/gi, '-')}-${new Date(event.date).toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface px-6 py-8 flex items-center justify-center">
        <div className="text-sm text-text-muted">Loading report…</div>
      </div>
    );
  }

  if (!event || !stats) {
    return (
      <div className="min-h-screen bg-surface px-6 py-8 flex items-center justify-center">
        <div className="text-sm text-text-muted">Event not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface px-6 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Breadcrumb */}
        <div className="text-[11px] text-text-muted mb-2">
          <Link to="/attendance" className="hover:text-primary">
            Attendance
          </Link>{' '}
          / <span className="text-navy">Report</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-text-muted">
              {EVENT_TYPE_LABEL[event.type]}
            </div>
            <h1 className="text-2xl font-bold text-navy tracking-tight">
              {event.name}
            </h1>
            <div className="text-sm text-text-secondary mt-1">
              {new Date(event.date).toLocaleString('en-IN', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {event.location && (
                <span className="ml-3 inline-flex items-center gap-1">
                  <IconMapPin size={12} /> {event.location}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onExportCsv}
            disabled={attendees.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            <IconDownload size={14} /> Export CSV
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KpiCard
            label="Expected"
            value={stats.expected}
            icon={<IconUsers size={18} />}
            tone="navy"
          />
          <KpiCard
            label="Present"
            value={stats.present}
            icon={<IconCheckCircle size={18} />}
            tone="green"
          />
          <KpiCard
            label="Absent"
            value={stats.absent}
            icon={<IconAlertTriangle size={18} />}
            tone="amber"
          />
          <KpiCard
            label="Turnout"
            value={`${stats.percentage}%`}
            icon={<IconActivity size={18} />}
            tone="primary"
          />
        </div>

        {/* By Ward + By Booth */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white border border-border rounded shadow-card p-5">
            <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">
              By Ward
            </h2>
            {stats.byWard.length === 0 ? (
              <div className="text-xs text-text-muted py-4">No attendees yet.</div>
            ) : (
              <ul className="space-y-2">
                {stats.byWard.map((w) => (
                  <li key={w.wardId}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="font-semibold text-navy truncate">
                        {w.wardName ?? '—'}
                      </span>
                      <span className="text-text-muted font-mono">{w.count}</span>
                    </div>
                    <div className="h-2 bg-surface-subtle rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${(w.count / maxWard) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white border border-border rounded shadow-card p-5">
            <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">
              By Booth
            </h2>
            {stats.byBooth.length === 0 ? (
              <div className="text-xs text-text-muted py-4">No attendees yet.</div>
            ) : (
              <ul className="space-y-2">
                {stats.byBooth.map((b) => (
                  <li key={b.boothId}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="font-semibold text-navy truncate">
                        {b.boothName ?? '—'}
                      </span>
                      <span className="text-text-muted font-mono">{b.count}</span>
                    </div>
                    <div className="h-2 bg-surface-subtle rounded-full overflow-hidden">
                      <div
                        className="h-full bg-navy transition-all"
                        style={{ width: `${(b.count / maxBooth) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* By method + attendee table */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white border border-border rounded shadow-card p-5">
            <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">
              By Method
            </h2>
            <div className="space-y-2">
              <MethodRow
                label="QR scan"
                count={stats.byMethod.QR}
                total={stats.present}
                tone="primary"
              />
              <MethodRow
                label="Fingerprint"
                count={stats.byMethod.FINGERPRINT}
                total={stats.present}
                tone="amber"
              />
              <MethodRow
                label="Manual"
                count={stats.byMethod.MANUAL}
                total={stats.present}
                tone="muted"
              />
            </div>
          </div>

          <div className="lg:col-span-2 bg-white border border-border rounded shadow-card p-5">
            <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">
              Attendees ({attendees.length})
            </h2>
            {attendees.length === 0 ? (
              <div className="text-xs text-text-muted py-6 text-center">
                Nobody marked yet.
              </div>
            ) : (
              <div className="overflow-auto max-h-[480px]">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-text-muted border-b border-border">
                    <tr>
                      <th className="text-left py-2 pr-2">Name</th>
                      <th className="text-left py-2 px-2">Ward / Booth</th>
                      <th className="text-left py-2 px-2">Method</th>
                      <th className="text-left py-2 pl-2">Marked at</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {attendees.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 shrink-0 rounded-full bg-surface-subtle border border-border overflow-hidden flex items-center justify-center text-text-muted">
                              {a.person.photoUrl ? (
                                <img
                                  src={a.person.photoUrl}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <IconUser size={10} />
                              )}
                            </div>
                            <div className="min-w-0">
                              <Link
                                to={`/people/${a.personId}`}
                                className="font-semibold text-navy hover:text-primary truncate"
                              >
                                {a.person.fullName}
                              </Link>
                              <div className="text-[10px] font-mono text-text-muted">
                                {a.person.uniqueId}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-text-secondary">
                          {a.person.ward?.name ?? '—'} /{' '}
                          {a.person.booth?.name ?? '—'}
                        </td>
                        <td className="py-2 px-2">
                          <MethodBadge method={a.method} />
                        </td>
                        <td className="py-2 pl-2 text-text-secondary">
                          {new Date(a.markedAt).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone: 'navy' | 'primary' | 'green' | 'amber';
}) {
  const toneCls = {
    navy: 'bg-navy/5 text-navy',
    primary: 'bg-primary/10 text-primary',
    green: 'bg-status-green-bg text-status-green',
    amber: 'bg-status-amber-bg text-status-amber',
  }[tone];
  return (
    <div className="bg-white border border-border rounded shadow-card p-4">
      <div className="flex items-start justify-between">
        <div className={`w-8 h-8 rounded flex items-center justify-center ${toneCls}`}>
          {icon}
        </div>
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div className="text-2xl font-bold text-navy mt-0.5">{value}</div>
    </div>
  );
}

function MethodRow({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: 'primary' | 'amber' | 'muted';
}) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  const bar =
    tone === 'primary'
      ? 'bg-primary'
      : tone === 'amber'
        ? 'bg-status-amber'
        : 'bg-text-muted';
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-0.5">
        <span className="font-semibold text-navy">{label}</span>
        <span className="text-text-muted font-mono">
          {count} <span className="text-text-muted/60">({pct}%)</span>
        </span>
      </div>
      <div className="h-2 bg-surface-subtle rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
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

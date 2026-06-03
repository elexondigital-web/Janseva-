import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth.store';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  dashboardApi,
  type DashboardStats,
  type RecentMember,
} from '../api/dashboard.api';
import { eventsApi, type EventListItem } from '../api/events.api';
import { reportsApi, type OverviewReport } from '../api/reports.api';
import { EventType } from '../types';
import {
  IconUsers,
  IconBuilding,
  IconMapPin,
  IconCheckCircle,
  IconCreditCard,
  IconTrendingUp,
  IconActivity,
  IconPlus,
  IconUser,
  IconMessageSquare,
  IconSend,
} from '../components/ui/Icon';

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  usePageTitle('Dashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentEvents, setRecentEvents] = useState<EventListItem[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<EventListItem[]>([]);
  const [reportOverview, setReportOverview] = useState<OverviewReport | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      try {
        const [s, past, upcoming] = await Promise.all([
          dashboardApi.getStats(),
          eventsApi.list({ when: 'past', limit: 5 }),
          eventsApi.list({ when: 'upcoming', limit: 3 }),
        ]);
        setStats(s);
        setRecentEvents(past.items);
        setUpcomingEvents(upcoming.items);
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? 'Failed to load stats');
      } finally {
        setLoading(false);
      }
      // Reports overview is non-blocking — Dashboard renders fine without it.
      try {
        setReportOverview(await reportsApi.overview());
      } catch {
        setReportOverview(null);
      }
    })();
  }, []);

  if (loading || !stats) {
    return (
      <div className="px-6 py-10 flex items-center justify-center text-text-muted">
        Loading dashboard…
      </div>
    );
  }

  const t = stats.totals;
  const greeting = getGreeting();

  return (
    <div className="px-4 md:px-6 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy tracking-tight">
            {greeting}, {user?.name?.split(' ')[0] ?? 'Admin'}
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Here's what's happening across your constituency today.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <Link
            to="/messaging"
            className="inline-flex items-center gap-1.5 border border-border bg-white text-navy hover:border-primary hover:text-primary text-sm font-semibold px-3.5 py-2 rounded transition-colors"
          >
            <IconSend size={14} /> Send quick message
          </Link>
          <Link
            to="/people/new"
            className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-4 py-2 rounded transition-colors"
          >
            <IconPlus size={16} /> Add Member
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-6">
        <KpiCard
          icon={<IconUsers size={18} />}
          label="Total Members"
          value={t.totalMembers}
          sub={`${t.activeMembers} active`}
          tone="primary"
        />
        <KpiCard
          icon={<IconTrendingUp size={18} />}
          label="New this month"
          value={t.newThisMonth}
          sub={`${t.newLast30Days} in last 30 days`}
          tone="green"
        />
        <KpiCard
          icon={<IconCreditCard size={18} />}
          label="ID Cards Issued"
          value={t.withIdCard}
          sub={pct(t.withIdCard, t.totalMembers)}
          tone="amber"
        />
        <KpiCard
          icon={<IconMessageSquare size={18} />}
          label="Messages this month"
          value={reportOverview?.messagesThisMonth ?? 0}
          sub={
            reportOverview
              ? `${reportOverview.activeBoothWorkers} booth workers`
              : 'Loading…'
          }
          tone="primary"
        />
        <KpiCard
          icon={<IconCheckCircle size={18} />}
          label="Pending approval"
          value={t.pendingMembers}
          sub={t.pendingMembers === 0 ? 'All up to date' : 'Needs attention'}
          tone="red"
        />
      </div>

      {/* Hierarchy strip */}
      <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6">
        <MiniStat
          icon={<IconBuilding size={16} />}
          label="Blocks"
          value={t.totalBlocks}
        />
        <MiniStat
          icon={<IconMapPin size={16} />}
          label="Wards"
          value={t.totalWards}
        />
        <MiniStat
          icon={<IconActivity size={16} />}
          label="Booths"
          value={t.totalBooths}
        />
      </div>

      {/* 3-column grid: breakdowns + recent members */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: breakdowns */}
        <div className="lg:col-span-2 space-y-4">
          <Panel title="Member Breakdown">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <BreakdownColumn title="By Status" rows={stats.byStatus} palette={STATUS_COLORS} />
              <BreakdownColumn title="By Gender" rows={stats.byGender} palette={GENDER_COLORS} />
              <BreakdownColumn title="By Role" rows={stats.byRole} palette={ROLE_COLORS} />
            </div>
          </Panel>

          {stats.topBlocks.length > 0 && (
            <Panel title="Members by Block">
              <div className="space-y-2">
                {stats.topBlocks.map((b) => {
                  const max = stats.topBlocks[0]?.count || 1;
                  const width = max > 0 ? Math.round((b.count / max) * 100) : 0;
                  return (
                    <div key={b.id} className="flex items-center gap-3">
                      <div className="w-32 text-sm text-navy truncate shrink-0">
                        {b.name}
                      </div>
                      <div className="flex-1 bg-surface-subtle rounded-sm h-6 overflow-hidden relative">
                        <div
                          className="h-full bg-primary/70 transition-all"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <div className="w-12 text-right text-sm font-mono text-navy">
                        {b.count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>

        {/* Right: recent members + events */}
        <div className="space-y-4">
          {/* Last-event turnout summary */}
          {recentEvents.length > 0 && (
            <Panel
              title="Last event turnout"
              action={
                <Link
                  to={`/attendance/${recentEvents[0].id}/report`}
                  className="text-xs text-primary hover:text-primary-dark font-semibold"
                >
                  Report →
                </Link>
              }
            >
              <LastEventCard ev={recentEvents[0]} />
            </Panel>
          )}

          <Panel
            title="Recent Members"
            action={
              <Link
                to="/people"
                className="text-xs text-primary hover:text-primary-dark font-semibold"
              >
                View all →
              </Link>
            }
          >
            {stats.recentMembers.length === 0 ? (
              <div className="text-sm text-text-muted py-8 text-center">
                No members yet
              </div>
            ) : (
              <div className="space-y-1">
                {stats.recentMembers.map((m) => (
                  <RecentMemberRow key={m.id} m={m} />
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Upcoming events"
            action={
              <Link
                to="/attendance"
                className="text-xs text-primary hover:text-primary-dark font-semibold"
              >
                All events →
              </Link>
            }
          >
            {upcomingEvents.length === 0 && recentEvents.length === 0 ? (
              <div className="text-sm text-text-muted py-6 text-center">
                No events scheduled
              </div>
            ) : (
              <div className="space-y-1">
                {upcomingEvents.map((e) => (
                  <EventRow key={e.id} e={e} tone="upcoming" />
                ))}
                {upcomingEvents.length === 0 &&
                  recentEvents.slice(0, 3).map((e) => (
                    <EventRow key={e.id} e={e} tone="past" />
                  ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function LastEventCard({ ev }: { ev: EventListItem }) {
  // We don't have a dashboard stat endpoint, so derive a rough turnout-sort
  // metric from the in-row attendance count only. The Report page has the
  // authoritative numbers.
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-text-muted">
        {EVENT_TYPE_LABEL[ev.type]}
      </div>
      <div className="text-sm font-bold text-navy truncate">{ev.name}</div>
      <div className="text-[11px] text-text-muted mt-0.5">
        {new Date(ev.date).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="text-2xl font-bold text-navy tracking-tight">
          {ev._count.attendances}
        </div>
        <div className="text-[11px] text-text-secondary">attendees marked</div>
      </div>
    </div>
  );
}

function EventRow({
  e,
  tone,
}: {
  e: EventListItem;
  tone: 'upcoming' | 'past';
}) {
  const d = new Date(e.date);
  return (
    <Link
      to={
        tone === 'upcoming'
          ? `/attendance?eventId=${e.id}`
          : `/attendance/${e.id}/report`
      }
      className="flex items-center gap-3 px-2 py-2 -mx-2 rounded hover:bg-surface-subtle/60 transition-colors"
    >
      <div
        className={`w-10 shrink-0 text-center py-1 rounded ${
          tone === 'upcoming'
            ? 'bg-primary/10 text-primary'
            : 'bg-surface-subtle text-text-secondary'
        }`}
      >
        <div className="text-[9px] uppercase leading-tight">
          {d.toLocaleDateString('en-IN', { month: 'short' })}
        </div>
        <div className="text-sm font-bold leading-tight">{d.getDate()}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-navy truncate">{e.name}</div>
        <div className="text-[11px] text-text-muted truncate">
          {EVENT_TYPE_LABEL[e.type]}
          {e.location && ` · ${e.location}`}
        </div>
      </div>
      {tone === 'past' && (
        <div className="text-[10px] text-text-muted shrink-0">
          {e._count.attendances}
        </div>
      )}
    </Link>
  );
}

const EVENT_TYPE_LABEL: Record<EventType, string> = {
  RALLY: 'Rally',
  MEETING: 'Meeting',
  FUNCTION: 'Function',
  GET_TOGETHER: 'Get-together',
};

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  tone: 'primary' | 'green' | 'amber' | 'red';
}) {
  const tones: Record<typeof tone, string> = {
    primary: 'bg-primary-bg text-primary',
    green: 'bg-status-green-bg text-status-green',
    amber: 'bg-status-amber-bg text-status-amber',
    red: 'bg-status-red-bg text-status-red',
  };
  return (
    <div className="bg-white border border-border rounded shadow-card p-4">
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded flex items-center justify-center ${tones[tone]}`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-navy mt-3 tracking-tight">
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-text-secondary mt-0.5">{label}</div>
      <div className="text-[11px] text-text-muted mt-1">{sub}</div>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-white border border-border rounded shadow-card px-4 py-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded bg-primary-bg text-primary flex items-center justify-center">
        {icon}
      </div>
      <div>
        <div className="text-lg font-bold text-navy leading-tight">{value}</div>
        <div className="text-[11px] text-text-muted uppercase tracking-wide">
          {label}
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-border rounded shadow-card">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide">
          {title}
        </h2>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function BreakdownColumn({
  title,
  rows,
  palette,
}: {
  title: string;
  rows: { label: string; value: number }[];
  palette: Record<string, string>;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div>
      <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-3">
        {title}
      </div>
      <div className="space-y-2">
        {rows.map((r) => {
          const width = total > 0 ? Math.round((r.value / total) * 100) : 0;
          const color = palette[r.label] ?? 'bg-primary';
          return (
            <div key={r.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-navy">{r.label}</span>
                <span className="text-text-muted font-mono">
                  {r.value} · {width}%
                </span>
              </div>
              <div className="h-1.5 bg-surface-subtle rounded-sm overflow-hidden">
                <div
                  className={`${color} h-full transition-all`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecentMemberRow({ m }: { m: RecentMember }) {
  const when = timeSince(new Date(m.createdAt));
  return (
    <Link
      to={`/people/${m.id}`}
      className="flex items-center gap-3 px-2 py-2 -mx-2 rounded hover:bg-surface-subtle/60 transition-colors"
    >
      <div className="w-8 h-8 shrink-0 rounded-full bg-surface-subtle border border-border overflow-hidden flex items-center justify-center text-text-muted">
        {m.photoUrl ? (
          <img src={m.photoUrl} alt={m.fullName} className="w-full h-full object-cover" />
        ) : (
          <IconUser size={14} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-navy truncate">{m.fullName}</div>
        <div className="text-[11px] text-text-muted truncate">
          {m.booth?.name ?? '—'} · {m.ward?.name ?? ''}
        </div>
      </div>
      <div className="text-[10px] text-text-muted shrink-0">{when}</div>
    </Link>
  );
}

const GENDER_COLORS: Record<string, string> = {
  Male: 'bg-primary',
  Female: 'bg-status-amber',
  Other: 'bg-text-muted',
};

const ROLE_COLORS: Record<string, string> = {
  Members: 'bg-primary',
  'Booth Workers': 'bg-primary-light',
  'Ward Admins': 'bg-status-amber',
  'Block Admins': 'bg-status-green',
};

const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-status-green',
  Inactive: 'bg-text-muted',
  Pending: 'bg-status-amber',
};

function pct(part: number, whole: number): string {
  if (whole === 0) return '—';
  return `${Math.round((part / whole) * 100)}% of members`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function timeSince(date: Date): string {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

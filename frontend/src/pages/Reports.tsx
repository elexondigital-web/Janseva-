import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useAuthStore } from '../store/auth.store';
import {
  reportsApi,
  type OverviewReport,
  type AttendanceTrendItem,
  type DemographicsReport,
  type WardPerformanceItem,
  type TopMemberItem,
} from '../api/reports.api';
import { auditApi, type AuditLogRecord } from '../api/audit.api';
import { AdminRole } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  IconBarChart,
  IconDownload,
  IconTrendingUp,
  IconUsers,
  IconActivity,
  IconMessageSquare,
  IconCheckCircle,
  IconAlertTriangle,
} from '../components/ui/Icon';

type SortField = 'wardName' | 'members' | 'avgAttendance' | 'lastEventAttendance';
type SortDir = 'asc' | 'desc';

export default function Reports() {
  const user = useAuthStore((s) => s.user);
  usePageTitle('Reports');
  const blockId =
    user?.role === AdminRole.SUPER_ADMIN ? user?.blockId ?? undefined : undefined;

  const [overview, setOverview] = useState<OverviewReport | null>(null);
  const [attendance, setAttendance] = useState<AttendanceTrendItem[]>([]);
  const [demographics, setDemographics] = useState<DemographicsReport | null>(
    null,
  );
  const [wardPerf, setWardPerf] = useState<WardPerformanceItem[]>([]);
  const [topMembers, setTopMembers] = useState<TopMemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<
    null | 'overview' | 'attendance' | 'demographics'
  >(null);

  const [sortField, setSortField] = useState<SortField>('avgAttendance');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const loadAll = useCallback(async () => {
    setLoading(true);
    // Run all 5 calls in parallel; failures are swallowed per-section so a
    // single bad query doesn't blank the page.
    const tasks: Promise<unknown>[] = [
      reportsApi.overview(blockId).then(setOverview).catch(() => setOverview(null)),
      reportsApi
        .attendance(blockId, 8)
        .then(setAttendance)
        .catch(() => setAttendance([])),
      reportsApi
        .demographics(blockId)
        .then(setDemographics)
        .catch(() => setDemographics(null)),
      reportsApi
        .wardPerformance(blockId)
        .then(setWardPerf)
        .catch(() => setWardPerf([])),
      reportsApi
        .topMembers(blockId, 10)
        .then(setTopMembers)
        .catch(() => setTopMembers([])),
    ];
    await Promise.allSettled(tasks);
    setLoading(false);
  }, [blockId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function onExport(type: 'overview' | 'attendance' | 'demographics') {
    setExporting(type);
    try {
      const blob = await reportsApi.exportPdf(type, blockId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `janseva-${type}-${new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, '')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Export failed');
    } finally {
      setExporting(null);
    }
  }

  const sortedWardPerf = useMemo(() => {
    const copy = [...wardPerf];
    copy.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc'
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      return sortDir === 'asc'
        ? Number(av) - Number(bv)
        : Number(bv) - Number(av);
    });
    return copy;
  }, [wardPerf, sortField, sortDir]);

  function toggleSort(f: SortField) {
    if (sortField === f) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(f);
      setSortDir(f === 'wardName' ? 'asc' : 'desc');
    }
  }

  return (
    <div className="min-h-screen bg-surface px-6 py-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-navy tracking-tight flex items-center gap-2">
              <IconBarChart size={22} /> Reports
            </h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Analytics across membership, attendance, demographics and ward
              performance. Numbers refresh every few minutes via in-memory cache.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ExportMenu onExport={onExport} exporting={exporting} />
          </div>
        </div>

        {/* Section 1: Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCard
            label="Total members"
            value={overview?.totalMembers ?? 0}
            sub={
              overview
                ? `${overview.growthPercent >= 0 ? '+' : ''}${overview.growthPercent}% MoM`
                : undefined
            }
            subPositive={(overview?.growthPercent ?? 0) >= 0}
            icon={<IconUsers size={16} />}
            loading={loading}
          />
          <SummaryCard
            label="Avg event attendance"
            value={`${overview?.avgAttendancePercent ?? 0}%`}
            sub={
              attendance.length > 0
                ? `over last ${attendance.length} events`
                : undefined
            }
            icon={<IconActivity size={16} />}
            loading={loading}
          />
          <SummaryCard
            label="Messages this month"
            value={overview?.messagesThisMonth ?? 0}
            icon={<IconMessageSquare size={16} />}
            loading={loading}
          />
          <SummaryCard
            label="Active booth workers"
            value={overview?.activeBoothWorkers ?? 0}
            icon={<IconCheckCircle size={16} />}
            loading={loading}
          />
        </div>

        {/* Section 2: Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-white border border-border rounded shadow-card p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-navy uppercase tracking-wide">
                Attendance trend
              </h2>
              <span className="text-[11px] text-text-muted">
                last {attendance.length} events
              </span>
            </div>
            {attendance.length === 0 ? (
              <ChartEmpty label="No events yet" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={attendance.map((a) => ({
                    name:
                      a.eventName.length > 12
                        ? a.eventName.slice(0, 12) + '…'
                        : a.eventName,
                    fullName: a.eventName,
                    date: a.date,
                    attended: a.attended,
                    invited: a.invited,
                    turnout: a.turnout,
                  }))}
                  margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
                >
                  <CartesianGrid stroke="#eef0f3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    fontSize={10}
                    stroke="#5E6773"
                    tickLine={false}
                  />
                  <YAxis fontSize={10} stroke="#5E6773" tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      fontSize: 11,
                      borderRadius: 6,
                      border: '1px solid #dde1e7',
                    }}
                    formatter={(v: number, k: string) =>
                      k === 'attended' ? [v, 'Present'] : [v, k]
                    }
                    labelFormatter={(_, items) => {
                      const item = items?.[0]?.payload;
                      if (!item) return '';
                      const d = new Date(item.date);
                      return `${item.fullName} · ${d.toLocaleDateString(
                        'en-IN',
                        { day: '2-digit', month: 'short' },
                      )} · ${item.turnout}% turnout`;
                    }}
                  />
                  <Bar dataKey="attended" fill="#087EA4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white border border-border rounded shadow-card p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-navy uppercase tracking-wide">
                Demographics — gender
              </h2>
            </div>
            <DemographicsDonut data={demographics} />
          </div>
        </div>

        {/* Section 3: Ward performance */}
        <div className="bg-white border border-border rounded shadow-card p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-navy uppercase tracking-wide">
              Ward performance
            </h2>
            <span className="text-[11px] text-text-muted">
              {wardPerf.length} wards
            </span>
          </div>
          {wardPerf.length === 0 && !loading ? (
            <div className="py-8 text-center text-xs text-text-muted">
              No ward data available.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wide border-b border-border">
                    <th className="pb-2 pr-3">
                      <SortHeader
                        label="Ward"
                        active={sortField === 'wardName'}
                        dir={sortDir}
                        onClick={() => toggleSort('wardName')}
                      />
                    </th>
                    <th className="pb-2 px-3 text-right">
                      <SortHeader
                        label="Members"
                        active={sortField === 'members'}
                        dir={sortDir}
                        onClick={() => toggleSort('members')}
                      />
                    </th>
                    <th className="pb-2 px-3 text-right">
                      <SortHeader
                        label="Avg %"
                        active={sortField === 'avgAttendance'}
                        dir={sortDir}
                        onClick={() => toggleSort('avgAttendance')}
                      />
                    </th>
                    <th className="pb-2 px-3 text-right">
                      <SortHeader
                        label="Last event %"
                        active={sortField === 'lastEventAttendance'}
                        dir={sortDir}
                        onClick={() => toggleSort('lastEventAttendance')}
                      />
                    </th>
                    <th className="pb-2 pl-3 text-right">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedWardPerf.map((w) => (
                    <tr
                      key={w.wardId}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-2 pr-3 font-semibold text-navy">
                        {w.wardName}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {w.members.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {w.avgAttendance}%
                      </td>
                      <td className="py-2 px-3 text-right">
                        <PercentBadge value={w.lastEventAttendance} />
                      </td>
                      <td className="py-2 pl-3 text-right">
                        <TrendArrow trend={w.trend} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 4: Age + Category */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-white border border-border rounded shadow-card p-5">
            <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">
              Age groups
            </h2>
            {!demographics ? (
              <ChartEmpty label="Loading…" />
            ) : (
              <HorizontalBars
                rows={[
                  { label: '18-35', value: demographics.age['18-35'] },
                  { label: '36-55', value: demographics.age['36-55'] },
                  { label: '55+', value: demographics.age['55+'] },
                  ...(demographics.age.unknown > 0
                    ? [{ label: 'Unknown', value: demographics.age.unknown }]
                    : []),
                ]}
              />
            )}
          </div>
          <div className="bg-white border border-border rounded shadow-card p-5">
            <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">
              Category
            </h2>
            {!demographics ? (
              <ChartEmpty label="Loading…" />
            ) : (
              <HorizontalBars
                rows={[
                  { label: 'General', value: demographics.category.GENERAL },
                  { label: 'OBC', value: demographics.category.OBC },
                  { label: 'SC', value: demographics.category.SC },
                  { label: 'ST', value: demographics.category.ST },
                ]}
              />
            )}
          </div>
        </div>

        {/* Section 5: Top members */}
        {topMembers.length > 0 && (
          <div className="bg-white border border-border rounded shadow-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-navy uppercase tracking-wide">
                Top members by attendance
              </h2>
              <span className="text-[11px] text-text-muted">
                Across {topMembers[0].totalEvents.toLocaleString('en-IN')} events
              </span>
            </div>
            <ul className="divide-y divide-border">
              {topMembers.map((m, i) => (
                <li
                  key={m.personId}
                  className="py-2 flex items-center gap-3 text-sm"
                >
                  <div className="w-6 text-[11px] text-text-muted font-mono text-right">
                    #{i + 1}
                  </div>
                  <div className="font-semibold text-navy flex-1 truncate">
                    {m.fullName}
                  </div>
                  <div className="text-[11px] text-text-muted font-mono">
                    {m.uniqueId}
                  </div>
                  <div className="text-[11px] text-text-muted hidden md:block">
                    {m.wardName ?? '—'} · {m.boothName ?? '—'}
                  </div>
                  <div className="font-semibold text-primary">
                    {m.attendanceRate}%
                  </div>
                  <div className="text-[10px] text-text-muted w-16 text-right">
                    {m.attendedEvents}/{m.totalEvents}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Section 6: Audit log (admins only) */}
        {(user?.role === AdminRole.SUPER_ADMIN ||
          user?.role === AdminRole.BLOCK_ADMIN) && (
          <div className="mt-6">
            <AuditLogSection />
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Audit log section ------------------------------------------------

function AuditLogSection() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AuditLogRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Cheap action picker — populated from a static list of well-known
  // actions emitted by AuditService. (We don't ask the server for the
  // distinct set so the dropdown stays snappy regardless of log volume.)
  const ACTIONS = [
    '',
    'LOGIN',
    'LOGOUT',
    'CREATE_PERSON',
    'UPDATE_PERSON',
    'DELETE_PERSON',
    'ENROLL_FINGERPRINT',
    'CREATE_ADMIN',
    'UPDATE_ADMIN',
    'DEACTIVATE_ADMIN',
    'RESET_PASSWORD',
    'SEND_MESSAGE',
    'MARK_ATTENDANCE',
    'UNMARK_ATTENDANCE',
  ];

  const load = async () => {
    setLoading(true);
    try {
      const res = await auditApi.list({
        page,
        limit: 25,
        action: actionFilter || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to + 'T23:59:59').toISOString() : undefined,
      });
      setItems(res.items);
      setTotalPages(res.totalPages);
    } catch {
      setItems([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page, actionFilter, from, to]);

  return (
    <div className="bg-white border border-border rounded shadow-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-surface-subtle/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide">
            Activity log
          </h2>
          <span className="text-[11px] text-text-muted">
            (admin actions)
          </span>
        </div>
        <span className="text-text-muted text-xs">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="border-t border-border p-5">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                Action
              </label>
              <select
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 text-xs border border-border rounded bg-white focus:outline-none focus:border-primary"
              >
                {ACTIONS.map((a) => (
                  <option key={a || 'all'} value={a}>
                    {a || 'All actions'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                From
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 text-xs border border-border rounded bg-white focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                To
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 text-xs border border-border rounded bg-white focus:outline-none focus:border-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setActionFilter('');
                setFrom('');
                setTo('');
                setPage(1);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-primary"
            >
              Clear
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wide border-b border-border">
                  <th className="pb-2 pr-3">When</th>
                  <th className="pb-2 px-3">Admin</th>
                  <th className="pb-2 px-3">Action</th>
                  <th className="pb-2 px-3">Entity</th>
                  <th className="pb-2 pl-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-6 text-center text-xs text-text-muted"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-6 text-center text-xs text-text-muted"
                    >
                      No log entries match these filters.
                    </td>
                  </tr>
                ) : (
                  items.map((it) => (
                    <tr
                      key={it.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-2 pr-3 text-[11px] text-text-secondary tabular-nums">
                        {new Date(it.createdAt).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-navy text-[12px]">
                          {it.adminName}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <span className="text-[10px] font-mono uppercase bg-surface-subtle border border-border rounded px-1.5 py-0.5 text-text-secondary">
                          {it.action}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[11px] text-text-secondary">
                        {it.entity}
                        {it.entityId && (
                          <span className="block text-[10px] text-text-muted font-mono truncate max-w-[180px]">
                            {it.entityId}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pl-3 text-[11px] text-text-secondary truncate max-w-[280px]">
                        {it.details}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 text-xs">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 border border-border rounded disabled:opacity-30 hover:border-primary hover:text-primary"
              >
                ← Prev
              </button>
              <span className="text-text-muted">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2 py-1 border border-border rounded disabled:opacity-30 hover:border-primary hover:text-primary"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- helpers -----------------------------------------------------------

function SummaryCard({
  label,
  value,
  sub,
  subPositive,
  icon,
  loading,
}: {
  label: string;
  value: string | number;
  sub?: string;
  subPositive?: boolean;
  icon: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="bg-white border border-border rounded shadow-card p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-bold text-navy mt-1.5 tabular-nums">
        {loading
          ? '…'
          : typeof value === 'number'
            ? value.toLocaleString('en-IN')
            : value}
      </div>
      {sub && (
        <div
          className={`text-[11px] mt-0.5 ${
            subPositive === false ? 'text-status-red' : 'text-status-green'
          } inline-flex items-center gap-1`}
        >
          {subPositive !== false && <IconTrendingUp size={11} />}
          {sub}
        </div>
      )}
    </div>
  );
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="h-[240px] flex items-center justify-center text-xs text-text-muted">
      {label}
    </div>
  );
}

function DemographicsDonut({ data }: { data: DemographicsReport | null }) {
  if (!data) return <ChartEmpty label="Loading…" />;
  const total =
    data.gender.MALE + data.gender.FEMALE + data.gender.OTHER;
  if (total === 0) return <ChartEmpty label="No demographic data" />;
  const slices = [
    { name: 'Male', value: data.gender.MALE, color: '#087EA4' },
    { name: 'Female', value: data.gender.FEMALE, color: '#149ECA' },
    { name: 'Other', value: data.gender.OTHER, color: '#99A1AD' },
  ].filter((s) => s.value > 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
      <div className="sm:col-span-2">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={75}
              paddingAngle={2}
              stroke="none"
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                fontSize: 11,
                borderRadius: 6,
                border: '1px solid #dde1e7',
              }}
              formatter={(v: number) => v.toLocaleString('en-IN')}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1.5 text-xs">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-text-secondary">{s.name}</span>
            <span className="ml-auto font-semibold text-navy tabular-nums">
              {s.value.toLocaleString('en-IN')}
            </span>
            <span className="text-text-muted text-[10px] tabular-nums">
              {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HorizontalBars({
  rows,
}: {
  rows: { label: string; value: number }[];
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between text-[11px] text-text-secondary mb-1">
            <span className="font-semibold text-navy">{r.label}</span>
            <span className="tabular-nums">
              {r.value.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-subtle overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-0.5 hover:text-primary transition-colors ${
        active ? 'text-primary' : ''
      }`}
    >
      {label}
      {active && <span>{dir === 'asc' ? ' ▲' : ' ▼'}</span>}
    </button>
  );
}

function PercentBadge({ value }: { value: number }) {
  const cls =
    value >= 80
      ? 'bg-status-green-bg text-status-green'
      : value >= 60
        ? 'bg-status-amber-bg text-status-amber'
        : 'bg-status-red-bg text-status-red';
  return (
    <span
      className={`text-[11px] font-semibold rounded px-1.5 py-0.5 ${cls} tabular-nums`}
    >
      {value}%
    </span>
  );
}

function TrendArrow({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up')
    return (
      <span className="text-status-green inline-flex items-center gap-0.5 text-xs">
        <IconTrendingUp size={12} /> up
      </span>
    );
  if (trend === 'down')
    return (
      <span className="text-status-red inline-flex items-center gap-0.5 text-xs">
        <IconAlertTriangle size={12} /> down
      </span>
    );
  return <span className="text-text-muted text-xs">—</span>;
}

function ExportMenu({
  onExport,
  exporting,
}: {
  onExport: (t: 'overview' | 'attendance' | 'demographics') => void;
  exporting: null | 'overview' | 'attendance' | 'demographics';
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark"
      >
        <IconDownload size={14} />
        {exporting ? `Exporting ${exporting}…` : 'Export PDF'}
      </button>
      {open && !exporting && (
        <div
          className="absolute right-0 mt-1 w-44 bg-white border border-border rounded shadow-lg z-20 overflow-hidden"
          onMouseLeave={() => setOpen(false)}
        >
          {(['overview', 'attendance', 'demographics'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setOpen(false);
                onExport(t);
              }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-surface-subtle capitalize"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth.store';
import {
  peopleApi,
  type PersonListItem,
  type SearchPeopleParams,
} from '../api/people.api';
import { wardsApi, boothsApi } from '../api/hierarchy.api';
import type { WardWithCount, BoothWithCount } from '../api/hierarchy.api';
import { Gender, Status, AdminRole } from '../types';
import { IconSearch, IconUser, IconX } from '../components/ui/Icon';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  RoleBadge,
  StatusBadge,
  GenderBadge,
} from '../components/people/Badges';

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

export default function Search() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  usePageTitle('Search');

  // Raw input — updates on every keystroke
  const [input, setInput] = useState('');
  // Debounced query — drives the API call
  const [q, setQ] = useState('');

  // Filters
  const [wardId, setWardId] = useState('');
  const [boothId, setBoothId] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [status, setStatus] = useState<Status | ''>('');
  const [ageMin, setAgeMin] = useState<string>('');
  const [ageMax, setAgeMax] = useState<string>('');
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<PersonListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Filter option sources
  const [wards, setWards] = useState<WardWithCount[]>([]);
  const [booths, setBooths] = useState<BoothWithCount[]>([]);

  // Debounce input -> q
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setQ(input.trim());
      setPage(1);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [input]);

  // Load ward/booth filter options based on role
  useEffect(() => {
    (async () => {
      try {
        if (
          user?.role === AdminRole.SUPER_ADMIN ||
          user?.role === AdminRole.BLOCK_ADMIN
        ) {
          const w = await wardsApi.list();
          setWards(w);
        }
        if (user?.role === AdminRole.WARD_ADMIN) {
          const b = await boothsApi.list();
          setBooths(b);
        }
      } catch {
        // ignore
      }
    })();
  }, [user]);

  // When ward changes, refresh booths
  useEffect(() => {
    if (!wardId) {
      if (user?.role !== AdminRole.WARD_ADMIN) {
        setBooths([]);
        setBoothId('');
      }
      return;
    }
    (async () => {
      try {
        const b = await boothsApi.list({ wardId });
        setBooths(b);
      } catch {
        setBooths([]);
      }
    })();
  }, [wardId, user]);

  // Execute search whenever q or filters or page change
  const run = useCallback(async () => {
    // Only skip if truly empty query AND no filters applied
    const anyFilter =
      wardId || boothId || gender || status || ageMin || ageMax;
    if (!q && !anyFilter) {
      setItems([]);
      setTotal(0);
      setTotalPages(1);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const params: SearchPeopleParams = {
        q: q || undefined,
        wardId: wardId || undefined,
        boothId: boothId || undefined,
        gender: (gender || undefined) as Gender | undefined,
        status: (status || undefined) as Status | undefined,
        ageMin: ageMin ? Number(ageMin) : undefined,
        ageMax: ageMax ? Number(ageMax) : undefined,
        page,
        limit: PAGE_SIZE,
      };
      const res = await peopleApi.search(params);
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [q, wardId, boothId, gender, status, ageMin, ageMax, page]);

  useEffect(() => {
    run();
  }, [run]);

  function resetAll() {
    setInput('');
    setQ('');
    setWardId('');
    setBoothId('');
    setGender('');
    setStatus('');
    setAgeMin('');
    setAgeMax('');
    setPage(1);
    setItems([]);
    setTotal(0);
    setTotalPages(1);
    setHasSearched(false);
  }

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (wardId) n++;
    if (boothId) n++;
    if (gender) n++;
    if (status) n++;
    if (ageMin) n++;
    if (ageMax) n++;
    return n;
  }, [wardId, boothId, gender, status, ageMin, ageMax]);

  return (
    <div className="min-h-screen bg-surface px-6 py-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-navy tracking-tight">Search</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Fuzzy search across name, phone, Aadhaar, voter ID, address, and
            unique ID.
          </p>
        </div>

        {/* Search bar */}
        <div className="bg-white border border-border rounded shadow-card p-4 mb-4">
          <div className="relative mb-3">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
              <IconSearch size={16} />
            </span>
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoFocus
              placeholder="Search by name, phone, Aadhaar, voter ID, address, unique ID…"
              className="w-full pl-9 pr-10 py-2.5 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {input && (
              <button
                type="button"
                onClick={() => setInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-navy"
                aria-label="Clear"
              >
                <IconX size={14} />
              </button>
            )}
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap items-end gap-3">
            {(user?.role === AdminRole.SUPER_ADMIN ||
              user?.role === AdminRole.BLOCK_ADMIN) && (
              <FilterSelect
                label="Ward"
                value={wardId}
                onChange={(v) => {
                  setWardId(v);
                  setBoothId('');
                  setPage(1);
                }}
                options={[
                  { value: '', label: 'All wards' },
                  ...wards.map((w) => ({ value: w.id, label: w.name })),
                ]}
              />
            )}

            {(user?.role === AdminRole.SUPER_ADMIN ||
              user?.role === AdminRole.BLOCK_ADMIN ||
              user?.role === AdminRole.WARD_ADMIN) && (
              <FilterSelect
                label="Booth"
                value={boothId}
                onChange={(v) => {
                  setBoothId(v);
                  setPage(1);
                }}
                options={[
                  { value: '', label: 'All booths' },
                  ...booths.map((b) => ({ value: b.id, label: b.name })),
                ]}
                disabled={!wardId && user?.role !== AdminRole.WARD_ADMIN}
              />
            )}

            <FilterSelect
              label="Gender"
              value={gender}
              onChange={(v) => {
                setGender(v as Gender | '');
                setPage(1);
              }}
              options={[
                { value: '', label: 'All' },
                { value: Gender.MALE, label: 'Male' },
                { value: Gender.FEMALE, label: 'Female' },
                { value: Gender.OTHER, label: 'Other' },
              ]}
            />

            <FilterSelect
              label="Status"
              value={status}
              onChange={(v) => {
                setStatus(v as Status | '');
                setPage(1);
              }}
              options={[
                { value: '', label: 'All' },
                { value: Status.ACTIVE, label: 'Active' },
                { value: Status.INACTIVE, label: 'Inactive' },
                { value: Status.PENDING, label: 'Pending' },
              ]}
            />

            <div className="min-w-[90px]">
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                Age min
              </label>
              <input
                type="number"
                min={0}
                max={120}
                value={ageMin}
                onChange={(e) => {
                  setAgeMin(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
              />
            </div>

            <div className="min-w-[90px]">
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                Age max
              </label>
              <input
                type="number"
                min={0}
                max={120}
                value={ageMax}
                onChange={(e) => {
                  setAgeMax(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
              />
            </div>

            {(q || activeFilterCount > 0) && (
              <button
                type="button"
                onClick={resetAll}
                className="px-3 py-2 text-sm text-text-secondary hover:text-navy transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Result header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm text-text-secondary">
            {loading ? (
              <span>Searching…</span>
            ) : hasSearched ? (
              <span>
                <span className="font-semibold text-navy">{total}</span> result
                {total === 1 ? '' : 's'}
                {q && (
                  <>
                    {' '}
                    for <span className="font-mono text-navy">"{q}"</span>
                  </>
                )}
                {activeFilterCount > 0 && (
                  <span className="text-text-muted">
                    {' '}
                    · {activeFilterCount} filter
                    {activeFilterCount === 1 ? '' : 's'}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-text-muted">
                Type in the search box or pick a filter to begin.
              </span>
            )}
          </div>
          {totalPages > 1 && (
            <div className="text-xs text-text-muted font-mono">
              Page {page} / {totalPages}
            </div>
          )}
        </div>

        {/* Results */}
        {hasSearched && (
          <div className="bg-white border border-border rounded shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-subtle border-b border-border">
                  <tr className="text-left">
                    <Th>Member</Th>
                    <Th>Unique ID</Th>
                    <Th>Phone</Th>
                    <Th>Location</Th>
                    <Th>Gender</Th>
                    <Th>Role</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading && items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center text-text-muted py-16"
                      >
                        Searching…
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center text-text-muted py-16"
                      >
                        No matches. Try a different term or loosen filters.
                      </td>
                    </tr>
                  ) : (
                    items.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => navigate(`/people/${p.id}`)}
                        className="border-b border-border last:border-0 hover:bg-surface-subtle/60 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 shrink-0 rounded-full bg-surface-subtle border border-border overflow-hidden flex items-center justify-center text-text-muted">
                              {p.photoUrl ? (
                                <img
                                  src={p.photoUrl}
                                  alt={p.fullName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <IconUser size={14} />
                              )}
                            </div>
                            <div className="min-w-0">
                              <Link
                                to={`/people/${p.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-semibold text-navy hover:text-primary truncate block"
                              >
                                <Highlight text={p.fullName} query={q} />
                              </Link>
                              {p.fatherName && (
                                <div className="text-xs text-text-muted truncate">
                                  {p.fatherName}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                          <Highlight text={p.uniqueId} query={q} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <Highlight text={p.phone} query={q} />
                        </td>
                        <td className="px-4 py-3 text-xs text-text-secondary">
                          <div>{p.booth?.name ?? '—'}</div>
                          <div className="text-text-muted">
                            {p.ward?.name ?? ''}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <GenderBadge gender={p.gender} />
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <RoleBadge role={p.role} />
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <StatusBadge status={p.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface-subtle/50">
                <div className="text-xs text-text-secondary">
                  Showing {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, total)} of {total}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-xs border border-border rounded bg-white hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-text-secondary font-mono">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-xs border border-border rounded bg-white hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state pre-search */}
        {!hasSearched && (
          <div className="bg-white border border-border rounded shadow-card py-20 flex flex-col items-center text-text-muted">
            <IconSearch size={32} />
            <div className="mt-3 text-sm">Start typing to search members.</div>
            <div className="mt-1 text-xs">
              Fuzzy match is tolerant of typos and partial strings.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-2.5 text-[11px] font-semibold text-text-secondary uppercase tracking-wide ${className}`}
    >
      {children}
    </th>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="min-w-[130px]">
      <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary disabled:bg-surface-subtle disabled:text-text-muted"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Highlight case-insensitive substring matches of `query` inside `text`.
function Highlight({
  text,
  query,
}: {
  text: string | null | undefined;
  query: string;
}) {
  if (!text) return <>—</>;
  if (!query) return <>{text}</>;

  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${safe})`, 'ig'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            className="bg-yellow-200 text-navy px-0.5 rounded-sm"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

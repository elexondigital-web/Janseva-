import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth.store';
import { peopleApi, type PersonListItem } from '../api/people.api';
import { blocksApi, wardsApi, boothsApi } from '../api/hierarchy.api';
import type { BlockWithCount, WardWithCount, BoothWithCount } from '../api/hierarchy.api';
import { Gender, PartyRole, Status, AdminRole } from '../types';
import {
  IconPlus,
  IconUser,
  IconUsers,
  IconEdit,
  IconTrash,
  IconCheckCircle,
  IconAlertTriangle,
} from '../components/ui/Icon';
import Modal from '../components/ui/Modal';
import { RoleBadge, StatusBadge } from '../components/people/Badges';
import { TableRowSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { usePageTitle } from '../hooks/usePageTitle';

const PAGE_SIZE = 20;

export default function People() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  usePageTitle('Members');

  const [items, setItems] = useState<PersonListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [blockId, setBlockId] = useState<string>('');
  const [wardId, setWardId] = useState<string>('');
  const [boothId, setBoothId] = useState<string>('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [role, setRole] = useState<PartyRole | ''>('');
  const [status, setStatus] = useState<Status | ''>('');

  const [blocks, setBlocks] = useState<BlockWithCount[]>([]);
  const [wards, setWards] = useState<WardWithCount[]>([]);
  const [booths, setBooths] = useState<BoothWithCount[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<PersonListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canEdit = useMemo(() => {
    if (!user) return false;
    return (
      user.role === AdminRole.SUPER_ADMIN ||
      user.role === AdminRole.BLOCK_ADMIN ||
      user.role === AdminRole.WARD_ADMIN ||
      user.role === AdminRole.BOOTH_WORKER
    );
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await peopleApi.list({
        search: search || undefined,
        blockId: blockId || undefined,
        wardId: wardId || undefined,
        boothId: boothId || undefined,
        gender: (gender || undefined) as Gender | undefined,
        role: (role || undefined) as PartyRole | undefined,
        status: (status || undefined) as Status | undefined,
        page,
        limit: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [search, blockId, wardId, boothId, gender, role, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Load filter dropdowns (blocks for super, wards scoped, etc.)
  useEffect(() => {
    (async () => {
      try {
        if (user?.role === AdminRole.SUPER_ADMIN) {
          const b = await blocksApi.list();
          setBlocks(b);
        } else if (user?.role === AdminRole.BLOCK_ADMIN) {
          const w = await wardsApi.list();
          setWards(w);
        } else if (user?.role === AdminRole.WARD_ADMIN) {
          const bt = await boothsApi.list();
          setBooths(bt);
        }
      } catch {
        // ignore filter load fails
      }
    })();
  }, [user]);

  // Cascade: when block changes, reload wards
  useEffect(() => {
    (async () => {
      if (user?.role !== AdminRole.SUPER_ADMIN) return;
      if (!blockId) {
        setWards([]);
        setWardId('');
        setBooths([]);
        setBoothId('');
        return;
      }
      try {
        const w = await wardsApi.list(blockId);
        setWards(w);
      } catch {
        setWards([]);
      }
    })();
  }, [blockId, user]);

  useEffect(() => {
    (async () => {
      if (!wardId) {
        setBooths((prev) =>
          user?.role === AdminRole.WARD_ADMIN ? prev : [],
        );
        setBoothId('');
        return;
      }
      try {
        const bt = await boothsApi.list({ wardId });
        setBooths(bt);
      } catch {
        setBooths([]);
      }
    })();
  }, [wardId, user]);

  function onSubmitSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  function resetFilters() {
    setSearchInput('');
    setSearch('');
    setBlockId('');
    setWardId('');
    setBoothId('');
    setGender('');
    setRole('');
    setStatus('');
    setPage(1);
  }

  async function onConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await peopleApi.remove(deleteTarget.id);
      toast.success('Member deleted');
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface px-6 py-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-navy tracking-tight">Members</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              {total} total · Page {page} of {totalPages}
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => navigate('/people/new')}
              className="flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-4 py-2 rounded transition-colors"
            >
              <IconPlus size={16} />
              Add Member
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white border border-border rounded shadow-card p-4 mb-4">
          <form onSubmit={onSubmitSearch} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                Search
              </label>
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Name, phone, ID, Aadhaar, voter ID…"
                className="w-full px-3 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
              />
            </div>

            {user?.role === AdminRole.SUPER_ADMIN && (
              <FilterSelect
                label="Block"
                value={blockId}
                onChange={(v) => {
                  setBlockId(v);
                  setWardId('');
                  setBoothId('');
                  setPage(1);
                }}
                options={[
                  { value: '', label: 'All blocks' },
                  ...blocks.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            )}

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
                disabled={user?.role === AdminRole.SUPER_ADMIN && !blockId}
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
              label="Role"
              value={role}
              onChange={(v) => {
                setRole(v as PartyRole | '');
                setPage(1);
              }}
              options={[
                { value: '', label: 'All' },
                { value: PartyRole.MEMBER, label: 'Member' },
                { value: PartyRole.BOOTH_WORKER, label: 'Booth Worker' },
                { value: PartyRole.WARD_ADMIN, label: 'Ward Admin' },
                { value: PartyRole.BLOCK_ADMIN, label: 'Block Admin' },
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

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-4 py-2 text-sm font-semibold bg-navy text-white rounded hover:bg-navy-light transition-colors"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="px-3 py-2 text-sm text-text-secondary hover:text-navy transition-colors"
              >
                Reset
              </button>
            </div>
          </form>
        </div>

        {/* Table */}
        <div className="bg-white border border-border rounded shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-subtle border-b border-border">
                <tr className="text-left">
                  <Th>Member</Th>
                  <Th>Unique ID</Th>
                  <Th>Phone</Th>
                  <Th>Location</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>ID Card</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <TableRowSkeleton key={i} cols={8} />
                    ))}
                  </>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-4">
                      <EmptyState
                        icon={<IconUsers size={22} />}
                        title="No members yet"
                        description="Add your first member to start building the constituency roster."
                        action={
                          <button
                            type="button"
                            onClick={() => navigate('/people/new')}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark"
                          >
                            <IconPlus size={14} /> Add member
                          </button>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  items.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-border last:border-0 hover:bg-surface-subtle/60 transition-colors"
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
                              className="font-semibold text-navy hover:text-primary truncate block"
                            >
                              {p.fullName}
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
                        {p.uniqueId}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{p.phone}</td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        <div>{p.booth?.name ?? '—'}</div>
                        <div className="text-text-muted">
                          {p.ward?.name ?? ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <RoleBadge role={p.role} />
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {p.idCard ? (
                          <span className="inline-flex items-center gap-1 text-status-green font-semibold">
                            <IconCheckCircle size={12} /> Issued
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={`/people/${p.id}`}
                            className="p-1.5 text-text-muted hover:text-primary hover:bg-primary-bg rounded transition-colors"
                            aria-label="View"
                          >
                            <IconUser size={14} />
                          </Link>
                          {canEdit && (
                            <>
                              <Link
                                to={`/people/${p.id}/edit`}
                                className="p-1.5 text-text-muted hover:text-navy hover:bg-surface-subtle rounded transition-colors"
                                aria-label="Edit"
                              >
                                <IconEdit size={14} />
                              </Link>
                              <button
                                onClick={() => setDeleteTarget(p)}
                                className="p-1.5 text-text-muted hover:text-status-red hover:bg-status-red-bg rounded transition-colors"
                                aria-label="Delete"
                              >
                                <IconTrash size={14} />
                              </button>
                            </>
                          )}
                        </div>
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
      </div>

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Delete member?"
        subtitle="This action cannot be undone."
        size="sm"
        footer={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="px-4 py-2 text-sm text-text-secondary hover:text-navy transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirmDelete}
              disabled={deleting}
              className="px-4 py-2 text-sm font-semibold bg-status-red text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 shrink-0 rounded-full bg-status-red-bg text-status-red flex items-center justify-center">
            <IconAlertTriangle size={18} />
          </div>
          <div className="text-sm text-navy">
            Permanently delete <strong>{deleteTarget?.fullName}</strong>? Their
            ID card and uploaded documents will also be removed.
          </div>
        </div>
      </Modal>
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


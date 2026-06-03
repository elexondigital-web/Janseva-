import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth.store';
import {
  adminsApi,
  type AdminRecord,
  type AdminStats,
  type CreateAdminPayload,
  type CreateAdminResult,
  type ResetPasswordResult,
  type UpdateAdminPayload,
} from '../api/admins.api';
import {
  blocksApi,
  wardsApi,
  boothsApi,
  type BlockWithCount,
  type WardWithCount,
  type BoothWithCount,
} from '../api/hierarchy.api';
import { AdminRole } from '../types';
import Modal from '../components/ui/Modal';
import {
  IconUsers,
  IconPlus,
  IconEdit,
  IconKey,
  IconPower,
  IconAlertTriangle,
  IconShield,
  IconCopy,
  IconClock,
  IconRefresh,
  IconUser,
} from '../components/ui/Icon';

const ROLE_LABEL: Record<AdminRole, string> = {
  [AdminRole.SUPER_ADMIN]: 'Super Admin',
  [AdminRole.BLOCK_ADMIN]: 'Block Admin',
  [AdminRole.WARD_ADMIN]: 'Ward Admin',
  [AdminRole.BOOTH_WORKER]: 'Booth Worker',
};

const ROLE_BADGE: Record<AdminRole, string> = {
  [AdminRole.SUPER_ADMIN]: 'bg-navy/10 text-navy border-navy/20',
  [AdminRole.BLOCK_ADMIN]: 'bg-primary-bg text-primary border-primary/30',
  [AdminRole.WARD_ADMIN]:
    'bg-status-green-bg text-status-green border-status-green/30',
  [AdminRole.BOOTH_WORKER]:
    'bg-status-amber-bg text-status-amber border-status-amber/30',
};

export default function Admins() {
  const me = useAuthStore((s) => s.user);
  const isSuperAdmin = me?.role === AdminRole.SUPER_ADMIN;

  const [items, setItems] = useState<AdminRecord[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<ResetPasswordResult | null>(
    null,
  );
  const [confirmDeact, setConfirmDeact] = useState<AdminRecord | null>(null);

  const canManage =
    me?.role === AdminRole.SUPER_ADMIN || me?.role === AdminRole.BLOCK_ADMIN;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        adminsApi.list({ limit: 100 }),
        adminsApi.stats(),
      ]);
      setItems(list.items);
      setStats(s);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to load admins');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    document.title = 'JanSeva — Admins';
  }, []);

  async function onDeactivate(a: AdminRecord) {
    try {
      await adminsApi.deactivate(a.id);
      toast.success(`${a.name} deactivated`);
      setConfirmDeact(null);
      await reload();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Deactivate failed');
    }
  }

  async function onResetPassword(a: AdminRecord) {
    if (
      !window.confirm(
        `Generate a new temporary password for ${a.name}? The old one will stop working immediately.`,
      )
    )
      return;
    try {
      const r = await adminsApi.resetPassword(a.id);
      setResetResult(r);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Reset failed');
    }
  }

  if (!canManage) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-6">
        <div className="text-center">
          <IconShield size={36} />
          <h1 className="text-lg font-bold text-navy mt-3">Access denied</h1>
          <p className="text-sm text-text-muted mt-1">
            Only Super Admin and Block Admin roles can view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface px-6 py-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-navy tracking-tight flex items-center gap-2">
              <IconUsers size={22} /> Admin Management
            </h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Create, scope, and manage operator accounts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reload}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border border-border rounded hover:border-primary hover:text-primary"
            >
              <IconRefresh size={14} /> Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark"
            >
              <IconPlus size={14} /> Add Admin
            </button>
          </div>
        </div>

        {/* Summary */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
            <SummaryCard label="Total" value={stats.total} />
            <SummaryCard
              label="Active"
              value={stats.active}
              tone="green"
            />
            <SummaryCard
              label="Inactive"
              value={stats.inactive}
              tone={stats.inactive > 0 ? 'amber' : 'muted'}
            />
            <SummaryCard
              label="Block admins"
              value={stats.byRole.BLOCK_ADMIN}
            />
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-border rounded shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-subtle">
                <tr className="text-left text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Scope</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last login</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-text-muted text-xs"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-text-muted text-xs"
                    >
                      No admins found.
                    </td>
                  </tr>
                ) : (
                  items.map((a) => {
                    const isMe = a.id === me?.id;
                    return (
                      <tr
                        key={a.id}
                        className="border-t border-border hover:bg-surface-subtle/40"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 shrink-0 rounded-full bg-surface-subtle border border-border flex items-center justify-center text-text-muted">
                              <IconUser size={12} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-navy truncate">
                                {a.name}
                                {isMe && (
                                  <span className="ml-2 text-[10px] font-mono uppercase text-text-muted">
                                    you
                                  </span>
                                )}
                              </div>
                              {a.mustChangePassword && (
                                <div className="text-[10px] text-status-amber font-semibold">
                                  must change password
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-text-secondary text-xs">
                          {a.email}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 ${ROLE_BADGE[a.role]}`}
                          >
                            {ROLE_LABEL[a.role]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-text-secondary">
                          {a.role === AdminRole.SUPER_ADMIN ? (
                            <span className="text-text-muted">All blocks</span>
                          ) : (
                            <div className="leading-tight">
                              {a.block?.name ?? '—'}
                              {a.ward && (
                                <div className="text-[11px] text-text-muted">
                                  {a.ward.name}
                                  {a.booth ? ` · ${a.booth.name}` : ''}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                              a.isActive
                                ? 'text-status-green'
                                : 'text-text-muted'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                a.isActive ? 'bg-status-green' : 'bg-text-muted'
                              }`}
                            />
                            {a.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-text-secondary">
                          {a.lastLoginAt ? (
                            <span className="inline-flex items-center gap-1">
                              <IconClock size={11} />
                              {formatRelative(a.lastLoginAt)}
                            </span>
                          ) : (
                            <span className="text-text-muted">never</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <IconButton
                              title={
                                isMe
                                  ? 'Cannot modify your own account'
                                  : 'Edit'
                              }
                              disabled={isMe}
                              onClick={() => setEditingId(a.id)}
                            >
                              <IconEdit size={13} />
                            </IconButton>
                            <IconButton
                              title="Reset password"
                              disabled={isMe}
                              onClick={() => onResetPassword(a)}
                            >
                              <IconKey size={13} />
                            </IconButton>
                            <IconButton
                              title={
                                isMe
                                  ? 'Cannot deactivate yourself'
                                  : a.isActive
                                    ? 'Deactivate'
                                    : 'Already inactive'
                              }
                              disabled={isMe || !a.isActive}
                              danger
                              onClick={() => setConfirmDeact(a)}
                            >
                              <IconPower size={13} />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateAdminModal
          actorBlockId={me?.blockId ?? null}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setShowCreate(false)}
          onCreated={(r) => {
            setShowCreate(false);
            reload();
            if (r.tempPassword) setResetResult({
              id: r.admin.id,
              tempPassword: r.tempPassword,
              emailSent: r.emailSent,
            });
            else toast.success('Admin created');
          }}
        />
      )}

      {/* Edit drawer (modal) */}
      {editingId && (
        <EditAdminModal
          adminId={editingId}
          actorBlockId={me?.blockId ?? null}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            reload();
          }}
        />
      )}

      {/* Reset/created result modal */}
      {resetResult && (
        <Modal
          open
          onClose={() => setResetResult(null)}
          title="Temporary password"
          subtitle="Copy this now — it will not be shown again"
          size="sm"
        >
          <div className="space-y-3">
            <div className="text-xs text-text-secondary">
              {resetResult.emailSent
                ? 'A welcome email has been sent. The password is also shown here in case email is delayed.'
                : 'Email is not configured on this server — give this password to the user out-of-band.'}
            </div>
            <div className="flex items-center gap-2 bg-surface-subtle border border-border rounded px-3 py-2">
              <code className="flex-1 font-mono text-sm text-navy break-all">
                {resetResult.tempPassword}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard
                    .writeText(resetResult.tempPassword)
                    .then(() => toast.success('Copied to clipboard'))
                    .catch(() => toast.error('Could not copy'));
                }}
                className="text-text-muted hover:text-primary"
                aria-label="Copy"
              >
                <IconCopy size={16} />
              </button>
            </div>
            <div className="text-[11px] text-text-muted">
              The user will be required to change this on next login.
            </div>
          </div>
        </Modal>
      )}

      {/* Deactivate confirmation */}
      {confirmDeact && (
        <Modal
          open
          onClose={() => setConfirmDeact(null)}
          title="Deactivate admin?"
          subtitle="This admin will lose access immediately."
          size="sm"
          footer={
            <>
              <button
                onClick={() => setConfirmDeact(null)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-navy"
              >
                Cancel
              </button>
              <button
                onClick={() => onDeactivate(confirmDeact)}
                className="px-4 py-2 text-sm font-semibold bg-status-red text-white rounded hover:bg-red-700"
              >
                Deactivate
              </button>
            </>
          }
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 shrink-0 rounded-full bg-status-red-bg text-status-red flex items-center justify-center">
              <IconAlertTriangle size={18} />
            </div>
            <div className="text-sm text-navy">
              <strong>{confirmDeact.name}</strong> ({confirmDeact.email}) will
              be marked inactive. Their existing sessions will be invalidated
              on next API call.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---- helpers / sub-components -----------------------------------------

function SummaryCard({
  label,
  value,
  tone = 'primary',
}: {
  label: string;
  value: number;
  tone?: 'primary' | 'green' | 'amber' | 'muted';
}) {
  const tones: Record<typeof tone, string> = {
    primary: 'text-primary',
    green: 'text-status-green',
    amber: 'text-status-amber',
    muted: 'text-text-muted',
  };
  return (
    <div className="bg-white border border-border rounded shadow-card p-4">
      <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 tabular-nums ${tones[tone]}`}>
        {value.toLocaleString('en-IN')}
      </div>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        danger
          ? 'text-status-red hover:bg-status-red-bg'
          : 'text-text-muted hover:text-primary hover:bg-primary-bg'
      }`}
    >
      {children}
    </button>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const sec = Math.floor((Date.now() - then) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });
}

// ---- Create / Edit modals ---------------------------------------------

function ScopePicker({
  role,
  blockId,
  wardId,
  boothId,
  isSuperAdmin,
  actorBlockId,
  onChange,
}: {
  role: AdminRole;
  blockId: string;
  wardId: string;
  boothId: string;
  isSuperAdmin: boolean;
  actorBlockId: string | null;
  onChange: (v: { blockId: string; wardId: string; boothId: string }) => void;
}) {
  const [blocks, setBlocks] = useState<BlockWithCount[]>([]);
  const [wards, setWards] = useState<WardWithCount[]>([]);
  const [booths, setBooths] = useState<BoothWithCount[]>([]);

  useEffect(() => {
    if (isSuperAdmin) {
      blocksApi.list().then(setBlocks).catch(() => setBlocks([]));
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    const target = blockId || actorBlockId || '';
    if (!target) {
      setWards([]);
      return;
    }
    wardsApi
      .list(target)
      .then(setWards)
      .catch(() => setWards([]));
  }, [blockId, actorBlockId]);

  useEffect(() => {
    if (!wardId) {
      setBooths([]);
      return;
    }
    boothsApi
      .list({ wardId })
      .then(setBooths)
      .catch(() => setBooths([]));
  }, [wardId]);

  if (role === AdminRole.SUPER_ADMIN) {
    return (
      <div className="text-[11px] text-text-muted bg-surface-subtle border border-border rounded p-3">
        Super admins have global scope — no block/ward/booth needed.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isSuperAdmin && (
        <Field label="Block">
          <select
            value={blockId}
            onChange={(e) =>
              onChange({ blockId: e.target.value, wardId: '', boothId: '' })
            }
            className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
          >
            <option value="">Select block…</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}, {b.district}
              </option>
            ))}
          </select>
        </Field>
      )}

      {(role === AdminRole.WARD_ADMIN || role === AdminRole.BOOTH_WORKER) && (
        <Field label="Ward">
          <select
            value={wardId}
            onChange={(e) =>
              onChange({ blockId, wardId: e.target.value, boothId: '' })
            }
            className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
          >
            <option value="">Select ward…</option>
            {wards.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {role === AdminRole.BOOTH_WORKER && (
        <Field label="Booth">
          <select
            value={boothId}
            onChange={(e) =>
              onChange({ blockId, wardId, boothId: e.target.value })
            }
            className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
          >
            <option value="">Select booth…</option>
            {booths.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function CreateAdminModal({
  actorBlockId,
  isSuperAdmin,
  onClose,
  onCreated,
}: {
  actorBlockId: string | null;
  isSuperAdmin: boolean;
  onClose: () => void;
  onCreated: (r: CreateAdminResult) => void;
}) {
  const allowedRoles: AdminRole[] = isSuperAdmin
    ? [
        AdminRole.SUPER_ADMIN,
        AdminRole.BLOCK_ADMIN,
        AdminRole.WARD_ADMIN,
        AdminRole.BOOTH_WORKER,
      ]
    : [AdminRole.WARD_ADMIN, AdminRole.BOOTH_WORKER];

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>(allowedRoles[0]);
  const [blockId, setBlockId] = useState(
    isSuperAdmin ? '' : actorBlockId ?? '',
  );
  const [wardId, setWardId] = useState('');
  const [boothId, setBoothId] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    setSubmitting(true);
    try {
      const payload: CreateAdminPayload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        blockId: role === AdminRole.SUPER_ADMIN ? undefined : blockId || undefined,
        wardId:
          role === AdminRole.WARD_ADMIN || role === AdminRole.BOOTH_WORKER
            ? wardId || undefined
            : undefined,
        boothId:
          role === AdminRole.BOOTH_WORKER ? boothId || undefined : undefined,
        sendEmail,
      };
      const r = await adminsApi.create(payload);
      onCreated(r);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Create failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => !submitting && onClose()}
      title="Add admin"
      subtitle="A temporary password will be generated and emailed."
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-text-secondary hover:text-navy"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit as any}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create admin'}
          </button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Full name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary font-mono"
          />
        </Field>
        <Field label="Role">
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as AdminRole);
              setWardId('');
              setBoothId('');
            }}
            className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
          >
            {allowedRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>

        <ScopePicker
          role={role}
          blockId={blockId}
          wardId={wardId}
          boothId={boothId}
          isSuperAdmin={isSuperAdmin}
          actorBlockId={actorBlockId}
          onChange={(v) => {
            setBlockId(v.blockId);
            setWardId(v.wardId);
            setBoothId(v.boothId);
          }}
        />

        <label className="flex items-center gap-2 mt-2 cursor-pointer text-xs text-navy">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="accent-primary"
          />
          Send welcome email with temporary password
        </label>

        <div className="text-[11px] text-text-muted bg-surface-subtle border border-border rounded p-2.5 inline-flex items-start gap-2">
          <IconShield size={12} />
          <span>
            The new admin will be required to change the temporary password on
            their first login.
          </span>
        </div>
      </form>
    </Modal>
  );
}

function EditAdminModal({
  adminId,
  actorBlockId,
  isSuperAdmin,
  onClose,
  onSaved,
}: {
  adminId: string;
  actorBlockId: string | null;
  isSuperAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [admin, setAdmin] = useState<AdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<AdminRole>(AdminRole.BOOTH_WORKER);
  const [blockId, setBlockId] = useState('');
  const [wardId, setWardId] = useState('');
  const [boothId, setBoothId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [confirmDeact, setConfirmDeact] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const a = await adminsApi.get(adminId);
        setAdmin(a);
        setName(a.name);
        setRole(a.role);
        setBlockId(a.blockId ?? '');
        setWardId(a.wardId ?? '');
        setBoothId(a.boothId ?? '');
        setIsActive(a.isActive);
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? 'Load failed');
        onClose();
      } finally {
        setLoading(false);
      }
    })();
  }, [adminId, onClose]);

  const allowedRoles: AdminRole[] = isSuperAdmin
    ? [
        AdminRole.SUPER_ADMIN,
        AdminRole.BLOCK_ADMIN,
        AdminRole.WARD_ADMIN,
        AdminRole.BOOTH_WORKER,
      ]
    : [AdminRole.WARD_ADMIN, AdminRole.BOOTH_WORKER];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: UpdateAdminPayload = {
        name: name.trim(),
        role,
        blockId: role === AdminRole.SUPER_ADMIN ? null : blockId || null,
        wardId:
          role === AdminRole.WARD_ADMIN || role === AdminRole.BOOTH_WORKER
            ? wardId || null
            : null,
        boothId: role === AdminRole.BOOTH_WORKER ? boothId || null : null,
        isActive,
      };
      await adminsApi.update(adminId, payload);
      toast.success('Admin updated');
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title={admin ? `Edit: ${admin.name}` : 'Edit admin'}
      subtitle={admin?.email}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-text-secondary hover:text-navy"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit as any}
            disabled={saving || loading}
            className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      {loading || !admin ? (
        <div className="py-6 text-center text-xs text-text-muted">Loading…</div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Full name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
            />
          </Field>
          <Field label="Role">
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value as AdminRole);
                setWardId('');
                setBoothId('');
              }}
              className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
            >
              {allowedRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          <ScopePicker
            role={role}
            blockId={blockId}
            wardId={wardId}
            boothId={boothId}
            isSuperAdmin={isSuperAdmin}
            actorBlockId={actorBlockId}
            onChange={(v) => {
              setBlockId(v.blockId);
              setWardId(v.wardId);
              setBoothId(v.boothId);
            }}
          />

          {/* Activation toggle */}
          <div className="border-t border-border pt-3 mt-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!isActive}
                onChange={(e) => {
                  if (e.target.checked) {
                    setConfirmDeact(true);
                  } else {
                    setIsActive(true);
                  }
                }}
                className="mt-0.5 accent-status-red"
              />
              <div>
                <div className="text-sm font-semibold text-status-red">
                  Deactivate account
                </div>
                <div className="text-[11px] text-text-muted">
                  Revokes access immediately. Can be re-activated later.
                </div>
              </div>
            </label>
            {confirmDeact && (
              <div className="mt-2 bg-status-red-bg text-status-red border border-status-red/30 rounded p-2 text-xs flex items-center justify-between">
                <span>Are you sure?</span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeact(false);
                    }}
                    className="text-text-secondary"
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsActive(false);
                      setConfirmDeact(false);
                    }}
                    className="font-semibold underline"
                  >
                    Yes, deactivate
                  </button>
                </span>
              </div>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}

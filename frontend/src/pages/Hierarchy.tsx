import { useEffect, useMemo, useState, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth.store';
import { AdminRole } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  blocksApi,
  wardsApi,
  boothsApi,
  type BlockWithCount,
  type WardWithCount,
  type BoothWithCount,
} from '../api/hierarchy.api';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconChevronRight,
  IconChevronDown,
  IconBuilding,
  IconMapPin,
  IconUsers,
  IconAlertTriangle,
  IconLogo,
} from '../components/ui/Icon';
import Modal from '../components/ui/Modal';

// ---- Types local to this page ----
type ModalMode = 'create-block' | 'edit-block' |
                 'create-ward' | 'edit-ward' |
                 'create-booth' | 'edit-booth' |
                 'confirm-delete' | null;

interface EditingState {
  mode: ModalMode;
  // For edits:
  block?: BlockWithCount;
  ward?: WardWithCount;
  booth?: BoothWithCount;
  // For nested creates:
  parentBlockId?: string;
  parentWardId?: string;
  // For deletes:
  deleteKind?: 'block' | 'ward' | 'booth';
  deleteId?: string;
  deleteLabel?: string;
}

export default function Hierarchy() {
  const currentUser = useAuthStore((s) => s.user);
  usePageTitle('Hierarchy');
  const canCreateBlocks = currentUser?.role === AdminRole.SUPER_ADMIN;
  const canCreateWards =
    currentUser?.role === AdminRole.SUPER_ADMIN ||
    currentUser?.role === AdminRole.BLOCK_ADMIN;
  const canCreateBooths =
    currentUser?.role === AdminRole.SUPER_ADMIN ||
    currentUser?.role === AdminRole.BLOCK_ADMIN ||
    currentUser?.role === AdminRole.WARD_ADMIN;

  const [blocks, setBlocks] = useState<BlockWithCount[]>([]);
  const [wardsByBlock, setWardsByBlock] = useState<Record<string, WardWithCount[]>>({});
  const [boothsByWard, setBoothsByWard] = useState<Record<string, BoothWithCount[]>>({});
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [expandedWards, setExpandedWards] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingState>({ mode: null });

  // ---- Load blocks on mount ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await blocksApi.list();
        if (!cancelled) {
          setBlocks(data);
          // Auto-expand the first block for quick visibility
          if (data.length > 0) setExpandedBlocks(new Set([data[0].id]));
        }
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message || 'Failed to load blocks';
        toast.error(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Expanding a block loads its wards lazily ----
  async function toggleBlock(block: BlockWithCount) {
    const next = new Set(expandedBlocks);
    if (next.has(block.id)) {
      next.delete(block.id);
      setExpandedBlocks(next);
      return;
    }
    next.add(block.id);
    setExpandedBlocks(next);

    if (!wardsByBlock[block.id]) {
      try {
        const wards = await wardsApi.list(block.id);
        setWardsByBlock((m) => ({ ...m, [block.id]: wards }));
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message || 'Failed to load wards';
        toast.error(message);
      }
    }
  }

  async function toggleWard(ward: WardWithCount) {
    const next = new Set(expandedWards);
    if (next.has(ward.id)) {
      next.delete(ward.id);
      setExpandedWards(next);
      return;
    }
    next.add(ward.id);
    setExpandedWards(next);

    if (!boothsByWard[ward.id]) {
      try {
        const booths = await boothsApi.list({ wardId: ward.id });
        setBoothsByWard((m) => ({ ...m, [ward.id]: booths }));
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message || 'Failed to load booths';
        toast.error(message);
      }
    }
  }

  // ---- Helpers to refresh local data after mutations ----
  async function refreshBlocks() {
    const data = await blocksApi.list();
    setBlocks(data);
  }

  async function refreshWards(blockId: string) {
    const wards = await wardsApi.list(blockId);
    setWardsByBlock((m) => ({ ...m, [blockId]: wards }));
  }

  async function refreshBooths(wardId: string) {
    const booths = await boothsApi.list({ wardId });
    setBoothsByWard((m) => ({ ...m, [wardId]: booths }));
  }

  // ---- Mutation handlers (called from modals) ----
  async function handleCreateBlock(values: { name: string; district: string; state?: string }) {
    await blocksApi.create(values);
    await refreshBlocks();
    toast.success('Block created');
  }

  async function handleUpdateBlock(id: string, values: { name?: string; district?: string; state?: string }) {
    await blocksApi.update(id, values);
    await refreshBlocks();
    toast.success('Block updated');
  }

  async function handleCreateWard(blockId: string, values: { name: string }) {
    await wardsApi.create({ name: values.name, blockId });
    await refreshBlocks();
    await refreshWards(blockId);
    toast.success('Ward created');
  }

  async function handleUpdateWard(id: string, blockId: string, values: { name?: string }) {
    await wardsApi.update(id, values);
    await refreshWards(blockId);
    toast.success('Ward updated');
  }

  async function handleCreateBooth(wardId: string, blockId: string, values: { name: string; location?: string }) {
    await boothsApi.create({ name: values.name, wardId, location: values.location });
    await refreshBooths(wardId);
    await refreshWards(blockId);
    toast.success('Booth created');
  }

  async function handleUpdateBooth(id: string, wardId: string, values: { name?: string; location?: string }) {
    await boothsApi.update(id, values);
    await refreshBooths(wardId);
    toast.success('Booth updated');
  }

  async function handleDelete() {
    if (!editing.deleteKind || !editing.deleteId) return;
    try {
      if (editing.deleteKind === 'block') {
        await blocksApi.remove(editing.deleteId);
        await refreshBlocks();
      } else if (editing.deleteKind === 'ward') {
        const blockId = editing.block?.id ?? editing.ward?.blockId;
        await wardsApi.remove(editing.deleteId);
        if (blockId) {
          await refreshWards(blockId);
          await refreshBlocks();
        }
      } else if (editing.deleteKind === 'booth') {
        const wardId = editing.ward?.id ?? editing.booth?.wardId;
        await boothsApi.remove(editing.deleteId);
        if (wardId) {
          await refreshBooths(wardId);
        }
      }
      toast.success('Deleted');
      setEditing({ mode: null });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Delete failed';
      toast.error(message);
    }
  }

  // ---- Computed stats ----
  const stats = useMemo(() => {
    const totalBlocks = blocks.length;
    const totalWards = blocks.reduce((sum, b) => sum + b._count.wards, 0);
    const totalMembers = blocks.reduce((sum, b) => sum + b._count.people, 0);
    const loadedBooths = Object.values(boothsByWard).flat().length;
    return { totalBlocks, totalWards, totalMembers, loadedBooths };
  }, [blocks, boothsByWard]);

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-border">
        <div className="max-w-6xl mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-primary flex items-center justify-center text-white">
              <IconLogo size={20} />
            </div>
            <div>
              <div className="text-[11px] font-semibold tracking-wider text-text-muted uppercase">
                Organization
              </div>
              <h1 className="text-xl font-bold text-navy tracking-tight">
                Hierarchy
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[13px] text-text-secondary">
            <span className="font-medium">{currentUser?.name}</span>
            <span className="text-text-muted">·</span>
            <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
              {currentUser?.role.replace('_', ' ')}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-8">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard label="Blocks" value={stats.totalBlocks} icon={<IconBuilding size={16} />} />
          <StatCard label="Wards" value={stats.totalWards} icon={<IconMapPin size={16} />} />
          <StatCard label="Members" value={stats.totalMembers} icon={<IconUsers size={16} />} />
        </div>

        {/* Header row with create block */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-navy">Branches</h2>
            <p className="text-[13px] text-text-secondary">
              Expand a block to view its wards and booths.
            </p>
          </div>
          {canCreateBlocks && (
            <button
              type="button"
              onClick={() => setEditing({ mode: 'create-block' })}
              className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white text-[13px] font-semibold px-3.5 py-2 rounded-sm transition-colors"
            >
              <IconPlus size={14} />
              New Block
            </button>
          )}
        </div>

        {loading ? (
          <div className="bg-white border border-border rounded-sm px-6 py-10 text-center text-text-muted text-sm">
            Loading hierarchy…
          </div>
        ) : blocks.length === 0 ? (
          <div className="bg-white border border-border rounded-sm px-6 py-10 text-center">
            <div className="w-10 h-10 mx-auto rounded bg-primary-bg flex items-center justify-center text-primary mb-3">
              <IconBuilding size={18} />
            </div>
            <div className="text-sm font-semibold text-navy">No blocks yet</div>
            <p className="text-[13px] text-text-secondary mt-1">
              {canCreateBlocks
                ? 'Create your first block to get started.'
                : 'Ask your super admin to set up your block.'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-sm divide-y divide-border">
            {blocks.map((block) => {
              const isOpen = expandedBlocks.has(block.id);
              const wards = wardsByBlock[block.id];
              return (
                <div key={block.id}>
                  {/* BLOCK ROW */}
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleBlock(block)}
                      className="text-text-muted hover:text-navy w-5 h-5 flex items-center justify-center"
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                    >
                      {isOpen ? (
                        <IconChevronDown size={14} />
                      ) : (
                        <IconChevronRight size={14} />
                      )}
                    </button>
                    <div className="w-7 h-7 rounded bg-primary-bg text-primary flex items-center justify-center flex-shrink-0">
                      <IconBuilding size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[14px] text-navy truncate">
                        {block.name}
                      </div>
                      <div className="text-[12px] text-text-muted truncate">
                        {block.district}, {block.state}
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-4 text-[12px] text-text-secondary">
                      <span>
                        <b className="text-navy">{block._count.wards}</b> wards
                      </span>
                      <span>
                        <b className="text-navy">{block._count.people}</b> members
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {canCreateWards && (
                        <IconButton
                          title="Add ward"
                          onClick={() =>
                            setEditing({
                              mode: 'create-ward',
                              parentBlockId: block.id,
                              block,
                            })
                          }
                        >
                          <IconPlus size={14} />
                        </IconButton>
                      )}
                      {canCreateBlocks && (
                        <>
                          <IconButton
                            title="Edit block"
                            onClick={() =>
                              setEditing({ mode: 'edit-block', block })
                            }
                          >
                            <IconEdit size={14} />
                          </IconButton>
                          <IconButton
                            title="Delete block"
                            variant="danger"
                            onClick={() =>
                              setEditing({
                                mode: 'confirm-delete',
                                deleteKind: 'block',
                                deleteId: block.id,
                                deleteLabel: block.name,
                              })
                            }
                          >
                            <IconTrash size={14} />
                          </IconButton>
                        </>
                      )}
                    </div>
                  </div>

                  {/* WARDS */}
                  {isOpen && (
                    <div className="bg-surface border-t border-border">
                      {!wards ? (
                        <div className="px-14 py-4 text-[13px] text-text-muted">
                          Loading wards…
                        </div>
                      ) : wards.length === 0 ? (
                        <div className="px-14 py-4 text-[13px] text-text-muted">
                          No wards in this block yet.
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {wards.map((ward) => {
                            const wOpen = expandedWards.has(ward.id);
                            const booths = boothsByWard[ward.id];
                            return (
                              <div key={ward.id}>
                                <div className="flex items-center gap-3 pl-10 pr-4 py-2.5 hover:bg-white transition-colors">
                                  <button
                                    type="button"
                                    onClick={() => toggleWard(ward)}
                                    className="text-text-muted hover:text-navy w-5 h-5 flex items-center justify-center"
                                    aria-label={wOpen ? 'Collapse' : 'Expand'}
                                  >
                                    {wOpen ? (
                                      <IconChevronDown size={12} />
                                    ) : (
                                      <IconChevronRight size={12} />
                                    )}
                                  </button>
                                  <div className="w-6 h-6 rounded bg-white border border-border text-primary flex items-center justify-center flex-shrink-0">
                                    <IconMapPin size={12} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-[13px] text-navy truncate">
                                      {ward.name}
                                    </div>
                                  </div>
                                  <div className="hidden sm:flex items-center gap-4 text-[12px] text-text-secondary">
                                    <span>
                                      <b className="text-navy">
                                        {ward._count.booths}
                                      </b>{' '}
                                      booths
                                    </span>
                                    <span>
                                      <b className="text-navy">
                                        {ward._count.people}
                                      </b>{' '}
                                      members
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {canCreateBooths && (
                                      <IconButton
                                        title="Add booth"
                                        onClick={() =>
                                          setEditing({
                                            mode: 'create-booth',
                                            parentWardId: ward.id,
                                            parentBlockId: block.id,
                                            ward,
                                          })
                                        }
                                      >
                                        <IconPlus size={12} />
                                      </IconButton>
                                    )}
                                    {canCreateWards && (
                                      <>
                                        <IconButton
                                          title="Edit ward"
                                          onClick={() =>
                                            setEditing({
                                              mode: 'edit-ward',
                                              ward,
                                              block,
                                            })
                                          }
                                        >
                                          <IconEdit size={12} />
                                        </IconButton>
                                        <IconButton
                                          title="Delete ward"
                                          variant="danger"
                                          onClick={() =>
                                            setEditing({
                                              mode: 'confirm-delete',
                                              deleteKind: 'ward',
                                              deleteId: ward.id,
                                              deleteLabel: ward.name,
                                              block,
                                              ward,
                                            })
                                          }
                                        >
                                          <IconTrash size={12} />
                                        </IconButton>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* BOOTHS */}
                                {wOpen && (
                                  <div className="bg-white">
                                    {!booths ? (
                                      <div className="pl-20 pr-4 py-3 text-[12px] text-text-muted">
                                        Loading booths…
                                      </div>
                                    ) : booths.length === 0 ? (
                                      <div className="pl-20 pr-4 py-3 text-[12px] text-text-muted">
                                        No booths in this ward yet.
                                      </div>
                                    ) : (
                                      <div>
                                        {booths.map((booth) => (
                                          <div
                                            key={booth.id}
                                            className="flex items-center gap-3 pl-20 pr-4 py-2 hover:bg-surface transition-colors border-t border-border"
                                          >
                                            <div className="w-5 h-5 rounded-full border border-border bg-surface flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <div className="font-medium text-[13px] text-navy truncate">
                                                {booth.name}
                                              </div>
                                              {booth.location && (
                                                <div className="text-[11.5px] text-text-muted truncate">
                                                  {booth.location}
                                                </div>
                                              )}
                                            </div>
                                            <div className="hidden sm:block text-[12px] text-text-secondary">
                                              <b className="text-navy">
                                                {booth._count.people}
                                              </b>{' '}
                                              members
                                            </div>
                                            <div className="flex items-center gap-1">
                                              {canCreateBooths && (
                                                <>
                                                  <IconButton
                                                    title="Edit booth"
                                                    onClick={() =>
                                                      setEditing({
                                                        mode: 'edit-booth',
                                                        booth,
                                                        ward,
                                                      })
                                                    }
                                                  >
                                                    <IconEdit size={12} />
                                                  </IconButton>
                                                  <IconButton
                                                    title="Delete booth"
                                                    variant="danger"
                                                    onClick={() =>
                                                      setEditing({
                                                        mode: 'confirm-delete',
                                                        deleteKind: 'booth',
                                                        deleteId: booth.id,
                                                        deleteLabel: booth.name,
                                                        booth,
                                                        ward,
                                                      })
                                                    }
                                                  >
                                                    <IconTrash size={12} />
                                                  </IconButton>
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ---------- MODALS ---------- */}
      {(editing.mode === 'create-block' || editing.mode === 'edit-block') && (
        <BlockFormModal
          block={editing.block}
          onClose={() => setEditing({ mode: null })}
          onSubmit={async (values) => {
            if (editing.mode === 'edit-block' && editing.block) {
              await handleUpdateBlock(editing.block.id, values);
            } else {
              await handleCreateBlock(values);
            }
            setEditing({ mode: null });
          }}
        />
      )}

      {(editing.mode === 'create-ward' || editing.mode === 'edit-ward') && (
        <WardFormModal
          ward={editing.ward}
          blockName={
            editing.mode === 'edit-ward'
              ? editing.ward?.block?.name
              : editing.block?.name
          }
          onClose={() => setEditing({ mode: null })}
          onSubmit={async (values) => {
            if (editing.mode === 'edit-ward' && editing.ward) {
              await handleUpdateWard(
                editing.ward.id,
                editing.ward.blockId,
                values,
              );
            } else if (editing.parentBlockId) {
              await handleCreateWard(editing.parentBlockId, values);
            }
            setEditing({ mode: null });
          }}
        />
      )}

      {(editing.mode === 'create-booth' || editing.mode === 'edit-booth') && (
        <BoothFormModal
          booth={editing.booth}
          wardName={editing.ward?.name}
          onClose={() => setEditing({ mode: null })}
          onSubmit={async (values) => {
            if (editing.mode === 'edit-booth' && editing.booth) {
              await handleUpdateBooth(
                editing.booth.id,
                editing.booth.wardId,
                values,
              );
            } else if (editing.parentWardId && editing.parentBlockId) {
              await handleCreateBooth(
                editing.parentWardId,
                editing.parentBlockId,
                values,
              );
            }
            setEditing({ mode: null });
          }}
        />
      )}

      {editing.mode === 'confirm-delete' && editing.deleteKind && editing.deleteId && (
        <ConfirmDeleteModal
          kind={editing.deleteKind}
          label={editing.deleteLabel ?? ''}
          onClose={() => setEditing({ mode: null })}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

// ========= Sub-components =========

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-border rounded-sm px-5 py-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-text-muted uppercase mb-2">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-bold text-navy tracking-tight">{value}</div>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
  variant = 'neutral',
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  variant?: 'neutral' | 'danger';
}) {
  const variantClass =
    variant === 'danger'
      ? 'text-text-muted hover:text-red-600 hover:bg-red-50'
      : 'text-text-muted hover:text-primary hover:bg-primary-bg';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${variantClass}`}
    >
      {children}
    </button>
  );
}

// ---------- Block Form Modal ----------
function BlockFormModal({
  block,
  onClose,
  onSubmit,
}: {
  block?: BlockWithCount;
  onClose: () => void;
  onSubmit: (values: { name: string; district: string; state?: string }) => Promise<void>;
}) {
  const [name, setName] = useState(block?.name ?? '');
  const [district, setDistrict] = useState(block?.district ?? '');
  const [state, setState] = useState(block?.state ?? 'Punjab');
  const [submitting, setSubmitting] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), district: district.trim(), state: state.trim() });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to save';
      toast.error(message);
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={block ? 'Edit block' : 'New block'}
      subtitle="A block is the top level of your organization."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-text-secondary hover:text-navy px-3 py-1.5 font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="block-form"
            disabled={submitting}
            className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white text-[13px] font-semibold px-4 py-1.5 rounded-sm transition-colors"
          >
            {submitting ? 'Saving…' : block ? 'Save changes' : 'Create block'}
          </button>
        </>
      }
    >
      <form id="block-form" onSubmit={handle} className="space-y-4">
        <Field label="Block name" required>
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Block 4"
            className="w-full border border-border rounded-sm bg-white px-3 py-2 text-[14px]"
          />
        </Field>
        <Field label="District" required>
          <input
            required
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            placeholder="Ludhiana"
            className="w-full border border-border rounded-sm bg-white px-3 py-2 text-[14px]"
          />
        </Field>
        <Field label="State">
          <input
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="Punjab"
            className="w-full border border-border rounded-sm bg-white px-3 py-2 text-[14px]"
          />
        </Field>
      </form>
    </Modal>
  );
}

// ---------- Ward Form Modal ----------
function WardFormModal({
  ward,
  blockName,
  onClose,
  onSubmit,
}: {
  ward?: WardWithCount;
  blockName?: string;
  onClose: () => void;
  onSubmit: (values: { name: string }) => Promise<void>;
}) {
  const [name, setName] = useState(ward?.name ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim() });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to save';
      toast.error(message);
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={ward ? 'Edit ward' : 'New ward'}
      subtitle={blockName ? `In block: ${blockName}` : 'Wards belong to a block.'}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-text-secondary hover:text-navy px-3 py-1.5 font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="ward-form"
            disabled={submitting}
            className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white text-[13px] font-semibold px-4 py-1.5 rounded-sm transition-colors"
          >
            {submitting ? 'Saving…' : ward ? 'Save changes' : 'Create ward'}
          </button>
        </>
      }
    >
      <form id="ward-form" onSubmit={handle} className="space-y-4">
        <Field label="Ward name" required>
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ward 7 — Sarabha Nagar"
            className="w-full border border-border rounded-sm bg-white px-3 py-2 text-[14px]"
          />
        </Field>
      </form>
    </Modal>
  );
}

// ---------- Booth Form Modal ----------
function BoothFormModal({
  booth,
  wardName,
  onClose,
  onSubmit,
}: {
  booth?: BoothWithCount;
  wardName?: string;
  onClose: () => void;
  onSubmit: (values: { name: string; location?: string }) => Promise<void>;
}) {
  const [name, setName] = useState(booth?.name ?? '');
  const [location, setLocation] = useState(booth?.location ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        location: location.trim() ? location.trim() : undefined,
      });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Failed to save';
      toast.error(message);
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={booth ? 'Edit booth' : 'New booth'}
      subtitle={wardName ? `In ward: ${wardName}` : 'Booths belong to a ward.'}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-text-secondary hover:text-navy px-3 py-1.5 font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="booth-form"
            disabled={submitting}
            className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white text-[13px] font-semibold px-4 py-1.5 rounded-sm transition-colors"
          >
            {submitting ? 'Saving…' : booth ? 'Save changes' : 'Create booth'}
          </button>
        </>
      }
    >
      <form id="booth-form" onSubmit={handle} className="space-y-4">
        <Field label="Booth name" required>
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Booth 12"
            className="w-full border border-border rounded-sm bg-white px-3 py-2 text-[14px]"
          />
        </Field>
        <Field label="Location / address">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Government Primary School, Sarabha Nagar"
            className="w-full border border-border rounded-sm bg-white px-3 py-2 text-[14px]"
          />
        </Field>
      </form>
    </Modal>
  );
}

// ---------- Confirm delete modal ----------
function ConfirmDeleteModal({
  kind,
  label,
  onClose,
  onConfirm,
}: {
  kind: 'block' | 'ward' | 'booth';
  label: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handle() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`Delete ${kind}`}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-text-secondary hover:text-navy px-3 py-1.5 font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handle}
            disabled={submitting}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-[13px] font-semibold px-4 py-1.5 rounded-sm transition-colors"
          >
            {submitting ? 'Deleting…' : `Delete ${kind}`}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
          <IconAlertTriangle size={18} />
        </div>
        <div>
          <div className="text-sm text-navy font-medium">
            Delete <span className="font-bold">{label}</span>?
          </div>
          <p className="text-[13px] text-text-secondary mt-1 leading-relaxed">
            This cannot be undone.{' '}
            {kind === 'block' && 'The block must be empty of wards and members.'}
            {kind === 'ward' && 'The ward must be empty of booths and members.'}
            {kind === 'booth' && 'The booth must be empty of members.'}
          </p>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Small form field helper ----------
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-navy-light mb-1.5">
        {label}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

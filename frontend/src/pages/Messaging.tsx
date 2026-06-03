import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth.store';
import {
  messagingApi,
  type MessageRecord,
  type SendMessagePayload,
} from '../api/messaging.api';
import {
  wardsApi,
  boothsApi,
  type WardWithCount,
  type BoothWithCount,
} from '../api/hierarchy.api';
import { peopleApi } from '../api/people.api';
import { healthApi, type HealthInfo } from '../api/health.api';
import { AdminRole, MessageType, TargetLevel } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';
import Modal from '../components/ui/Modal';
import {
  IconMessageSquare,
  IconMail,
  IconPhone,
  IconSend,
  IconAlertTriangle,
  IconCheckCircle,
  IconLayers,
  IconRefresh,
} from '../components/ui/Icon';

// Hardcoded message templates per Phase 3 spec.
interface MessageTemplate {
  id: string;
  name: string;
  language: 'EN' | 'HI' | 'PA';
  type: MessageType;
  subject?: string;
  content: string;
}

const TEMPLATES: MessageTemplate[] = [
  {
    id: 'rally-hi',
    name: 'Rally invitation',
    language: 'HI',
    type: MessageType.SMS,
    content:
      'नमस्ते {name} जी, आज शाम 5 बजे {ward} में जनसभा है। कृपया पधारें। - JanSeva',
  },
  {
    id: 'attendance-en',
    name: 'Attendance reminder',
    language: 'EN',
    type: MessageType.WHATSAPP,
    content:
      'Hi {name}, please confirm your attendance for tomorrow’s meeting at {booth}. Reply YES to confirm.',
  },
  {
    id: 'birthday-pa',
    name: 'Birthday greetings',
    language: 'PA',
    type: MessageType.SMS,
    content:
      'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ {name} ਜੀ, ਜਨਮਦਿਨ ਦੀਆਂ ਲੱਖ ਲੱਖ ਮੁਬਾਰਕਾਂ! - JanSeva',
  },
  {
    id: 'announce-en',
    name: 'General announcement',
    language: 'EN',
    type: MessageType.EMAIL,
    subject: 'Update from JanSeva',
    content:
      '<p>Dear {name},</p><p>This is an update for members of {ward}.</p><p>—<br/>JanSeva Team</p>',
  },
];

const VAR_BUTTONS = [
  { token: '{name}', label: 'Name' },
  { token: '{ward}', label: 'Ward' },
  { token: '{booth}', label: 'Booth' },
  { token: '{id}', label: 'JS-id' },
  { token: '{phone}', label: 'Phone' },
];

const TYPE_LABEL: Record<MessageType, string> = {
  [MessageType.SMS]: 'SMS',
  [MessageType.WHATSAPP]: 'WhatsApp',
  [MessageType.EMAIL]: 'Email',
};

const TARGET_LABEL: Record<TargetLevel, string> = {
  [TargetLevel.ALL]: 'All members',
  [TargetLevel.BLOCK]: 'Whole block',
  [TargetLevel.WARD]: 'Specific ward',
  [TargetLevel.BOOTH]: 'Specific booth',
};

export default function Messaging() {
  const user = useAuthStore((s) => s.user);
  usePageTitle('Messaging');
  const [searchParams] = useSearchParams();

  // ----- Compose state -----
  const [type, setType] = useState<MessageType>(MessageType.SMS);
  const [content, setContent] = useState('');
  const [subject, setSubject] = useState('');
  const [targetLevel, setTargetLevel] = useState<TargetLevel>(TargetLevel.ALL);
  const [wardId, setWardId] = useState<string>('');
  const [boothId, setBoothId] = useState<string>('');

  const [wards, setWards] = useState<WardWithCount[]>([]);
  const [booths, setBooths] = useState<BoothWithCount[]>([]);
  const [estimateCount, setEstimateCount] = useState<number | null>(null);

  // Pre-fill from a personId query param (used by PersonDetail "Send message")
  const prefillPersonId = searchParams.get('personId');

  // Confirmation modal
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);

  // ----- History state -----
  const [history, setHistory] = useState<MessageRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ----- Health / demo mode -----
  const [health, setHealth] = useState<HealthInfo | null>(null);
  useEffect(() => {
    healthApi.get().then(setHealth);
  }, []);

  // Load wards on mount.
  useEffect(() => {
    (async () => {
      try {
        const ws = await wardsApi.list();
        setWards(ws);
      } catch {
        setWards([]);
      }
    })();
  }, []);

  // Load booths whenever the ward changes.
  useEffect(() => {
    if (!wardId) {
      setBooths([]);
      setBoothId('');
      return;
    }
    (async () => {
      try {
        const bs = await boothsApi.list({ wardId });
        setBooths(bs);
      } catch {
        setBooths([]);
      }
    })();
  }, [wardId]);

  // Lock ward/booth scope for ward-admins / booth-workers.
  useEffect(() => {
    if (!user) return;
    if (user.role === AdminRole.WARD_ADMIN) {
      setTargetLevel(TargetLevel.WARD);
      if (user.wardId) setWardId(user.wardId);
    } else if (user.role === AdminRole.BOOTH_WORKER) {
      setTargetLevel(TargetLevel.BOOTH);
      if (user.boothId) setBoothId(user.boothId);
    }
  }, [user]);

  // Recipient count estimator. We use peopleApi.list with limit=1 to get
  // the total without dragging full rows over the wire.
  const recomputeEstimate = useCallback(async () => {
    try {
      const params: any = { limit: 1 };
      switch (targetLevel) {
        case TargetLevel.ALL:
        case TargetLevel.BLOCK:
          if (user?.blockId) params.blockId = user.blockId;
          break;
        case TargetLevel.WARD:
          if (!wardId) {
            setEstimateCount(null);
            return;
          }
          params.wardId = wardId;
          break;
        case TargetLevel.BOOTH:
          if (!boothId) {
            setEstimateCount(null);
            return;
          }
          params.boothId = boothId;
          break;
      }
      params.status = 'ACTIVE';
      const res = await peopleApi.list(params);
      setEstimateCount(res.total);
    } catch {
      setEstimateCount(null);
    }
  }, [targetLevel, wardId, boothId, user?.blockId]);

  useEffect(() => {
    recomputeEstimate();
  }, [recomputeEstimate]);

  // Load history.
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await messagingApi.list({ limit: 20 });
      setHistory(res.items);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // If we were sent here from a person, default to a single-target send by
  // pre-filling the textarea with their name. We don't have a per-person
  // backend route, so the operator can either send to ALL/WARD/BOOTH
  // around them, or just use the pre-filled name token.
  useEffect(() => {
    if (!prefillPersonId) return;
    (async () => {
      try {
        const p = await peopleApi.get(prefillPersonId);
        setContent((c) => c || `Hi ${p.fullName}, `);
        if (p.boothId) {
          setTargetLevel(TargetLevel.BOOTH);
          setWardId(p.wardId);
          setBoothId(p.boothId);
        }
      } catch {
        // ignore
      }
    })();
  }, [prefillPersonId]);

  // Helpers
  function insertVar(token: string) {
    setContent((c) => c + token);
  }

  function applyTemplate(t: MessageTemplate) {
    setType(t.type);
    setContent(t.content);
    if (t.subject) setSubject(t.subject);
  }

  function previewBody(): string {
    return content
      .replace(/\{name\}/g, 'Ravi Kumar')
      .replace(/\{ward\}/g, 'Ward 12')
      .replace(/\{booth\}/g, 'Booth 7')
      .replace(/\{id\}/g, 'JS-000123')
      .replace(/\{phone\}/g, '9876543210');
  }

  const charCount = content.length;
  const charWarn =
    type === MessageType.SMS
      ? charCount > 160
      : type === MessageType.WHATSAPP
        ? charCount > 4096
        : false;
  const charLimit =
    type === MessageType.SMS ? 160 : type === MessageType.WHATSAPP ? 4096 : null;

  function validate(): string | null {
    if (!content.trim()) return 'Message body is required';
    if (type === MessageType.EMAIL && !subject.trim())
      return 'Email needs a subject';
    if (targetLevel === TargetLevel.WARD && !wardId)
      return 'Pick a ward to send to';
    if (targetLevel === TargetLevel.BOOTH && !boothId)
      return 'Pick a booth to send to';
    if ((estimateCount ?? 0) === 0) return 'No recipients matched';
    return null;
  }

  async function onSendConfirmed() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSending(true);
    try {
      const payload: SendMessagePayload = {
        type,
        content,
        subject: type === MessageType.EMAIL ? subject : undefined,
        targetLevel,
        targetId:
          targetLevel === TargetLevel.WARD
            ? wardId
            : targetLevel === TargetLevel.BOOTH
              ? boothId
              : undefined,
        blockId: user?.blockId ?? undefined,
      };
      const res = await messagingApi.send(payload);
      toast.success(res.message);
      setShowConfirm(false);
      setContent('');
      setSubject('');
      // Refresh history shortly so the new row appears with status.
      window.setTimeout(loadHistory, 500);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Send failed');
    } finally {
      setSending(false);
    }
  }

  const validation = validate();
  const sendDisabled = Boolean(validation) || sending;

  return (
    <div className="min-h-screen bg-surface px-6 py-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-navy tracking-tight flex items-center gap-2">
              <IconMessageSquare size={22} /> Messaging
            </h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Send SMS, WhatsApp, or email broadcasts to members in your block.
              Templates support per-recipient substitution.
            </p>
          </div>
        </div>

        {health && !providersAllConfigured(health) && (
          <div className="mb-5 bg-status-amber-bg border border-status-amber/30 rounded p-3 flex items-start gap-2.5 text-status-amber">
            <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div className="text-xs leading-relaxed">
              <strong className="font-semibold">Demo mode</strong>
              {' — '}
              {!health.providers.sms && 'SMS '}
              {!health.providers.whatsapp && 'WhatsApp '}
              {!health.providers.email && 'Email '}
              provider{providerMissingCount(health) > 1 ? 's are' : ' is'} not
              configured. Messages will be marked as <em>Simulated</em> in the
              history below — no real send will occur. Configure provider
              credentials in <code className="font-mono">.env</code> to enable
              live sending.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ============ Compose (left, 2/3) ============ */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-border rounded shadow-card p-5">
              {/* Channel tabs */}
              <div className="flex border border-border rounded overflow-hidden mb-4 text-sm">
                {(
                  [
                    { k: MessageType.SMS, label: 'SMS', icon: <IconPhone size={14} /> },
                    {
                      k: MessageType.WHATSAPP,
                      label: 'WhatsApp',
                      icon: <IconMessageSquare size={14} />,
                    },
                    { k: MessageType.EMAIL, label: 'Email', icon: <IconMail size={14} /> },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.k}
                    onClick={() => setType(t.k)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 font-semibold transition-colors ${
                      type === t.k
                        ? 'bg-primary text-white'
                        : 'bg-white text-text-secondary hover:bg-surface-subtle'
                    }`}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>

              {/* Send to */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                    Send to
                  </label>
                  <select
                    value={targetLevel}
                    onChange={(e) =>
                      setTargetLevel(e.target.value as TargetLevel)
                    }
                    disabled={
                      user?.role === AdminRole.WARD_ADMIN ||
                      user?.role === AdminRole.BOOTH_WORKER
                    }
                    className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary disabled:bg-surface-subtle"
                  >
                    {(
                      [
                        TargetLevel.ALL,
                        TargetLevel.WARD,
                        TargetLevel.BOOTH,
                      ] as const
                    ).map((t) => (
                      <option key={t} value={t}>
                        {TARGET_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-sm flex items-end">
                  <div className="text-[11px] text-text-secondary leading-relaxed">
                    Estimated recipients:{' '}
                    {estimateCount === null ? (
                      <span className="text-text-muted">—</span>
                    ) : (
                      <strong className="text-navy text-base">
                        {estimateCount.toLocaleString('en-IN')}
                      </strong>
                    )}
                  </div>
                </div>
              </div>

              {targetLevel === TargetLevel.WARD && (
                <div className="mb-3">
                  <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                    Ward
                  </label>
                  <select
                    value={wardId}
                    onChange={(e) => setWardId(e.target.value)}
                    disabled={user?.role === AdminRole.WARD_ADMIN}
                    className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary disabled:bg-surface-subtle"
                  >
                    <option value="">Select ward…</option>
                    {wards.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w._count.people})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {targetLevel === TargetLevel.BOOTH && (
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                      Ward
                    </label>
                    <select
                      value={wardId}
                      onChange={(e) => setWardId(e.target.value)}
                      disabled={user?.role === AdminRole.BOOTH_WORKER}
                      className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary disabled:bg-surface-subtle"
                    >
                      <option value="">Select ward…</option>
                      {wards.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                      Booth
                    </label>
                    <select
                      value={boothId}
                      onChange={(e) => setBoothId(e.target.value)}
                      disabled={
                        user?.role === AdminRole.BOOTH_WORKER || !wardId
                      }
                      className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary disabled:bg-surface-subtle"
                    >
                      <option value="">Select booth…</option>
                      {booths.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b._count.people})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Subject (email only) */}
              {type === MessageType.EMAIL && (
                <div className="mb-3">
                  <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Update from JanSeva"
                    className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              {/* Message body */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
                    {type === MessageType.EMAIL ? 'HTML body' : 'Message'}
                  </label>
                  <div
                    className={`text-[11px] ${
                      charWarn ? 'text-status-amber font-semibold' : 'text-text-muted'
                    }`}
                  >
                    {charCount}
                    {charLimit ? ` / ${charLimit}` : ' chars'}
                  </div>
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={type === MessageType.EMAIL ? 8 : 5}
                  placeholder={
                    type === MessageType.EMAIL
                      ? '<p>Hi {name},</p><p>…</p>'
                      : 'Hi {name}, …'
                  }
                  className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary font-mono"
                />
              </div>

              {/* Variable insert buttons */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {VAR_BUTTONS.map((v) => (
                  <button
                    key={v.token}
                    type="button"
                    onClick={() => insertVar(v.token)}
                    className="px-2 py-0.5 text-[11px] font-semibold border border-border rounded hover:border-primary hover:text-primary text-text-secondary"
                  >
                    + {v.label}
                  </button>
                ))}
              </div>

              {/* Send / Preview */}
              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  className="px-3 py-2 text-sm font-semibold border border-border rounded hover:border-primary hover:text-primary"
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirm(true)}
                  disabled={sendDisabled}
                  className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <IconSend size={14} /> Send
                </button>
              </div>
              {validation && (
                <div className="text-[11px] text-status-amber mt-2 text-right">
                  {validation}
                </div>
              )}
            </div>
          </div>

          {/* ============ Right: templates + history ============ */}
          <div className="space-y-4">
            <div className="bg-white border border-border rounded shadow-card p-5">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-navy uppercase tracking-wide mb-3">
                <IconLayers size={14} /> Templates
              </h2>
              <ul className="space-y-1.5">
                {TEMPLATES.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="w-full text-left px-3 py-2 rounded border border-border hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-navy">
                          {t.name}
                        </span>
                        <span className="text-[10px] uppercase font-mono bg-surface-subtle border border-border rounded px-1.5 py-0.5 text-text-secondary">
                          {t.language}
                        </span>
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5">
                        {TYPE_LABEL[t.type]} · {t.content.slice(0, 60)}
                        {t.content.length > 60 ? '…' : ''}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white border border-border rounded shadow-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">
                  History
                </h2>
                <button
                  type="button"
                  onClick={loadHistory}
                  className="text-[11px] text-text-muted hover:text-primary inline-flex items-center gap-1"
                  aria-label="Refresh"
                >
                  <IconRefresh size={12} />
                  Refresh
                </button>
              </div>
              {historyLoading ? (
                <div className="py-6 text-center text-xs text-text-muted">
                  Loading…
                </div>
              ) : history.length === 0 ? (
                <div className="py-6 text-center text-xs text-text-muted">
                  No messages sent yet.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {history.map((m) => (
                    <li key={m.id} className="py-2">
                      <div className="flex items-center gap-2">
                        <TypeBadge type={m.type} />
                        <span className="text-sm font-semibold text-navy truncate flex-1">
                          {m.subject ?? m.content.slice(0, 60)}
                        </span>
                        <StatusBadge status={m.status} />
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5">
                        {TARGET_LABEL[m.targetLevel]} ·{' '}
                        {m.recipientCount.toLocaleString('en-IN')} recipient
                        {m.recipientCount === 1 ? '' : 's'}
                        {m.failedCount > 0 && (
                          <span className="text-status-red">
                            {' · '}
                            {m.failedCount} failed
                          </span>
                        )}
                        {' · '}
                        {new Date(m.sentAt).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview modal */}
      {showPreview && (
        <Modal
          open
          onClose={() => setShowPreview(false)}
          title="Preview"
          subtitle="With sample recipient data"
          size="md"
        >
          <div className="space-y-3">
            {type === MessageType.EMAIL && (
              <div>
                <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
                  Subject
                </div>
                <div className="text-sm text-navy">{subject || '(no subject)'}</div>
              </div>
            )}
            <div>
              <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
                Body
              </div>
              {type === MessageType.EMAIL ? (
                <div
                  className="text-sm text-navy bg-surface-subtle border border-border rounded p-3"
                  dangerouslySetInnerHTML={{ __html: previewBody() }}
                />
              ) : (
                <div className="text-sm text-navy bg-surface-subtle border border-border rounded p-3 whitespace-pre-wrap font-mono">
                  {previewBody()}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <Modal
          open
          onClose={() => !sending && setShowConfirm(false)}
          title="Confirm send"
          subtitle="This cannot be undone"
          size="sm"
          footer={
            <>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={sending}
                className="px-4 py-2 text-sm text-text-secondary hover:text-navy"
              >
                Cancel
              </button>
              <button
                onClick={onSendConfirmed}
                disabled={sending}
                className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Confirm send'}
              </button>
            </>
          }
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 shrink-0 rounded-full bg-status-amber-bg text-status-amber flex items-center justify-center">
              <IconAlertTriangle size={18} />
            </div>
            <div className="text-sm text-navy">
              You are about to send this {TYPE_LABEL[type]} to{' '}
              <strong>{(estimateCount ?? 0).toLocaleString('en-IN')}</strong>{' '}
              recipient{estimateCount === 1 ? '' : 's'}. Provider charges may
              apply.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: MessageType }) {
  const cfg =
    type === MessageType.SMS
      ? { label: 'SMS', cls: 'bg-primary-bg text-primary' }
      : type === MessageType.WHATSAPP
        ? {
            label: 'WhatsApp',
            cls: 'bg-status-green-bg text-status-green',
          }
        : { label: 'Email', cls: 'bg-status-amber-bg text-status-amber' };
  return (
    <span
      className={`text-[10px] font-semibold uppercase rounded px-1.5 py-0.5 ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

function providersAllConfigured(h: HealthInfo): boolean {
  return h.providers.sms && h.providers.whatsapp && h.providers.email;
}

function providerMissingCount(h: HealthInfo): number {
  let n = 0;
  if (!h.providers.sms) n++;
  if (!h.providers.whatsapp) n++;
  if (!h.providers.email) n++;
  return n;
}

function StatusBadge({ status }: { status: string }) {
  const cfg =
    status === 'sent'
      ? { label: 'Sent', cls: 'text-status-green' }
      : status === 'sending'
        ? { label: 'Sending', cls: 'text-status-amber' }
        : status === 'partial'
          ? { label: 'Partial', cls: 'text-status-amber' }
          : status === 'demo'
            ? { label: 'Simulated', cls: 'text-status-amber' }
            : status === 'failed'
              ? { label: 'Failed', cls: 'text-status-red' }
              : { label: status, cls: 'text-text-muted' };
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wide ${cfg.cls} inline-flex items-center gap-0.5`}
      title={
        status === 'demo'
          ? 'Demo mode: provider not configured, no real message sent'
          : undefined
      }
    >
      {(status === 'sent' || status === 'demo') && <IconCheckCircle size={10} />}
      {cfg.label}
    </span>
  );
}


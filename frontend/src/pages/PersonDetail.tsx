import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth.store';
import { peopleApi, type PersonDetail as PersonDetailType } from '../api/people.api';
import { idCardsApi, type IdCardDetail } from '../api/idcards.api';
import {
  attendanceApi,
  type PersonAttendanceItem,
} from '../api/attendance.api';
import { AdminRole, AttendanceMethod, EventType } from '../types';
import IdCard from '../components/IdCard';
import Modal from '../components/ui/Modal';
import {
  IconEdit,
  IconTrash,
  IconUser,
  IconMail,
  IconMapPin,
  IconShield,
  IconCheckCircle,
  IconAlertTriangle,
  IconActivity,
  IconPrinter,
  IconCreditCard,
  IconFingerprint,
  IconSend,
} from '../components/ui/Icon';
import {
  probeStatus,
  capture as mantraCapture,
  fakeCapture,
  MantraError,
  type ScannerInfo,
} from '../lib/mantra';

const EVENT_TYPE_LABEL: Record<EventType, string> = {
  RALLY: 'Rally',
  MEETING: 'Meeting',
  FUNCTION: 'Function',
  GET_TOGETHER: 'Get-together',
};

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [person, setPerson] = useState<PersonDetailType | null>(null);
  const [card, setCard] = useState<IdCardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [attendance, setAttendance] = useState<PersonAttendanceItem[]>([]);
  const [attendanceTotal, setAttendanceTotal] = useState(0);
  const [fpEnrolled, setFpEnrolled] = useState<boolean | null>(null);
  const [showEnroll, setShowEnroll] = useState(false);

  const canEdit = useMemo(() => {
    return (
      user?.role === AdminRole.SUPER_ADMIN ||
      user?.role === AdminRole.BLOCK_ADMIN ||
      user?.role === AdminRole.WARD_ADMIN ||
      user?.role === AdminRole.BOOTH_WORKER
    );
  }, [user]);

  async function loadAll() {
    if (!id) return;
    setLoading(true);
    try {
      const p = await peopleApi.get(id);
      setPerson(p);
      if (p.idCard) {
        try {
          const c = await idCardsApi.get(p.id);
          setCard(c);
        } catch {
          setCard(null);
        }
      } else {
        setCard(null);
      }
      // Attendance history is non-blocking: keep page usable even if this fails.
      try {
        const att = await attendanceApi.listForPerson(p.id, { limit: 10 });
        setAttendance(att.items);
        setAttendanceTotal(att.total);
      } catch {
        setAttendance([]);
        setAttendanceTotal(0);
      }
      // Fingerprint enrollment status — also non-blocking.
      try {
        const fp = await peopleApi.fingerprintStatus(p.id);
        setFpEnrolled(fp.enrolled);
      } catch {
        setFpEnrolled(null);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to load member');
      navigate('/people');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onIssue() {
    if (!person) return;
    setIssuing(true);
    try {
      const c = await idCardsApi.issue(person.id);
      setCard(c);
      toast.success('ID card issued');
      await loadAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to issue card');
    } finally {
      setIssuing(false);
    }
  }

  async function onDelete() {
    if (!person) return;
    setDeleting(true);
    try {
      await peopleApi.remove(person.id);
      toast.success('Member deleted');
      navigate('/people');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Delete failed');
      setDeleting(false);
    }
  }

  if (loading || !person) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-text-muted">Loading…</div>
      </div>
    );
  }

  const dob = person.dob
    ? new Date(person.dob).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

  return (
    <div className="min-h-screen bg-surface px-6 py-8 print:bg-white print:px-0">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 print:hidden">
          <Link
            to="/people"
            className="text-xs text-text-secondary hover:text-primary"
          >
            ← Back to members
          </Link>
          <div className="flex items-center justify-between mt-2">
            <div>
              <h1 className="text-2xl font-bold text-navy tracking-tight">
                {person.fullName}
              </h1>
              <div className="text-sm text-text-secondary mt-0.5 font-mono">
                {person.uniqueId}
              </div>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2">
                <Link
                  to={`/messaging?personId=${person.id}`}
                  className="flex items-center gap-1.5 text-sm font-semibold border border-border bg-white hover:border-primary hover:text-primary px-3 py-1.5 rounded transition-colors"
                >
                  <IconSend size={14} /> Message
                </Link>
                <button
                  onClick={() => navigate(`/people/${person.id}/edit`)}
                  className="flex items-center gap-1.5 text-sm font-semibold border border-border bg-white hover:border-primary px-3 py-1.5 rounded transition-colors"
                >
                  <IconEdit size={14} /> Edit
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-sm font-semibold border border-border bg-white text-status-red hover:border-status-red px-3 py-1.5 rounded transition-colors"
                >
                  <IconTrash size={14} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Details */}
          <div className="lg:col-span-2 space-y-4 print:hidden">
            {/* Profile card */}
            <div className="bg-white border border-border rounded shadow-card p-6">
              <div className="flex gap-5">
                <div className="w-28 h-32 shrink-0 bg-surface-subtle border border-border rounded overflow-hidden flex items-center justify-center text-text-muted">
                  {person.photoUrl ? (
                    <img
                      src={person.photoUrl}
                      alt={person.fullName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <IconUser size={42} />
                  )}
                </div>
                <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <DetailRow label="Father / Spouse" value={person.fatherName ?? '—'} />
                  <DetailRow label="DOB" value={dob} />
                  <DetailRow label="Gender" value={formatLabel(person.gender)} />
                  <DetailRow label="Category" value={formatLabel(person.category)} />
                  <DetailRow
                    label="Role"
                    value={formatLabel(person.role)}
                  />
                  <DetailRow
                    label="Status"
                    value={formatLabel(person.status)}
                  />
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="bg-white border border-border rounded shadow-card p-6">
              <SectionHeading icon={<IconMail size={14} />}>
                Contact
              </SectionHeading>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <DetailRow label="Phone" value={person.phone} mono />
                <DetailRow label="WhatsApp" value={person.whatsapp ?? '—'} mono />
                <DetailRow label="Email" value={person.email ?? '—'} />
                <DetailRow label="Occupation" value={person.occupation ?? '—'} />
              </div>
            </div>

            {/* Identity */}
            <div className="bg-white border border-border rounded shadow-card p-6">
              <SectionHeading icon={<IconShield size={14} />}>
                Identity
              </SectionHeading>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <DetailRow
                  label="Aadhaar"
                  value={person.aadhaarNumber ?? '—'}
                  mono
                />
                <DetailRow label="Voter ID" value={person.voterId ?? '—'} mono />
                <DetailRow label="Caste" value={person.caste ?? '—'} />
                <DetailRow label="Pincode" value={person.pincode ?? '—'} mono />
              </div>
              {person.aadhaarImageUrl && (
                <div className="mt-4">
                  <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
                    Aadhaar Image
                  </div>
                  <a
                    href={person.aadhaarImageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block max-w-xs rounded overflow-hidden border border-border hover:border-primary"
                  >
                    <img
                      src={person.aadhaarImageUrl}
                      alt="Aadhaar"
                      className="w-full h-auto"
                    />
                  </a>
                </div>
              )}
            </div>

            {/* Location */}
            <div className="bg-white border border-border rounded shadow-card p-6">
              <SectionHeading icon={<IconMapPin size={14} />}>
                Location
              </SectionHeading>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <DetailRow
                  label="Block"
                  value={`${person.block?.name ?? '—'}, ${person.block?.district ?? ''}`}
                />
                <DetailRow label="Ward" value={person.ward?.name ?? '—'} />
                <DetailRow
                  label="Booth"
                  value={
                    person.booth
                      ? `${person.booth.name}${person.booth.location ? ` — ${person.booth.location}` : ''}`
                      : '—'
                  }
                />
                <DetailRow label="Address" value={person.address ?? '—'} />
              </div>
            </div>

            {/* Attendance history */}
            <div className="bg-white border border-border rounded shadow-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-navy uppercase tracking-wide">
                  <span className="text-primary">
                    <IconActivity size={14} />
                  </span>
                  Attendance history
                </h2>
                <span className="text-[11px] font-semibold text-text-secondary bg-surface-subtle border border-border rounded px-2 py-0.5">
                  {attendanceTotal} event{attendanceTotal === 1 ? '' : 's'}
                </span>
              </div>
              {attendance.length === 0 ? (
                <div className="text-xs text-text-muted py-4 text-center border border-dashed border-border rounded">
                  No events attended yet.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {attendance.map((a) => {
                    const d = new Date(a.event.date);
                    const dateLabel = d.toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    });
                    const markedAt = new Date(a.markedAt).toLocaleTimeString(
                      'en-IN',
                      { hour: '2-digit', minute: '2-digit' },
                    );
                    return (
                      <li key={a.id} className="py-3 flex items-start gap-3">
                        <div className="w-9 h-9 shrink-0 rounded bg-primary-bg text-primary flex items-center justify-center">
                          <IconActivity size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-navy truncate">
                              {a.event.name}
                            </span>
                            <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide bg-surface-subtle border border-border rounded px-1.5 py-0.5">
                              {EVENT_TYPE_LABEL[a.event.type]}
                            </span>
                          </div>
                          <div className="text-xs text-text-secondary mt-0.5">
                            {dateLabel}
                            {a.event.location ? ` · ${a.event.location}` : ''}
                            {' · marked at '}
                            {markedAt}
                          </div>
                        </div>
                        <MethodBadge method={a.method} />
                      </li>
                    );
                  })}
                </ul>
              )}
              {attendanceTotal > attendance.length && (
                <div className="text-[11px] text-text-muted mt-3 pt-3 border-t border-border">
                  Showing latest {attendance.length} of {attendanceTotal}.
                </div>
              )}
            </div>
          </div>

          {/* Right column: ID card */}
          <div className="space-y-4">
            <div className="bg-white border border-border rounded shadow-card p-5 print:hidden">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">
                  ID Card
                </h2>
                {card ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-status-green">
                    <IconCheckCircle size={12} /> Active
                  </span>
                ) : (
                  <span className="text-[11px] text-text-muted">Not issued</span>
                )}
              </div>

              {card ? (
                <div className="space-y-3">
                  <IdCard card={card} />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => window.print()}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-navy text-white rounded hover:bg-navy-light transition-colors"
                    >
                      <IconPrinter size={13} /> Print
                    </button>
                    <Link
                      to={`/id-cards?personId=${person.id}`}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border text-navy bg-white hover:border-primary hover:text-primary rounded transition-colors"
                    >
                      <IconCreditCard size={13} /> ID tools
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-text-secondary">
                    No ID card issued for this member yet.
                  </p>
                  {canEdit && (
                    <button
                      onClick={onIssue}
                      disabled={issuing}
                      className="w-full px-3 py-2 text-xs font-semibold bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50 transition-colors"
                    >
                      {issuing ? 'Issuing…' : 'Issue ID Card'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Fingerprint enrollment */}
            <div className="bg-white border border-border rounded shadow-card p-5 print:hidden">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide flex items-center gap-1.5">
                  <span className="text-primary">
                    <IconFingerprint size={14} />
                  </span>
                  Fingerprint
                </h2>
                {fpEnrolled === true ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-status-green">
                    <IconCheckCircle size={12} /> Enrolled
                  </span>
                ) : fpEnrolled === false ? (
                  <span className="text-[11px] text-text-muted">
                    Not enrolled
                  </span>
                ) : (
                  <span className="text-[11px] text-text-muted">…</span>
                )}
              </div>
              <p className="text-xs text-text-secondary mb-3">
                {fpEnrolled
                  ? 'A fingerprint is on file. You can re-enroll if the scan quality was poor.'
                  : 'Enroll a fingerprint to enable biometric attendance marking.'}
              </p>
              {canEdit && (
                <button
                  onClick={() => setShowEnroll(true)}
                  className="w-full px-3 py-2 text-xs font-semibold bg-primary text-white rounded hover:bg-primary-dark transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <IconFingerprint size={13} />
                  {fpEnrolled ? 'Re-enroll fingerprint' : 'Enroll fingerprint'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Print-only: full-size card */}
        {card && (
          <div className="hidden print:flex print:justify-center print:mt-12">
            <IdCard card={card} />
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <Modal
        open={confirmDelete}
        onClose={() => !deleting && setConfirmDelete(false)}
        title="Delete member?"
        subtitle="This action cannot be undone."
        size="sm"
        footer={
          <>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="px-4 py-2 text-sm text-text-secondary hover:text-navy transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onDelete}
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
            Permanently delete <strong>{person.fullName}</strong>? Their ID card
            and uploaded documents will also be removed.
          </div>
        </div>
      </Modal>

      {/* Fingerprint enrollment modal */}
      {showEnroll && (
        <EnrollFingerprintModal
          personId={person.id}
          personName={person.fullName}
          alreadyEnrolled={fpEnrolled === true}
          onClose={() => setShowEnroll(false)}
          onEnrolled={() => {
            setFpEnrolled(true);
            setShowEnroll(false);
            toast.success('Fingerprint enrolled');
          }}
        />
      )}
    </div>
  );
}

function SectionHeading({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-1.5 text-sm font-bold text-navy uppercase tracking-wide mb-4">
      <span className="text-primary">{icon}</span>
      {children}
    </h2>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
        {label}
      </div>
      <div className={`text-navy ${mono ? 'font-mono text-xs' : 'text-sm'}`}>
        {value}
      </div>
    </div>
  );
}

function formatLabel(v: string): string {
  return v.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Fingerprint enrollment modal — probes the local Mantra RD Service,
 * captures one template, and POSTs it to /people/:id/enroll-fingerprint.
 * Re-enrollment is allowed; the backend overwrites the previous template.
 */
function EnrollFingerprintModal({
  personId,
  personName,
  alreadyEnrolled,
  onClose,
  onEnrolled,
}: {
  personId: string;
  personName: string;
  alreadyEnrolled: boolean;
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const [info, setInfo] = useState<ScannerInfo | null>(null);
  const [probing, setProbing] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setProbing(true);
    setInfo(await probeStatus());
    setProbing(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onCapture(mode: 'real' | 'demo' = 'real') {
    if (capturing) return;
    setErrorMsg(null);
    setCapturing(true);
    try {
      const cap =
        mode === 'demo' ? fakeCapture() : await mantraCapture({ timeoutMs: 10000 });
      setCaptured(cap.fingerprintTemplate);
    } catch (err: any) {
      if (err instanceof MantraError) {
        if (err.code === 'NOT_RUNNING') {
          setErrorMsg(
            'Mantra RD Service is not running. Install the driver, or use Demo capture below.',
          );
        } else if (err.code === 'TIMEOUT' || err.code === 'NO_FINGER') {
          setErrorMsg(
            'No finger detected within 10 seconds. Place finger firmly and retry.',
          );
        } else {
          setErrorMsg(err.message);
        }
      } else {
        setErrorMsg(err?.message ?? 'Capture failed');
      }
    } finally {
      setCapturing(false);
    }
  }

  async function onSave() {
    if (!captured) return;
    setSaving(true);
    try {
      await peopleApi.enrollFingerprint(personId, captured);
      onEnrolled();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => !saving && !capturing && onClose()}
      title={alreadyEnrolled ? 'Re-enroll fingerprint' : 'Enroll fingerprint'}
      subtitle={personName}
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={saving || capturing}
            className="px-4 py-2 text-sm text-text-secondary hover:text-navy transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!captured || saving}
            className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save fingerprint'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold">
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
          {!probing && (
            <button
              type="button"
              onClick={refresh}
              className="ml-auto text-[10px] text-primary hover:underline"
            >
              Refresh
            </button>
          )}
        </div>

        <div className="flex items-center justify-center py-4">
          <div
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-colors ${
              capturing
                ? 'bg-primary text-white animate-pulse'
                : captured
                  ? 'bg-status-green-bg text-status-green'
                  : info?.available
                    ? 'bg-primary-bg text-primary'
                    : 'bg-surface-subtle text-text-muted'
            }`}
          >
            {captured ? (
              <IconCheckCircle size={42} />
            ) : (
              <IconFingerprint size={42} />
            )}
          </div>
        </div>

        <div className="text-center text-sm font-semibold text-navy">
          {capturing
            ? 'Place finger on scanner…'
            : captured
              ? 'Fingerprint captured — review and save'
              : info?.available
                ? 'Press capture and place your finger'
                : 'Connect a Mantra MFS100 to continue'}
        </div>

        {errorMsg && (
          <div className="text-xs text-status-red text-center">{errorMsg}</div>
        )}

        {captured && (
          <div className="text-[10px] text-text-muted font-mono break-all bg-surface-subtle border border-border rounded p-2 max-h-20 overflow-y-auto">
            {captured.slice(0, 200)}
            {captured.length > 200 ? '…' : ''}
          </div>
        )}

        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => onCapture('real')}
            disabled={!info?.available || capturing}
            className="px-3 py-2 text-xs font-semibold border border-border rounded hover:border-primary hover:text-primary disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <IconFingerprint size={13} />
            {capturing ? 'Capturing…' : captured ? 'Re-capture' : 'Capture'}
          </button>
          <button
            type="button"
            onClick={() => onCapture('demo')}
            disabled={capturing}
            title="Simulate a capture without the Mantra device — useful for demos"
            className="px-3 py-2 text-xs font-semibold border border-dashed border-status-amber/50 text-status-amber rounded hover:bg-status-amber-bg disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            Demo capture
          </button>
        </div>

        {!info?.available && !probing && (
          <div className="text-[11px] text-text-muted text-center">
            <a
              href="https://mantratecapp.com/MFS100Device.html"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Install Mantra RD Service →
            </a>
          </div>
        )}
      </div>
    </Modal>
  );
}

function MethodBadge({ method }: { method: AttendanceMethod }) {
  const config: Record<
    AttendanceMethod,
    { label: string; className: string }
  > = {
    [AttendanceMethod.QR]: {
      label: 'QR',
      className: 'bg-primary-bg text-primary border-primary/30',
    },
    [AttendanceMethod.FINGERPRINT]: {
      label: 'Fingerprint',
      className: 'bg-navy/10 text-navy border-navy/20',
    },
    [AttendanceMethod.MANUAL]: {
      label: 'Manual',
      className: 'bg-status-amber-bg text-status-amber border-status-amber/30',
    },
  };
  const c = config[method];
  return (
    <span
      className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 ${c.className}`}
    >
      {c.label}
    </span>
  );
}

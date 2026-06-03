import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth.store';
import {
  peopleApi,
  type CreatePersonPayload,
  type UpdatePersonPayload,
} from '../api/people.api';
import { blocksApi, wardsApi, boothsApi } from '../api/hierarchy.api';
import type { BlockWithCount, WardWithCount, BoothWithCount } from '../api/hierarchy.api';
import { Gender, Category, PartyRole, Status, AdminRole } from '../types';
import FileUpload from '../components/FileUpload';
import { usePageTitle } from '../hooks/usePageTitle';

interface FormState {
  fullName: string;
  fatherName: string;
  dob: string;
  gender: Gender | '';
  phone: string;
  whatsapp: string;
  email: string;
  aadhaarNumber: string;
  voterId: string;
  address: string;
  pincode: string;
  occupation: string;
  caste: string;
  category: Category | '';
  photoUrl: string | null;
  aadhaarImageUrl: string | null;
  role: PartyRole | '';
  status: Status | '';
  blockId: string;
  wardId: string;
  boothId: string;
}

const EMPTY: FormState = {
  fullName: '',
  fatherName: '',
  dob: '',
  gender: '',
  phone: '',
  whatsapp: '',
  email: '',
  aadhaarNumber: '',
  voterId: '',
  address: '',
  pincode: '',
  occupation: '',
  caste: '',
  category: Category.GENERAL,
  photoUrl: null,
  aadhaarImageUrl: null,
  role: PartyRole.MEMBER,
  status: Status.ACTIVE,
  blockId: '',
  wardId: '',
  boothId: '',
};

export default function PersonForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  usePageTitle(id ? 'Edit member' : 'Add member');
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [blocks, setBlocks] = useState<BlockWithCount[]>([]);
  const [wards, setWards] = useState<WardWithCount[]>([]);
  const [booths, setBooths] = useState<BoothWithCount[]>([]);

  const lockBlock = user?.role !== AdminRole.SUPER_ADMIN;
  const lockWard =
    user?.role === AdminRole.WARD_ADMIN || user?.role === AdminRole.BOOTH_WORKER;
  const lockBooth = user?.role === AdminRole.BOOTH_WORKER;

  // Load existing person if editing
  useEffect(() => {
    if (!isEdit || !id) return;
    (async () => {
      try {
        const person = await peopleApi.get(id);
        setForm({
          fullName: person.fullName,
          fatherName: person.fatherName ?? '',
          dob: person.dob ? person.dob.slice(0, 10) : '',
          gender: person.gender,
          phone: person.phone,
          whatsapp: person.whatsapp ?? '',
          email: person.email ?? '',
          aadhaarNumber: person.aadhaarNumber ?? '',
          voterId: person.voterId ?? '',
          address: person.address ?? '',
          pincode: person.pincode ?? '',
          occupation: person.occupation ?? '',
          caste: person.caste ?? '',
          category: person.category,
          photoUrl: person.photoUrl,
          aadhaarImageUrl: person.aadhaarImageUrl,
          role: person.role,
          status: person.status,
          blockId: person.blockId,
          wardId: person.wardId,
          boothId: person.boothId,
        });
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? 'Failed to load member');
        navigate('/people');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit, navigate]);

  // Load hierarchy. For non-super, pre-lock scope
  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        if (user.role === AdminRole.SUPER_ADMIN) {
          setBlocks(await blocksApi.list());
        } else if (user.role === AdminRole.BLOCK_ADMIN) {
          setForm((f) =>
            f.blockId ? f : { ...f, blockId: user.blockId ?? '' },
          );
          setWards(await wardsApi.list(user.blockId ?? undefined));
        } else if (user.role === AdminRole.WARD_ADMIN) {
          setForm((f) =>
            f.blockId && f.wardId
              ? f
              : {
                  ...f,
                  blockId: user.blockId ?? '',
                  wardId: user.wardId ?? '',
                },
          );
          setBooths(await boothsApi.list({ wardId: user.wardId ?? undefined }));
        } else if (user.role === AdminRole.BOOTH_WORKER) {
          setForm((f) =>
            f.blockId && f.wardId && f.boothId
              ? f
              : {
                  ...f,
                  blockId: user.blockId ?? '',
                  wardId: user.wardId ?? '',
                  boothId: user.boothId ?? '',
                },
          );
        }
      } catch {
        // soft failure
      }
    })();
  }, [user]);

  // Super admin: block change → wards
  useEffect(() => {
    if (user?.role !== AdminRole.SUPER_ADMIN) return;
    if (!form.blockId) {
      setWards([]);
      return;
    }
    (async () => {
      try {
        setWards(await wardsApi.list(form.blockId));
      } catch {
        setWards([]);
      }
    })();
  }, [form.blockId, user]);

  // Ward change → booths (super or block admin)
  useEffect(() => {
    if (
      user?.role !== AdminRole.SUPER_ADMIN &&
      user?.role !== AdminRole.BLOCK_ADMIN
    )
      return;
    if (!form.wardId) {
      setBooths([]);
      return;
    }
    (async () => {
      try {
        setBooths(await boothsApi.list({ wardId: form.wardId }));
      } catch {
        setBooths([]);
      }
    })();
  }, [form.wardId, user]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!form.fullName.trim()) return 'Full name is required';
    if (!form.gender) return 'Gender is required';
    if (!/^[0-9]{10}$/.test(form.phone)) return 'Phone must be 10 digits';
    if (form.whatsapp && !/^[0-9]{10}$/.test(form.whatsapp))
      return 'WhatsApp must be 10 digits';
    if (form.aadhaarNumber && !/^[0-9]{12}$/.test(form.aadhaarNumber))
      return 'Aadhaar must be 12 digits';
    if (form.pincode && !/^[0-9]{6}$/.test(form.pincode))
      return 'Pincode must be 6 digits';
    if (!form.blockId) return 'Block is required';
    if (!form.wardId) return 'Ward is required';
    if (!form.boothId) return 'Booth is required';
    return null;
  }

  function buildPayload(): CreatePersonPayload | UpdatePersonPayload {
    return {
      fullName: form.fullName.trim(),
      fatherName: form.fatherName.trim() || undefined,
      dob: form.dob || undefined,
      gender: form.gender as Gender,
      phone: form.phone,
      whatsapp: form.whatsapp || undefined,
      email: form.email.trim() || undefined,
      aadhaarNumber: form.aadhaarNumber || undefined,
      voterId: form.voterId.trim() || undefined,
      address: form.address.trim() || undefined,
      pincode: form.pincode || undefined,
      occupation: form.occupation.trim() || undefined,
      caste: form.caste.trim() || undefined,
      category: (form.category || undefined) as Category | undefined,
      photoUrl: form.photoUrl ?? undefined,
      aadhaarImageUrl: form.aadhaarImageUrl ?? undefined,
      role: (form.role || undefined) as PartyRole | undefined,
      status: (form.status || undefined) as Status | undefined,
      blockId: form.blockId,
      wardId: form.wardId,
      boothId: form.boothId,
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    setSaving(true);
    try {
      if (isEdit && id) {
        const updated = await peopleApi.update(id, buildPayload());
        toast.success('Member updated');
        navigate(`/people/${updated.id}`);
      } else {
        const created = await peopleApi.create(buildPayload() as CreatePersonPayload);
        toast.success(`Member created (${created.uniqueId})`);
        navigate(`/people/${created.id}`);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-text-muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface px-6 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link
            to="/people"
            className="text-xs text-text-secondary hover:text-primary"
          >
            ← Back to members
          </Link>
          <h1 className="text-2xl font-bold text-navy tracking-tight mt-2">
            {isEdit ? 'Edit Member' : 'Add Member'}
          </h1>
        </div>

        <form
          onSubmit={onSubmit}
          className="bg-white border border-border rounded shadow-card divide-y divide-border"
        >
          {/* Personal */}
          <Section title="Personal Information">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Full Name" required>
                <TextInput
                  value={form.fullName}
                  onChange={(v) => set('fullName', v)}
                  maxLength={120}
                />
              </Field>
              <Field label="Father's / Spouse's Name">
                <TextInput
                  value={form.fatherName}
                  onChange={(v) => set('fatherName', v)}
                  maxLength={120}
                />
              </Field>
              <Field label="Date of Birth">
                <TextInput
                  type="date"
                  value={form.dob}
                  onChange={(v) => set('dob', v)}
                />
              </Field>
              <Field label="Gender" required>
                <SelectInput
                  value={form.gender}
                  onChange={(v) => set('gender', v as Gender | '')}
                  options={[
                    { value: '', label: 'Select…' },
                    { value: Gender.MALE, label: 'Male' },
                    { value: Gender.FEMALE, label: 'Female' },
                    { value: Gender.OTHER, label: 'Other' },
                  ]}
                />
              </Field>
              <Field label="Category">
                <SelectInput
                  value={form.category}
                  onChange={(v) => set('category', v as Category | '')}
                  options={[
                    { value: Category.GENERAL, label: 'General' },
                    { value: Category.OBC, label: 'OBC' },
                    { value: Category.SC, label: 'SC' },
                    { value: Category.ST, label: 'ST' },
                  ]}
                />
              </Field>
              <Field label="Caste (optional)">
                <TextInput
                  value={form.caste}
                  onChange={(v) => set('caste', v)}
                  maxLength={60}
                />
              </Field>
            </div>
          </Section>

          {/* Contact */}
          <Section title="Contact">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Phone (10 digits)" required>
                <TextInput
                  value={form.phone}
                  onChange={(v) => set('phone', v.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9876543210"
                  inputMode="numeric"
                />
              </Field>
              <Field label="WhatsApp (optional)">
                <TextInput
                  value={form.whatsapp}
                  onChange={(v) => set('whatsapp', v.replace(/\D/g, '').slice(0, 10))}
                  inputMode="numeric"
                />
              </Field>
              <Field label="Email">
                <TextInput
                  type="email"
                  value={form.email}
                  onChange={(v) => set('email', v)}
                />
              </Field>
              <Field label="Occupation">
                <TextInput
                  value={form.occupation}
                  onChange={(v) => set('occupation', v)}
                  maxLength={100}
                />
              </Field>
            </div>
          </Section>

          {/* Identity + Address */}
          <Section title="Identity & Address">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Aadhaar Number (12 digits)">
                <TextInput
                  value={form.aadhaarNumber}
                  onChange={(v) =>
                    set('aadhaarNumber', v.replace(/\D/g, '').slice(0, 12))
                  }
                  inputMode="numeric"
                />
              </Field>
              <Field label="Voter ID">
                <TextInput
                  value={form.voterId}
                  onChange={(v) => set('voterId', v.toUpperCase())}
                  maxLength={20}
                />
              </Field>
              <Field label="Pincode (6 digits)">
                <TextInput
                  value={form.pincode}
                  onChange={(v) => set('pincode', v.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                />
              </Field>
              <Field label="Address" className="md:col-span-2">
                <textarea
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  rows={2}
                  maxLength={500}
                  className="w-full px-3 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
                />
              </Field>
            </div>
          </Section>

          {/* Hierarchy */}
          <Section title="Booth Assignment">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Block" required>
                <SelectInput
                  value={form.blockId}
                  onChange={(v) => {
                    set('blockId', v);
                    set('wardId', '');
                    set('boothId', '');
                  }}
                  disabled={lockBlock}
                  options={[
                    { value: '', label: 'Select block…' },
                    ...blocks.map((b) => ({
                      value: b.id,
                      label: `${b.name} (${b.district})`,
                    })),
                  ]}
                />
              </Field>
              <Field label="Ward" required>
                <SelectInput
                  value={form.wardId}
                  onChange={(v) => {
                    set('wardId', v);
                    set('boothId', '');
                  }}
                  disabled={lockWard || !form.blockId}
                  options={[
                    { value: '', label: 'Select ward…' },
                    ...wards.map((w) => ({ value: w.id, label: w.name })),
                  ]}
                />
              </Field>
              <Field label="Booth" required>
                <SelectInput
                  value={form.boothId}
                  onChange={(v) => set('boothId', v)}
                  disabled={lockBooth || !form.wardId}
                  options={[
                    { value: '', label: 'Select booth…' },
                    ...booths.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                />
              </Field>
            </div>
          </Section>

          {/* Party */}
          <Section title="Party Role & Status">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Role">
                <SelectInput
                  value={form.role}
                  onChange={(v) => set('role', v as PartyRole | '')}
                  options={[
                    { value: PartyRole.MEMBER, label: 'Member' },
                    { value: PartyRole.BOOTH_WORKER, label: 'Booth Worker' },
                    { value: PartyRole.WARD_ADMIN, label: 'Ward Admin' },
                    { value: PartyRole.BLOCK_ADMIN, label: 'Block Admin' },
                  ]}
                />
              </Field>
              <Field label="Status">
                <SelectInput
                  value={form.status}
                  onChange={(v) => set('status', v as Status | '')}
                  options={[
                    { value: Status.ACTIVE, label: 'Active' },
                    { value: Status.INACTIVE, label: 'Inactive' },
                    { value: Status.PENDING, label: 'Pending' },
                  ]}
                />
              </Field>
            </div>
          </Section>

          {/* Documents */}
          <Section title="Photo & Documents">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FileUpload
                label="Photo"
                folder="photos"
                value={form.photoUrl}
                onChange={(v) => set('photoUrl', v)}
                aspect="square"
                hint="Used on ID card. Square photo recommended."
              />
              <FileUpload
                label="Aadhaar Image"
                folder="aadhaar"
                value={form.aadhaarImageUrl}
                onChange={(v) => set('aadhaarImageUrl', v)}
                aspect="wide"
                hint="Scan or photo of Aadhaar card."
              />
            </div>
          </Section>

          {/* Actions */}
          <div className="px-6 py-4 bg-surface-subtle flex items-center justify-end gap-3">
            <Link
              to="/people"
              className="px-4 py-2 text-sm text-text-secondary hover:text-navy"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-6 py-5">
      <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  children,
  className = '',
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
        {label}
        {required && <span className="text-status-red ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  type = 'text',
  placeholder,
  maxLength,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  maxLength?: number;
  inputMode?: 'numeric' | 'text' | 'email' | 'tel';
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      inputMode={inputMode}
      className="w-full px-3 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-3 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary disabled:bg-surface-subtle disabled:text-text-muted"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

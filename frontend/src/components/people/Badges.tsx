import { Gender, PartyRole, Status } from '../../types';

export function RoleBadge({ role }: { role: PartyRole }) {
  const label = role.replace('_', ' ').toLowerCase();
  return (
    <span className="inline-block px-2 py-0.5 rounded-sm bg-primary-bg text-primary-dark text-[11px] font-semibold capitalize">
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { bg: string; text: string }> = {
    ACTIVE: { bg: 'bg-status-green-bg', text: 'text-status-green' },
    INACTIVE: { bg: 'bg-surface-subtle', text: 'text-text-secondary' },
    PENDING: { bg: 'bg-status-amber-bg', text: 'text-status-amber' },
  };
  const { bg, text } = map[status];
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-sm ${bg} ${text} text-[11px] font-semibold capitalize`}
    >
      {status.toLowerCase()}
    </span>
  );
}

export function GenderBadge({ gender }: { gender: Gender }) {
  const map: Record<Gender, { bg: string; text: string; label: string }> = {
    MALE: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Male' },
    FEMALE: { bg: 'bg-pink-50', text: 'text-pink-700', label: 'Female' },
    OTHER: { bg: 'bg-surface-subtle', text: 'text-text-secondary', label: 'Other' },
  };
  const { bg, text, label } = map[gender];
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-sm ${bg} ${text} text-[11px] font-semibold`}
    >
      {label}
    </span>
  );
}

import type { IdCardDetail } from '../api/idcards.api';
import { IconShield, IconUser } from './ui/Icon';

interface IdCardProps {
  card: IdCardDetail;
}

/**
 * ID-1 card (ISO/IEC 7810): 85.6mm × 54mm → aspect ratio 1.585:1.
 * On-screen we draw it at exactly 342×216 CSS px (4px/mm) so that
 * html2canvas captures a bitmap in the same aspect ratio jsPDF places
 * onto the physical page — no vertical squish, no "floating text".
 *
 * Every length below is in CSS px chosen to sum to the physical
 * footprint; do NOT swap for Tailwind spacing tokens (those are 4px
 * steps and would round off).
 */
export default function IdCard({ card }: IdCardProps) {
  const { person, qrCodeDataUrl, uniqueCardId, issuedAt } = card;
  const issued = new Date(issuedAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div
      className="id-card id-card-print bg-white border border-border rounded shadow-card overflow-hidden font-sans print:shadow-none print:border flex flex-col"
      data-card-id={uniqueCardId}
      style={{
        width: '342px',
        height: '216px',
        // Lock intrinsic size for html2canvas/jsPDF fidelity.
        flex: '0 0 auto',
      }}
    >
      {/* Header strip */}
      <div
        className="bg-primary text-white flex items-center gap-1.5"
        style={{ padding: '6px 10px', height: '30px' }}
      >
        <IconShield size={14} />
        <div className="leading-tight min-w-0 flex-1">
          <div
            className="uppercase tracking-wider opacity-90"
            style={{ fontSize: '8px', lineHeight: '10px' }}
          >
            JanSeva
          </div>
          <div
            className="font-bold truncate"
            style={{ fontSize: '11px', lineHeight: '12px' }}
          >
            Constituency Member
          </div>
        </div>
      </div>

      {/* Body: photo + identity block */}
      <div
        className="flex gap-2.5 flex-1 min-h-0"
        style={{ padding: '8px 10px' }}
      >
        <div
          className="shrink-0 bg-surface-subtle border border-border rounded overflow-hidden flex items-center justify-center"
          style={{ width: '68px', height: '82px' }}
        >
          {person.photoUrl ? (
            <img
              src={person.photoUrl}
              alt={person.fullName}
              className="w-full h-full object-cover"
            />
          ) : (
            <IconUser size={26} />
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col" style={{ gap: '3px' }}>
          <div>
            <div
              className="uppercase tracking-wider text-text-muted"
              style={{ fontSize: '7.5px', lineHeight: '9px' }}
            >
              Name
            </div>
            <div
              className="font-bold text-navy break-words"
              style={{
                fontSize: '12px',
                lineHeight: '14px',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {person.fullName}
            </div>
          </div>

          {person.fatherName && (
            <div>
              <div
                className="uppercase tracking-wider text-text-muted"
                style={{ fontSize: '7.5px', lineHeight: '9px' }}
              >
                S/o, D/o
              </div>
              <div
                className="text-navy truncate"
                style={{ fontSize: '10px', lineHeight: '12px' }}
              >
                {person.fatherName}
              </div>
            </div>
          )}

          <div>
            <div
              className="uppercase tracking-wider text-text-muted"
              style={{ fontSize: '7.5px', lineHeight: '9px' }}
            >
              ID
            </div>
            <div
              className="font-mono text-navy"
              style={{ fontSize: '10px', lineHeight: '12px' }}
            >
              {person.uniqueId}
            </div>
          </div>
        </div>
      </div>

      {/* Location strip */}
      <div
        className="border-t border-border text-text-secondary"
        style={{
          padding: '4px 10px',
          fontSize: '8.5px',
          lineHeight: '11px',
        }}
      >
        <div className="truncate">
          <span className="text-text-muted">Booth:</span> {person.booth.name}
          {' · '}
          <span className="text-text-muted">Ward:</span> {person.ward.name}
        </div>
        <div className="truncate">
          <span className="text-text-muted">Block:</span> {person.block.name},{' '}
          {person.block.district}
        </div>
      </div>

      {/* Footer: card id + issued + QR */}
      <div
        className="border-t border-border flex items-center justify-between gap-2"
        style={{ padding: '5px 10px', height: '58px' }}
      >
        <div className="min-w-0 flex-1">
          <div
            className="uppercase tracking-wider text-text-muted"
            style={{ fontSize: '7.5px', lineHeight: '9px' }}
          >
            Card ID
          </div>
          <div
            className="font-mono text-navy truncate"
            style={{ fontSize: '9.5px', lineHeight: '11px' }}
          >
            {uniqueCardId}
          </div>
          <div
            className="text-text-muted"
            style={{ fontSize: '8px', lineHeight: '10px', marginTop: '2px' }}
          >
            Issued: {issued}
          </div>
        </div>
        <img
          src={qrCodeDataUrl}
          alt="QR Code"
          className="border border-border rounded-sm shrink-0"
          style={{ width: '48px', height: '48px' }}
        />
      </div>
    </div>
  );
}

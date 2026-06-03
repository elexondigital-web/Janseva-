import type { ReactNode } from 'react';

/**
 * Phase 4 empty-state primitive.
 *
 * Use on list pages when the result set is empty (not when loading —
 * for that, use Skeleton). The icon slot accepts any SVG component
 * so each consumer can pick a contextual icon (no emoji per design rule).
 *
 * The CTA slot is optional. If provided, render it as the primary
 * action that turns the empty page into something actionable.
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}
    >
      {icon && (
        <div className="w-14 h-14 rounded-full bg-surface-subtle text-text-muted flex items-center justify-center mb-3">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-navy">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-text-secondary max-w-md leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

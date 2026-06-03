import type { CSSProperties } from 'react';

/**
 * Phase 4 loading skeletons. Use one of the named variants below
 * during list-page loads instead of an empty page or a spinner.
 *
 * Implemented with Tailwind's animate-pulse — no extra dependencies.
 */

const baseClass = 'bg-surface-subtle rounded animate-pulse';

export function Skeleton({
  className = '',
  width,
  height,
  style,
}: {
  className?: string;
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`${baseClass} ${className}`}
      style={{
        width: width ?? '100%',
        height: height ?? 12,
        ...style,
      }}
    />
  );
}

/** A single list-row skeleton — avatar circle + two text lines. */
export function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3 px-2 border-b border-border last:border-0">
      <div className="w-8 h-8 rounded-full bg-surface-subtle animate-pulse shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton width="60%" height={10} />
        <Skeleton width="40%" height={8} />
      </div>
      <Skeleton width={60} height={10} />
    </div>
  );
}

/** Stack of N list-row skeletons — drop-in for a loading <ul>. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <ListRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** Table-row skeleton matching a 6-column table. */
export function TableRowSkeleton({ cols = 6 }: { cols?: number }) {
  return (
    <tr className="border-t border-border">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton width="80%" height={10} />
        </td>
      ))}
    </tr>
  );
}

/** Card-grid skeleton — drop into a stats row while loading. */
export function CardSkeleton() {
  return (
    <div className="bg-white border border-border rounded shadow-card p-4">
      <Skeleton width="40%" height={10} />
      <div className="mt-3">
        <Skeleton width="60%" height={20} />
      </div>
      <div className="mt-2">
        <Skeleton width="30%" height={8} />
      </div>
    </div>
  );
}

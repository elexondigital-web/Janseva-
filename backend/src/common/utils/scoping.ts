import { AdminRole } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/types';

/**
 * Returns a Prisma `where` filter that restricts queries to the data the
 * authenticated admin is allowed to see.
 *
 * - SUPER_ADMIN   -> no filter (sees everything)
 * - BLOCK_ADMIN   -> only rows with their blockId
 * - WARD_ADMIN    -> only rows with their wardId
 * - BOOTH_WORKER  -> only rows with their boothId
 *
 * Use by merging into an existing `where` clause:
 *   prisma.person.findMany({ where: { ...scopeFilter(user), ...otherWhere } })
 */
export function scopeFilter(user: AuthenticatedUser): Record<string, string> {
  switch (user.role) {
    case AdminRole.SUPER_ADMIN:
      return {};
    case AdminRole.BLOCK_ADMIN:
      return user.blockId ? { blockId: user.blockId } : { blockId: '__none__' };
    case AdminRole.WARD_ADMIN:
      return user.wardId ? { wardId: user.wardId } : { wardId: '__none__' };
    case AdminRole.BOOTH_WORKER:
      return user.boothId ? { boothId: user.boothId } : { boothId: '__none__' };
    default:
      return { id: '__none__' };
  }
}

/**
 * Asserts that the user has permission to act on a record with the given
 * block/ward/booth IDs. Throws a RangeError if the scope does not match.
 * (Use this before create/update/delete operations.)
 */
export function assertInScope(
  user: AuthenticatedUser,
  target: { blockId?: string | null; wardId?: string | null; boothId?: string | null },
): void {
  if (user.role === AdminRole.SUPER_ADMIN) return;

  if (user.role === AdminRole.BLOCK_ADMIN && target.blockId !== user.blockId) {
    throw new RangeError('Target is outside your block scope');
  }
  if (user.role === AdminRole.WARD_ADMIN && target.wardId !== user.wardId) {
    throw new RangeError('Target is outside your ward scope');
  }
  if (user.role === AdminRole.BOOTH_WORKER && target.boothId !== user.boothId) {
    throw new RangeError('Target is outside your booth scope');
  }
}

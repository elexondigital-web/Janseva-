import { Transform, TransformFnParams } from 'class-transformer';

/**
 * Phase 4 input sanitization helpers. Apply to DTO string fields whose
 * value comes straight from a user — names, addresses, message bodies,
 * etc. — to drop incidental whitespace before validation runs.
 *
 * They are safe on undefined/null and don't change non-string values.
 */

const trimFn = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? value.trim() : value;

const lowerTrimFn = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Trim leading/trailing whitespace. */
export const Trim = () => Transform(trimFn);

/** Trim and lowercase — for emails, usernames, and similar identifiers. */
export const LowerTrim = () => Transform(lowerTrimFn);

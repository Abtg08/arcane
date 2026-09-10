/**
 * UUIDv7 generation — time-ordered, sortable, k-sortable in B-tree indexes.
 * All externally visible IDs in Arcane use UUIDv7.
 *
 * The `uuidv7` package produces spec-compliant UUIDv7 values.
 */

import { uuidv7 as _uuidv7 } from 'uuidv7';
import type { UUIDv7 } from '@arcane/schemas';

/**
 * Generate a new UUIDv7. Use for all entity IDs.
 */
export function generateId(): UUIDv7 {
  return _uuidv7() as UUIDv7;
}

/**
 * Extract the timestamp embedded in a UUIDv7.
 * Useful for debugging / audit — not for business logic.
 */
export function uuidv7Timestamp(id: UUIDv7): Date {
  // First 48 bits are Unix milliseconds
  const hex = id.replace(/-/g, '');
  const msPart = hex.slice(0, 12);
  return new Date(parseInt(msPart, 16));
}

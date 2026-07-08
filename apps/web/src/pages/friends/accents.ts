import { friendAccent } from '@buddy-pass/shared';

/**
 * Stable-ish accent slots (WEB.md §1): friendsSince order, cycling the fixed
 * palette. A removal can reshuffle later friends — accepted for MVP.
 */
export function sortedWithAccents<T extends { id: string; friendsSince: Date }>(friends: T[]) {
  return [...friends]
    .sort((a, b) => a.friendsSince.getTime() - b.friendsSince.getTime() || a.id.localeCompare(b.id))
    .map((friend, index) => ({ ...friend, accent: friendAccent(index) }));
}

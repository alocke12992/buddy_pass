/**
 * Friend accent palette (docs/design-system.md): assigned in this fixed order
 * by friendsSince, cycling. Shared here so web and React Native use the same
 * list. Volt is excluded — it always means *you*.
 */
export const FRIEND_ACCENTS = [
  '#A78BFA', // violet
  '#4EA8F4', // blue
  '#F472B6', // pink
  '#2DD4BF', // teal
  '#FB923C', // orange
  '#E879F9', // fuchsia
] as const;

export function friendAccent(index: number): string {
  return FRIEND_ACCENTS[
    ((index % FRIEND_ACCENTS.length) + FRIEND_ACCENTS.length) % FRIEND_ACCENTS.length
  ]!;
}

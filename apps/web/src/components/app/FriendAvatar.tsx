import { FRIEND_ACCENT_INK } from '@buddy-pass/shared';
import { cn } from '@/lib/utils';

/**
 * Buddy avatar on their accent color (design-system.md): initial-letter tile,
 * dark ink on the tint. Accent comes from the friend's stable palette slot.
 */
export function FriendAvatar({
  name,
  accent,
  className,
}: {
  name: string;
  accent: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex items-center justify-center rounded-full text-lg font-bold select-none',
        className,
      )}
      style={{ backgroundColor: accent, color: FRIEND_ACCENT_INK }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

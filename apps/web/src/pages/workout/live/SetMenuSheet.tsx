import { Trash2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

/**
 * Per-set overflow menu (the 3-dot button on a live set row). Deleting is a hard
 * delete with no undo, so it lives behind this rather than bare on the row —
 * mid-workout thumbs are imprecise and the row is dense with 56px targets.
 */
export function SetMenuSheet({
  label,
  open,
  onOpenChange,
  onDelete,
}: {
  /** e.g. "Set 2" — the same label the row shows. */
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle className="truncate">{label}</SheetTitle>
          <SheetDescription className="sr-only">Set actions</SheetDescription>
        </SheetHeader>
        <div className="space-y-1 p-4 pt-0">
          <button
            type="button"
            onClick={onDelete}
            className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-destructive transition-colors hover:bg-muted"
          >
            <Trash2 aria-hidden className="size-5" />
            Delete set
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

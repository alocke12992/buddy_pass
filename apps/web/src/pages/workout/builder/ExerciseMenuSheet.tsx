import { ArrowLeftRight, Link2, Trash2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

function MenuAction({
  icon: Icon,
  label,
  destructive,
  onClick,
}: {
  icon: typeof Link2;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-muted',
        destructive ? 'text-destructive' : 'text-foreground',
      )}
    >
      <Icon aria-hidden className="size-5" />
      {label}
    </button>
  );
}

/** Per-exercise overflow menu (the 3-dot button on a builder card). */
export function ExerciseMenuSheet({
  exerciseName,
  inSuperset,
  open,
  onOpenChange,
  onReplace,
  onSuperset,
  onRemove,
}: {
  exerciseName: string;
  inSuperset: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReplace: () => void;
  onSuperset: () => void;
  onRemove: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle className="truncate">{exerciseName}</SheetTitle>
          <SheetDescription className="sr-only">Exercise actions</SheetDescription>
        </SheetHeader>
        <div className="space-y-1 p-4 pt-0">
          <MenuAction icon={ArrowLeftRight} label="Replace exercise" onClick={onReplace} />
          <MenuAction
            icon={Link2}
            label={inSuperset ? 'Edit superset' : 'Build superset'}
            onClick={onSuperset}
          />
          <MenuAction icon={Trash2} label="Remove from workout" destructive onClick={onRemove} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

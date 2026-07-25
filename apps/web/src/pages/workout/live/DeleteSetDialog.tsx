import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Only completed sets get this — an empty set you just added goes on one tap.
 * The guard is pre-action because the delete is a hard one: a re-added set
 * would come back with a new id at the end of the exercise, so "undo" would lie.
 */
export function DeleteSetDialog({
  open,
  label,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  /** e.g. "Set 2" — the same label the row shows. */
  label: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {label}?</DialogTitle>
          <DialogDescription>
            You logged this one. Deleting it drops the reps and weight from this workout for good —
            there's no undo.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button variant="destructive" size="lg" onClick={onConfirm}>
            Delete set
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

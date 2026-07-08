import type { WorkoutVisibility } from '@buddy-pass/shared';
import { Segmented } from '@/components/app/Segmented';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';

function toDateInputValue(date: Date | null): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Save step (FRONTEND.md §3.2): optional schedule + visibility, then create/update. */
export function SaveSheet({
  open,
  onOpenChange,
  scheduledFor,
  onScheduledForChange,
  visibility,
  onVisibilityChange,
  saving,
  onSave,
  saveLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduledFor: Date | null;
  onScheduledForChange: (date: Date | null) => void;
  visibility: WorkoutVisibility;
  onVisibilityChange: (v: WorkoutVisibility) => void;
  saving: boolean;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>Save workout</SheetTitle>
          <SheetDescription>Schedule it and choose who can see it.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 p-4 pt-0">
          <div className="flex flex-col gap-2">
            <Label htmlFor="scheduledFor">Scheduled for (optional)</Label>
            <Input
              id="scheduledFor"
              type="date"
              className="h-11"
              value={toDateInputValue(scheduledFor)}
              onChange={(e) => {
                const v = e.target.value;
                onScheduledForChange(v ? new Date(`${v}T09:00:00`) : null);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Visibility</Label>
            <Segmented
              aria-label="Visibility"
              options={[
                { value: 'private', label: 'Private', description: 'Only you' },
                { value: 'friends', label: 'Friends', description: 'Buddies can view' },
              ]}
              value={visibility}
              onChange={onVisibilityChange}
            />
          </div>
          <Button size="xl" className="w-full" disabled={saving} onClick={onSave}>
            {saving && <Spinner data-icon="inline-start" />}
            {saveLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

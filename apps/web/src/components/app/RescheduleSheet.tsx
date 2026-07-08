import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
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
import { useTRPC } from '@/lib/trpc';
import { workoutDocToInput } from '@/lib/workouts';

function toDateInputValue(date: Date | null): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Lightweight date sheet (FRONTEND.md §3.1). workouts.update is whole-document
 * (ADR-0003), so this fetches the doc and resubmits it with one field patched.
 */
export function RescheduleSheet({
  workoutId,
  open,
  onOpenChange,
}: {
  workoutId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const doc = useQuery(trpc.workouts.byId.queryOptions({ id: workoutId }, { enabled: open }));

  // null = untouched → derive from the doc; a string means the user edited it
  const [edited, setEdited] = useState<string | null>(null);
  const value = edited ?? toDateInputValue(doc.data?.scheduledFor ?? null);
  const setValue = setEdited;

  const update = useMutation(
    trpc.workouts.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.workouts.pathKey() });
        toast.success('Workout rescheduled');
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Couldn't reschedule"),
    }),
  );

  const submit = () => {
    if (!doc.data) return;
    const input = workoutDocToInput(doc.data);
    update.mutate({
      id: workoutId,
      ...input,
      scheduledFor: value ? new Date(`${value}T09:00:00`) : undefined,
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setEdited(null);
        onOpenChange(next);
      }}
    >
      <SheetContent side="bottom" className="gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>Reschedule</SheetTitle>
          <SheetDescription>Move this workout to another day.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 p-4 pt-0">
          <div className="flex flex-col gap-2">
            <Label htmlFor="reschedule-date">Scheduled for</Label>
            <Input
              id="reschedule-date"
              type="date"
              className="h-11"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={doc.isPending}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="xl"
              className="flex-1"
              disabled={doc.isPending || update.isPending}
              onClick={() => {
                setValue('');
              }}
            >
              Clear date
            </Button>
            <Button
              size="xl"
              className="flex-1"
              disabled={doc.isPending || update.isPending}
              onClick={submit}
            >
              {update.isPending && <Spinner data-icon="inline-start" />}
              Save
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

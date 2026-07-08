import { lbToKg, type UnitPreference } from '@buddy-pass/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { weightUnitLabel } from '@/lib/format';
import { useTRPC } from '@/lib/trpc';

/** New body_measurements row (FRONTEND.md §3.12) — input in display units, stored kg. */
export function WeighInSheet({
  open,
  onOpenChange,
  unit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: UnitPreference;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');

  const logWeight = useMutation(
    trpc.profile.logWeight.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.stats.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.profile.get.queryKey() }),
        ]);
        toast.success('Weigh-in logged');
        setValue('');
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Couldn't log the weigh-in"),
    }),
  );

  const submit = () => {
    const display = Number(value);
    const weightKg = unit === 'metric' ? display : Math.round(lbToKg(display) * 10) / 10;
    if (!value || Number.isNaN(display) || weightKg < 20 || weightKg > 500) {
      toast.error('Enter a valid weight');
      return;
    }
    logWeight.mutate({ weightKg });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>Log weigh-in</SheetTitle>
          <SheetDescription>Today's body weight.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 p-4 pt-0">
          <div className="flex flex-col gap-2">
            <Label htmlFor="weigh-in">Weight ({weightUnitLabel(unit)})</Label>
            <Input
              id="weigh-in"
              type="number"
              inputMode="decimal"
              step="0.1"
              className="numeric h-11"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <Button size="xl" className="w-full" disabled={logWeight.isPending} onClick={submit}>
            {logWeight.isPending && <Spinner data-icon="inline-start" />}
            Save
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

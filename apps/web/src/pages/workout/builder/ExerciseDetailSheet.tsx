import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { ExerciseImage } from '@/components/app/ExerciseImage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExerciseIndexEntry } from '@/lib/api-types';
import { useTRPC } from '@/lib/trpc';

/** Mini detail from the picker (FRONTEND.md §3.2): instructions + images. */
export function ExerciseDetailSheet({
  exerciseId,
  onClose,
  onAdd,
}: {
  exerciseId: string | null;
  onClose: () => void;
  onAdd: (entry: ExerciseIndexEntry) => void;
}) {
  const trpc = useTRPC();
  const detail = useQuery(
    trpc.exercises.byId.queryOptions(
      { id: exerciseId ?? '' },
      { enabled: exerciseId !== null, staleTime: Infinity },
    ),
  );

  return (
    <Sheet open={exerciseId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-2xl">
        {detail.isPending && (
          <div className="space-y-3 p-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {detail.isSuccess && (
          <>
            <SheetHeader className="gap-2">
              <SheetTitle>{detail.data.name}</SheetTitle>
              <SheetDescription className="sr-only">Exercise details</SheetDescription>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="capitalize">
                  {detail.data.level}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {detail.data.category}
                </Badge>
                {detail.data.equipment && (
                  <Badge variant="outline">{detail.data.equipment.name}</Badge>
                )}
                {detail.data.primaryMuscles.map((m) => (
                  <Badge key={m} variant="outline" className="text-muted-foreground">
                    {m}
                  </Badge>
                ))}
              </div>
            </SheetHeader>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
              <div className="grid grid-cols-2 gap-2">
                {detail.data.images.slice(0, 2).map((img) => (
                  <ExerciseImage
                    key={img}
                    path={img}
                    name={detail.data.name}
                    className="aspect-[4/3] w-full"
                  />
                ))}
              </div>
              {detail.data.instructions.length > 0 && (
                <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                  {detail.data.instructions.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              )}
            </div>
            <div className="border-t p-4">
              <Button size="xl" className="w-full" onClick={() => onAdd(detail.data)}>
                <Plus data-icon="inline-start" />
                Add to workout
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

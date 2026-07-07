import { Hammer } from 'lucide-react';
import { EmptyState } from './EmptyState';

/** Route-skeleton stand-in (plans/WEB.md milestone 1); replaced milestone by milestone. */
export function Placeholder({ screen, milestone }: { screen: string; milestone: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-h1">{screen}</h1>
      <EmptyState
        icon={Hammer}
        title={`${screen} lands with ${milestone}`}
        description="This route is wired; the screen itself is on its way."
      />
    </div>
  );
}

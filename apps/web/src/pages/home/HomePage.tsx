import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Hammer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/app/EmptyState';
import { useTRPC } from '@/lib/trpc';

export default function HomePage() {
  const trpc = useTRPC();
  const ping = useQuery(trpc.ping.queryOptions());

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-h1">Home</h1>
        <Button size="lg" disabled>
          <Plus data-icon="inline-start" />
          New workout
        </Button>
      </header>
      <EmptyState
        icon={Hammer}
        title="The hero card lands with milestone 4"
        description="This route is wired; the launcher is on its way."
      />
      <p className="numeric text-center text-xs text-faint">
        {ping.isPending
          ? 'Checking API…'
          : ping.isError
            ? 'API unreachable'
            : `API pong at ${ping.data.at.toLocaleTimeString()}`}
      </p>
    </div>
  );
}

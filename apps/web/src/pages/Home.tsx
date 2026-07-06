import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc';

export default function Home() {
  const trpc = useTRPC();
  const ping = useQuery(trpc.ping.queryOptions());

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2">
      <h1 className="text-3xl font-bold">Buddy Pass</h1>
      <p className="text-sm text-neutral-500">
        {ping.isPending
          ? 'Checking API…'
          : ping.isError
            ? 'API unreachable'
            : `API pong at ${ping.data.at.toLocaleTimeString()}`}
      </p>
    </main>
  );
}

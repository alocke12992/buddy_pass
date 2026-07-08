import { RotateCcw } from 'lucide-react';
import { useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';
import { Wordmark } from './Wordmark';

/** Root errorElement: render crashes land here instead of a white screen. */
export function CrashScreen() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Wordmark className="text-2xl" />
      <p className="text-muted-foreground">
        Something broke on our side — a reload usually fixes it.
      </p>
      <Button size="xl" onClick={() => window.location.reload()}>
        <RotateCcw data-icon="inline-start" />
        Reload
      </Button>
    </div>
  );
}

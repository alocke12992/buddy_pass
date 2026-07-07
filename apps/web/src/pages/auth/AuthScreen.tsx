import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

/** Shared frame for the sign-in / sign-up screens. */
export function AuthScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-6 py-6">
      <div>
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label="Back to welcome"
          render={<Link to="/welcome" />}
        >
          <ArrowLeft />
        </Button>
      </div>
      <h1 className="text-h1">{title}</h1>
      {children}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

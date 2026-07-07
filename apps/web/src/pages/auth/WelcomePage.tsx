import { Link } from 'react-router';
import { Wordmark } from '@/components/app/Wordmark';
import { Button } from '@/components/ui/button';

/** Logged-out root (FRONTEND.md §3.14): one screen, value prop, two doors. */
export default function WelcomePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-10">
      <Wordmark />
      <div className="flex flex-1 flex-col justify-center gap-4 py-12">
        <h1 className="text-display text-balance">
          Workouts are better with <span className="text-secondary">buddies</span>.
        </h1>
        <p className="text-lg text-muted-foreground">
          Build a workout, log every set, and share it with a link — anyone can start it in one tap.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Button size="xl" render={<Link to="/sign-up" />}>
          Create account
        </Button>
        <Button size="xl" variant="outline" render={<Link to="/sign-in" />}>
          Sign in
        </Button>
      </div>
    </div>
  );
}

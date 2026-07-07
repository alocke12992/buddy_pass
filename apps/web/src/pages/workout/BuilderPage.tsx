import { Placeholder } from '@/components/app/Placeholder';

/** Serves both /workout/new and /workout/:id/edit. */
export default function BuilderPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Placeholder screen="Workout builder" milestone="milestone 4" />
    </div>
  );
}

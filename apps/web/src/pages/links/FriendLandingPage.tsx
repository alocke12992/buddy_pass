import { Placeholder } from '@/components/app/Placeholder';

/** /friend/:token — the consent moment; never auto-accepts (FRONTEND.md §3.11). */
export default function FriendLandingPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Placeholder screen="Friend invite" milestone="milestone 8" />
    </div>
  );
}

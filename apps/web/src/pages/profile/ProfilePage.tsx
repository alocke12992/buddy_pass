import { LogOut } from 'lucide-react';
import { Placeholder } from '@/components/app/Placeholder';
import { Button } from '@/components/ui/button';
import { useAuthentication } from '@/context/Authentication';

export default function ProfilePage() {
  const { user, signOut } = useAuthentication();

  return (
    <div className="space-y-6">
      <Placeholder screen="Profile" milestone="milestone 7" />
      {/* Temporary until milestone 7's real Profile: session identity + sign out */}
      <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{user?.name || 'Guest'}</p>
          <p className="truncate text-sm text-muted-foreground">
            {user?.isAnonymous ? 'Guest session' : user?.email}
          </p>
        </div>
        <Button variant="outline" size="lg" onClick={() => void signOut()}>
          <LogOut data-icon="inline-start" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

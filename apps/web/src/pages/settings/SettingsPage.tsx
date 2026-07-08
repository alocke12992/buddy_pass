import {
  cmToFeetInches,
  feetInchesToCm,
  type ExperienceLevel,
  type Gender,
  type UnitPreference,
  type WorkoutVisibility,
} from '@buddy-pass/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, KeyRound, LogOut } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Segmented } from '@/components/app/Segmented';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useAuthentication } from '@/context/Authentication';
import { authClient } from '@/lib/auth-client';
import { useTRPC } from '@/lib/trpc';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4">
      <h2 className="text-h2">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ChangePasswordSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (next.length < 8) {
      toast.error('New password needs at least 8 characters');
      return;
    }
    setBusy(true);
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message ?? "Couldn't change the password");
      return;
    }
    toast.success('Password changed');
    setCurrent('');
    setNext('');
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>Change password</SheetTitle>
          <SheetDescription className="sr-only">Update your password</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 p-4 pt-0">
          <Field label="Current password">
            <Input
              type="password"
              autoComplete="current-password"
              className="h-11"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="New password">
            <Input
              type="password"
              autoComplete="new-password"
              className="h-11"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Button size="xl" className="w-full" disabled={busy} onClick={() => void submit()}>
            {busy && <Spinner data-icon="inline-start" />}
            Change password
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Settings (FRONTEND.md §3.13): preferences, body basics, account. Danger zone deferred (WEB.md §2a). */
export default function SettingsPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuthentication();

  const profile = useQuery(trpc.profile.get.queryOptions());
  const [passwordOpen, setPasswordOpen] = useState(false);
  // null = untouched, derive from profile
  const [heightEdit, setHeightEdit] = useState<{ cm?: string; ft?: string; in?: string } | null>(
    null,
  );

  const invalidateProfile = () =>
    queryClient.invalidateQueries({ queryKey: trpc.profile.get.queryKey() });

  const updateSettings = useMutation(
    trpc.profile.updateSettings.mutationOptions({
      onSuccess: invalidateProfile,
      onError: (e) => toast.error(e.message || "Couldn't save the setting"),
    }),
  );
  const updateStats = useMutation(
    trpc.profile.updateStats.mutationOptions({
      onSuccess: invalidateProfile,
      onError: (e) => toast.error(e.message || "Couldn't save the change"),
    }),
  );

  if (profile.isPending) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (profile.isError) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <p className="text-sm text-muted-foreground">Couldn't load settings.</p>
      </div>
    );
  }

  const settings = profile.data.settings;
  const stats = profile.data.stats;
  const unit: UnitPreference = settings?.unitPreference ?? 'metric';

  const heightCm = stats?.heightCm ?? null;
  const { feet: ftDefault, inches: inDefault } =
    heightCm !== null ? cmToFeetInches(heightCm) : { feet: 0, inches: 0 };

  const commitHeight = () => {
    if (!heightEdit) return;
    let cm: number;
    if (unit === 'metric') {
      cm = Number(heightEdit.cm ?? '');
    } else {
      cm = feetInchesToCm(Number(heightEdit.ft ?? ftDefault), Number(heightEdit.in ?? inDefault));
    }
    setHeightEdit(null);
    if (!Number.isFinite(cm) || cm < 50 || cm > 260) {
      toast.error('Enter a valid height');
      return;
    }
    if (cm !== heightCm) updateStats.mutate({ heightCm: cm });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-4">
      <header className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label="Back to profile"
          onClick={() => navigate('/profile')}
        >
          <ChevronLeft />
        </Button>
        <h1 className="text-h1">Settings</h1>
      </header>

      <Section title="Preferences">
        <Field label="Units">
          <Segmented
            aria-label="Units"
            options={[
              { value: 'metric', label: 'Metric', description: 'kg · cm' },
              { value: 'imperial', label: 'Imperial', description: 'lb · ft' },
            ]}
            value={settings?.unitPreference ?? undefined}
            onChange={(v: UnitPreference) => updateSettings.mutate({ unitPreference: v })}
          />
        </Field>
        <Field label="Default workout visibility">
          <Segmented
            aria-label="Default workout visibility"
            options={[
              { value: 'private', label: 'Private', description: 'Only you' },
              { value: 'friends', label: 'Friends', description: 'Buddies can view' },
            ]}
            value={settings?.defaultWorkoutVisibility ?? undefined}
            onChange={(v: WorkoutVisibility) =>
              updateSettings.mutate({ defaultWorkoutVisibility: v })
            }
          />
        </Field>
        <Field label="Experience level">
          <Segmented
            aria-label="Experience level"
            options={[
              { value: 'beginner', label: 'Beginner' },
              { value: 'intermediate', label: 'Intermediate' },
              { value: 'expert', label: 'Expert' },
            ]}
            value={settings?.experienceLevel ?? undefined}
            onChange={(v: ExperienceLevel) => updateSettings.mutate({ experienceLevel: v })}
          />
        </Field>
      </Section>

      <Section title="Body basics">
        {unit === 'metric' ? (
          <Field label="Height (cm)">
            <Input
              type="number"
              inputMode="numeric"
              className="numeric h-11"
              value={heightEdit?.cm ?? (heightCm !== null ? String(heightCm) : '')}
              onChange={(e) => setHeightEdit({ cm: e.target.value })}
              onBlur={commitHeight}
            />
          </Field>
        ) : (
          <Field label="Height">
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Input
                  type="number"
                  inputMode="numeric"
                  aria-label="Feet"
                  className="numeric h-11 pr-8"
                  value={heightEdit?.ft ?? (heightCm !== null ? String(ftDefault) : '')}
                  onChange={(e) => setHeightEdit((h) => ({ ...h, ft: e.target.value }))}
                  onBlur={commitHeight}
                />
                <span className="absolute inset-y-0 right-3 flex items-center text-sm text-faint">
                  ft
                </span>
              </div>
              <div className="relative">
                <Input
                  type="number"
                  inputMode="numeric"
                  aria-label="Inches"
                  className="numeric h-11 pr-8"
                  value={heightEdit?.in ?? (heightCm !== null ? String(inDefault) : '')}
                  onChange={(e) => setHeightEdit((h) => ({ ...h, in: e.target.value }))}
                  onBlur={commitHeight}
                />
                <span className="absolute inset-y-0 right-3 flex items-center text-sm text-faint">
                  in
                </span>
              </div>
            </div>
          </Field>
        )}
        <Field label="Date of birth">
          <Input
            type="date"
            className="h-11"
            max={new Date().toISOString().slice(0, 10)}
            value={stats?.dateOfBirth ? stats.dateOfBirth.toISOString().slice(0, 10) : ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v) updateStats.mutate({ dateOfBirth: new Date(`${v}T00:00:00Z`) });
            }}
          />
        </Field>
        <Field label="Gender">
          <Segmented
            aria-label="Gender"
            options={[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
              { value: 'other', label: 'Other' },
            ]}
            value={stats?.gender ?? undefined}
            onChange={(v: Gender) => updateStats.mutate({ gender: v })}
          />
        </Field>
      </Section>

      <Section title="Account">
        {user?.isAnonymous ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You're on a guest session — create an account to set an email and password.
            </p>
            <Button size="xl" className="w-full" render={<Link to="/sign-up" />}>
              Create account
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user?.email}</span>
            </div>
            <Button
              variant="outline"
              size="xl"
              className="w-full"
              onClick={() => setPasswordOpen(true)}
            >
              <KeyRound data-icon="inline-start" />
              Change password
            </Button>
          </>
        )}
        <Button variant="outline" size="xl" className="w-full" onClick={() => void signOut()}>
          <LogOut data-icon="inline-start" />
          Sign out
        </Button>
      </Section>

      <ChangePasswordSheet open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}

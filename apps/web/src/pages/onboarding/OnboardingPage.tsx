import {
  feetInchesToCm,
  lbToKg,
  type ExperienceLevel,
  type Gender,
  type UnitPreference,
  type WorkoutVisibility,
} from '@buddy-pass/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Segmented } from '@/components/app/Segmented';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useAuthentication } from '@/context/Authentication';
import { useTRPC } from '@/lib/trpc';
import { FieldError } from '@/pages/auth/AuthScreen';

// Step 1 collects everything profile.completeOnboarding strictly needs (one
// transaction — partial onboarding cannot exist, API.md §2.4). Steps 2–3 are
// skippable; skips submit defaults, editable later in Settings.
const DEFAULT_EXPERIENCE: ExperienceLevel = 'beginner';
const DEFAULT_VISIBILITY: WorkoutVisibility = 'private';

interface Step1Values {
  unitPreference: UnitPreference;
  dateOfBirth: string;
  gender?: Gender;
  heightCm: string;
  heightFeet: string;
  heightInches: string;
  weight: string;
}

interface Basics {
  unitPreference: UnitPreference;
  dateOfBirth: Date;
  gender: Gender;
  heightCm: number;
  weightKg: number;
}

function ProgressDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex justify-center gap-2" aria-label={`Step ${step} of 3`}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          aria-hidden
          className={`size-2 rounded-full transition-colors ${n <= step ? 'bg-primary' : 'bg-muted'}`}
        />
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthentication();

  const profile = useQuery(trpc.profile.get.queryOptions());

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [basics, setBasics] = useState<Basics | null>(null);
  const [experience, setExperience] = useState<ExperienceLevel>(DEFAULT_EXPERIENCE);
  const [visibility, setVisibility] = useState<WorkoutVisibility>(DEFAULT_VISIBILITY);

  const complete = useMutation(
    trpc.profile.completeOnboarding.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.profile.get.queryKey() });
        navigate('/', { replace: true });
      },
      onError: () => toast.error("Couldn't save your profile — try again."),
    }),
  );

  const form = useForm<Step1Values>({
    defaultValues: {
      unitPreference: 'metric',
      dateOfBirth: '',
      heightCm: '',
      heightFeet: '',
      heightInches: '',
      weight: '',
    },
  });
  const units = useWatch({ control: form.control, name: 'unitPreference' });
  const { errors, isSubmitting } = form.formState;

  // Guests are exempt until they sign up; already-onboarded users have no business here.
  if (user?.isAnonymous) return <Navigate to="/" replace />;
  if (profile.isSuccess && profile.data.settings !== null) return <Navigate to="/" replace />;

  const submitStep1 = form.handleSubmit((values) => {
    let ok = true;
    const dob = new Date(`${values.dateOfBirth}T00:00:00Z`);
    if (!values.dateOfBirth || Number.isNaN(dob.getTime()) || dob >= new Date()) {
      form.setError('dateOfBirth', { message: 'Enter a date in the past' });
      ok = false;
    }
    if (!values.gender) {
      form.setError('gender', { message: 'Pick one' });
      ok = false;
    }
    let heightCm: number;
    if (values.unitPreference === 'metric') {
      heightCm = Number(values.heightCm);
      if (!values.heightCm || heightCm < 50 || heightCm > 260) {
        form.setError('heightCm', { message: 'Height in cm (50–260)' });
        ok = false;
      }
    } else {
      const feet = Number(values.heightFeet);
      const inches = Number(values.heightInches || '0');
      heightCm = feetInchesToCm(feet, inches);
      if (!values.heightFeet || heightCm < 50 || heightCm > 260) {
        form.setError('heightFeet', { message: 'Enter a valid height' });
        ok = false;
      }
    }
    const weightInput = Number(values.weight);
    const weightKg =
      values.unitPreference === 'metric' ? weightInput : Number(lbToKg(weightInput).toFixed(1));
    if (!values.weight || weightKg < 20 || weightKg > 500) {
      form.setError('weight', { message: 'Enter a valid weight' });
      ok = false;
    }
    if (!ok) return;

    setBasics({
      unitPreference: values.unitPreference,
      dateOfBirth: dob,
      gender: values.gender!,
      heightCm: heightCm!,
      weightKg,
    });
    setStep(2);
  });

  const finish = (finalVisibility: WorkoutVisibility) => {
    if (!basics) return;
    complete.mutate({
      stats: {
        heightCm: basics.heightCm,
        gender: basics.gender,
        dateOfBirth: basics.dateOfBirth,
      },
      settings: {
        unitPreference: basics.unitPreference,
        experienceLevel: experience,
        defaultWorkoutVisibility: finalVisibility,
      },
      weightKg: basics.weightKg,
    });
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-6 py-10">
      <ProgressDots step={step} />

      {step === 1 && (
        <form onSubmit={submitStep1} className="flex flex-1 flex-col gap-6" noValidate>
          <div className="space-y-1">
            <h1 className="text-h1">The basics</h1>
            <p className="text-sm text-muted-foreground">
              So weights, heights, and progress read right.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Units</Label>
            <Controller
              control={form.control}
              name="unitPreference"
              render={({ field }) => (
                <Segmented
                  aria-label="Units"
                  options={[
                    { value: 'metric', label: 'Metric', description: 'kg · cm' },
                    { value: 'imperial', label: 'Imperial', description: 'lb · ft' },
                  ]}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dateOfBirth">Date of birth</Label>
            <Input
              id="dateOfBirth"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              className="h-11"
              {...form.register('dateOfBirth')}
            />
            <FieldError message={errors.dateOfBirth?.message} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Gender</Label>
            <Controller
              control={form.control}
              name="gender"
              render={({ field }) => (
                <Segmented
                  aria-label="Gender"
                  options={[
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                    { value: 'other', label: 'Other' },
                  ]}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            <FieldError message={errors.gender?.message} />
          </div>

          {units === 'metric' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="heightCm">Height (cm)</Label>
              <Input
                id="heightCm"
                type="number"
                inputMode="numeric"
                className="numeric h-11"
                {...form.register('heightCm')}
              />
              <FieldError message={errors.heightCm?.message} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="heightFeet">Height</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <Input
                    id="heightFeet"
                    type="number"
                    inputMode="numeric"
                    aria-label="Feet"
                    className="numeric h-11 pr-8"
                    {...form.register('heightFeet')}
                  />
                  <span className="absolute inset-y-0 right-3 flex items-center text-sm text-faint">
                    ft
                  </span>
                </div>
                <div className="relative">
                  <Input
                    id="heightInches"
                    type="number"
                    inputMode="numeric"
                    aria-label="Inches"
                    className="numeric h-11 pr-8"
                    {...form.register('heightInches')}
                  />
                  <span className="absolute inset-y-0 right-3 flex items-center text-sm text-faint">
                    in
                  </span>
                </div>
              </div>
              <FieldError message={errors.heightFeet?.message} />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="weight">Current weight ({units === 'metric' ? 'kg' : 'lb'})</Label>
            <Input
              id="weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              className="numeric h-11"
              {...form.register('weight')}
            />
            <FieldError message={errors.weight?.message} />
          </div>

          <div className="mt-auto">
            <Button type="submit" size="xl" className="w-full" disabled={isSubmitting}>
              Continue
            </Button>
          </div>
        </form>
      )}

      {step === 2 && (
        <div className="flex flex-1 flex-col gap-6">
          <div className="space-y-1">
            <h1 className="text-h1">How experienced are you?</h1>
            <p className="text-sm text-muted-foreground">You can change this any time.</p>
          </div>
          <Segmented
            aria-label="Experience level"
            columns={1}
            options={[
              { value: 'beginner', label: 'Beginner', description: 'New or getting back into it' },
              {
                value: 'intermediate',
                label: 'Intermediate',
                description: 'Training consistently for 6+ months',
              },
              { value: 'expert', label: 'Expert', description: 'Years under the bar' },
            ]}
            value={experience}
            onChange={setExperience}
          />
          <div className="mt-auto flex flex-col gap-2">
            <Button size="xl" onClick={() => setStep(3)}>
              Continue
            </Button>
            <Button
              variant="ghost"
              size="xl"
              onClick={() => {
                setExperience(DEFAULT_EXPERIENCE);
                setStep(3);
              }}
            >
              Skip
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-1 flex-col gap-6">
          <div className="space-y-1">
            <h1 className="text-h1">Who sees your workouts?</h1>
            <p className="text-sm text-muted-foreground">
              The default for new workouts — each one can differ.
            </p>
          </div>
          <Segmented
            aria-label="Default workout visibility"
            columns={1}
            options={[
              { value: 'private', label: 'Private', description: 'Only you' },
              {
                value: 'friends',
                label: 'Friends',
                description: 'Buddies see your completed workouts',
              },
            ]}
            value={visibility}
            onChange={setVisibility}
          />
          <div className="mt-auto flex flex-col gap-2">
            <Button size="xl" onClick={() => finish(visibility)} disabled={complete.isPending}>
              {complete.isPending && <Spinner data-icon="inline-start" />}
              Finish
            </Button>
            <Button
              variant="ghost"
              size="xl"
              disabled={complete.isPending}
              onClick={() => finish(DEFAULT_VISIBILITY)}
            >
              Skip
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

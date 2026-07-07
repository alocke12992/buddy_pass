import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useAuthentication } from '@/context/Authentication';
import { authClient } from '@/lib/auth-client';
import { AuthScreen, FieldError } from './AuthScreen';

const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
});
type SignUpValues = z.infer<typeof signUpSchema>;

/**
 * Also the guest upgrade path: signing up with an anonymous session live
 * triggers the server-side merge (better-auth onLinkAccount, MVP.md §5).
 */
export default function SignUpPage() {
  const navigate = useNavigate();
  const { user } = useAuthentication();
  const isGuestUpgrade = user?.isAnonymous === true;

  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await authClient.signUp.email(values);
    if (error) {
      form.setError('root', {
        message: error.message ?? 'Something went wrong — try again.',
      });
      return;
    }
    // Onboarding redirects already-onboarded users (merged guests) home itself.
    navigate('/onboarding', { replace: true });
  });

  return (
    <AuthScreen title={isGuestUpgrade ? 'Save your progress' : 'Create account'}>
      {isGuestUpgrade && (
        <p className="text-sm text-muted-foreground">
          Your workouts stay with you — creating an account keeps everything you've logged as a
          guest.
        </p>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" autoComplete="name" className="h-11" {...form.register('name')} />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            className="h-11"
            {...form.register('email')}
          />
          <FieldError message={errors.email?.message} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            className="h-11"
            {...form.register('password')}
          />
          <FieldError message={errors.password?.message} />
        </div>
        <FieldError message={errors.root?.message} />
        <Button type="submit" size="xl" disabled={isSubmitting}>
          {isSubmitting && <Spinner data-icon="inline-start" />}
          Create account
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/sign-in" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthScreen>
  );
}

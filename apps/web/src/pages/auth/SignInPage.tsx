import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { authClient } from '@/lib/auth-client';
import { AuthScreen, FieldError } from './AuthScreen';

const signInSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
type SignInValues = z.infer<typeof signInSchema>;

export default function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await authClient.signIn.email(values);
    if (error) {
      form.setError('root', { message: 'Invalid email or password.' });
      return;
    }
    navigate(from, { replace: true });
  });

  return (
    <AuthScreen title="Sign in">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
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
            autoComplete="current-password"
            className="h-11"
            {...form.register('password')}
          />
          <FieldError message={errors.password?.message} />
        </div>
        <FieldError message={errors.root?.message} />
        <Button type="submit" size="xl" disabled={isSubmitting}>
          {isSubmitting && <Spinner data-icon="inline-start" />}
          Sign in
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        No account yet?{' '}
        <Link to="/sign-up" className="font-medium text-primary hover:underline">
          Create one
        </Link>
      </p>
    </AuthScreen>
  );
}

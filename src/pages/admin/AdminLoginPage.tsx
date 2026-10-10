import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Lock } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';

import { SetupRequired } from '@/components/common/states';
import { BrandMonogram } from '@/components/layout/brand-mark';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { staffSessionKey, useStaffSession } from '@/hooks/admin/use-staff-session';
import { usePageTitle } from '@/hooks/use-page-title';
import { messageFor } from '@/lib/errors';
import { supabaseConfig } from '@/lib/supabase/env';
import { loginSchema, type LoginValues } from '@/lib/validation/admin';
import { signInStaff } from '@/services/admin/auth';

function safeNext(value: string | null): string {
  // Only allow redirects within the admin panel (prevents open redirects).
  return value && /^\/admin(\/[\w\-/]*)?(\?[\w=&%-]*)?$/.test(value) ? value : '/admin';
}

export default function AdminLoginPage() {
  usePageTitle('Staff sign-in');
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useStaffSession();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (!supabaseConfig.isConfigured) {
    return (
      <div className="mx-auto max-w-xl p-6 py-20">
        <SetupRequired />
      </div>
    );
  }

  if (session.data?.role) return <Navigate to={next} replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await signInStaff(values.email, values.password);
      await queryClient.invalidateQueries({ queryKey: staffSessionKey });
      navigate(next, { replace: true });
    } catch (caught) {
      setError(messageFor(caught));
    }
  });

  return (
    <div className="bg-grain flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMonogram className="size-12 rounded-2xl text-xl" />
          <h1 className="mt-5 font-display text-3xl font-medium">Staff sign-in</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Kitchen and administration access only.</p>
        </div>
        <form
          onSubmit={onSubmit}
          noValidate
          className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-lift sm:p-8"
        >
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field id="email" label="Email" error={form.formState.errors.email?.message}>
            {(props) => <Input {...props} type="email" autoComplete="username" {...form.register('email')} />}
          </Field>
          <Field id="password" label="Password" error={form.formState.errors.password?.message}>
            {(props) => (
              <Input
                {...props}
                type="password"
                autoComplete="current-password"
                {...form.register('password')}
              />
            )}
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <LoaderCircle className="animate-spin" /> : <Lock />} Sign in
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            There is no public sign-up. Accounts are created by an administrator.
          </p>
        </form>
        <p className="mt-6 text-center text-sm">
          <Link to="/" className="font-semibold text-primary hover:underline">
            ← Back to the student site
          </Link>
        </p>
      </div>
    </div>
  );
}

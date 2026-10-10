import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Save, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { orderingStatusKey } from '@/hooks/admin/query-keys';
import { useStaff } from '@/components/admin/staff-context';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { usePageTitle } from '@/hooks/use-page-title';
import { DAY_LABELS } from '@/lib/dates';
import { messageFor } from '@/lib/errors';
import { settingsFormSchema, type SettingsFormOutput, type SettingsFormValues } from '@/lib/validation/admin';
import { fetchAdminSettings, updateSettings, type AdminSettings } from '@/services/admin/settings';
import { DAY_KEYS, type OpeningHours } from '@/types/domain';

function toForm(settings: AdminSettings): SettingsFormValues {
  return {
    canteenName: settings.canteen_name,
    tagline: settings.tagline ?? '',
    pickupInstructions: settings.pickup_instructions ?? '',
    orderingEnabled: settings.ordering_enabled,
    orderingPaused: settings.ordering_paused,
    pauseMessage: settings.pause_message ?? '',
    enforceOpeningHours: settings.enforce_opening_hours,
    openingHours: settings.opening_hours as unknown as OpeningHours,
    timezone: settings.timezone,
    studentIdMode: settings.student_id_mode,
    studentIdLabel: settings.student_id_label,
    orderPrefix: settings.order_prefix,
    maxItemsPerOrder: settings.max_items_per_order,
    pendingPaymentWindowMinutes: settings.pending_payment_window_minutes,
  };
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-5 grid gap-5">{children}</div>
    </section>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SettingsForm({ settings }: { settings: AdminSettings }) {
  const queryClient = useQueryClient();
  const form = useForm<SettingsFormValues, unknown, SettingsFormOutput>({
    resolver: zodResolver(settingsFormSchema),
    values: toForm(settings),
  });
  const errors = form.formState.errors;

  const save = useMutation({
    mutationFn: (values: SettingsFormOutput) =>
      updateSettings({
        canteen_name: values.canteenName,
        tagline: values.tagline || null,
        pickup_instructions: values.pickupInstructions || null,
        ordering_enabled: values.orderingEnabled,
        ordering_paused: values.orderingPaused,
        pause_message: values.pauseMessage || null,
        enforce_opening_hours: values.enforceOpeningHours,
        opening_hours: values.openingHours,
        timezone: values.timezone,
        student_id_mode: values.studentIdMode,
        student_id_label: values.studentIdLabel,
        order_prefix: values.orderPrefix,
        max_items_per_order: values.maxItemsPerOrder,
        pending_payment_window_minutes: values.pendingPaymentWindowMinutes,
      }),
    onSuccess: () => {
      toast.success('Settings saved');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      void queryClient.invalidateQueries({ queryKey: orderingStatusKey });
      void queryClient.invalidateQueries({ queryKey: ['public-settings'] });
    },
    onError: (error) => toast.error(messageFor(error)),
  });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
      className="grid gap-6 pb-24"
    >
      <Section title="General">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="canteenName"
            label="Canteen name"
            error={errors.canteenName?.message}
            description="Shown on receipts and in the header."
          >
            {(props) => <Input {...props} {...form.register('canteenName')} />}
          </Field>
          <Field id="tagline" label="Tagline" optional error={errors.tagline?.message}>
            {(props) => <Input {...props} {...form.register('tagline')} />}
          </Field>
        </div>
        <Field
          id="pickupInstructions"
          label="Pickup instructions"
          optional
          error={errors.pickupInstructions?.message}
          description="Shown on the home page and every receipt."
        >
          {(props) => <Textarea {...props} maxLength={500} {...form.register('pickupInstructions')} />}
        </Field>
      </Section>

      <Section
        title="Ordering"
        description="When ordering is off, paused or outside opening hours, students can browse but cannot check out."
      >
        <ToggleRow
          id="orderingEnabled"
          label="Online ordering"
          description="Master switch for new orders."
          checked={form.watch('orderingEnabled')}
          onChange={(v) => form.setValue('orderingEnabled', v, { shouldDirty: true })}
        />
        <ToggleRow
          id="orderingPaused"
          label="Temporarily pause new orders"
          description="For rushes or short breaks. Counter staff can also toggle this."
          checked={form.watch('orderingPaused')}
          onChange={(v) => form.setValue('orderingPaused', v, { shouldDirty: true })}
        />
        <Field id="pauseMessage" label="Pause message" optional error={errors.pauseMessage?.message}>
          {(props) => (
            <Input
              {...props}
              maxLength={200}
              placeholder="e.g. Back in 15 minutes"
              {...form.register('pauseMessage')}
            />
          )}
        </Field>
        <ToggleRow
          id="enforceOpeningHours"
          label="Only accept orders during opening hours"
          description="Turn off to accept orders at any time."
          checked={form.watch('enforceOpeningHours')}
          onChange={(v) => form.setValue('enforceOpeningHours', v, { shouldDirty: true })}
        />
      </Section>

      <Section
        title="Opening hours"
        description="Local time in the canteen’s time zone. Hours crossing midnight are not supported."
      >
        <div className="grid gap-3">
          {DAY_KEYS.map((day) => {
            const closed = form.watch(`openingHours.${day}.closed`);
            const dayError = errors.openingHours?.[day];
            return (
              <div
                key={day}
                className="grid grid-cols-[6.5rem_auto_1fr] items-center gap-3 sm:grid-cols-[8rem_auto_1fr]"
              >
                <span className="text-sm font-semibold">{DAY_LABELS[day]}</span>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={!closed}
                    onCheckedChange={(open) =>
                      form.setValue(`openingHours.${day}.closed`, !open, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    aria-label={`${DAY_LABELS[day]} open`}
                  />
                  <span className="w-12">{closed ? 'Closed' : 'Open'}</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="time"
                    aria-label={`${DAY_LABELS[day]} opening time`}
                    disabled={closed}
                    className="h-10 w-32"
                    {...form.register(`openingHours.${day}.open`)}
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="time"
                    aria-label={`${DAY_LABELS[day]} closing time`}
                    disabled={closed}
                    className="h-10 w-32"
                    {...form.register(`openingHours.${day}.close`)}
                  />
                  {dayError ? (
                    <span role="alert" className="text-xs font-semibold text-destructive">
                      {dayError.close?.message ?? dayError.open?.message ?? 'Invalid hours'}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <Field
          id="timezone"
          label="Time zone"
          error={errors.timezone?.message}
          description="IANA name, e.g. Asia/Kolkata."
        >
          {(props) => <Input {...props} className="sm:w-64" {...form.register('timezone')} />}
        </Field>
      </Section>

      <Section title="Checkout">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="studentIdMode"
            label="Student ID at checkout"
            error={errors.studentIdMode?.message}
            description="Collect only if your college requires it."
          >
            {(props) => (
              <NativeSelect {...props} {...form.register('studentIdMode')}>
                <option value="hidden">Don’t ask</option>
                <option value="optional">Optional</option>
                <option value="required">Required</option>
              </NativeSelect>
            )}
          </Field>
          <Field id="studentIdLabel" label="Label for the ID field" error={errors.studentIdLabel?.message}>
            {(props) => <Input {...props} {...form.register('studentIdLabel')} />}
          </Field>
          <Field
            id="maxItemsPerOrder"
            label="Maximum items per order"
            error={errors.maxItemsPerOrder?.message}
          >
            {(props) => (
              <Input {...props} type="number" min={1} max={100} {...form.register('maxItemsPerOrder')} />
            )}
          </Field>
          <Field
            id="pendingPaymentWindowMinutes"
            label="Payment window (minutes)"
            error={errors.pendingPaymentWindowMinutes?.message}
            description="How long an unpaid order can still be paid."
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={5}
                max={240}
                {...form.register('pendingPaymentWindowMinutes')}
              />
            )}
          </Field>
          <Field
            id="orderPrefix"
            label="Order number prefix"
            error={errors.orderPrefix?.message}
            description="e.g. CT → CT-20261010-0042"
          >
            {(props) => (
              <Input
                {...props}
                maxLength={6}
                className="uppercase"
                {...form.register('orderPrefix', { setValueAs: (v: string) => v.toUpperCase() })}
              />
            )}
          </Field>
        </div>
      </Section>

      <Section
        title="Menu categories"
        description="The categories students can browse are managed on the Menu page."
      >
        <Button asChild variant="outline" className="justify-self-start">
          <Link to="/admin/menu">Manage categories</Link>
        </Button>
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-4 py-3 backdrop-blur xl:left-64">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {form.formState.isDirty ? 'You have unsaved changes.' : 'All changes saved.'}
          </p>
          <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>
            {save.isPending ? <LoaderCircle className="animate-spin" /> : <Save />} Save settings
          </Button>
        </div>
      </div>
    </form>
  );
}

export default function AdminSettingsPage() {
  usePageTitle('Settings');
  const { isAdmin } = useStaff();
  const settings = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: fetchAdminSettings,
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Administrators only"
        description="Ask an administrator to change canteen settings."
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <AdminPageHeader title="Settings" description="Canteen details, ordering rules and opening hours." />
      {settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : settings.data ? (
        <SettingsForm settings={settings.data} />
      ) : (
        <Skeleton className="h-[40rem] rounded-2xl" />
      )}
    </div>
  );
}

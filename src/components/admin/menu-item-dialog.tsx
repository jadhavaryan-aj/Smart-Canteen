import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FoodImage } from '@/components/common/food-image';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { messageFor } from '@/lib/errors';
import { paiseToRupeeInput, parseRupeesToPaise } from '@/lib/money';
import { menuItemFormSchema, type MenuItemFormOutput, type MenuItemFormValues } from '@/lib/validation/admin';
import { saveMenuItem, uploadMenuImage, validateImageFile } from '@/services/admin/menu';
import type { Category, MenuItem } from '@/types/domain';

function defaults(item: MenuItem | null, categories: Category[]): MenuItemFormValues {
  return {
    name: item?.name ?? '',
    description: item?.description ?? '',
    price: item ? paiseToRupeeInput(item.pricePaise) : '',
    categoryId: item?.categoryId ?? categories[0]?.id ?? '',
    imageUrl: item?.imageUrl ?? '',
    isVegetarian: item?.isVegetarian ?? true,
    isAvailable: item?.isAvailable ?? true,
    isActive: item?.isActive ?? true,
    isFeatured: item?.isFeatured ?? false,
    sortOrder: item?.sortOrder ?? 100,
    options: (item?.options ?? []).map((option) => ({
      id: option.id,
      name: option.name,
      price: paiseToRupeeInput(option.priceDeltaPaise),
      isAvailable: option.isAvailable,
    })),
  };
}

function SwitchRow({
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
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function MenuItemDialog({
  item,
  categories,
  open,
  onOpenChange,
}: {
  item: MenuItem | null;
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const form = useForm<MenuItemFormValues, unknown, MenuItemFormOutput>({
    resolver: zodResolver(menuItemFormSchema),
    values: defaults(item, categories),
  });
  const options = useFieldArray({ control: form.control, name: 'options' });
  const imageUrl = form.watch('imageUrl');
  const errors = form.formState.errors;

  const save = useMutation({
    mutationFn: (values: MenuItemFormOutput) =>
      saveMenuItem(
        {
          id: item?.id,
          categoryId: values.categoryId,
          name: values.name,
          description: values.description,
          pricePaise: parseRupeesToPaise(values.price) ?? 0,
          imageUrl: values.imageUrl || null,
          isVegetarian: values.isVegetarian,
          isAvailable: values.isAvailable,
          isActive: values.isActive,
          isFeatured: values.isFeatured,
          sortOrder: values.sortOrder,
          options: values.options.map((option) => ({
            id: option.id,
            name: option.name,
            priceDeltaPaise: parseRupeesToPaise(option.price) ?? 0,
            isAvailable: option.isAvailable,
          })),
        },
        item?.options.map((option) => option.id) ?? [],
      ),
    onSuccess: () => {
      toast.success(item ? 'Item updated' : 'Item added');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'menu'] });
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(messageFor(error)),
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadMenuImage(file);
      form.setValue('imageUrl', url, { shouldDirty: true, shouldValidate: true });
      toast.success('Image uploaded');
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${item.name}` : 'Add a menu item'}</DialogTitle>
          <DialogDescription>
            Prices include taxes. Changes apply to new orders immediately.
          </DialogDescription>
        </DialogHeader>
        <form
          id="menu-item-form"
          noValidate
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className="grid gap-5"
        >
          <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
            <div className="grid content-start gap-2">
              <FoodImage
                src={imageUrl || null}
                alt={form.watch('name') || 'Preview'}
                className="aspect-square w-full rounded-xl"
              />
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                id="menu-item-image"
                onChange={(event) => void onFile(event.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? <LoaderCircle className="animate-spin" /> : <ImagePlus />} Upload photo
              </Button>
              <p className="text-[0.7rem] text-muted-foreground">JPEG, PNG or WebP · max 2 MB</p>
            </div>
            <div className="grid content-start gap-4">
              <Field id="item-name" label="Name" error={errors.name?.message}>
                {(props) => <Input {...props} {...form.register('name')} />}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="item-price" label="Price (₹)" error={errors.price?.message}>
                  {(props) => (
                    <Input {...props} inputMode="decimal" placeholder="70" {...form.register('price')} />
                  )}
                </Field>
                <Field id="item-category" label="Category" error={errors.categoryId?.message}>
                  {(props) => (
                    <NativeSelect {...props} {...form.register('categoryId')}>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                          {category.isActive ? '' : ' (hidden)'}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
              </div>
              <Field
                id="item-image-url"
                label="Image URL"
                optional
                error={errors.imageUrl?.message}
                description="Upload a photo or paste an https:// address."
              >
                {(props) => <Input {...props} placeholder="https://…" {...form.register('imageUrl')} />}
              </Field>
            </div>
          </div>

          <Field id="item-description" label="Description" error={errors.description?.message}>
            {(props) => (
              <Textarea {...props} maxLength={280} className="min-h-20" {...form.register('description')} />
            )}
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <SwitchRow
              id="item-veg"
              label="Vegetarian"
              description="Shows the green veg mark"
              checked={form.watch('isVegetarian')}
              onChange={(value) => form.setValue('isVegetarian', value, { shouldDirty: true })}
            />
            <SwitchRow
              id="item-available"
              label="In stock"
              description="Off = shown as sold out"
              checked={form.watch('isAvailable')}
              onChange={(value) => form.setValue('isAvailable', value, { shouldDirty: true })}
            />
            <SwitchRow
              id="item-active"
              label="Listed on menu"
              description="Off = hidden (archived)"
              checked={form.watch('isActive')}
              onChange={(value) => form.setValue('isActive', value, { shouldDirty: true })}
            />
            <SwitchRow
              id="item-featured"
              label="Featured"
              description="Shown on the home page"
              checked={form.watch('isFeatured')}
              onChange={(value) => form.setValue('isFeatured', value, { shouldDirty: true })}
            />
          </div>

          <Field
            id="item-sort"
            label="Sort order"
            error={errors.sortOrder?.message}
            description="Lower numbers appear first within the category."
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                max={10000}
                className="w-32"
                {...form.register('sortOrder')}
              />
            )}
          </Field>

          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-semibold">Customisation options</legend>
            {options.fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">No options. Students order this item as-is.</p>
            ) : null}
            {options.fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-[1fr_6.5rem_auto_auto] items-center gap-2">
                <Input
                  aria-label={`Option ${index + 1} name`}
                  placeholder="e.g. Add cheese"
                  {...form.register(`options.${index}.name`)}
                  aria-invalid={Boolean(errors.options?.[index]?.name)}
                />
                <Input
                  aria-label={`Option ${index + 1} extra price in rupees`}
                  inputMode="decimal"
                  placeholder="+₹"
                  {...form.register(`options.${index}.price`)}
                  aria-invalid={Boolean(errors.options?.[index]?.price)}
                />
                <Switch
                  aria-label={`Option ${index + 1} available`}
                  checked={form.watch(`options.${index}.isAvailable`)}
                  onCheckedChange={(value) =>
                    form.setValue(`options.${index}.isAvailable`, value, { shouldDirty: true })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove option ${index + 1}`}
                  onClick={() => options.remove(index)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {errors.options ? (
              <p role="alert" className="text-xs font-semibold text-destructive">
                {errors.options.message ??
                  errors.options.root?.message ??
                  'Check the option names and prices.'}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start"
              disabled={options.fields.length >= 10}
              onClick={() => options.append({ name: '', price: '0', isAvailable: true })}
            >
              <Plus /> Add option
            </Button>
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="menu-item-form" disabled={save.isPending || uploading}>
            {save.isPending ? <LoaderCircle className="animate-spin" /> : null}{' '}
            {item ? 'Save changes' : 'Add item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

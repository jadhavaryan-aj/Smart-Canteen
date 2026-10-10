import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { categoryIcon } from '@/components/common/category-icon';
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
import { Switch } from '@/components/ui/switch';
import { messageFor } from '@/lib/errors';
import { categoryFormSchema, slugify, type CategoryFormValues } from '@/lib/validation/admin';
import { deleteCategory, reorderCategories, saveCategory, setCategoryActive } from '@/services/admin/menu';
import type { Category, MenuItem } from '@/types/domain';

function CategoryDialog({
  category,
  nextSortOrder,
  open,
  onOpenChange,
}: {
  category: Category | null;
  nextSortOrder: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    values: {
      name: category?.name ?? '',
      slug: category?.slug ?? '',
      description: category?.description ?? '',
      isActive: category?.isActive ?? true,
    },
  });
  const save = useMutation({
    mutationFn: (values: CategoryFormValues) =>
      saveCategory({
        id: category?.id,
        name: values.name,
        slug: values.slug,
        description: values.description || null,
        isActive: values.isActive,
        sortOrder: category?.sortOrder ?? nextSortOrder,
      }),
    onSuccess: () => {
      toast.success(category ? 'Category updated' : 'Category added');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'menu'] });
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(messageFor(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? 'Edit category' : 'Add a category'}</DialogTitle>
          <DialogDescription>Categories group the menu and power the filters students see.</DialogDescription>
        </DialogHeader>
        <form
          id="category-form"
          noValidate
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className="grid gap-4"
        >
          <Field id="category-name" label="Name" error={form.formState.errors.name?.message}>
            {(props) => (
              <Input
                {...props}
                {...form.register('name', {
                  onChange: (event: { target: { value: string } }) => {
                    if (!category)
                      form.setValue('slug', slugify(event.target.value), { shouldValidate: true });
                  },
                })}
              />
            )}
          </Field>
          <Field
            id="category-slug"
            label="URL name"
            error={form.formState.errors.slug?.message}
            description="Used in links, e.g. /menu?category=breakfast"
          >
            {(props) => <Input {...props} {...form.register('slug')} />}
          </Field>
          <Field
            id="category-description"
            label="Description"
            optional
            error={form.formState.errors.description?.message}
          >
            {(props) => <Input {...props} maxLength={160} {...form.register('description')} />}
          </Field>
          <label className="flex items-center gap-3 text-sm font-semibold">
            <Switch
              checked={form.watch('isActive')}
              onCheckedChange={(value) => form.setValue('isActive', value)}
            />{' '}
            Visible to students
          </label>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" disabled={save.isPending}>
            {category ? 'Save' : 'Add category'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryManager({ categories, items }: { categories: Category[]; items: MenuItem[] }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'menu'] });
    void queryClient.invalidateQueries({ queryKey: ['menu'] });
  };

  const reorder = useMutation({
    mutationFn: reorderCategories,
    onSuccess: invalidate,
    onError: (error) => toast.error(messageFor(error)),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setCategoryActive(id, active),
    onSuccess: invalidate,
    onError: (error) => toast.error(messageFor(error)),
  });
  const remove = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      toast.success('Category deleted');
      invalidate();
    },
    onError: (error) => toast.error(messageFor(error)),
  });

  const move = (index: number, direction: -1 | 1) => {
    const ids = categories.map((category) => category.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids);
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex items-center justify-between border-b border-border p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">Use the arrows to change the order students see.</p>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus /> Add category
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {categories.map((category, index) => {
          const Icon = categoryIcon(category.slug);
          const count = items.filter((item) => item.categoryId === category.id).length;
          return (
            <li key={category.id} className="flex flex-wrap items-center gap-3 p-4 sm:px-5">
              <div className="flex flex-col">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${category.name} up`}
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${category.name} down`}
                  disabled={index === categories.length - 1 || reorder.isPending}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
              </div>
              <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{category.name}</p>
                <p className="text-xs text-muted-foreground">
                  /{category.slug} · {count} item{count === 1 ? '' : 's'}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Switch
                  checked={category.isActive}
                  onCheckedChange={(active) => toggle.mutate({ id: category.id, active })}
                  aria-label={`${category.name} visible to students`}
                />
                Visible
              </label>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${category.name}`}
                onClick={() => {
                  setEditing(category);
                  setDialogOpen(true);
                }}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${category.name}`}
                disabled={count > 0 || remove.isPending}
                title={count > 0 ? 'Move or delete its items first' : undefined}
                onClick={() => {
                  if (window.confirm(`Delete the “${category.name}” category?`)) remove.mutate(category.id);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          );
        })}
      </ul>
      <CategoryDialog
        category={editing}
        nextSortOrder={(categories.length + 1) * 10}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}

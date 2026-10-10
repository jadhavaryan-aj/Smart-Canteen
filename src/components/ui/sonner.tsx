import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            'group !rounded-2xl !border !border-border !bg-card !text-foreground !shadow-lift !font-sans !text-sm',
          description: '!text-muted-foreground',
          actionButton: '!rounded-full !bg-primary !text-primary-foreground !font-semibold',
          cancelButton: '!rounded-full !bg-muted !text-foreground',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };

"use client";

import { Toaster as Sonner, toast } from "sonner";

/**
 * "Someone else changed this…" errors all ask the person to reload, so every
 * such toast gets a Reload button, wherever it is raised.
 */
const CONFLICT = /someone else changed/i;
const showError = toast.error;
let patched = false;
if (!patched) {
  patched = true;
  toast.error = ((message, data) =>
    typeof message === "string" && CONFLICT.test(message) && !data?.action
      ? showError(message, { ...data, duration: 10_000, action: { label: "Reload", onClick: () => window.location.reload() } })
      : showError(message, data)) as typeof toast.error;
}

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };

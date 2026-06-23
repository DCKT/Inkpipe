import { createToaster, Toast, Toaster } from "@ark-ui/react";
import type { ReactNode } from "react";

const toaster = createToaster({
  placement: "bottom-end",
  overlap: true,
  gap: 8,
});

export { toaster };

export const ToastGroup = {
  Toaster: () => (
    <Toaster toaster={toaster}>
      {(toast) => (
        <Toast.Root key={toast.id}>
          <div className="island-shell flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg min-w-72">
            <div className="flex-1 min-w-0">
              {toast.title && (
                <Toast.Title className="text-sm font-semibold text-primary">
                  {toast.title as ReactNode}
                </Toast.Title>
              )}
              {toast.description && (
                <Toast.Description className="mt-0.5 text-xs text-secondary">
                  {toast.description as ReactNode}
                </Toast.Description>
              )}
            </div>
            <Toast.CloseTrigger className="shrink-0 rounded p-0.5 text-secondary hover:text-primary" />
          </div>
        </Toast.Root>
      )}
    </Toaster>
  ),
  create: {
    success: (title: string, description?: string) =>
      toaster.create({
        title,
        description,
        type: "success",
      }),
    error: (title: string, description?: string) =>
      toaster.create({
        title,
        description,
        type: "error",
      }),
    info: (title: string, description?: string) =>
      toaster.create({
        title,
        description,
        type: "info",
      }),
  },
};

import * as ArkDialog from "@ark-ui/react/dialog";
import type { DialogContentProps, DialogTitleProps, DialogDescriptionProps, DialogCloseTriggerProps, DialogBackdropProps } from "@ark-ui/react/dialog";
import { X } from "lucide-react";

const backdropClass = "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm";

const contentClass =
  "island-shell fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-2xl";

const titleClass = "text-lg font-semibold text-[var(--sea-ink)]";

const descriptionClass = "text-sm text-[var(--sea-ink-soft)]";

const closeTriggerClass =
  "rounded-lg p-1.5 text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]";

export const Dialog = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Root: (props: any) => <ArkDialog.DialogRoot {...props} />,
  Backdrop: ({ className, ...props }: DialogBackdropProps) => (
    <ArkDialog.DialogBackdrop
      className={`${backdropClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Content: ({ className, ...props }: DialogContentProps) => (
    <ArkDialog.DialogContent
      className={`${contentClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Title: ({ className, ...props }: DialogTitleProps) => (
    <ArkDialog.DialogTitle
      className={`${titleClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Description: ({ className, ...props }: DialogDescriptionProps) => (
    <ArkDialog.DialogDescription
      className={`${descriptionClass} ${className ?? ""}`}
      {...props}
    />
  ),
  CloseTrigger: ({ className, children, ...props }: DialogCloseTriggerProps) => (
    <ArkDialog.DialogCloseTrigger
      className={`${closeTriggerClass} ${className ?? ""}`}
      {...props}
    >
      {children ?? <X size={18} />}
    </ArkDialog.DialogCloseTrigger>
  ),
  Trigger: ArkDialog.DialogTrigger,
  Positioner: ArkDialog.DialogPositioner,
};

import * as ArkCombobox from "@ark-ui/react/combobox";
import { createListCollection } from "@ark-ui/react";
import { ChevronsUpDown, X } from "lucide-react";
import type {
  ComboboxInputProps,
  ComboboxContentProps,
  ComboboxItemProps,
  ComboboxLabelProps,
  ComboboxTriggerProps,
} from "@ark-ui/react/combobox";

const controlClass =
  "flex items-center gap-1 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-2.5 focus-within:border-[var(--lagoon)]";

const inputClass =
  "min-w-0 flex-1 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] outline-none bg-transparent border-none";

const contentClass =
  "z-50 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] shadow-lg backdrop-blur-sm p-1";

const itemClass =
  "rounded-lg px-3 py-2 text-left text-sm text-[var(--sea-ink)] cursor-pointer data-[highlighted]:bg-[var(--lagoon)]/10 data-[highlighted]:text-[var(--lagoon-deep)]";

const triggerClass =
  "inline-flex items-center justify-center rounded-lg size-5 text-[var(--sea-ink)]/50 hover:text-[var(--sea-ink)] data-[state=open]:text-[var(--lagoon)] cursor-pointer transition-colors";

const clearTriggerClass =
  "inline-flex items-center justify-center rounded-lg size-5 text-[var(--sea-ink)]/50 hover:text-[var(--sea-ink)] cursor-pointer transition-colors";

const labelClass = "text-sm font-medium text-[var(--sea-ink)]";

export { createListCollection };

export const Combobox = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Root: (props: any) => <ArkCombobox.ComboboxRoot {...props} />,
  Control: ({ className, ...props }: { className?: string; children?: React.ReactNode }) => (
    <ArkCombobox.ComboboxControl
      className={`${controlClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Input: ({ className, ...props }: ComboboxInputProps) => (
    <ArkCombobox.ComboboxInput
      className={`${inputClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Content: ({ className, ...props }: ComboboxContentProps) => (
    <ArkCombobox.ComboboxContent
      className={`${contentClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Item: ({ className, ...props }: ComboboxItemProps) => (
    <ArkCombobox.ComboboxItem
      className={`${itemClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Label: ({ className, ...props }: ComboboxLabelProps) => (
    <ArkCombobox.ComboboxLabel
      className={`${labelClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Trigger: ({ className, children, ...props }: ComboboxTriggerProps) => (
    <ArkCombobox.ComboboxTrigger
      className={`${triggerClass} ${className ?? ""}`}
      {...props}
    >
      {children ?? <ChevronsUpDown className="size-4" />}
    </ArkCombobox.ComboboxTrigger>
  ),
  ClearTrigger: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => (
    <ArkCombobox.ComboboxClearTrigger
      className={`${clearTriggerClass} ${className ?? ""}`}
      {...props}
    >
      {children ?? <X className="size-4" />}
    </ArkCombobox.ComboboxClearTrigger>
  ),
  Positioner: ArkCombobox.ComboboxPositioner,
  List: ArkCombobox.ComboboxList,
  ItemText: ArkCombobox.ComboboxItemText,
  Empty: ArkCombobox.ComboboxEmpty,
};

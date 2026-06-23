import * as ArkSelect from "@ark-ui/react/select";
import { createListCollection } from "@ark-ui/react";
import type { SelectTriggerProps, SelectContentProps, SelectItemProps, SelectLabelProps, SelectValueTextProps } from "@ark-ui/react/select";
const triggerClass =
  "w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-primary flex items-center justify-between gap-2 data-[placeholder]:text-secondary focus:border-accent focus:outline-none";

const contentClass =
  "z-50 rounded-xl border border-border bg-surface shadow-lg backdrop-blur-sm p-1";

const itemClass =
  "rounded-lg px-3 py-2 text-sm text-primary cursor-pointer data-[highlighted]:bg-accent/10 data-[highlighted]:text-accent-hover data-[selected]:text-accent-hover data-[selected]:font-medium";

const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-secondary";

export { createListCollection };

export const Select = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Root: (props: any) => <ArkSelect.SelectRoot {...props} />,
  Trigger: ({ className, ...props }: SelectTriggerProps) => (
    <ArkSelect.SelectTrigger
      className={`${triggerClass} ${className ?? ""}`}
      {...props}
    />
  ),
  ValueText: ({ className, ...props }: SelectValueTextProps) => (
    <ArkSelect.SelectValueText
      className={`text-sm ${className ?? ""}`}
      {...props}
    />
  ),
  Content: ({ className, ...props }: SelectContentProps) => (
    <ArkSelect.SelectContent
      className={`${contentClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Item: ({ className, ...props }: SelectItemProps) => (
    <ArkSelect.SelectItem
      className={`${itemClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Label: ({ className, ...props }: SelectLabelProps) => (
    <ArkSelect.SelectLabel
      className={`${labelClass} ${className ?? ""}`}
      {...props}
    />
  ),
  HiddenSelect: ArkSelect.SelectHiddenSelect,
  Positioner: ArkSelect.SelectPositioner,
  Indicator: ArkSelect.SelectIndicator,
  ItemText: ArkSelect.SelectItemText,
  ItemGroup: ArkSelect.SelectItemGroup,
  ItemGroupLabel: ArkSelect.SelectItemGroupLabel,
};

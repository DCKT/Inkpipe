import * as ArkSelect from "@ark-ui/react/select";
import { createListCollection } from "@ark-ui/react";
import type { SelectTriggerProps, SelectContentProps, SelectItemProps, SelectLabelProps, SelectValueTextProps } from "@ark-ui/react/select";
const triggerClass =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-2.5 text-sm text-[var(--sea-ink)] flex items-center justify-between gap-2 data-[placeholder]:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none";

const contentClass =
  "z-50 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] shadow-lg backdrop-blur-sm p-1";

const itemClass =
  "rounded-lg px-3 py-2 text-sm text-[var(--sea-ink)] cursor-pointer data-[highlighted]:bg-[var(--lagoon)]/10 data-[highlighted]:text-[var(--lagoon-deep)] data-[selected]:text-[var(--lagoon-deep)] data-[selected]:font-medium";

const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]";

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

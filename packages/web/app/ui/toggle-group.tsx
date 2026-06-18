import * as ArkToggleGroup from "@ark-ui/react/toggle-group";
import type { ToggleGroupRootProps, ToggleGroupItemProps } from "@ark-ui/react/toggle-group";

const rootClass =
  "flex gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-1 w-fit";

const itemClass =
  "rounded-lg px-4 py-1.5 text-sm font-medium transition data-[state=on]:bg-[var(--lagoon)] data-[state=on]:text-white data-[state=on]:shadow-sm text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] cursor-pointer";

export const ToggleGroup = {
  Root: ({ className, ...props }: ToggleGroupRootProps) => (
    <ArkToggleGroup.ToggleGroupRoot
      className={`${rootClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Item: ({ className, ...props }: ToggleGroupItemProps) => (
    <ArkToggleGroup.ToggleGroupItem
      className={`${itemClass} ${className ?? ""}`}
      {...props}
    />
  ),
};

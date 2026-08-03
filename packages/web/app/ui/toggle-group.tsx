import * as ArkToggleGroup from "@ark-ui/react/toggle-group";
import type { ToggleGroupRootProps, ToggleGroupItemProps } from "@ark-ui/react/toggle-group";

const rootClass =
  "flex gap-1 rounded-[3px] border border-border bg-surface p-1 w-fit";

const itemClass =
  "rounded-[2px] px-4 py-1.5 text-sm font-semibold transition data-[state=on]:bg-accent data-[state=on]:text-on-accent text-secondary hover:text-primary cursor-pointer";

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

import * as ArkTooltip from "@ark-ui/react/tooltip";
import type {
  TooltipRootProps,
  TooltipTriggerProps,
  TooltipContentProps,
} from "@ark-ui/react/tooltip";

const contentClass =
  "z-50 rounded-[3px] border border-border bg-surface px-2 py-1 font-mono text-[11px] text-primary shadow-lg";

export const Tooltip = {
  Root: ({ children, openDelay = 200, closeDelay = 0, ...props }: TooltipRootProps) => (
    <ArkTooltip.TooltipRoot openDelay={openDelay} closeDelay={closeDelay} {...props}>
      {children}
    </ArkTooltip.TooltipRoot>
  ),
  Trigger: ({ children, ...props }: TooltipTriggerProps) => (
    <ArkTooltip.TooltipTrigger asChild {...props}>
      {children}
    </ArkTooltip.TooltipTrigger>
  ),
  Content: ({ className, children, ...props }: TooltipContentProps) => (
    <ArkTooltip.TooltipPositioner>
      <ArkTooltip.TooltipContent className={`${contentClass} ${className ?? ""}`} {...props}>
        {children}
      </ArkTooltip.TooltipContent>
    </ArkTooltip.TooltipPositioner>
  ),
};

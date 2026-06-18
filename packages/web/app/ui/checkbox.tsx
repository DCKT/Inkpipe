import * as ArkCheckbox from "@ark-ui/react/checkbox";
import type { CheckboxRootProps, CheckboxControlProps, CheckboxLabelProps, CheckboxIndicatorProps } from "@ark-ui/react/checkbox";

const rootClass = "flex items-center gap-2.5";
const controlClass =
  "flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--line)] bg-[var(--surface-strong)] data-[state=checked]:bg-[var(--lagoon)] data-[state=checked]:border-[var(--lagoon)] transition-colors";

const indicatorClass = "text-white";

const labelClass = "text-sm text-[var(--sea-ink)] select-none";

export const Checkbox = {
  Root: ({ className, children, ...props }: CheckboxRootProps) => (
    <ArkCheckbox.CheckboxRoot
      className={`${rootClass} ${className ?? ""}`}
      {...props}
    >
      <ArkCheckbox.CheckboxHiddenInput />
      {children}
    </ArkCheckbox.CheckboxRoot>
  ),
  Control: ({ className, ...props }: CheckboxControlProps) => (
    <ArkCheckbox.CheckboxControl
      className={`${controlClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Label: ({ className, ...props }: CheckboxLabelProps) => (
    <ArkCheckbox.CheckboxLabel
      className={`${labelClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Indicator: ({ className, ...props }: CheckboxIndicatorProps) => (
    <ArkCheckbox.CheckboxIndicator
      className={`${indicatorClass} ${className ?? ""}`}
      {...props}
    />
  ),
};

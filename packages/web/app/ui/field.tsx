import * as ArkField from "@ark-ui/react/field";
import type { FieldRootProps, FieldLabelProps, FieldInputProps, FieldSelectProps, FieldHelperTextProps, FieldErrorTextProps } from "@ark-ui/react/field";

const labelClass =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]";

const inputClass =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-2.5 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none";

const helperTextClass = "mt-1 text-xs text-[var(--sea-ink-soft)]";

const errorTextClass = "mt-1 text-xs text-red-600";

export const Field = {
  Root: ({ className, ...props }: FieldRootProps) => (
    <ArkField.FieldRoot className={className} {...props} />
  ),
  Label: ({ className, ...props }: FieldLabelProps) => (
    <ArkField.FieldLabel
      className={`${labelClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Input: ({ className, ...props }: FieldInputProps) => (
    <ArkField.FieldInput
      className={`${inputClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Select: ({ className, ...props }: FieldSelectProps) => (
    <ArkField.FieldSelect
      className={`${inputClass} ${className ?? ""}`}
      {...props}
    />
  ),
  HelperText: ({ className, ...props }: FieldHelperTextProps) => (
    <ArkField.FieldHelperText
      className={`${helperTextClass} ${className ?? ""}`}
      {...props}
    />
  ),
  ErrorText: ({ className, ...props }: FieldErrorTextProps) => (
    <ArkField.FieldErrorText
      className={`${errorTextClass} ${className ?? ""}`}
      {...props}
    />
  ),
  RequiredIndicator: ArkField.FieldRequiredIndicator,
};

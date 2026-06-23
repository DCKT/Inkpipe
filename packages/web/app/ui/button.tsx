import { forwardRef } from "react";

const variants = {
  primary:
    "rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50",
  secondary:
    "rounded-full border border-[rgba(114,135,253,0.3)] px-5 py-2 text-sm font-medium text-primary transition hover:bg-accent/10",
  ghost:
    "rounded-lg p-1.5 text-secondary transition hover:bg-surface-hover hover:text-primary",
  submit:
    "w-full rounded-xl border border-[rgba(114,135,253,0.3)] bg-[rgba(136,57,239,0.14)] px-6 py-3 text-sm font-semibold text-accent-hover transition hover:-translate-y-0.5 hover:bg-[rgba(136,57,239,0.24)] disabled:opacity-50",
  refresh:
    "rounded-lg border border-border px-4 py-2 text-sm font-medium text-secondary transition hover:bg-surface-hover disabled:opacity-50",
  floating:
    "rounded-full border border-[rgba(114,135,253,0.3)] bg-accent px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-accent-hover disabled:opacity-50",
} as const;

type Variant = keyof typeof variants;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={`${variants[variant]} ${className ?? ""}`}
      {...props}
    >
      {children}
    </button>
  ),
);

Button.displayName = "Button";

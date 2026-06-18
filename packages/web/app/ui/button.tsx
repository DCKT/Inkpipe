import { forwardRef } from "react";

const variants = {
  primary:
    "rounded-xl bg-[var(--lagoon)] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--lagoon-deep)] disabled:opacity-50",
  secondary:
    "rounded-full border border-[rgba(114,135,253,0.3)] px-5 py-2 text-sm font-medium text-[var(--sea-ink)] transition hover:bg-[var(--lagoon)]/10",
  ghost:
    "rounded-lg p-1.5 text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]",
  submit:
    "w-full rounded-xl border border-[rgba(114,135,253,0.3)] bg-[rgba(136,57,239,0.14)] px-6 py-3 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:-translate-y-0.5 hover:bg-[rgba(136,57,239,0.24)] disabled:opacity-50",
  refresh:
    "rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] disabled:opacity-50",
  floating:
    "rounded-full border border-[rgba(114,135,253,0.3)] bg-[var(--lagoon)] px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[var(--lagoon-deep)] disabled:opacity-50",
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

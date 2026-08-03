import { forwardRef } from "react";

const variants = {
  // Primary: solid accent stamp
  primary:
    "rounded-[3px] bg-accent px-6 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-50",
  // Secondary: 1.5px solid text-primary border, transparent bg
  secondary:
    "rounded-[3px] border-[1.5px] border-primary px-5 py-2 text-sm font-semibold text-primary transition hover:bg-surface-2 disabled:opacity-50",
  // Ghost: transparent, underlined, text-secondary
  ghost:
    "rounded-[3px] p-1.5 text-secondary underline underline-offset-2 transition hover:text-primary",
  submit:
    "w-full rounded-[3px] border-[1.5px] border-accent bg-accent-tint px-6 py-3 text-sm font-semibold text-accent-hover transition hover:bg-accent/20 disabled:opacity-50",
  refresh:
    "rounded-[3px] border border-border px-4 py-2 text-sm font-semibold text-secondary transition hover:bg-surface-2 disabled:opacity-50",
  floating:
    "rounded-[3px] border border-accent bg-accent px-8 py-3 text-sm font-semibold text-on-accent shadow-lg transition hover:-translate-y-0.5 hover:bg-accent-hover disabled:opacity-50",
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

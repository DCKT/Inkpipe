import { forwardRef } from "react";

const baseClass =
  "w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-primary placeholder:text-secondary focus:border-accent focus:outline-none";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={`${baseClass} ${className ?? ""}`} {...props} />
  ),
);

Input.displayName = "Input";

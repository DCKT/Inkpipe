export function InkpipeMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M50 10 L78 46 C86 57 86 72 74 82 C63 91 50 90 42 80 C36 72 38 61 46 54 L50 50 L54 54 C58 58 58 64 54 68 C51 71 47 70 45 67"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="28" r="5" fill="var(--color-accent)" />
    </svg>
  );
}

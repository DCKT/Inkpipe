import * as ArkProgress from "@ark-ui/react/progress";
import type { ProgressRootProps, ProgressTrackProps, ProgressRangeProps, ProgressValueTextProps } from "@ark-ui/react/progress";

const rootClass = "w-full";

const trackClass =
  "h-1.5 overflow-hidden rounded-full bg-border";

const rangeClass =
  "h-full rounded-full bg-accent transition-all duration-300";

const valueTextClass = "text-xs text-secondary";

export const Progress = {
  Root: ({ className, ...props }: ProgressRootProps) => (
    <ArkProgress.ProgressRoot
      className={`${rootClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Track: ({ className, ...props }: ProgressTrackProps) => (
    <ArkProgress.ProgressTrack
      className={`${trackClass} ${className ?? ""}`}
      {...props}
    />
  ),
  Range: ({ className, ...props }: ProgressRangeProps) => (
    <ArkProgress.ProgressRange
      className={`${rangeClass} ${className ?? ""}`}
      {...props}
    />
  ),
  ValueText: ({ className, ...props }: ProgressValueTextProps) => (
    <ArkProgress.ProgressValueText
      className={`${valueTextClass} ${className ?? ""}`}
      {...props}
    />
  ),
  View: ArkProgress.ProgressView,
  Label: ArkProgress.ProgressLabel,
};

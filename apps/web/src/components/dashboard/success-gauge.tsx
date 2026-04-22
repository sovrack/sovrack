'use client';

type SuccessGaugeProps = {
  percentage: number;
  label?: string;
};

export function SuccessGauge({ percentage, label = 'Success Rate' }: SuccessGaugeProps) {
  const radius = 52;
  const cx = 70;
  const cy = 70;
  const circumference = 2 * Math.PI * radius;
  const safePercent = Math.min(100, Math.max(0, percentage));
  const strokeDashoffset = circumference * (1 - safePercent / 100);

  const color =
    safePercent >= 80
      ? '#22c55e'
      : safePercent >= 50
        ? '#eab308'
        : '#ef4444';

  const bgColor =
    safePercent >= 80
      ? 'rgba(34, 197, 94, 0.1)'
      : safePercent >= 50
        ? 'rgba(234, 179, 8, 0.1)'
        : 'rgba(239, 68, 68, 0.1)';

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 140" width={140} height={140}>
        {/* Background track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={14}
        />
        {/* Progress arc */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        {/* Center text */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          fontSize={26}
          fontWeight={700}
          fill="var(--text-primary)"
          fontFamily="system-ui, sans-serif"
        >
          {safePercent}%
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fontSize={11}
          fill="var(--text-muted)"
          fontFamily="system-ui, sans-serif"
        >
          {label}
        </text>
      </svg>

      {/* Color hint */}
      <div className="mt-1 flex items-center gap-1.5">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs text-[var(--text-secondary)]">
          {safePercent >= 80
            ? 'Excellent'
            : safePercent >= 50
              ? 'Stable'
              : 'Needs attention'}
        </span>
      </div>
    </div>
  );
}

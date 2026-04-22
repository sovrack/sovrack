'use client';

type DayData = {
  label: string;
  total: number;
  success: number;
};

type DeploymentsChartProps = {
  data: DayData[];
};

const CHART_HEIGHT = 120;
const BAR_WIDTH = 28;
const BAR_GAP = 12;

export function DeploymentsChart({ data }: DeploymentsChartProps) {
  const maxValue = Math.max(...data.map((d) => d.total), 1);
  const chartWidth = data.length * (BAR_WIDTH + BAR_GAP) - BAR_GAP;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT + 28}`}
        width="100%"
        className="overflow-visible"
      >
        {/* Horizontal guide lines */}
        {[0, 0.5, 1].map((ratio) => {
          const y = CHART_HEIGHT - ratio * CHART_HEIGHT;
          return (
            <line
              key={ratio}
              x1={0}
              y1={y}
              x2={chartWidth}
              y2={y}
              stroke="var(--border)"
              strokeWidth={1}
            />
          );
        })}

        {data.map((d, i) => {
          const x = i * (BAR_WIDTH + BAR_GAP);
          const totalHeight = (d.total / maxValue) * CHART_HEIGHT;
          const successHeight = (d.success / maxValue) * CHART_HEIGHT;

          return (
            <g key={d.label}>
              {/* Total bar (background) */}
              <rect
                x={x}
                y={CHART_HEIGHT - totalHeight}
                width={BAR_WIDTH}
                height={totalHeight}
                rx={5}
                fill="var(--hover)"
              />
              {/* Success bar (foreground) */}
              {d.success > 0 && (
                <rect
                  x={x}
                  y={CHART_HEIGHT - successHeight}
                  width={BAR_WIDTH}
                  height={successHeight}
                  rx={5}
                  fill="#22c55e"
                />
              )}
              {/* Day label */}
              <text
                x={x + BAR_WIDTH / 2}
                y={CHART_HEIGHT + 18}
                textAnchor="middle"
                fontSize={10}
                fill="var(--text-muted)"
                fontFamily="system-ui, sans-serif"
              >
                {d.label}
              </text>
              {/* Value on hover — using title */}
              <title>{`${d.label}: ${d.total} total, ${d.success} success`}</title>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--text-primary)]" />
          <span className="text-xs text-[var(--text-secondary)]">Success</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--hover)]" />
          <span className="text-xs text-[var(--text-secondary)]">Total</span>
        </div>
      </div>
    </div>
  );
}

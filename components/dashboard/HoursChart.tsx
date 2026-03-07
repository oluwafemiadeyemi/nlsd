"use client";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface HoursChartProps {
  monthlyHours: number[];
  year: number;
}

export function HoursChart({ monthlyHours, year }: HoursChartProps) {
  const maxHours = Math.max(1, ...monthlyHours);
  const currentMonth = new Date().getMonth();

  return (
    <div className="rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold mb-3">Hours by Month — {year}</h3>
      <div className="flex items-end gap-1 h-28">
        {MONTH_LABELS.map((label, i) => {
          const hours = monthlyHours[i] ?? 0;
          const heightPct = maxHours > 0 ? (hours / maxHours) * 100 : 0;
          const isCurrent = i === currentMonth;
          return (
            <div key={label} className="flex-1 flex flex-col items-center gap-1">
              {hours > 0 && (
                <span className="text-[10px] text-muted-foreground font-medium">
                  {hours.toFixed(0)}
                </span>
              )}
              <div
                className={`w-full rounded-t transition-all ${isCurrent ? "bg-primary" : "bg-primary/30"}`}
                style={{ height: `${Math.max(2, heightPct)}%` }}
                title={`${label}: ${hours.toFixed(1)}h`}
              />
              <span className={`text-[10px] ${isCurrent ? "text-primary font-bold" : "text-muted-foreground"}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

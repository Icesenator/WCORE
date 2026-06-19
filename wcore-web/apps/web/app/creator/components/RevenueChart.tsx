"use client";

interface RevenueChartProps {
  revenueByDay: Record<string, number>;
}

export function RevenueChart({ revenueByDay }: RevenueChartProps) {
  const sortedDays = Object.keys(revenueByDay).sort();
  const maxValue = Math.max(1, ...Object.values(revenueByDay));

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Revenue (Last 30 Days)</p>
      {sortedDays.length === 0 ? (
        <p className="text-sm text-muted text-center py-4">No data available</p>
      ) : (
        <div className="flex items-end gap-1 h-40">
          {sortedDays.map((day) => {
            const value = revenueByDay[day] ?? 0;
            const heightPercent = (value / maxValue) * 100;
            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-1 group" title={`${day}: ${value} GM${value !== 1 ? "s" : ""}`}>
                <div
                  className="w-full rounded-sm bg-accent/70 transition-all hover:bg-accent"
                  style={{ height: `${Math.max(heightPercent, 2)}%` }}
                />
                <span className="text-[9px] text-muted rotate-90 origin-left translate-y-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {day.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>{sortedDays[0] ?? "—"}</span>
        <span>{sortedDays[sortedDays.length - 1] ?? "—"}</span>
      </div>
    </div>
  );
}

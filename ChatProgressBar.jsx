import { useMemo } from "react";

function calcStreak(completedDays) {
  if (!completedDays?.length) return 0;
  const sorted = [...completedDays].sort((a, b) => b - a);
  let streak = 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i] - sorted[i + 1] === 1) streak++;
    else break;
  }
  return streak;
}

function calcLevel(completedDays) {
  const count = completedDays?.length || 0;
  if (count >= 18) return 6;
  if (count >= 14) return 5;
  if (count >= 10) return 4;
  if (count >= 7) return 3;
  if (count >= 3) return 2;
  return 1;
}

export default function ChatProgressBar({ profile }) {
  const completedDays = profile?.completed_days || [];
  const dailyTasks = profile?.daily_tasks || [];
  const streak = calcStreak(completedDays);
  const level = calcLevel(completedDays);
  const isPremium = profile?.is_premium;

  // Bar chart: last 7 days tasks
  const weekData = useMemo(() => {
    return dailyTasks.slice(-7).map((d) => ({
      day: d.day,
      completed: d.tasks?.filter((t) => t.completed).length || 0,
      total: d.tasks?.length || 3,
    }));
  }, [dailyTasks]);

  const hasData = weekData.length > 0;

  if (!profile) return null;

  return (
    <div className="mx-4 mb-3 bg-card rounded-2xl border border-white/5 p-3 shrink-0">
      {/* Title */}
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center mb-2">
        Tu progreso esta semana
      </p>

      {/* Mini bar chart */}
      <div className="flex items-end gap-1 justify-center h-10 mb-3">
        {hasData ? (
          weekData.map((d, i) => {
            const pct = d.total > 0 ? d.completed / d.total : 0;
            const isLast = i === weekData.length - 1;
            return (
              <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full">
                <div
                  className={`w-full rounded-sm transition-all ${
                    isLast ? "bg-accent" : "bg-primary/60"
                  }`}
                  style={{ height: `${Math.max(pct * 100, 10)}%` }}
                />
              </div>
            );
          })
        ) : (
          Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 flex items-end h-full">
              <div className="w-full rounded-sm bg-white/10" style={{ height: "20%" }} />
            </div>
          ))
        )}
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5 justify-start">
        {streak > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-semibold bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-full">
            🏆 {streak} días seguidos
          </span>
        )}
        <span className="flex items-center gap-1 text-[11px] font-semibold bg-primary/20 text-primary px-2.5 py-1 rounded-full">
          ⭐ Nivel {level}
        </span>
        {isPremium && (
          <span className="flex items-center gap-1 text-[11px] font-semibold bg-accent/20 text-accent px-2.5 py-1 rounded-full">
            💎 Premium
          </span>
        )}

/**
 * Pre-first-brief empty state — never invent fake Top-3 kicks (design § Home empty states).
 */
export function KicksEmpty() {
  return (
    <section className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-shell-fg">
            Today&apos;s Top 3 Kicks
          </h2>
          <p className="mt-1 text-sm text-shell-muted">
            Today&apos;s kicks appear after your first morning brief.
          </p>
        </div>
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-shell-surface text-shell-warm ring-1 ring-shell-border"
        >
          ✨
        </span>
      </div>

      <ul className="space-y-2" aria-hidden>
        {[1, 2, 3].map((n) => (
          <li
            key={n}
            className="flex items-center gap-3 rounded-2xl border border-dashed border-shell-border/80 bg-shell-surface/40 px-4 py-3"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-shell-border/40 text-xs font-semibold text-shell-muted">
              {n}
            </span>
            <span className="h-3 w-2/3 max-w-[12rem] rounded-full bg-shell-border/50" />
          </li>
        ))}
      </ul>

      <p className="text-xs leading-relaxed text-shell-muted/80">
        Connect apps and wait for the morning check-in — or run a brief when that
        lands. No fake priorities here.
      </p>
    </section>
  )
}

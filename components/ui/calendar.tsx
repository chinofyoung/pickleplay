"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// Parse a "yyyy-mm-dd" string into its parts (month is 0-based).
function parseISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return { y, m: m - 1, d }
}

function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

// Calendar math via UTC so it never shifts across the user's local timezone.
function firstWeekday(y: number, m: number) {
  return new Date(Date.UTC(y, m, 1)).getUTCDay()
}
function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
}

export function Calendar({
  value,
  min,
  onSelect,
}: {
  /** Selected date as "yyyy-mm-dd". */
  value?: string
  /** Earliest selectable date as "yyyy-mm-dd" (inclusive). */
  min?: string
  onSelect: (iso: string) => void
}) {
  const selected = value ? parseISO(value) : null
  const anchor = selected ?? (min ? parseISO(min) : parseISO(toISO(2026, 0, 1)))
  const [view, setView] = useState({ y: anchor.y, m: anchor.m })

  const leading = firstWeekday(view.y, view.m)
  const total = daysInMonth(view.y, view.m)
  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ]

  // Disable navigating before the month that contains `min`.
  const atMinMonth =
    !!min &&
    view.y === parseISO(min).y &&
    view.m === parseISO(min).m

  function shift(delta: number) {
    setView(({ y, m }) => {
      const next = m + delta
      return { y: y + Math.floor(next / 12), m: ((next % 12) + 12) % 12 }
    })
  }

  return (
    <div className="w-[18rem] p-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-3">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={atMinMonth}
          aria-label="Previous month"
          className="flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold text-foreground">
          {MONTHS[view.m]} {view.y}
        </span>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next month"
          className="flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-1 pb-1">
        {WEEKDAYS.map((w, i) => (
          <span
            key={i}
            className="flex h-8 items-center justify-center text-xs font-medium text-text-muted"
          >
            {w}
          </span>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <span key={i} />
          const iso = toISO(view.y, view.m, day)
          const isSelected = !!value && iso === value
          const isDisabled = !!min && iso < min
          return (
            <button
              key={i}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect(iso)}
              className={cn(
                "flex size-9 items-center justify-center rounded-lg text-sm transition-colors",
                "hover:bg-white/[0.08]",
                "disabled:pointer-events-none disabled:text-text-muted/30",
                isSelected
                  ? "bg-primary font-semibold text-primary-foreground hover:bg-primary"
                  : "text-foreground"
              )}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

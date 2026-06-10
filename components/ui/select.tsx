"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Root ──────────────────────────────────────────────────────────────────────
function Select<Value>(props: SelectPrimitive.Root.Props<Value>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

// ── Trigger ───────────────────────────────────────────────────────────────────
const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  SelectPrimitive.Trigger.Props & { className?: string }
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    data-slot="select-trigger"
    className={cn(
      "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&[aria-expanded=true]_[data-slot=select-chevron]]:rotate-180",
      className
    )}
    {...props}
  >
    {children}
    <ChevronDown
      data-slot="select-chevron"
      className="size-4 shrink-0 text-muted-foreground transition-transform duration-200"
    />
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = "SelectTrigger"

// ── Value ─────────────────────────────────────────────────────────────────────
function SelectValue(props: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

// ── Portal ────────────────────────────────────────────────────────────────────
function SelectPortal(props: SelectPrimitive.Portal.Props) {
  return <SelectPrimitive.Portal data-slot="select-portal" {...props} />
}

// ── Positioner ────────────────────────────────────────────────────────────────
function SelectPositioner({
  className,
  sideOffset = 4,
  ...props
}: SelectPrimitive.Positioner.Props & { className?: string }) {
  return (
    <SelectPrimitive.Positioner
      data-slot="select-positioner"
      className={cn("isolate z-50 outline-none", className)}
      sideOffset={sideOffset}
      {...props}
    />
  )
}

// ── Popup ─────────────────────────────────────────────────────────────────────
function SelectPopup({
  className,
  ...props
}: SelectPrimitive.Popup.Props & { className?: string }) {
  return (
    <SelectPrimitive.Popup
      data-slot="select-popup"
      className={cn(
        "z-50 max-h-[min(var(--available-height,280px),280px)] w-(--anchor-width) min-w-[8rem] overflow-y-auto overscroll-contain rounded-lg bg-card p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none",
        "origin-(--transform-origin)",
        "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
        "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  )
}

// ── Item ──────────────────────────────────────────────────────────────────────
const SelectItem = React.forwardRef<
  HTMLDivElement,
  SelectPrimitive.Item.Props & { className?: string }
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    data-slot="select-item"
    className={cn(
      // min-h-11 ensures ≥44 px tap target on mobile
      "relative flex min-h-11 cursor-default select-none items-center rounded-md px-3 py-2.5 text-sm outline-none",
      "focus:bg-muted focus:text-foreground",
      "data-highlighted:bg-muted data-highlighted:text-foreground",
      "data-selected:text-primary",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
      className
    )}
    {...props}
  >
    <SelectItemText>{children}</SelectItemText>
    <SelectItemIndicator className="absolute right-3" />
  </SelectPrimitive.Item>
))
SelectItem.displayName = "SelectItem"

// ── ItemText ──────────────────────────────────────────────────────────────────
function SelectItemText(props: SelectPrimitive.ItemText.Props) {
  return <SelectPrimitive.ItemText data-slot="select-item-text" {...props} />
}

// ── ItemIndicator ─────────────────────────────────────────────────────────────
function SelectItemIndicator({
  className,
  ...props
}: SelectPrimitive.ItemIndicator.Props & { className?: string }) {
  return (
    <SelectPrimitive.ItemIndicator
      data-slot="select-item-indicator"
      className={cn("flex items-center justify-center", className)}
      {...props}
    >
      <Check className="size-3.5 text-primary" />
    </SelectPrimitive.ItemIndicator>
  )
}

// ── Content convenience wrapper ───────────────────────────────────────────────
// Composes Portal + Positioner + Popup so callers can just write <SelectContent>
function SelectContent({
  className,
  children,
  align = "start",
  side = "bottom",
  sideOffset = 4,
  ...props
}: SelectPrimitive.Popup.Props & {
  className?: string
  align?: SelectPrimitive.Positioner.Props["align"]
  side?: SelectPrimitive.Positioner.Props["side"]
  sideOffset?: number
}) {
  return (
    <SelectPortal>
      <SelectPositioner align={align} side={side} sideOffset={sideOffset}>
        <SelectPopup className={className} {...props}>
          {children}
        </SelectPopup>
      </SelectPositioner>
    </SelectPortal>
  )
}

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPortal,
  SelectPositioner,
  SelectPopup,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
}

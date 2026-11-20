/**
 * Popover — Design System Component
 *
 * An anchored floating panel that opens on trigger interaction.
 *
 * Behavior is provided by @radix-ui/react-popover, which handles:
 *   - Open/close state (both controlled and uncontrolled)
 *   - Trigger click interaction
 *   - Escape key closes the popover + focus returns to trigger
 *   - Outside-click (pointer-down) closes the popover
 *   - Focus moves into the content on open
 *   - Portal rendering to document.body
 *   - Viewport collision detection and automatic side-flip
 *   - aria-expanded, aria-haspopup, aria-controls wiring
 *   - role="dialog" on the content panel
 *
 * DIWA continues to own:
 *   - Public API (open, onOpenChange, defaultOpen, placement, title, maxWidth, className, children)
 *   - Trigger visual treatment (button styling)
 *   - Content panel visual treatment (bg, border, radius, shadow, padding)
 *   - Placement vocabulary (DIWA names mapped internally to Radix side+align)
 *   - Typography and color tokens
 *   - Component anatomy and composition model
 *
 * Composition:
 *   <Popover>
 *     <PopoverTrigger>Open</PopoverTrigger>
 *     <PopoverContent title="Settings">…</PopoverContent>
 *   </Popover>
 *
 * Placement: 'bottom-start' | 'bottom-end' | 'bottom' |
 *            'top-start'    | 'top-end'    | 'top'
 *
 * Difference from Dialog/Modal:
 *   - Popover is anchored to a trigger and positioned near it.
 *   - Dialog/Modal is centered in the viewport and blocks the page.
 *   - Tooltip shows text-only hints on hover/focus without interaction.
 */

import * as PopoverPrimitive from '@radix-ui/react-popover';
import { type ReactNode } from 'react';
import { cn, FLOATING_LAYER_SELECTOR } from '../../../lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PopoverPlacement =
  | 'bottom-start' | 'bottom' | 'bottom-end'
  | 'top-start'    | 'top'    | 'top-end'
  | 'left-start'   | 'left'   | 'left-end'
  | 'right-start'  | 'right'  | 'right-end';

// ── Placement → Radix side + align mapping ────────────────────────────────────

type RadixSide  = 'top' | 'bottom' | 'left' | 'right';
type RadixAlign = 'start' | 'center' | 'end';

function toRadixPlacement(placement: PopoverPlacement): { side: RadixSide; align: RadixAlign } {
  switch (placement) {
    case 'bottom-start': return { side: 'bottom', align: 'start' };
    case 'bottom':       return { side: 'bottom', align: 'center' };
    case 'bottom-end':   return { side: 'bottom', align: 'end' };
    case 'top-start':    return { side: 'top',    align: 'start' };
    case 'top':          return { side: 'top',    align: 'center' };
    case 'top-end':      return { side: 'top',    align: 'end' };
    case 'left-start':   return { side: 'left',   align: 'start' };
    case 'left':         return { side: 'left',   align: 'center' };
    case 'left-end':     return { side: 'left',   align: 'end' };
    case 'right-start':  return { side: 'right',  align: 'start' };
    case 'right':        return { side: 'right',  align: 'center' };
    case 'right-end':    return { side: 'right',  align: 'end' };
  }
}

// ── Popover (root) ────────────────────────────────────────────────────────────

export interface PopoverProps {
  /** Controlled open state */
  open?: boolean;
  /** Controlled: called when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Uncontrolled initial open state */
  defaultOpen?: boolean;
  placement?: PopoverPlacement;
  children: ReactNode;
}

export function Popover({
  open,
  onOpenChange,
  defaultOpen = false,
  placement = 'bottom-start',
  children,
}: PopoverProps) {
  const { side, align } = toRadixPlacement(placement);

  return (
    // We pass side/align down via a context-like trick: wrap in a span-level
    // context provider so PopoverContent can pick up the resolved placement.
    // Radix manages open state internally; controlled mode uses open/onOpenChange.
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      defaultOpen={defaultOpen}
    >
      {/*
        Render children with the resolved placement accessible via React context.
        Because PopoverTrigger and PopoverContent are co-located in this file,
        we can pass side/align as props through a thin internal context.
      */}
      <PopoverPlacementContext.Provider value={{ side, align }}>
        {children}
      </PopoverPlacementContext.Provider>
    </PopoverPrimitive.Root>
  );
}

// ── Internal placement context ────────────────────────────────────────────────
// Not exported — Radix placement details never surface to consumers.

import { createContext, useContext } from 'react';

interface PlacementCtx { side: RadixSide; align: RadixAlign }
const PopoverPlacementContext = createContext<PlacementCtx>({ side: 'bottom', align: 'start' });
function usePlacement() { return useContext(PopoverPlacementContext); }

// ── PopoverTrigger ────────────────────────────────────────────────────────────

export interface PopoverTriggerProps {
  children: ReactNode;
  className?: string;
}

export function PopoverTrigger({ children, className = '' }: PopoverTriggerProps) {
  return (
    // asChild forwards Radix's accessibility props (aria-expanded, aria-haspopup,
    // aria-controls) onto the inner <button> rather than creating a wrapper element.
    <PopoverPrimitive.Trigger asChild>
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30',
          className,
        )}
      >
        {children}
      </button>
    </PopoverPrimitive.Trigger>
  );
}

// ── PopoverContent ────────────────────────────────────────────────────────────

export interface PopoverContentProps {
  /** Optional title rendered in the popover header */
  title?: string;
  children: ReactNode;
  /** Tailwind max-width class */
  maxWidth?: string;
  className?: string;
}

export function PopoverContent({
  title,
  children,
  maxWidth = 'max-w-xs',
  className = '',
}: PopoverContentProps) {
  const { side, align } = usePlacement();

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        side={side}
        align={align}
        sideOffset={8}
        // Radix will flip to the opposite side if the preferred side clips
        // the viewport (collision detection via @floating-ui/dom internally).
        // avoidCollisions is true by default.
        onInteractOutside={(e) => {
          // Keep the popover open when interacting with a floating layer
          // (Select listbox, Menu panel, DatePicker calendar) portaled to
          // document.body outside this popover content node.
          const target = e.target as Element | null;
          if (target?.closest(FLOATING_LAYER_SELECTOR)) {
            e.preventDefault();
          }
        }}
        className={cn(
          // DIWA visual treatment — matches the pre-migration appearance exactly
          'z-50 w-max rounded-xl border border-slate-200 bg-white shadow-lg',
          'outline-none',
          // Entry/exit animations
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          'duration-200',
          maxWidth,
          className,
        )}
      >
        {title && (
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="font-heading text-sm font-bold text-slate-900">{title}</h3>
          </div>
        )}
        <div className="px-4 py-3">{children}</div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Floating layers (Menu panels, DatePicker calendars) portal to document.body.
 * Inside an open Modal/Dialog, Radix blocks pointer events outside its content
 * and treats any interaction there as "outside" (closing the dialog). Floating
 * layers opt out by setting `pointer-events: auto` and carrying this marker;
 * Modal and Dialog then ignore interactions that land inside them.
 */
export const FLOATING_LAYER_ATTR = 'data-pis-floating';
export const FLOATING_LAYER_SELECTOR = `.pis-datepicker-popover, [${FLOATING_LAYER_ATTR}]`;

/**
 * Nearest *vertical* scroll container of `el`. Floating panels (Select, Dropdown)
 * clamp their vertical bounds to this so they can't spill past a pinned modal
 * header/footer or an app's sticky top header — the container's visible box
 * excludes those. Returns null when none exists (caller then uses the viewport).
 *
 * An `overflow-x-auto` wrapper (e.g. a horizontally-scrolling table) also reports
 * computed `overflowY: 'auto'` but does NOT scroll vertically; those are skipped
 * (they'd wrongly clamp the panel to a short box and clip it) unless overflow-y
 * is explicitly `scroll`.
 */
export function getScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body && node !== document.documentElement) {
    const oy = getComputedStyle(node).overflowY;
    const scrollsVertically = node.scrollHeight > node.clientHeight;
    if (oy === 'scroll' || (/(auto|overlay)/.test(oy) && scrollsVertically)) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Bottom Y (viewport coords) of any `position: sticky`/`fixed` element pinned to
 * the TOP of the viewport that horizontally overlaps `x`. Used to raise a
 * floating panel's top bound so it can't render under/over a sticky app header
 * when the page scrolls at the document level (no bounded scroll container).
 * Returns 0 when there's no such header. Capped at a third of the viewport so a
 * tall pinned element can't swallow the usable area.
 */
export function getTopInsetAt(x: number): number {
  let inset = 0;
  const maxInset = window.innerHeight / 3;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
    const pos = getComputedStyle(el).position;
    if (pos !== 'sticky' && pos !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    // Pinned to the top, with real height, covering this x.
    if (r.top <= 1 && r.bottom > 0 && r.bottom <= maxInset && r.left <= x && r.right >= x) {
      inset = Math.max(inset, r.bottom);
    }
  }
  return inset;
}

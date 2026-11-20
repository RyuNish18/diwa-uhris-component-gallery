/**
 * selectPosition — pure positioning helpers for the Select option panel.
 *
 * Kept in a separate module (not Select.tsx) so the component file only exports
 * components — required by react-refresh/only-export-components (Fast Refresh).
 * Also makes these pure functions trivially unit-testable.
 */

export const PANEL_GAP = 4;
export const PANEL_MARGIN = 8;
export const PANEL_FLIP_THRESHOLD = 160;
export const PANEL_MIN_HEIGHT = 120;
export const PANEL_MAX_HEIGHT = 240;

export interface PanelStyle {
  position: 'fixed';
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

/**
 * Computes the fixed-position style for the option panel so it:
 *  - anchors to the trigger (`triggerRect`),
 *  - stays within its container bounds (`boundTop`/`boundBottom` — the visible
 *    area of a Modal/Dialog, or the viewport when portaled to <body>),
 *  - flips up only when there isn't enough room below,
 *  - and is height-clamped so it never spills past the container on either side.
 *
 * Fixed positioning (viewport coords) avoids the offset-parent/scroll-delta math
 * that made an absolutely-positioned panel detach from its trigger inside a
 * scrolling modal body.
 */
export function computeSelectPanelStyle(
  triggerRect: { top: number; bottom: number; left: number; width: number },
  boundTop: number,
  boundBottom: number,
  measuredHeight?: number,
): PanelStyle {
  const spaceBelow = boundBottom - triggerRect.bottom - PANEL_GAP - PANEL_MARGIN;
  const spaceAbove = triggerRect.top - boundTop - PANEL_GAP - PANEL_MARGIN;
  const dropUp = spaceBelow < PANEL_FLIP_THRESHOLD && spaceAbove > spaceBelow;

  const avail = Math.max(0, dropUp ? spaceAbove : spaceBelow);
  const maxHeight = Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, avail));

  // The panel's rendered height = its content, capped by maxHeight. Anchor a
  // drop-up panel to this ACTUAL height (not maxHeight) so its bottom sits snug
  // above the trigger — otherwise a short list (e.g. 3 options) flipped up leaves
  // a large empty gap between the panel and the trigger. Falls back to maxHeight
  // before the panel has been measured (first paint).
  const panelHeight = Math.min(maxHeight, measuredHeight ?? maxHeight);

  let top = dropUp ? triggerRect.top - PANEL_GAP - panelHeight : triggerRect.bottom + PANEL_GAP;
  // Clamp so the panel (at its rendered height) never crosses a container edge.
  const minTop = boundTop + PANEL_MARGIN;
  const maxTop = boundBottom - PANEL_MARGIN - panelHeight;
  top = Math.min(Math.max(top, minTop), Math.max(minTop, maxTop));

  return { position: 'fixed', top, left: triggerRect.left, width: triggerRect.width, maxHeight };
}

function createsFixedContainingBlock(el: HTMLElement): boolean {
  // Radix Popper positions its wrapper with inline `transform: translate(...)`,
  // which turns it into the containing block for any `position: fixed` child.
  if (el.hasAttribute('data-radix-popper-content-wrapper')) return true;

  const style = getComputedStyle(el);
  if (Boolean(style.transform) && style.transform !== 'none') return true;
  if (Boolean(style.perspective) && style.perspective !== 'none') return true;
  if (Boolean(style.filter) && style.filter !== 'none') return true;
  const { backdropFilter } = style as CSSStyleDeclaration & { backdropFilter?: string };
  if (Boolean(backdropFilter) && backdropFilter !== 'none') return true;
  if (Boolean(style.willChange) && /\b(transform|perspective|filter|backdrop-filter)\b/.test(style.willChange)) return true;
  if (Boolean(style.contain) && /\b(paint|layout|strict|content)\b/.test(style.contain)) return true;

  return false;
}

/**
 * Resolves where Select should portal its `position: fixed` listbox.
 * Portals into an untransformed `[role="dialog"]` (like Modal) so Radix's
 * scroll lock permits wheel/touch scrolling on the list, and falls back to
 * `document.body` when the dialog or any ancestor establishes a containing
 * block for fixed-positioned descendants (e.g. Popover's transformed popper
 * wrapper or a translated Dialog).
 */
export function resolveSelectPortalTarget(triggerWrapper: HTMLElement | null): HTMLElement {
  const dialog = triggerWrapper?.closest<HTMLElement>('[role="dialog"]');
  if (!dialog) return document.body;

  let node: HTMLElement | null = dialog;
  while (node && node !== document.body && node !== document.documentElement) {
    if (createsFixedContainingBlock(node)) return document.body;
    node = node.parentElement;
  }

  return dialog;
}

/**
 * Nearest *vertical* scroll container of `el`, used to bound the option panel.
 * Re-exported from lib/utils so Select and Dropdown share one implementation.
 * (Kept exported here for the existing select-panel-position unit tests.)
 */
export { getScrollableAncestor } from '../../../lib/utils';

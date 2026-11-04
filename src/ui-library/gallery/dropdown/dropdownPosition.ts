/**
 * Pure placement for the Dropdown panel. The panel stays ANCHORED to the trigger
 * (never slides over it): it picks the roomier side, and shrinks (scrolls
 * internally) to the space available on that side, within [boundTop, boundBottom].
 */
export const DROPDOWN_GAP = 4;
export const DROPDOWN_MARGIN = 8;
export const DROPDOWN_MAX_HEIGHT = 280;
const MIN_HEIGHT = 96;

export function computeDropdownPlacement(
  trigger: { top: number; bottom: number },
  boundTop: number,
  boundBottom: number,
  naturalHeight: number,
): { top: number; maxHeight: number; placeBelow: boolean } {
  const desired = Math.min(DROPDOWN_MAX_HEIGHT, naturalHeight);
  const availBelow = boundBottom - trigger.bottom - DROPDOWN_GAP - DROPDOWN_MARGIN;
  const availAbove = trigger.top - boundTop - DROPDOWN_GAP - DROPDOWN_MARGIN;
  const placeBelow = availBelow >= desired || availBelow >= availAbove;
  const avail = placeBelow ? availBelow : availAbove;
  const maxHeight = Math.max(MIN_HEIGHT, Math.min(DROPDOWN_MAX_HEIGHT, avail));
  const height = Math.min(desired, maxHeight);
  const top = placeBelow ? trigger.bottom + DROPDOWN_GAP : trigger.top - DROPDOWN_GAP - height;
  return { top, maxHeight, placeBelow };
}

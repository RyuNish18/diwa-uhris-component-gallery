/**
 * Dropdown — Design System Component
 *
 * A controlled floating panel anchored to a trigger button.
 * The consumer owns the open state, trigger content, and panel content.
 *
 * Responsibilities:
 *   - Trigger button with aria-expanded, aria-haspopup, aria-controls
 *   - Floating panel anchored below the trigger
 *   - Close on outside click (mousedown)
 *   - Close on Escape key
 *   - Stable panel ID per instance
 *
 * This component is intentionally presentation-only. It does not:
 *   - Manage selected options
 *   - Impose role="listbox" or role="option" on children
 *   - Handle async data
 *
 * Consumers are responsible for the trigger layout, option semantics,
 * and any keyboard navigation within the panel.
 *
 * Usage:
 *   <Dropdown
 *     trigger={<><Filter size={16} /><span>Filter</span><ChevronDown size={14} /></>}
 *     isOpen={open}
 *     onToggle={() => setOpen(!open)}
 *     onClose={() => setOpen(false)}
 *   >
 *     <button onClick={() => select('all')}>All</button>
 *     <button onClick={() => select('active')}>Active</button>
 *   </Dropdown>
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../../lib/utils';

export interface DropdownProps {
  /** Complete trigger content — icons, label, chevron — owned by consumer. */
  trigger: ReactNode;
  /** Whether the panel is open. Owned by the consumer. */
  isOpen: boolean;
  /** Called when the trigger button is clicked. Consumer toggles isOpen. */
  onToggle: () => void;
  /** Called on outside click or Escape press. Consumer sets isOpen to false. */
  onClose: () => void;
  /** Panel content — option buttons or any children. */
  children: ReactNode;
  /** Optional className on the trigger button */
  triggerClassName?: string;
  /** Optional className on the floating panel */
  panelClassName?: string;
}

export function Dropdown({
  trigger,
  isOpen,
  onToggle,
  onClose,
  children,
  triggerClassName = '',
  panelClassName = '',
}: DropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const panelId = `${uid.replace(/:/g, '')}-panel`;
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  // The panel must be mounted to be measured (for flip/clamp), but rendering it
  // before it's positioned flashes at the body's top-left. So we mount it hidden
  // and reveal it once the position is computed.
  const [positioned, setPositioned] = useState(false);

  // Compute portal panel position from trigger bounding rect. Because the panel
  // is position:fixed, its coordinates must be recomputed on scroll/resize or it
  // stays locked in the viewport while the trigger scrolls away. Placement is
  // viewport-aware: it flips above the trigger when there isn't room below, and
  // clamps to stay on-screen, so a trigger near the bottom edge still shows a
  // reachable panel.
  useEffect(() => {
    if (!isOpen || !triggerRef.current) {
      setPositioned(false);
      return;
    }
    const GAP = 4;
    const MARGIN = 8;
    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      // If the trigger has scrolled out of the viewport, there's nothing to
      // anchor to — keeping the panel open would strand it mid-screen, detached
      // from its (now off-screen) trigger. Close instead.
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
        onClose();
        return;
      }
      // Measured once the panel has mounted; fall back to its max-height (280)
      // on the very first pass before the ref is populated.
      const panelHeight = panelRef.current?.offsetHeight ?? 280;
      const panelWidth = panelRef.current?.offsetWidth ?? Math.max(rect.width, 180);
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      // Prefer below; flip above only when it doesn't fit below AND there's more room above.
      const placeBelow = spaceBelow >= panelHeight + GAP + MARGIN || spaceBelow >= spaceAbove;
      const top = placeBelow
        ? Math.min(rect.bottom + GAP, window.innerHeight - panelHeight - MARGIN)
        : Math.max(rect.top - panelHeight - GAP, MARGIN);
      const left = Math.max(
        MARGIN,
        Math.min(rect.left, window.innerWidth - panelWidth - MARGIN),
      );
      setPanelStyle({
        position: 'fixed',
        top: Math.max(MARGIN, top),
        left,
        // Below the DatePicker calendar's z-index (1050 in ui.css) so a calendar
        // the panel spawns paints on top, but above normal page content.
        zIndex: 1000,
        minWidth: Math.max(rect.width, 180),
      });
    };
    updatePosition();
    // A second pass next frame uses the now-mounted panel's real measured height,
    // then reveal the panel to avoid a flash at the pre-positioned location.
    const raf = requestAnimationFrame(() => {
      updatePosition();
      setPositioned(true);
    });
    // capture:true catches scrolls on any ancestor, not just the window.
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, onClose]);

  // Close on outside mousedown — return focus to trigger
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // The panel is portaled to document.body, so it is NOT a descendant of
      // `ref`. Treat clicks inside the panel itself — and inside a portaled
      // DatePicker calendar it may spawn (also in document.body) — as "inside",
      // or interacting with panel content would dismiss the dropdown.
      if (panelRef.current?.contains(target)) return;
      if ((target as Element).closest?.('.pis-datepicker-popover')) return;
      if (ref.current && !ref.current.contains(target)) {
        onClose();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen, onClose]);

  // Close on Escape — return focus to trigger
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls={isOpen ? panelId : undefined}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-slate-600 transition-all',
          'hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30',
          triggerClassName,
        )}
      >
        {trigger}
      </button>

      {/* Panel — rendered via portal to escape overflow:hidden parents */}
      {isOpen && createPortal(
        <div
          id={panelId}
          ref={panelRef}
          style={{ ...panelStyle, visibility: positioned ? 'visible' : 'hidden' }}
          className={cn(
            'w-max max-w-[calc(100vw-16px)] max-h-[280px] overflow-y-auto',
            'rounded-xl border border-slate-200 bg-white shadow-lg',
            panelClassName,
          )}
        >
          {children}
        </div>,
        document.body,
      )}
    </div>
  );
}

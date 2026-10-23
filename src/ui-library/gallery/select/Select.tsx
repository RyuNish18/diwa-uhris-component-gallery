/**
 * Select — Design System Component
 *
 * A single-value selection control. Wraps the native <select> element
 * with design-system styling. Accessible by default — keyboard and
 * screen-reader behavior is inherited from the browser.
 *
 * A custom dropdown (non-native) is NOT used here because:
 *   - Native <select> provides full keyboard/AT support at zero cost.
 *   - Custom dropdowns require significant ARIA authoring to match
 *     native behavior, and frequently regress in edge cases.
 *   - For searchable/multi-select use cases, use Combobox (Phase 3).
 *
 * The label is NOT included. The consuming feature pairs a <label>.
 *
 * When renderOption is provided, a custom dropdown is rendered instead
 * of the native <select>. Only use this when native option rendering
 * is insufficient (e.g., icons, avatars, multi-line content).
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import {
  type FieldStatus,
  FIELD_STATUS_RING_DIRECT,
  FIELD_HELPER_COLOR,
} from '../shared/fieldStatus';
import { cn } from '../../../lib/utils';

export type SelectStatus = FieldStatus;

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectGroup {
  group: string;
  options: SelectOption[];
}

export type SelectItem = SelectOption | SelectGroup;

export interface SelectProps extends Omit<React.ComponentProps<'select'>, 'children'> {
  /** Flat options or grouped options */
  items: SelectItem[];
  /** Placeholder option shown when no value is selected */
  placeholder?: string;
  status?: SelectStatus;
  helper?: string;
  /**
   * Custom renderer for each option row. When provided, renders a custom
   * dropdown instead of the native <select>. Only flat SelectOption items
   * are passed — group labels are rendered as non-interactive dividers.
   */
  renderOption?: (item: SelectOption) => React.ReactNode;
  /** Ref forwarded to the native <select> element (ignored when renderOption is provided). */
  ref?: React.Ref<HTMLSelectElement>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isGroup(item: SelectItem): item is SelectGroup {
  return 'group' in item;
}

// ── CustomDropdown ────────────────────────────────────────────────────────────
// Used only when renderOption is provided. Renders a custom accessible listbox.

interface CustomDropdownProps {
  items: SelectItem[];
  value?: string | number | readonly string[];
  placeholder?: string;
  status: SelectStatus;
  disabled?: boolean;
  renderOption: (item: SelectOption) => React.ReactNode;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
}

function CustomDropdown({
  items,
  value,
  placeholder,
  status,
  disabled,
  renderOption,
  onChange,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  className = '',
}: CustomDropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const triggerId = useId();
  const optionId = (index: number) => `${listboxId}-opt-${index}`;
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  // Flatten items into options (preserving group headers)
  const flatItems: Array<{ type: 'group'; label: string } | { type: 'option'; opt: SelectOption }> = [];
  for (const item of items) {
    if (isGroup(item)) {
      flatItems.push({ type: 'group', label: item.group });
      for (const opt of item.options) {
        flatItems.push({ type: 'option', opt });
      }
    } else {
      flatItems.push({ type: 'option', opt: item });
    }
  }

  const flatOptions = flatItems.filter((fi): fi is { type: 'option'; opt: SelectOption } => fi.type === 'option').map((fi) => fi.opt);

  const selectedOption = flatOptions.find((o) => String(o.value) === String(value ?? ''));
  const displayLabel = selectedOption?.label ?? placeholder ?? '';
  const hasValue = Boolean(selectedOption);

  // Reset highlight when dropdown closes
  useEffect(() => {
    if (!open) setHighlightIndex(-1);
  }, [open]);

  // Scroll highlighted option into view
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const el = listRef.current.querySelector<HTMLElement>(`[id="${optionId(highlightIndex)}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  // optionId is stable (derived from listboxId which is stable)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightIndex]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // The option list is portaled to <body>, so it is NOT inside containerRef.
      // Without also allowing listRef, pressing an option fires this mousedown,
      // closes the panel, and unmounts the <li> before its click/onClick runs —
      // making every option appear unclickable.
      if (containerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  // Compute portal panel position
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const MARGIN = 8;
      const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
      const spaceAbove = rect.top - MARGIN;
      const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
      const maxHeight = Math.min(240, Math.max(120, openUp ? spaceAbove : spaceBelow));

      // The panel is portaled into the nearest dialog (so the scroll-lock allows
      // gesture scrolling). Position it ABSOLUTE within that parent using the
      // trigger's offset relative to the parent (handles the parent's own scroll
      // and box). For document.body this is page coordinates.
      const parent = (trigger.closest('[role="dialog"]') as HTMLElement | null) ?? document.body;
      const isBody = parent === document.body;
      const pr = isBody ? null : parent.getBoundingClientRect();
      const left = rect.left - (pr?.left ?? 0) + parent.scrollLeft;
      const topBelow = rect.bottom - (pr?.top ?? 0) + parent.scrollTop + 4;
      const parentH = isBody ? window.innerHeight : parent.clientHeight;
      const bottomAbove = parentH - (rect.top - (pr?.top ?? 0) + parent.scrollTop) + 4;

      // Always provide BOTH top and bottom (one as undefined) so a previous
      // value is cleared when the open direction changes.
      setPanelStyle({
        position: 'absolute',
        top: openUp ? undefined : topBelow,
        bottom: openUp ? bottomAbove : undefined,
        left,
        zIndex: 9999,
        width: rect.width,
        maxHeight,
      });
    };
    // rAF so the rect is read after the panel mounts/layout settles.
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const handleSelect = useCallback((opt: SelectOption) => {
    if (opt.disabled) return;
    // Synthesize a change event so callers can use standard onChange
    const syntheticEvent = {
      target: { value: opt.value },
      currentTarget: { value: opt.value },
    } as unknown as React.ChangeEvent<HTMLSelectElement>;
    onChange?.(syntheticEvent);
    setOpen(false);
    triggerRef.current?.focus();
  }, [onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    // Helper: find next enabled option index starting from `from`, direction +1 or -1
    const nextEnabled = (from: number, dir: 1 | -1): number => {
      let idx = from;
      while (idx >= 0 && idx < flatOptions.length) {
        if (!flatOptions[idx]?.disabled) return idx;
        idx += dir;
      }
      return -1;
    };

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          // Highlight first enabled option on open
          const first = nextEnabled(0, 1);
          setHighlightIndex(first);
        } else {
          setHighlightIndex((prev) => {
            const next = nextEnabled(prev + 1, 1);
            return next === -1 ? prev : next;
          });
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (open) {
          setHighlightIndex((prev) => {
            const next = nextEnabled(prev - 1, -1);
            return next === -1 ? prev : next;
          });
        }
        break;
      }
      case 'Home': {
        e.preventDefault();
        if (open) {
          const first = nextEnabled(0, 1);
          setHighlightIndex(first);
        }
        break;
      }
      case 'End': {
        e.preventDefault();
        if (open) {
          const last = nextEnabled(flatOptions.length - 1, -1);
          setHighlightIndex(last);
        }
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (!open) {
          setOpen(true);
        } else if (highlightIndex >= 0 && flatOptions[highlightIndex] && !flatOptions[highlightIndex].disabled) {
          handleSelect(flatOptions[highlightIndex]);
        } else {
          setOpen(false);
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        setOpen(false);
        break;
      }
      default:
        break;
    }
  };

  // The trigger id for aria-labelledby on the listbox
  const effectiveTriggerId = id ?? triggerId;

  // Portal target resolved synchronously at render: the nearest open dialog
  // content when inside a Modal/Dialog, else <body>. Computing it here (not via
  // state) avoids a null→target re-parent of the panel on open, which could
  // detach an option mid-click and drop the click in real browsers. Portaling
  // into the dialog also keeps the panel inside react-remove-scroll's allowed
  // subtree so wheel/touch gestures scroll the list.
  const portalTarget: HTMLElement =
    (triggerRef.current?.closest('[role="dialog"]') as HTMLElement | null) ??
    (typeof document !== 'undefined' ? document.body : (null as unknown as HTMLElement));

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        id={effectiveTriggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && highlightIndex >= 0 ? optionId(highlightIndex) : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full appearance-none rounded-md border bg-white py-2.5 pl-4 pr-10 text-left text-sm font-medium outline-none transition',
          FIELD_STATUS_RING_DIRECT[status],
          hasValue ? 'text-slate-900' : 'text-slate-400',
          disabled ? 'cursor-not-allowed bg-slate-50 opacity-60' : 'cursor-pointer',
          className,
        )}
      >
        {displayLabel}
      </button>

      {/* Custom caret */}
      <span
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      >
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </span>

      {open && !disabled && createPortal(
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={effectiveTriggerId}
          /* Marks this portaled panel as a floating layer so the design-system
             Modal/Dialog (Radix) treats option clicks as "inside" and does not
             swallow them as outside-interactions. Without this, options are
             unclickable when the Select is rendered inside a Modal. */
          data-pis-floating=""
          style={{ ...panelStyle, pointerEvents: 'auto' }}
          className="overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
        >
          {flatItems.map((fi, i) => {
            if (fi.type === 'group') {
              return (
                <li key={`group-${fi.label}-${i}`} role="presentation" className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {fi.label}
                </li>
              );
            }
            const opt = fi.opt;
            // Index into flatOptions for highlight tracking
            const optIndex = flatOptions.indexOf(opt);
            const isSelected = String(opt.value) === String(value ?? '');
            const isHighlighted = optIndex === highlightIndex;
            return (
              <li
                key={opt.value}
                id={optionId(optIndex)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled}
                onClick={() => handleSelect(opt)}
                className={[
                  'cursor-pointer px-3 py-2 text-sm transition-colors',
                  opt.disabled ? 'cursor-not-allowed opacity-50' : '',
                  isHighlighted && !opt.disabled ? 'bg-blue-50 font-semibold text-brand-blue' : '',
                  isSelected && !isHighlighted ? 'bg-blue-50 font-semibold text-brand-blue' : '',
                  !isHighlighted && !isSelected && !opt.disabled ? 'hover:bg-slate-50 text-slate-700' : '',
                  opt.disabled ? 'text-slate-400' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {renderOption(opt)}
              </li>
            );
          })}
        </ul>,
        portalTarget,
      )}
    </div>
  );
}

// ── Style maps ────────────────────────────────────────────────────────────────
// STATUS_CLASS and HELPER_CLASS use FIELD_STATUS_RING_DIRECT / FIELD_HELPER_COLOR
// from shared/fieldStatus — same semantic mapping as Input and Textarea.

// ── Component ─────────────────────────────────────────────────────────────────

export function Select({
  items,
  placeholder,
  status = 'default',
  helper,
  disabled,
  className = '',
  renderOption,
  ref,
  ...props
}: SelectProps) {
  if (renderOption) {
    return (
      <div className="w-full">
        <CustomDropdown
          items={items}
          value={props.value}
          placeholder={placeholder}
          status={status}
          disabled={disabled}
          renderOption={renderOption}
          onChange={props.onChange as React.ChangeEventHandler<HTMLSelectElement> | undefined}
          id={props.id}
          aria-label={props['aria-label']}
          aria-labelledby={props['aria-labelledby']}
          className={className}
        />
        {helper && (
          <p className={`mt-1.5 text-xs font-medium ${FIELD_HELPER_COLOR[status]}`}>{helper}</p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="relative">
        <select
          ref={ref}
          disabled={disabled}
          className={cn(
            'w-full appearance-none rounded-md border bg-white py-2.5 pl-4 pr-10 text-sm font-medium text-slate-900 outline-none transition',
            FIELD_STATUS_RING_DIRECT[status],
            disabled ? 'cursor-not-allowed bg-slate-50 opacity-60' : 'cursor-pointer',
            className,
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}

          {items.map((item) =>
            isGroup(item) ? (
              <optgroup key={item.group} label={item.group}>
                {item.options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option key={item.value} value={item.value} disabled={item.disabled}>
                {item.label}
              </option>
            ),
          )}
        </select>

        {/* Custom caret — purely decorative */}
        <span
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        >
          <ChevronDown size={14} />
        </span>
      </div>

      {helper && (
        <p className={`mt-1.5 text-xs font-medium ${FIELD_HELPER_COLOR[status]}`}>{helper}</p>
      )}
    </div>
  );
}

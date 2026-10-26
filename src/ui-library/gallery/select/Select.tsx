/**
 * Select — Design System Component
 *
 * A single-value selection control. Renders a branded listbox (same look as
 * Combobox) instead of the browser's native popup, whose OS-blue highlight
 * cannot be styled and does not follow the DIWA palette.
 *
 * A visually hidden native <select> is kept in sync so `name`, `required`,
 * `form`, refs and `event.target.value` behave exactly as before.
 *
 * Keyboard support follows the native control: Enter/Space/Arrow keys open,
 * Arrow/Home/End navigate, Enter/Space select, Escape closes, and typing
 * jumps to the first matching option. For searchable lists, use Combobox.
 *
 * The label is NOT included. The consuming feature pairs a <label>.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import {
  type FieldStatus,
  FIELD_STATUS_RING_DIRECT,
  FIELD_HELPER_COLOR,
} from '../shared/fieldStatus';
import { cn, FLOATING_LAYER_ATTR } from '../../../lib/utils';

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
  /** Text shown in the trigger when no value is selected */
  placeholder?: string;
  status?: SelectStatus;
  helper?: string;
  /** Custom renderer for each option row (icons, avatars, multi-line content). */
  renderOption?: (item: SelectOption) => React.ReactNode;
  /** Ref forwarded to the hidden native <select> (focusing it focuses the trigger). */
  ref?: React.Ref<HTMLSelectElement>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isGroup(item: SelectItem): item is SelectGroup {
  return 'group' in item;
}

const TYPEAHEAD_RESET_MS = 500;
const PANEL_GAP = 4;
const PANEL_MARGIN = 8;
const PANEL_FLIP_THRESHOLD = 160;
const PANEL_MIN_HEIGHT = 120;
const PANEL_MAX_HEIGHT = 240;

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
  value: valueProp,
  defaultValue,
  onChange,
  name,
  required,
  form,
  autoComplete,
  onBlur,
  onKeyDown,
  ...rest
}: SelectProps) {
  const isControlled = valueProp !== undefined;
  const [internalValue, setInternalValue] = useState(String(defaultValue ?? ''));
  const value = isControlled ? String(valueProp ?? '') : internalValue;

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const nativeRef = useRef<HTMLSelectElement | null>(null);
  const typeahead = useRef({ buffer: '', timer: 0 });

  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const helperId = `${uid}-helper`;
  const optionId = (index: number) => `${uid}-option-${index}`;

  const options: SelectOption[] = items.flatMap((item) => (isGroup(item) ? item.options : [item]));
  const indexOf = new Map(options.map((opt, i) => [opt, i]));
  const selectedIndex = options.findIndex((opt) => opt.value === value);
  const selected = options[selectedIndex];
  const hasValue = Boolean(selected) && selected.value !== '';
  const displayLabel = selected?.label ?? placeholder ?? '';
  const hasEmptyOption = options.some((opt) => opt.value === '');

  const nextEnabled = (from: number, dir: 1 | -1) => {
    for (let i = from; i >= 0 && i < options.length; i += dir) {
      if (!options[i].disabled) return i;
    }
    return -1;
  };

  const setNativeRef = (node: HTMLSelectElement | null) => {
    nativeRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.RefObject<HTMLSelectElement | null>).current = node;
  };

  // ── Open / close / commit ──────────────────────────────────────────────────

  const openList = (at: 'selected' | 'last' = 'selected') => {
    if (disabled) return;
    const fallback = at === 'last' ? nextEnabled(options.length - 1, -1) : nextEnabled(0, 1);
    setHighlight(at === 'selected' && selected && !selected.disabled ? selectedIndex : fallback);
    setPortalTarget(wrapperRef.current?.closest<HTMLElement>('[role="dialog"]') ?? document.body);
    setOpen(true);
  };

  const commit = (opt: SelectOption) => {
    if (opt.disabled) return;
    if (!isControlled) setInternalValue(opt.value);
    const native = nativeRef.current;
    if (native) native.value = opt.value;
    const target = native ?? { value: opt.value, name };
    onChange?.({ target, currentTarget: target, type: 'change' } as unknown as React.ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    triggerRef.current?.focus();
  };

  // ── Panel positioning: anchored to the trigger while any ancestor scrolls ──
  // Inside a Modal/Dialog the panel is portaled into the dialog so its scroll
  // lock lets wheel/touch gestures scroll the list. There it is positioned
  // absolute against its offset parent, which also survives transformed
  // dialogs (a transform would break position: fixed).

  useLayoutEffect(() => {
    if (!open) return;
    let raf = 0;
    let prev = '';
    const place = () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const list = listRef.current;
      if (rect && list) {
        const spaceBelow = window.innerHeight - rect.bottom - PANEL_MARGIN;
        const spaceAbove = rect.top - PANEL_MARGIN;
        const dropUp = spaceBelow < PANEL_FLIP_THRESHOLD && spaceAbove > spaceBelow;
        const maxHeight = Math.min(PANEL_MAX_HEIGHT, Math.max(PANEL_MIN_HEIGHT, dropUp ? spaceAbove : spaceBelow));

        const inBody = list.parentElement === document.body;
        const parent = inBody ? null : (list.offsetParent as HTMLElement | null) ?? list.parentElement;
        const pr = parent?.getBoundingClientRect();
        const dx = parent && pr ? pr.left + parent.clientLeft - parent.scrollLeft : 0;
        const dy = parent && pr ? pr.top + parent.clientTop - parent.scrollTop : 0;

        const next = {
          position: inBody ? 'fixed' : 'absolute',
          top: (dropUp ? rect.top - PANEL_GAP : rect.bottom + PANEL_GAP) - dy,
          left: rect.left - dx,
          width: rect.width,
          maxHeight,
          transform: dropUp ? 'translateY(-100%)' : undefined,
        } as const;
        const key = JSON.stringify(next);
        if (key !== prev) {
          prev = key;
          setPanelStyle({ zIndex: 9999, ...next });
        }
      }
      raf = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // ── Dismissal: outside press, and Escape before a parent Modal sees it ─────

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!wrapperRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    // Window capture runs before Radix's document-level Escape listener, so
    // Escape closes only this listbox, not the surrounding Modal/Dialog.
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [open]);

  // Scroll only the list (never the page) to keep the highlighted option visible.
  useEffect(() => {
    const list = listRef.current;
    const el = open && highlight >= 0 ? document.getElementById(optionId(highlight)) : null;
    if (!list || !el) return;
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
    }
    // optionId is derived from a stable useId value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, highlight]);

  useEffect(() => () => window.clearTimeout(typeahead.current.timer), []);

  // ── Keyboard ───────────────────────────────────────────────────────────────

  const handleTypeahead = (char: string) => {
    const state = typeahead.current;
    window.clearTimeout(state.timer);
    state.buffer += char.toLowerCase();
    state.timer = window.setTimeout(() => { state.buffer = ''; }, TYPEAHEAD_RESET_MS);

    // Repeating one letter cycles through options starting with it.
    const query = [...state.buffer].every((c) => c === state.buffer[0]) ? state.buffer[0] : state.buffer;
    const current = open ? highlight : selectedIndex;
    const start = query.length > 1 ? Math.max(current, 0) : current + 1;
    const ordered = [...options.slice(start), ...options.slice(0, start)];
    const match = ordered.find((opt) => !opt.disabled && opt.label.toLowerCase().startsWith(query));
    if (!match) return;
    if (open) setHighlight(indexOf.get(match)!);
    else commit(match);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    (onKeyDown as React.KeyboardEventHandler<HTMLButtonElement> | undefined)?.(e);
    if (e.defaultPrevented) return;

    const move = (from: number, dir: 1 | -1) =>
      setHighlight((prev) => {
        const next = nextEnabled(from === -1 ? prev + dir : from, dir);
        return next === -1 ? prev : next;
      });

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openList();
        else move(-1, e.key === 'ArrowDown' ? 1 : -1);
        break;
      case 'Home':
      case 'End':
        if (!open) break;
        e.preventDefault();
        move(e.key === 'Home' ? 0 : options.length - 1, e.key === 'Home' ? 1 : -1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) openList();
        else if (options[highlight] && !options[highlight].disabled) commit(options[highlight]);
        else setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          handleTypeahead(e.key);
        }
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderItem = (opt: SelectOption) => {
    const index = indexOf.get(opt)!;
    const isSelected = opt.value === value;
    return (
      <li
        key={`${opt.value}-${index}`}
        id={optionId(index)}
        role="option"
        aria-selected={isSelected}
        aria-disabled={opt.disabled || undefined}
        onMouseEnter={() => { if (!opt.disabled) setHighlight(index); }}
        onClick={() => commit(opt)}
        className={cn(
          'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-slate-700 transition-colors',
          index === highlight && !opt.disabled && 'bg-blue-50 text-brand-blue',
          isSelected && 'font-semibold text-brand-blue',
          opt.disabled && 'cursor-not-allowed text-slate-400 opacity-50',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{renderOption ? renderOption(opt) : opt.label}</span>
        {isSelected && <Check size={14} aria-hidden="true" className="shrink-0" />}
      </li>
    );
  };

  const describedBy = [rest['aria-describedby'], helper && helperId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="w-full">
      <div ref={wrapperRef} className="relative">
        <select
          ref={setNativeRef}
          name={name}
          required={required}
          form={form}
          autoComplete={autoComplete}
          disabled={disabled}
          value={value}
          onChange={() => {}}
          onFocus={() => triggerRef.current?.focus()}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        >
          {!hasEmptyOption && <option value="" />}
          {options.map((opt, i) => (
            <option key={`${opt.value}-${i}`} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>

        <button
          {...(rest as unknown as React.ButtonHTMLAttributes<HTMLButtonElement>)}
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={open && highlight >= 0 ? optionId(highlight) : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            setOpen(false);
            (onBlur as React.FocusEventHandler<HTMLButtonElement> | undefined)?.(e);
          }}
          className={cn(
            'w-full rounded-xl border bg-slate-50 py-2.5 pl-4 pr-10 text-left text-sm font-medium outline-none transition',
            FIELD_STATUS_RING_DIRECT[status],
            hasValue ? 'text-slate-900' : 'text-slate-400',
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            className,
          )}
        >
          <span className="block truncate">{displayLabel || '\u00A0'}</span>
        </button>

        <ChevronDown
          size={16}
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-transform',
            open && 'rotate-180',
          )}
        />
      </div>

      {open && !disabled && portalTarget && createPortal(
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={rest['aria-label']}
          aria-labelledby={rest['aria-labelledby']}
          // Stay clickable (and not count as "outside") inside an open
          // Modal/Dialog, which sets pointer-events: none on <body>.
          {...{ [FLOATING_LAYER_ATTR]: '' }}
          style={{ position: 'fixed', ...panelStyle, pointerEvents: 'auto' }}
          // Keep focus on the trigger so aria-activedescendant stays valid.
          onMouseDown={(e) => e.preventDefault()}
          className="max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white py-1 shadow-lg [scrollbar-color:theme(colors.slate.300)_transparent] [scrollbar-width:thin]"
        >
          {options.length === 0 && (
            <li role="presentation" className="px-3 py-2 text-sm font-semibold text-slate-400">No options</li>
          )}
          {items.map((item, gi) =>
            isGroup(item) ? (
              <li key={`group-${item.group}-${gi}`} role="presentation">
                <div
                  id={`${uid}-group-${gi}`}
                  className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400"
                >
                  {item.group}
                </div>
                <ul role="group" aria-labelledby={`${uid}-group-${gi}`}>
                  {item.options.map(renderItem)}
                </ul>
              </li>
            ) : (
              renderItem(item)
            ),
          )}
        </ul>,
        portalTarget,
      )}

      {helper && (
        <p id={helperId} className={`mt-1.5 text-xs font-medium ${FIELD_HELPER_COLOR[status]}`}>{helper}</p>
      )}
    </div>
  );
}

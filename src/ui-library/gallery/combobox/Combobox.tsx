/**
 * Combobox — Gallery-native searchable dropdown.
 * Copied from shared/components/PisCombobox.tsx and isolated.
 * No production imports.
 */
import { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { composeRefs } from '../../../lib/composeRefs';

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  /** Controlled value. When provided, pair with onChange. */
  value?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  'aria-label'?: string;
  onBlur?: () => void;
  ref?: React.Ref<HTMLInputElement>;
}

const fieldInputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-blue/40 focus:ring-2 focus:ring-brand-blue/15 disabled:cursor-not-allowed disabled:opacity-60';
const fieldInputErrorClass = 'border-rose-300 focus:border-rose-400 focus:ring-rose-100';

export function Combobox({ value: controlledValue, defaultValue = '', onChange, options, placeholder, className, disabled, loading, error, 'aria-label': ariaLabel, onBlur, ref }: ComboboxProps) {
  // Controlled/uncontrolled split
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = isControlled ? controlledValue : internalValue;

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const optionId = (index: number) => `${uid}-option-${index}`;

  const q = search.toLowerCase().trim();
  const DISPLAY_LIMIT = 100;
  const filtered = q.length === 0
    ? options
    : options.filter(opt =>
        opt.label.toLowerCase().includes(q)
      ).sort((a, b) => {
        const al = a.label.toLowerCase();
        const bl = b.label.toLowerCase();
        const aScore = al === q ? 0 : al.startsWith(q) ? 1 : al.indexOf(q) + 2;
        const bScore = bl === q ? 0 : bl.startsWith(q) ? 1 : bl.indexOf(q) + 2;
        return aScore - bScore;
      });
  const displayed = filtered.length > DISPLAY_LIMIT ? filtered.slice(0, DISPLAY_LIMIT) : filtered;

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSearch(value); }, [value]);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        wrapperRef.current && !wrapperRef.current.contains(target) &&
        !(listRef.current && listRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute and track portal panel position.
  // Uses a requestAnimationFrame loop that runs while the dropdown is open so the panel
  // stays anchored to the input regardless of which container is scrolled, avoiding
  // React 19 concurrent-mode effect-scheduling issues with [isOpen]-gated listeners.

  const isOpenRef = useRef(isOpen);
  useEffect(() => { isOpenRef.current = isOpen; });

  // Nearest scrollable ancestor — used to clip/hide the portaled panel so it
  // stays within a scroll container (e.g. a Modal body) and disappears when the
  // input scrolls out of that container instead of floating over its header.
  const scrollParentOf = (el: HTMLElement | null): HTMLElement | null => {
    let node = el?.parentElement ?? null;
    while (node) {
      const s = getComputedStyle(node);
      if (/(auto|scroll|overlay)/.test(s.overflowY) || /(auto|scroll|overlay)/.test(s.overflowX)) return node;
      node = node.parentElement;
    }
    return null;
  };

  useEffect(() => {
    // Track previous style to skip setState when nothing moved
    let prevKey = '';
    let rafId: number;

    const loop = () => {
      if (isOpenRef.current && wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect();
        const GAP = 4;
        const MARGIN = 8; // keep the panel clear of the edge
        const PANEL_MAX = 240; // design cap (matches max-h-60)

        // Clip bounds = intersection of the viewport and the nearest scroll
        // ancestor's box. The panel must never extend past these, and the input
        // must be within them to keep the panel visible.
        const scrollParent = scrollParentOf(wrapperRef.current);
        const spRect = scrollParent?.getBoundingClientRect();
        const clipTop = Math.max(0, spRect ? spRect.top : 0);
        const clipBottom = Math.min(window.innerHeight, spRect ? spRect.bottom : window.innerHeight);

        // Hide the panel when the input has scrolled out of the clip region —
        // otherwise a body-portaled fixed panel keeps floating over the header.
        const inputVisible = rect.bottom > clipTop + 2 && rect.top < clipBottom - 2;

        const spaceBelow = clipBottom - rect.bottom - GAP - MARGIN;
        const spaceAbove = rect.top - clipTop - GAP - MARGIN;
        // Prefer dropping DOWN; only flip up when below can't fit a reasonable
        // panel and there's more room above.
        const dropUp = spaceBelow < 160 && spaceAbove > spaceBelow;
        // Clamp height to the available space on the chosen side (bounded by the
        // scroll container), so the panel can't spill past the modal edges.
        const avail = Math.max(0, dropUp ? spaceAbove : spaceBelow);
        const nextMaxHeight = Math.max(80, Math.min(PANEL_MAX, avail));
        const nextTop = dropUp ? undefined : rect.bottom + GAP;
        const nextBottom = dropUp ? (window.innerHeight - rect.top + GAP) : undefined;

        const key = `${inputVisible}|${nextTop}|${nextBottom}|${rect.left}|${rect.width}|${nextMaxHeight}`;
        if (key !== prevKey) {
          prevKey = key;
          setPanelStyle({
            position: 'fixed',
            top: nextTop,
            bottom: nextBottom,
            left: rect.left,
            zIndex: 9999,
            width: rect.width,
            maxHeight: nextMaxHeight,
            // Hide (without unmounting) when the input is scrolled out of view.
            visibility: inputVisible ? 'visible' : 'hidden',
            pointerEvents: inputVisible ? 'auto' : 'none',
            overscrollBehavior: 'contain',
          });
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []); // mount-once — loop checks isOpenRef each frame

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!isOpen) setHighlightIndex(-1); }, [isOpen]);

  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  const selectOption = (opt: ComboboxOption) => {
    if (opt.disabled) return;
    if (!isControlled) setInternalValue(opt.value);
    onChange?.(opt.value);
    setSearch(opt.label);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    if (!isControlled) setInternalValue(val);
    setIsOpen(true);
    setHighlightIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Helper: find next enabled index from `from` in direction +1/-1
    const nextEnabled = (from: number, dir: 1 | -1): number => {
      let idx = from;
      while (idx >= 0 && idx < displayed.length) {
        if (!displayed[idx]?.disabled) return idx;
        idx += dir;
      }
      return -1;
    };

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) { setIsOpen(true); return; }
      setHighlightIndex(prev => {
        const next = nextEnabled(prev + 1, 1);
        return next === -1 ? prev : next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => {
        const next = nextEnabled(prev - 1, -1);
        return next === -1 ? prev : next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && displayed[highlightIndex] && !displayed[highlightIndex].disabled) selectOption(displayed[highlightIndex]);
      else if (isOpen) setIsOpen(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const handleBlur = () => {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (
        !wrapperRef.current?.contains(active) &&
        !listRef.current?.contains(active)
      ) {
        setIsOpen(false);
        onBlur?.();
      }
    });
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          ref={composeRefs(inputRef, ref)}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={highlightIndex >= 0 ? optionId(highlightIndex) : undefined}
          aria-autocomplete="list"
          aria-invalid={error ? 'true' : undefined}
          aria-label={ariaLabel}
          value={search}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(fieldInputClass, 'pr-8', error && fieldInputErrorClass, className)}
        />
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {isOpen && !disabled && createPortal(
        <div ref={listRef} id={listboxId} role="listbox"
          style={panelStyle}
          className="bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto"
          onWheel={(e) => {
            // Explicitly scroll the list on wheel — needed when Radix Dialog has
            // pointer-events:none on body, which can prevent wheel event delivery.
            if (listRef.current) {
              listRef.current.scrollTop += e.deltaY;
              e.stopPropagation();
            }
          }}
        >
          {error ? (
            <div className="px-3 py-2 text-sm text-rose-500 font-semibold">{error}</div>
          ) : loading ? (
            <div className="px-3 py-2 text-sm text-slate-400 font-semibold">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400 font-semibold">
              No matches — press Enter to use this value
            </div>
          ) : (
            <>
              {displayed.map((opt, i) => (
                <div key={opt.value} id={optionId(i)} role="option" aria-selected={opt.value === value}
                  aria-disabled={opt.disabled}
                  onMouseDown={(e) => { e.preventDefault(); if (!opt.disabled) selectOption(opt); }}
                  className={`px-3 py-2 text-sm transition-colors ${opt.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${i === highlightIndex && !opt.disabled ? 'bg-blue-50 text-brand-blue font-semibold' : opt.disabled ? 'text-slate-400' : 'text-slate-700 hover:bg-slate-50'} ${opt.value === value ? 'font-medium' : ''}`}
                >
                  {opt.label}
                </div>
              ))}
              {filtered.length > DISPLAY_LIMIT && (
                <div className="px-3 py-2 text-xs text-slate-400 font-semibold text-center border-t border-slate-100">
                  +{filtered.length - DISPLAY_LIMIT} more results — refine your search
                </div>
              )}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

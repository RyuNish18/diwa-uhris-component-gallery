# Changelog

All notable changes to `@diwauhris/ui` are documented here.

Format: [Semantic Versioning](https://semver.org). Entries are consumer-facing — internal refactors and gallery infrastructure changes are omitted unless they affect component behavior.

---

## [1.7.46] — 2026-10-26

### Bug Fixes

- **`Select`** — The open dropdown now follows the DIWA palette instead of the browser's native popup, whose bright OS-blue (`#007BFF`) highlight could not be styled. Every `Select` renders a branded listbox that matches `Combobox`: a pale-blue highlight with brand-blue text, and the selected option in bold with a check mark. The closed field also matches `Combobox` (rounded, `bg-slate-50`). Options with an empty value (e.g. "Choose rank") show in placeholder grey in the closed field.
- **`Select`** inside a `Modal`/`Dialog` — Options are clickable, the list scrolls with the wheel or touch, and Escape closes only the list, not the dialog.

### Component Improvements (all backward-compatible)

- **`Select`**
  - A hidden native `<select>` stays in sync, so `name`, `required`, `form`, `ref` and form submission work unchanged, and `onChange` still receives `event.target.value`.
  - Keyboard parity with the native control: Enter / Space / Arrow keys open on the current value, Arrow / Home / End navigate (disabled options are skipped), and typing jumps to the first matching option.
  - The list opens upward when there is no room below, and its height fits the available space.
  - `helper` text is linked to the trigger via `aria-describedby`.

---

## [1.7.43] — 2026-10-16

### Bug Fixes

- **`OrgChart`** — The chart no longer snaps back to the default zoom while the user is reading it. Before, it redrew and re-fitted on every `onSelect` identity change, on every `selectedId` change, and on any resize. Opening a modal counted as a resize because it hides the page scrollbar. The chart now stays fitted only until the user zooms or pans. After that their view is kept through selection, re-renders and data refreshes, and resizes keep the view's centre. Pressing **Fit to screen** returns the chart to auto-fit. Data updates are applied in place instead of redrawing the whole chart.

### Component Improvements (all backward-compatible)

- **`OrgChart`**
  - `fitKey?: string | number`: when this value changes, the chart re-fits (for example after switching company scope).
  - `OrgChartNode.tone?: 'default' | 'muted'`: draws a dashed, greyed-out card for inactive or archived units.
  - Controls: zoom in, a live zoom %, zoom out, and **Fit to screen** (renamed from "Reset zoom"). The zoom buttons are disabled at the zoom limits. Button zoom skips its animation under `prefers-reduced-motion`.
  - Keyboard: `+` / `=` zooms in, `-` zooms out, `0` fits. When `onSelect` is set, nodes are focusable buttons (Enter / Space select) with a focus ring, and a node off screen is brought into view when it receives focus.
  - Nodes get a hover border. Long names and descriptions are cut short with an ellipsis, and the full text shows in a tooltip.
  - Panning no longer counts as a node click (5px click tolerance). Double-click no longer zooms.
  - An empty `nodes` array shows "No units to display" instead of a blank canvas.

---

## [1.7.4] — 2026-09-06

### New Components

- **`Search`** — A search input with a built-in prefix icon and optional × clear button. Controlled (`value`/`onChange`), ref-forwarded, all native input attributes spread through. Pass `onClear` to show the clear button when the field has a value. Native browser clear button suppressed on Chromium via `[&::-webkit-search-cancel-button]:hidden`.

### Breaking Changes

None. All changes are additive.

### Component Improvements

**Production-grade API additions (all backward-compatible):**

- **Button / IconButton** — `asChild?: boolean` prop added. When `true`, renders as the child element via Radix Slot (`@radix-ui/react-slot`). Enables `<Button asChild><Link to="/path">` without duplicating styles.
- **Combobox** — `defaultValue?: string` for uncontrolled usage; `onBlur?: () => void`; `onChange` is now optional (required in controlled mode only). Ref forwarded to the text `<input>`.
- **DatePicker** — `maxDate?: Date` prop added. Previously the calendar was hard-capped at December 31, 2026 — that cap is now removed by default.
- **Dialog / Modal** — `onOpenAutoFocus`, `onCloseAutoFocus`, `onEscapeKeyDown`, `onInteractOutside` props forwarded to `DialogPrimitive.Content`. **Modal** also gains `preventClose?: boolean` — when `true`, disables Escape, backdrop click, and hides the close button.
- **FileUpload** — `value?: File[]` and `onChange?: (files: File[]) => void` for controlled usage. Previous `onFiles` callback retained for uncontrolled usage.
- **Menu** — `open?: boolean` and `onOpenChange?: (open: boolean) => void` for controlled open state.
- **Popover** — `left`, `left-start`, `left-end`, `right`, `right-start`, `right-end` placements added to `PopoverPlacement`.
- **Select** — `renderOption?: (item: SelectOption) => ReactNode` prop added. When provided, a custom accessible dropdown renders instead of the native `<select>`, enabling icons, avatars, and multi-line option content.
- **Switch** — `defaultChecked?: boolean` for uncontrolled usage; `checked` is now optional.
- **Tooltip** — `content` prop widened from `string` to `ReactNode`.

**Ref forwarding (React 19 plain prop pattern):**

All form inputs now forward `ref` to their underlying DOM element, enabling `react-hook-form register()`, `form.setFocus()`, and animation library measurement:
`Input`, `Textarea`, `FieldInput`, `Checkbox` (via `composeRefs`), `Switch`, `RadioItem`, `FileUpload`, `Select` (native path), `Combobox`.

**Portal rendering:**

`Menu`, `Dropdown`, `Select` (custom path), and `Combobox` listboxes now render via `createPortal` into `document.body`. Floating panels no longer clip inside `overflow:hidden` ancestors (table cells, card containers).

**Animations:**

- `tailwindcss-animate` added as devDependency. Entry/exit animations on `Dialog` (fade + zoom-95, 200ms), `Modal` (same), `Tooltip` (fade-in 150ms), `Popover` (fade + zoom-95, 200ms). Respects `prefers-reduced-motion`.
- `Accordion` — `AccordionContent` now animates height via CSS `grid-rows` transition instead of returning `null`. `aria-hidden={!isOpen}` added to preserve AT accessibility with content in DOM.
- `CommandPalette` — Tab/Shift+Tab focus trap added.

**Skeleton shimmer:**

All 5 Skeleton components (`Skeleton`, `SkeletonText`, `SkeletonAvatar`, `SkeletonCard`, `SkeletonTableRow`) accept `variant?: 'pulse' | 'shimmer'`. Default is `'pulse'` (unchanged). `'shimmer'` renders a horizontal gradient sweep. `SkeletonVariant` type exported.

**`className` reliability:**

All 57 gallery components now use `cn()` (clsx + twMerge) for className assembly. Consumer `className` overrides reliably win over component defaults via Tailwind Merge conflict resolution.

### Bug Fixes

- **Button `asChild` + icon slots** — `leftIcon`/`rightIcon` are suppressed when `asChild=true` to prevent Radix Slot multiple-children throw.
- **Combobox portal click-outside** — outside-click handler now includes the portal panel in its check, preventing premature close on non-option panel clicks.
- **Menu portal click-outside** — `panelRef` added to the outside-click check, enabling mouse clicks on menu items in the portal panel.
- **Modal `preventClose` close button** — close button is now hidden (`{!preventClose && ...}`) when `preventClose=true`, preventing visual close via Radix `DialogPrimitive.Close`.

---

## [1.7.2] — 2026-08-23

### Documentation / Examples

This release contains only gallery documentation and example fixes. No component APIs, exported types, or runtime behavior changed.

#### Pagination demo consistency — 2 pages

Gallery examples that demonstrate the `Pagination` component now consistently use `pageSize = 10` as the standard, with dataset sizes large enough to produce multiple real pages.

- **PaginationPage — `patternTable` snippet** — `PAGE_SIZE` was `20`. Corrected to `10`. This snippet is the primary reference example developers copy when wiring up table pagination; it should demonstrate the convention, not an arbitrary value.
- **PaginationPage — `withCount` demo (live + snippet)** — `pageSize` was `25`, `totalItems` was `428`, `totalPages` was `18`. Corrected to `pageSize={10}` / `totalItems={103}` / `totalPages={11}` (`Math.ceil(103 / 10)`). The live demo and its paired code snippet are now in sync. The rendered footer now reads "Showing 1–10 of 103 employees".
- **PageSamplePage — employee table** — The `EMPLOYEES` sample array had 6 rows while the pagination footer showed three page buttons, implying 20–30 total records that didn't exist. Expanded to 10 rows (adding Rosa Aquino, Ben Torres, Clara Navarro, Dan Espiritu — all matching the existing shape). The footer now reads "Showing 1–10 of 28 employees", which is internally consistent: 10 rows shown on page 1 of a simulated 28-record dataset across 3 pages.

---

## [1.7.1] — 2026-08-23

### Documentation / Examples

This release contains only gallery documentation and code example fixes. No component APIs, exported types, or runtime behavior changed.

#### Code example runnability — 17 gallery pages

Code snippets across the following pages had undefined variables or handlers that would cause a copy-pasted example to fail immediately. All have been resolved — either by adding the missing `const`/`useState` declaration inline, adding a stub handler, or marking the snippet as a fragment with a clear comment telling you exactly what state to add:

- **StatusPage** — all three preset snippets (`notFound`, `forbidden`, `serverError`) now include `import { useNavigate } from 'react-router-dom'` and a note that `react-router-dom` is a peer dependency the consumer must have installed.
- **Charts** — `LineChart` and `AreaChart` snippets now include the sample data arrays inline (`MONTHLY`, `TREND_12`, `RATE_6`, `DUAL_24`). Previously the snippets referenced variables that only existed at the page level.
- **Table** — the "Full table with toolbar" snippet now defines `btnPrimary` and a `rows` sample array inline. Previously both were referenced but not defined in the snippet.
- **Menu** — `handleEdit`, `handleDelete`, `handleView`, `handleArchive`, and `canEdit` stubs added to all variant snippets. The `patternCardActions` pattern snippet is now marked as a fragment.
- **ConfirmDialog** — `handleDelete` and `handlePublish` stubs added to the `basic` and `primary` snippets.
- **ConfirmAction** — `handleArchive` and `handlePublish` stubs added to the `renderProp` and `primary` snippets. The `tableRow` pattern snippet is now marked as a fragment.
- **Spinner** — `handleSave` stub and `setSaving` wrapping logic added to the `buttonLoading` snippet alongside the existing `useState`.
- **Pagination** — all four short variant snippets (`fewPages`, `manyPages`, `atStart`, `atEnd`) and the `withCount` snippet are now marked as fragments with the exact `useState` declaration you need to add.
- **Dropdown** — the custom date-range panel snippet now includes `useState` declarations for `isOpen`, `from`, and `to` inline.
- **Combobox** — `withField` and `states` snippets now include state declarations or fragment markers.
- **OtpInput** — the `error` state snippet is now marked as a fragment with the `useState` hint.
- **Drawer** — the `bottom` placement variant snippet is now marked as a fragment.
- **Dialog** — the `preventClose` and `sizes` variant snippets are now marked as fragments.
- **FileUpload** — the multiple-files variant now includes an inline `useState` for the `attachments` array.
- **Modal**, **StatusDot** — see specific fixes below.

#### Installation page

- The "Current version" row in the Package Details table now reads `1.7.0` (was `1.5.0` — stale since the 1.6.0 release).
- The CSS import comment now clarifies that both `@diwauhris/ui/lib/assets/ui.css` and the shorthand `@diwauhris/ui/styles.css` resolve to the same compiled file.

#### Modal page

- The component header description no longer overstates that focus restoration "comes for free". It now accurately qualifies: automatic for the mount/unmount pattern, manual responsibility for the `isOpen`/`onClose` API — and points to the existing Accessibility section caveat for details.

#### StatusDot page

- The `importName` in the component header now correctly shows `StatusDot, MaskedValue` (was `StatusDot` only). The `MaskedValue` component has been documented on this page since 1.7.0 but the import line omitted it.

---

## [1.7.0] — 2026-08-22

### New Components

#### `StatusPage` + `STATUS_PAGE_PRESETS`
Full-page status screen for 404, 403, 500, and custom states. Uses the status code itself as a large typographic watermark in the brand's Barlow typeface — no icon-in-a-circle. No routing logic built in; action buttons accept `onClick` or `href` and the consumer wires navigation.

```tsx
import { StatusPage, STATUS_PAGE_PRESETS } from '@diwauhris/ui';

<StatusPage
  {...STATUS_PAGE_PRESETS.notFound}
  primaryAction={{ label: 'Go to Dashboard', onClick: () => navigate('/dashboard') }}
  secondaryAction={{ label: 'Go Back', onClick: () => navigate(-1) }}
/>
```

Three presets included: `notFound` (404), `forbidden` (403), `serverError` (500). Custom states supported via `icon`, `eyebrow`, `title`, `description`, and action props.

### Bug Fixes

- **BarChart value label clipping** — labels for the tallest bars no longer clip at the top of the SVG. Top headroom increased from 8 px to 16 px.
- **AreaChart `yTicks={[]}` crash** — passing an empty array to `yTicks` no longer produces `NaN` coordinates and an invisible chart. An empty array is now treated the same as omitting the prop (domain auto-derives from the data).
- **AreaChart annotation label clipping** — annotation labels at high data values are now clamped to stay within the SVG boundary.
- **Showcase alignment** — gallery preview sections with `center={false}` now correctly center their content horizontally. Previously, narrow components (e.g. a single button in a wide preview well) would left-align instead of centering.
- **PackageTestPage `<button>` nesting** — the `PopoverTrigger` smoke-test no longer nests a `<Button>` component (which renders a `<button>`) inside the trigger (which also renders a `<button>`). This eliminated a React DOM nesting warning.

### Documentation

- **Modal — focus restoration caveat** (Accessibility section): The `isOpen`/`onClose` API pattern does not automatically return focus to the triggering element when the modal closes. The Accessibility section now explains this, includes a WCAG 2.1 SC 2.4.3 reference, and provides two code patterns for manual focus restoration (`useRef` on the trigger, or capture `document.activeElement` before opening). The `isOpen` and `onClose` ApiTable descriptions also note the caveat.
- **RadioGroup** — `horizontal` layout and `disabled` variants now have live rendered previews alongside their code examples (previously code-only).
- **Timeline** — Implementation section now shows live rendered previews for all three code examples (`Timeline`, `TimelineValueCard`, `TimelineEmptyState`).
- **Charts** — Overview section label corrected from "Single color" to "Default palette" (the BarChart overview was already showing the multi-color CHART_PALETTE rotation, not a single color).
- **Various** — orphaned code examples (defined in `CODE` objects but never rendered) removed from ApprovalRequest, Card, Input, Pagination, and Spinner pages.

---

## [1.6.0] — 2026-08-22

### New Components

#### `AreaChart`
SVG area/line chart with gradient fill, explicit Y-axis ticks, threshold reference lines, annotated data points, highlight regions, and multi-series support. Gradient IDs are scoped per instance via `useId()` — safe to render multiple charts on the same page.

#### `BarList`
Ranked horizontal bar list for categorical distributions. Bars animate in from the left via `.os-bar-in` with configurable stagger delay. `color` accepts CSS values only (hex/rgb/named).

#### `CHART_PALETTE`
Exported color sequence for multi-series and per-item charts. Built on the brand's blue-sky hue family with a warm accent.

```ts
import { CHART_PALETTE } from '@diwauhris/ui';
// ['#034EA2', '#2D8ACA', '#4F6FBF', '#0E7490', '#B45309']
```

### Improvements

#### `BarChart` — visual refresh
- Top-only rounded corners (was: all-four corners rounded).
- Subtle same-hue gradient fill (full opacity at top → 70% at base). No new colors.
- Baseline rule at y=zero grounds the bars visually.
- Value labels moved inside the SVG above each bar (was: external `div` below the chart).
- Default multi-color palette now uses `CHART_PALETTE` instead of arbitrary saturated hues.
- Bars breathe: gap ratio increased from 0.4 to 1.2 units per side.

#### `LineChart` — visual refresh
- Area fill now fades to transparent (was: flat uniform tint).
- Stroke width increased from 1.5 to 2.
- Data-point dots: r=2.5 with white stroke ring (was: r=2, no ring). Dots suppressed when `data.length > 12`.
- Removed `preserveAspectRatio="none"` — chart no longer stretches strokes/text horizontally on resize.

### New CSS
- `.os-bar-in` — `opacity 0→1 + scaleX 0→1` (left origin), 0.22s, matching the `.os-*` animation family. Fully covered by `prefers-reduced-motion: reduce`.

---

## [1.5.0] — 2026-08-21

Initial public release with full component library.

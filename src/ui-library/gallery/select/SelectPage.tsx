/**
 * SelectPage — Gallery infrastructure
 * Phase 3: Showcase pattern.
 */

import { useState } from 'react';
import { GalleryLayout } from '../GalleryLayout';
import { GalleryPageWrapper } from '../components/GalleryPageWrapper';
import { GalleryComponentHeader } from '../components/GalleryComponentHeader';
import { GallerySection } from '../components/GallerySection';
import { Showcase, ShowcasePreview } from '../components/Showcase';
import { ShowcaseGrid } from '../components/ShowcaseGrid';
import { ApiTable } from '../components/ApiTable';
import { RelatedComponents } from '../components/RelatedComponents';
import { SelectPlayground } from './SelectPlayground';
import { Select, type SelectOption } from './Select';
import { getRelatedComponents } from '../../registry';

const RELATED = getRelatedComponents(['input', 'checkbox', 'button']);

const STATUS_OPTIONS = [
  { value: 'active',     label: 'Active'     },
  { value: 'inactive',   label: 'Inactive'   },
  { value: 'terminated', label: 'Terminated' },
];

const DEPT_GROUPS = [
  { group: 'Finance',    options: [{ value: 'payroll', label: 'Payroll' }, { value: 'accounting', label: 'Accounting' }] },
  { group: 'Operations', options: [{ value: 'hr', label: 'Human Resources' }, { value: 'it', label: 'IT' }] },
];

// Employee status options used in the renderOption showcase
const EMPLOYEE_STATUS_OPTIONS: SelectOption[] = [
  { value: 'active',      label: 'Active'      },
  { value: 'on-leave',    label: 'On Leave'    },
  { value: 'suspended',   label: 'Suspended'   },
  { value: 'terminated',  label: 'Terminated', disabled: true },
];

const STATUS_DOT_COLOR: Record<string, string> = {
  'active':     'bg-emerald-500',
  'on-leave':   'bg-amber-400',
  'suspended':  'bg-rose-500',
  'terminated': 'bg-slate-300',
};

function renderEmployeeStatus(item: SelectOption) {
  return (
    <span className="flex items-center gap-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_COLOR[item.value] ?? 'bg-slate-300'}`} aria-hidden="true" />
      {item.label}
    </span>
  );
}

const CODE = {
  default: `import { Select } from '@diwauhris/ui';

const items = [
  { value: 'active',     label: 'Active'     },
  { value: 'inactive',   label: 'Inactive'   },
  { value: 'terminated', label: 'Terminated' },
];

<Select items={items} placeholder="Select status…" />`,

  withLabel: `<div>
  <label htmlFor="status" className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">
    Employment Status
  </label>
  <Select id="status" items={items} placeholder="Select…" />
</div>`,

  error: `<Select
  items={items}
  status="error"
  placeholder="Select…"
  helper="This field is required."
  aria-invalid="true"
/>`,

  success: `<Select
  items={items}
  status="success"
  defaultValue="active"
  helper="Selection confirmed."
/>`,

  disabled: `<Select items={items} placeholder="Select…" disabled />`,

  grouped: `const groups = [
  { group: 'Finance',    options: [{ value: 'payroll', label: 'Payroll' }, { value: 'accounting', label: 'Accounting' }] },
  { group: 'Operations', options: [{ value: 'hr', label: 'Human Resources' }, { value: 'it', label: 'IT' }] },
];

<Select items={groups} placeholder="Select department…" />`,

  renderOption: `import { Select } from '@diwauhris/ui';
import { useState } from 'react';

const STATUS_OPTIONS = [
  { value: 'active',     label: 'Active'     },
  { value: 'on-leave',   label: 'On Leave'   },
  { value: 'suspended',  label: 'Suspended'  },
  { value: 'terminated', label: 'Terminated', disabled: true },
];

const DOT_COLOR = {
  'active':     'bg-emerald-500',
  'on-leave':   'bg-amber-400',
  'suspended':  'bg-rose-500',
  'terminated': 'bg-slate-300',
};

const [status, setStatus] = useState('');

<Select
  items={STATUS_OPTIONS}
  value={status}
  onChange={(e) => setStatus(e.target.value)}
  placeholder="Select employment status…"
  renderOption={(item) => (
    <span className="flex items-center gap-2">
      <span className={\`h-2 w-2 shrink-0 rounded-full \${DOT_COLOR[item.value] ?? 'bg-slate-300'}\`} aria-hidden="true" />
      {item.label}
    </span>
  )}
/>`,
};

export default function SelectPage() {
  const [statusValue, setStatusValue] = useState('');
  return (
    <GalleryLayout activeId="select">
      <title>Select — UI Component Gallery</title>
      <GalleryPageWrapper>
        <GalleryComponentHeader
          category="Inputs"
          name="Select"
          description="A single-value dropdown with a branded option list that matches Combobox, while still behaving like a native select in forms. Need search? Use Combobox."
          status="complete"
        />

        <GallerySection id="overview" title="Overview" description="Key states at a glance. No code — use the playground to experiment.">
          <ShowcasePreview standalone>
            <div className="w-full max-w-xs space-y-3">
              <Select items={STATUS_OPTIONS} placeholder="Select status…" />
              <Select items={STATUS_OPTIONS} defaultValue="active" />
              <Select items={STATUS_OPTIONS} status="error" placeholder="Select…" helper="Required." />
              <Select items={STATUS_OPTIONS} placeholder="Disabled" disabled />
            </div>
          </ShowcasePreview>
        </GallerySection>

        <GallerySection id="playground" title="Playground">
          <SelectPlayground />
        </GallerySection>

        <GallerySection id="states" title="States">
          <ShowcaseGrid columns={2}>
            <Showcase title="Default" code={CODE.default}>
              <div className="w-full max-w-xs">
                <Select items={STATUS_OPTIONS} placeholder="Select status…" />
              </div>
            </Showcase>

            <Showcase title="With Label" code={CODE.withLabel}>
              <div className="w-full max-w-xs">
                <label htmlFor="sc-status" className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">
                  Employment Status
                </label>
                <Select id="sc-status" items={STATUS_OPTIONS} placeholder="Select…" />
              </div>
            </Showcase>

            <Showcase title="Error" code={CODE.error}>
              <div className="w-full max-w-xs">
                <Select items={STATUS_OPTIONS} status="error" placeholder="Select…" helper="This field is required." />
              </div>
            </Showcase>

            <Showcase title="Success" code={CODE.success}>
              <div className="w-full max-w-xs">
                <Select items={STATUS_OPTIONS} status="success" defaultValue="active" helper="Selection confirmed." />
              </div>
            </Showcase>

            <Showcase title="Disabled" code={CODE.disabled}>
              <div className="w-full max-w-xs">
                <Select items={STATUS_OPTIONS} placeholder="Select…" disabled />
              </div>
            </Showcase>
          </ShowcaseGrid>
        </GallerySection>

        <GallerySection id="grouped" title="Grouped Options" description="Use SelectGroup to organize long option lists.">
          <Showcase title="Grouped options" code={CODE.grouped}>
            <div className="w-full max-w-xs">
              <Select items={DEPT_GROUPS} placeholder="Select department…" />
            </div>
          </Showcase>
        </GallerySection>

        <GallerySection
          id="custom-option-rendering"
          title="Custom Option Rendering"
          description="Pass renderOption to replace the default text-only option with any ReactNode — icons, avatars, status indicators, or multi-line content. The Terminated option below is disabled."
        >
          <Showcase title="Employment status with status dots" code={CODE.renderOption} tone="white" center={false}>
            <div className="w-full max-w-xs">
              <Select
                items={EMPLOYEE_STATUS_OPTIONS}
                value={statusValue}
                onChange={(e) => setStatusValue(e.target.value)}
                placeholder="Select employment status…"
                renderOption={renderEmployeeStatus}
              />
            </div>
          </Showcase>
        </GallerySection>

        <GallerySection id="accessibility" title="Accessibility">
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-700">Why a custom list?</h3>
              <p className="text-sm font-medium leading-relaxed text-slate-600">
                The browser&apos;s native option popup can&apos;t be styled and shows an OS-blue highlight outside the
                DIWA palette. Select renders an ARIA combobox + listbox instead, and keeps a hidden
                native <code className="rounded bg-slate-100 px-1 font-mono text-xs">{'<select>'}</code> in sync so
                {' '}<code className="rounded bg-slate-100 px-1 font-mono text-xs">name</code>,{' '}
                <code className="rounded bg-slate-100 px-1 font-mono text-xs">required</code>, refs and form submission
                work unchanged.
              </p>
            </div>
            {[
              ['Keyboard', ['Tab / Shift+Tab — focus.', 'Space, Enter, or Arrow keys — opens on the current value.', 'Arrow keys, Home, End — navigate options (disabled options are skipped).', 'Enter or Space — selects the highlighted option.', 'Typing — jumps to the first option starting with the typed text.', 'Escape — closes without selecting (an enclosing Modal stays open).']],
              ['Labels', ['Always pair with <label htmlFor="id">. Select does not include its own label.', 'Helper text is linked to the trigger with aria-describedby automatically.', 'Set aria-invalid="true" for error states.']],
            ].map(([heading, items]) => (
              <div key={String(heading)}>
                <h3 className="mb-2 text-sm font-bold text-slate-700">{String(heading)}</h3>
                <ul className="space-y-1.5">
                  {(items as string[]).map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm font-medium text-slate-600">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </GallerySection>

        <GallerySection id="api" title="API Reference">
          <ApiTable props={[
            { name: 'items',       type: 'SelectItem[]', required: true, description: 'Flat or grouped option sets.' },
            { name: 'placeholder', type: 'string', description: 'Text shown in the trigger before a value is selected.' },
            { name: 'status',      type: "'default' | 'error' | 'success'", default: "'default'", description: 'Visual validation state.' },
            { name: 'helper',      type: 'string', description: 'Helper or error text below the field.' },
            { name: 'disabled',    type: 'boolean', default: 'false', description: 'Disables the select.' },
            { name: 'renderOption', type: '(item: SelectOption) => ReactNode', description: 'Custom renderer for each option row. Enables icons, avatars, and multi-line option content.' },
            { name: 'ref',         type: 'Ref<HTMLSelectElement>', description: 'Forwarded to the hidden native <select>; focusing it focuses the trigger.' },
            { name: '...rest',     type: 'React.ComponentProps<"select">', description: 'name, required, form and autoComplete go to the hidden native select; id, aria-* and other attributes go to the trigger.' },
          ]} />
        </GallerySection>

        <GallerySection id="related" title="Related Components">
          <RelatedComponents components={RELATED} />
        </GallerySection>
      </GalleryPageWrapper>
    </GalleryLayout>
  );
}

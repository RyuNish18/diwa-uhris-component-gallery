/**
 * OrgChartPage — Gallery infrastructure (Enterprise)
 *
 * Documents the OrgChart design-system component.
 * Visual design sourced from UHRIS CompanyStructurePage diagram mode.
 * Source: frontend/src/ui-library/gallery/org-chart/OrgChart.tsx
 *
 * Technology: D3 v7 (already a production dependency)
 */

import { useState } from 'react';
import { GalleryLayout } from '../GalleryLayout';
import { GalleryPageWrapper } from '../components/GalleryPageWrapper';
import { GalleryComponentHeader } from '../components/GalleryComponentHeader';
import { GallerySection } from '../components/GallerySection';
import { ShowcasePreview, Showcase } from '../components/Showcase';
import { ApiTable } from '../components/ApiTable';
import { RelatedComponents } from '../components/RelatedComponents';
import { OrgChart, type OrgChartNode } from './OrgChart';
import { getRelatedComponents } from '../../registry';

const RELATED = getRelatedComponents(['org-unit-tree', 'tree-view', 'charts']);

// ── Demo data ──────────────────────────────────────────────────────────────

const DEMO_NODES: OrgChartNode[] = [
  {
    id: 'hq',
    label: 'Acme Corporation',
    description: '6 departments · 42 positions',
    children: [
      {
        id: 'hr',
        label: 'Human Resources',
        description: '3 sections · 8 positions',
        children: [
          { id: 'recruitment', label: 'Recruitment', description: '4 positions' },
          { id: 'emp-rel',     label: 'Employee Relations', description: '2 positions' },
        ],
      },
      {
        id: 'eng',
        label: 'Engineering',
        description: '2 sections · 14 positions',
        children: [
          { id: 'software', label: 'Software Dev', description: '10 positions' },
          { id: 'infra',    label: 'Infrastructure', description: '4 positions' },
        ],
      },
      {
        id: 'finance',
        label: 'Finance',
        description: '2 sections · 5 positions',
        children: [
          { id: 'accounting', label: 'Accounting', description: '3 positions' },
          { id: 'payroll',    label: 'Payroll',    description: '2 positions · Inactive', tone: 'muted' },
        ],
      },
    ],
  },
];

const DEEP_NODES: OrgChartNode[] = [
  {
    id: 'ceo',
    label: 'Chief Executive',
    description: 'Executive Office',
    children: [
      {
        id: 'coo',
        label: 'Chief Operating',
        description: 'Operations Division',
        children: [
          {
            id: 'vp-eng',
            label: 'VP Engineering',
            description: 'Technology Group',
            children: [
              { id: 'dir-sw',   label: 'Director SW',   description: 'Software' },
              { id: 'dir-infra', label: 'Director Infra', description: 'Infrastructure' },
            ],
          },
          { id: 'vp-ops', label: 'VP Operations', description: 'Ops Group' },
        ],
      },
      {
        id: 'cfo',
        label: 'Chief Financial',
        description: 'Finance Division',
        children: [
          { id: 'controller', label: 'Controller',   description: 'Accounting' },
          { id: 'treasurer',  label: 'Treasurer',    description: 'Treasury' },
        ],
      },
    ],
  },
];

// ── Code examples ──────────────────────────────────────────────────────────

const CODE = {
  basic: `import { OrgChart, type OrgChartNode } from '@diwauhris/ui';

const nodes: OrgChartNode[] = [
  {
    id: 'hq',
    label: 'Acme Corporation',
    description: '6 departments',
    children: [
      { id: 'hr',  label: 'Human Resources', description: '8 positions' },
      { id: 'eng', label: 'Engineering',     description: '14 positions' },
    ],
  },
];

<OrgChart
  nodes={nodes}
  aria-label="Company organization chart"
/>`,

  interactive: `// With selection callback
const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

<OrgChart
  nodes={nodes}
  selectedId={selectedId}
  onSelect={setSelectedId}
  height="480px"
  aria-label="Acme Corporation hierarchy"
/>`,

  domainMap: `// Mapping domain OrgUnitTreeNode to OrgChartNode
// (domain import stays in the feature module — not in the gallery component)
import type { OrgUnitTreeNode } from 'org-structure/models/orgStructure.types';
import { OrgChart, type OrgChartNode } from '@diwauhris/ui';

function mapToChart(node: OrgUnitTreeNode): OrgChartNode {
  return {
    id: node.id,
    label: node.name,
    description: \`\${levelLabel(node)} · \${positionsForUnit(node.id)} positions\`,
    // Dashed, greyed-out card for units that are not active.
    tone: node.status === 'active' ? 'default' : 'muted',
    children: node.children.map(mapToChart),
  };
}

const chartNodes = orgTree.map(mapToChart);

<OrgChart
  nodes={chartNodes}
  selectedId={selectedId}
  onSelect={setSelectedId}
  // The user's zoom survives data refreshes; a new company scope re-fits.
  fitKey={companyScope}
  aria-label="Organization chart"
/>`,
};

// ── Page ───────────────────────────────────────────────────────────────────

export default function OrgChartPage() {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  return (
    <GalleryLayout activeId="org-chart">
      <title>OrgChart — UI Component Gallery</title>
      <GalleryPageWrapper>

        <GalleryComponentHeader
          category="Enterprise"
          name="OrgChart"
          description="A D3-powered SVG org chart for the diagram view of your company structure. Top-down tree with rectangular nodes. Supports zoom, pan, and click-to-select. D3 is already a dependency — no new packages needed."
          status="complete"
        />

        {/* Overview */}
        <GallerySection
          id="overview"
          title="Overview"
          description="Organization chart with zoom, pan, and node selection. Zoom with the controls (top-right), the wheel, or + / - / 0. The chart stays fitted until you zoom or pan; after that your view is kept through selection, data refreshes and resizes until you press Fit to screen or fitKey changes. Muted nodes mark inactive units."
        >
          <ShowcasePreview standalone center={false}>
            <OrgChart
              nodes={DEMO_NODES}
              selectedId={selectedId}
              onSelect={setSelectedId}
              height="420px"
              aria-label="Acme Corporation organization chart"
            />
            {selectedId && (
              <p className="mt-2 text-xs font-mono text-slate-500">
                Selected: <strong>{selectedId}</strong>
              </p>
            )}
          </ShowcasePreview>
        </GallerySection>

        {/* Deeper hierarchy */}
        <GallerySection
          id="deep"
          title="Deeper Hierarchy"
          description="4-level executive tree — zoom out to see the full structure."
        >
          <ShowcasePreview standalone center={false}>
            <OrgChart
              nodes={DEEP_NODES}
              height="360px"
              aria-label="Executive organization chart"
            />
          </ShowcasePreview>
        </GallerySection>

        {/* Relationship to OrgUnitTree */}
        <GallerySection id="comparison" title="OrgChart vs OrgUnitTree">
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['', 'OrgChart', 'OrgUnitTree'].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {[
                  ['Visual style',      'SVG rect nodes + path connectors',    'Tailwind CSS card rows + border-l connectors'],
                  ['Layout',            'D3 tree algorithm (top-down)',         'Indent-based nesting'],
                  ['Zoom / Pan',        '✅ D3 zoom + wheel + drag',           '❌ Not applicable'],
                  ['Node metadata',     'label + description (SVG text)',      'label, description, badge, meta, actions slots'],
                  ['Accessibility',     'Focusable nodes (Enter / Space), + / - / 0 zoom keys', 'Full WAI-ARIA tree, keyboard navigation'],
                  ['Best for',          'Visual org overview, presentation',   'Editable hierarchy, detailed metadata'],
                  ['Production source', 'CompanyStructurePage Diagram mode',   'CompanyStructurePage List mode'],
                ].map(([feature, chart, tree]) => (
                  <tr key={String(feature)} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 text-xs font-bold text-slate-600">{feature}</td>
                    <td className="px-5 py-3 text-xs font-medium text-slate-700">{chart}</td>
                    <td className="px-5 py-3 text-xs font-medium text-slate-700">{tree}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GallerySection>

        {/* Implementation */}
        <GallerySection id="implementation" title="Implementation">
          <Showcase code={CODE.basic} language="tsx" title="Basic chart" center={false}>
            <OrgChart nodes={DEMO_NODES} height="320px" aria-label="Acme Corporation organization chart" />
          </Showcase>
          <Showcase code={CODE.interactive} language="tsx" title="With selection" center={false}>
            <div className="w-full">
              <OrgChart
                nodes={DEMO_NODES}
                selectedId={selectedId}
                onSelect={setSelectedId}
                height="320px"
                aria-label="Acme Corporation organization chart"
              />
              {selectedId && (
                <p className="mt-2 text-xs font-mono text-slate-500">Selected: <strong>{selectedId}</strong></p>
              )}
            </div>
          </Showcase>
          <Showcase code={CODE.domainMap} language="tsx" title="Mapping from domain OrgUnitTreeNode">
            <OrgChart nodes={DEMO_NODES} height="200px" aria-label="Mapped organization chart" />
          </Showcase>
        </GallerySection>

        {/* Accessibility */}
        <GallerySection id="accessibility" title="Accessibility">
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            {[
              ['SVG semantics', [
                'The SVG canvas has role="img" and aria-label describing the chart.',
                'SVG-rendered nodes (D3-generated <rect> + <text>) do not receive individual ARIA roles — they are not accessible to keyboard-only users.',
                'This matches the production CompanyStructurePage which explicitly states: "Switch to List view for a screen-reader-friendly version."',
              ]],
              ['Zoom and reset controls', [
                'ZoomIn, Reset, and ZoomOut buttons are keyboard-accessible HTML <button> elements with aria-label.',
                'Tab reaches the control panel; keyboard users can zoom/reset but cannot navigate chart nodes.',
              ]],
              ['Selection', [
                'Node selection via click is mouse/pointer only in the SVG diagram.',
                'The selected node shows an indigo ring — a visual indicator.',
                'For keyboard-accessible selection, use OrgUnitTree instead.',
              ]],
              ['Recommendation', [
                'For screen-reader users or keyboard-only navigation, use OrgUnitTree.',
                'OrgChart is appropriate for sighted users who need a visual overview of the hierarchy.',
                'Both components can coexist — OrgChart for the diagram view, OrgUnitTree for the list view.',
              ]],
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

        {/* API */}
        <GallerySection id="api" title="API Reference">
          <p className="text-sm font-bold text-slate-700 mb-2">OrgChartProps</p>
          <ApiTable props={[
            { name: 'nodes',      type: 'OrgChartNode[]', required: true, description: 'Root nodes. A single root produces a standard org chart. Multiple roots share an invisible synthetic parent.' },
            { name: 'selectedId', type: 'string',                        description: 'Selected node id — renders an indigo ring on the matching node.' },
            { name: 'onSelect',   type: '(id: string) => void',          description: 'Called when a node is clicked.' },
            { name: 'height',     type: 'string', default: "'75vh'",      description: 'Container height. Use a fixed value in demos: "480px".' },
            { name: 'aria-label', type: 'string', default: '"Organization chart"', description: 'Accessible label for the SVG role="img" element.' },
            { name: 'className',  type: 'string',                        description: 'Additional class on the root container div.' },
          ]} />

          <p className="text-sm font-bold text-slate-700 mb-2 mt-6">OrgChartNode</p>
          <ApiTable props={[
            { name: 'id',          type: 'string',         required: true, description: 'Unique identifier.' },
            { name: 'label',       type: 'string',         required: true, description: 'Primary text rendered in the node (name line).' },
            { name: 'description', type: 'string',                        description: 'Secondary text line below the label.' },
            { name: 'children',    type: 'OrgChartNode[]',                description: 'Child nodes.' },
          ]} />

          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-5 py-4">
            <p className="text-sm font-semibold text-amber-800">Note on D3</p>
            <p className="text-xs font-medium text-amber-700 mt-1">
              OrgChart uses D3 v7 (<code>d3 ^7.9.0</code>), which is already a production dependency.
              No additional packages are required. The component imports from <code>d3</code> directly.
            </p>
          </div>
        </GallerySection>

        {/* Related */}
        <GallerySection id="related" title="Related Components">
          <RelatedComponents components={RELATED} />
        </GallerySection>

      </GalleryPageWrapper>
    </GalleryLayout>
  );
}

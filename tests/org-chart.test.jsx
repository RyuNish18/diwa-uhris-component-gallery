/**
 * org-chart.test.jsx
 *
 * OrgChart keeps the user's zoom/pan. It used to redraw and re-fit on every
 * prop identity change, on selection, and on any resize — so opening a modal
 * (which hides the page scrollbar and widens the chart) snapped the zoom back.
 * Auto-fit now only applies until the user takes control, or after Fit to
 * screen / a new fitKey.
 */

const React = require('react');
const { render, screen, fireEvent, act } = require('@testing-library/react');
// Imported directly (not via the library index) so this suite doesn't load
// unrelated components.
const { OrgChart } = require('../src/ui-library/gallery/org-chart/OrgChart');
const { layoutOrgChart } = require('../src/ui-library/gallery/org-chart/orgChartLayout');

const nodes = () => [
  {
    id: 'hq',
    label: 'Acme Corporation',
    description: 'Company',
    children: [
      { id: 'eng', label: 'Engineering', description: 'Department' },
      { id: 'ops', label: 'Operations', description: 'Department', tone: 'muted' },
    ],
  },
];

let size;
let resizeCallbacks;
const OriginalResizeObserver = global.ResizeObserver;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  size = { width: 800, height: 600 };
  resizeCallbacks = [];
  global.ResizeObserver = class {
    constructor(cb) { resizeCallbacks.push(cb); }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // Button zoom applies instantly instead of through a d3 transition.
  window.matchMedia = (query) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  });
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const { width, height } = this.tagName.toLowerCase() === 'svg' ? size : { width: 0, height: 0 };
    return { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {} };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  global.ResizeObserver = OriginalResizeObserver;
  window.matchMedia = originalMatchMedia;
});

const viewTransform = (container) =>
  container.querySelector('g.oc-viewport').getAttribute('transform');

const parse = (transform) => {
  const [, x, y, k] = /translate\(([-\d.e]+),([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(transform);
  return { x: Number(x), y: Number(y), k: Number(k) };
};

const resizeTo = (width, height) => {
  size = { width, height };
  act(() => resizeCallbacks.forEach((cb) => cb([])));
};

const zoomIn = () => act(() => { fireEvent.click(screen.getByRole('button', { name: 'Zoom in' })); });

describe('OrgChart zoom', () => {
  test('fits the tree on first render', () => {
    const { container } = render(<OrgChart nodes={nodes()} />);
    expect(viewTransform(container)).toMatch(/translate\(.+\) scale\(.+\)/);
  });

  test('a new onSelect identity or selection does not reset the zoom', () => {
    const data = nodes();
    const { container, rerender } = render(<OrgChart nodes={data} onSelect={() => {}} />);
    zoomIn();
    const zoomed = viewTransform(container);

    rerender(<OrgChart nodes={data} onSelect={() => {}} selectedId="eng" />);
    rerender(<OrgChart nodes={data} onSelect={() => {}} selectedId={undefined} />);
    expect(viewTransform(container)).toBe(zoomed);
  });

  test('after the user zooms, a resize keeps the scale and the view centre', () => {
    const { container } = render(<OrgChart nodes={nodes()} />);
    resizeTo(800, 600); // initial observation
    zoomIn();
    const before = parse(viewTransform(container));

    // e.g. a modal hides the page scrollbar and the chart grows 16px wider
    resizeTo(816, 600);
    const after = parse(viewTransform(container));
    expect(after.k).toBeCloseTo(before.k);
    expect(after.x).toBeCloseTo(before.x + 8);
    expect(after.y).toBeCloseTo(before.y);
  });

  test('while untouched, a resize re-fits', () => {
    const { container } = render(<OrgChart nodes={nodes()} />);
    resizeTo(800, 600);
    const fitted = viewTransform(container);
    resizeTo(400, 600);
    expect(viewTransform(container)).not.toBe(fitted);
  });

  test('a data refresh with the same units keeps the zoom', () => {
    const { container, rerender } = render(<OrgChart nodes={nodes()} />);
    zoomIn();
    const zoomed = viewTransform(container);
    rerender(<OrgChart nodes={nodes()} />);
    expect(viewTransform(container)).toBe(zoomed);
  });

  test('Fit to screen restores the fitted view', () => {
    const { container } = render(<OrgChart nodes={nodes()} />);
    const fitted = viewTransform(container);
    zoomIn();
    expect(viewTransform(container)).not.toBe(fitted);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Fit to screen' })); });
    expect(viewTransform(container)).toBe(fitted);
  });

  test('a new fitKey re-fits; the same fitKey does not', () => {
    const { container, rerender } = render(<OrgChart nodes={nodes()} fitKey="a" />);
    const fitted = viewTransform(container);
    zoomIn();
    const zoomed = viewTransform(container);
    rerender(<OrgChart nodes={nodes()} fitKey="a" />);
    expect(viewTransform(container)).toBe(zoomed);
    rerender(<OrgChart nodes={nodes()} fitKey="b" />);
    expect(viewTransform(container)).toBe(fitted);
  });

  test('minFitScale: a tree too wide to read opens at that zoom, top-centred on the root', () => {
    const wide = [{ id: 'hq', label: 'HQ', children: Array.from({ length: 30 }, (_, i) => ({ id: `d${i}`, label: `D${i}`, expanded: false })) }];
    const { container } = render(<OrgChart nodes={wide} minFitScale={0.6} />);
    const t = parse(viewTransform(container));
    expect(t.k).toBeCloseTo(0.6);
    expect(t.x).toBeCloseTo(400); // the root (x = 0) sits at the middle of the 800px-wide chart
    // A small tree still fits normally above the floor.
    const { container: small } = render(<OrgChart nodes={nodes()} minFitScale={0.6} />);
    expect(parse(viewTransform(small)).k).toBeGreaterThan(0.6);
  });

  test('keyboard shortcuts zoom and fit', () => {
    const { container } = render(<OrgChart nodes={nodes()} />);
    const fitted = viewTransform(container);
    const chart = container.firstChild;
    act(() => { fireEvent.keyDown(chart, { key: '+' }); });
    expect(parse(viewTransform(container)).k).toBeGreaterThan(parse(fitted).k);
    act(() => { fireEvent.keyDown(chart, { key: '0' }); });
    expect(viewTransform(container)).toBe(fitted);
  });
});

describe('layoutOrgChart stackLeaves', () => {
  // A head with one sub-unit and five childless reports, next to a wide sibling branch.
  const tree = () => [{
    id: 'hq', label: 'HQ', children: [
      { id: 'head', label: 'Head', children: [
        { id: 'r1', label: 'R1' }, { id: 'r2', label: 'R2' }, { id: 'sub', label: 'Sub', children: [{ id: 's1', label: 'S1' }] },
        { id: 'r3', label: 'R3' }, { id: 'r4', label: 'R4' }, { id: 'r5', label: 'R5' },
      ] },
      { id: 'wide', label: 'Wide', children: [
        { id: 'w', label: 'W', children: [{ id: 'w1', label: 'W1', children: [{ id: 'w2', label: 'W2' }] }] },
      ] },
    ],
  }];
  const byId = (placed) => Object.fromEntries(placed.map((p) => [p.data.originalId, p]));

  test('without it, every leaf gets its own column', () => {
    const at = byId(layoutOrgChart(tree()));
    expect(new Set(['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => at[id].x)).size).toBe(5);
  });

  test('stacks childless siblings in one column, in order, and links each to the one above', () => {
    const placed = layoutOrgChart(tree(), true);
    const at = byId(placed);
    const column = ['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => at[id]);
    expect(new Set(column.map((p) => p.x)).size).toBe(1);
    column.slice(1).forEach((p, i) => {
      expect(p.y).toBeGreaterThan(column[i].y);
      expect(p.stackPrev).toBe(column[i]);
    });
    // Every stacked card still reports to the head; no layout-only nodes are drawn.
    column.forEach((p) => expect(p.parent).toBe(at.head));
    expect(placed.map((p) => p.data.originalId).sort()).toEqual(
      ['hq', 'head', 'r1', 'r2', 'r3', 'r4', 'r5', 'sub', 's1', 'wide', 'w', 'w1', 'w2'].sort(),
    );
  });

  test('a collapsed node is not stacked: it has hidden children and keeps its own column', () => {
    const placed = layoutOrgChart([{ id: 'hq', label: 'HQ', children: [
      { id: 'a', label: 'A', expanded: false }, { id: 'b', label: 'B', expanded: false },
    ] }], true);
    const at = byId(placed);
    expect(at.a.x).not.toBe(at.b.x);
    expect(at.a.y).toBe(at.b.y);
  });

  test('no other card overlaps the stacked column', () => {
    const placed = layoutOrgChart(tree(), true);
    const overlaps = (a, b) => Math.abs(a.x - b.x) < 250 && Math.abs(a.y - b.y) < 84;
    placed.forEach((a, i) => placed.slice(i + 1).forEach((b) => {
      expect(overlaps(a, b)).toBe(false);
    }));
  });
});

describe('OrgChart nodes', () => {
  test('click and Enter select a unit', () => {
    const onSelect = jest.fn();
    render(<OrgChart nodes={nodes()} onSelect={onSelect} />);
    const eng = screen.getByRole('button', { name: 'Engineering, Department' });
    fireEvent.click(eng);
    fireEvent.keyDown(eng, { key: 'Enter' });
    expect(onSelect).toHaveBeenNthCalledWith(1, 'eng');
    expect(onSelect).toHaveBeenNthCalledWith(2, 'eng');
  });

  test('nodes are not focusable buttons when nothing can be selected', () => {
    const { container } = render(<OrgChart nodes={nodes()} />);
    const node = container.querySelector('g.oc-node');
    expect(node.getAttribute('tabindex')).toBeNull();
    expect(node.getAttribute('role')).toBeNull();
  });

  test('selection and tone are reflected on the node', () => {
    const { container } = render(<OrgChart nodes={nodes()} selectedId="eng" onSelect={() => {}} />);
    const byName = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
    expect(byName('Engineering')).toHaveClass('is-selected');
    expect(byName('Engineering')).toHaveAttribute('aria-pressed', 'true');
    expect(byName('Operations')).toHaveClass('is-muted');
    expect(container.querySelectorAll('g.oc-node.is-selected')).toHaveLength(1);
  });

  test('an unknown selectedId selects nothing', () => {
    const { container } = render(<OrgChart nodes={nodes()} selectedId="missing" onSelect={() => {}} />);
    expect(container.querySelectorAll('g.oc-node.is-selected')).toHaveLength(0);
  });

  test('long names are truncated with the full text in a tooltip', () => {
    const long = 'Department of Information and Communications Technology Infrastructure Services';
    const { container } = render(<OrgChart nodes={[{ id: 'x', label: long }]} />);
    const name = container.querySelector('text.oc-name').textContent;
    expect(name.endsWith('…')).toBe(true);
    expect(name.length).toBeLessThan(long.length);
    expect(container.querySelector('g.oc-node title').textContent).toBe(long);
  });

  test('multiple roots render without the synthetic root', () => {
    const { container } = render(
      <OrgChart nodes={[{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }]} />,
    );
    expect(container.querySelectorAll('g.oc-node')).toHaveLength(2);
    expect(container.querySelectorAll('g.oc-links path')).toHaveLength(0);
  });

  test('vacant and filled tones are flagged on their nodes only', () => {
    render(<OrgChart onSelect={() => {}} nodes={[{ id: 'u', label: 'Unit', children: [
      { id: 'a', label: 'Open seat', tone: 'vacant' },
      { id: 'b', label: 'Filled seat', tone: 'filled' },
      { id: 'c', label: 'Plain' },
    ] }]} />);
    expect(screen.getByRole('button', { name: 'Open seat' })).toHaveClass('is-vacant');
    expect(screen.getByRole('button', { name: 'Open seat' })).not.toHaveClass('is-filled');
    expect(screen.getByRole('button', { name: 'Filled seat' })).toHaveClass('is-filled');
    expect(screen.getByRole('button', { name: 'Filled seat' })).not.toHaveClass('is-vacant');
    expect(screen.getByRole('button', { name: 'Plain' }).getAttribute('class')).toBe('oc-node');
  });

  test('the toggle button calls onToggle, not onSelect; Space on the node toggles too', () => {
    const onSelect = jest.fn();
    const onToggle = jest.fn();
    const { container } = render(
      <OrgChart onSelect={onSelect} onToggle={onToggle} nodes={[{ id: 'u', label: 'Unit', expanded: false }]} />,
    );
    const unit = screen.getByRole('button', { name: 'Unit' });
    expect(unit).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(container.querySelector('g.oc-toggle'));
    fireEvent.keyDown(unit, { key: ' ' });
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('without onToggle there is no toggle and Space selects', () => {
    const onSelect = jest.fn();
    const { container } = render(<OrgChart onSelect={onSelect} nodes={[{ id: 'u', label: 'Unit', expanded: false }]} />);
    expect(container.querySelector('g.oc-toggle').style.display).toBe('none');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Unit' }), { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith('u');
  });

  test('one Tab stop; arrow keys move it between parent, child and siblings', () => {
    render(<OrgChart nodes={nodes()} onSelect={() => {}} />);
    const button = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
    expect(button('Acme').getAttribute('tabindex')).toBe('0');
    expect(button('Engineering').getAttribute('tabindex')).toBe('-1');

    act(() => { button('Acme').focus(); });
    fireEvent.keyDown(button('Acme'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(button('Engineering'));
    fireEvent.keyDown(button('Engineering'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(button('Operations'));
    expect(button('Operations').getAttribute('tabindex')).toBe('0');
    expect(button('Engineering').getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(button('Operations'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(button('Acme'));
  });

  test('an empty tree shows a message instead of a blank canvas', () => {
    const { container, rerender } = render(<OrgChart nodes={nodes()} />);
    rerender(<OrgChart nodes={[]} />);
    expect(screen.getByText('No units to display')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull();
    expect(container.querySelectorAll('g.oc-node')).toHaveLength(0);
  });
});

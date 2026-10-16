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

  test('an empty tree shows a message instead of a blank canvas', () => {
    const { container, rerender } = render(<OrgChart nodes={nodes()} />);
    rerender(<OrgChart nodes={[]} />);
    expect(screen.getByText('No units to display')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull();
    expect(container.querySelectorAll('g.oc-node')).toHaveLength(0);
  });
});

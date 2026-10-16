/**
 * OrgChart — Design System Component
 *
 * A D3-powered SVG organization chart matching the UHRIS Company Structure
 * diagram mode. Renders a top-down tree with rectangular nodes and
 * stepped orthogonal connectors.
 *
 * Technology: D3 v7 (d3.hierarchy + d3.tree layout + d3.zoom)
 * Already a production dependency — no new packages introduced.
 *
 * Visual design (sourced from CompanyStructurePage diagram mode):
 *   Nodes:
 *     - 250 × 84 px rounded rectangles (rx=14)
 *     - Root (depth 0): dark navy fill (#0f172a), white text
 *     - Children: white fill (#fff), slate border (#e2e8f0)
 *     - Muted tone: dashed border, slate-50 fill, muted text (inactive units)
 *     - drop-shadow: 0 6px 12px rgba(15,23,42,0.08)
 *     - Name: 13px, font-weight 800, centered, ellipsis + tooltip when too long
 *     - Description: 11px, font-weight 600, #64748b / #cbd5e1 (root)
 *     - Hover: indigo-300 border; Selected: indigo border + overlay ring
 *   Connectors:
 *     - Stepped orthogonal path: M→V→H→V
 *     - Stroke: #cbd5e1, stroke-width 1.5
 *   Canvas:
 *     - Fits the tree to the viewport until the user zooms or pans; after that
 *       the user's view is kept across re-renders, data refreshes and resizes
 *       (e.g. a modal hiding the page scrollbar). "Fit to screen" or a new
 *       `fitKey` hands control back to auto-fit.
 *     - Zoom: scaleExtent [0.05, 1.8]; wheel / pinch / buttons / keyboard
 *     - Pan: mouse/touch drag (a drag never counts as a node click)
 *     - Layout: nodeSize [280, 185] — horizontal × vertical spacing
 *   Controls:
 *     - Zoom in, zoom %, Zoom out, Fit to screen (top-right overlay panel)
 *
 * Accessibility:
 *   - SVG has an aria-label; role="img" when read-only, role="group" when nodes are selectable
 *   - Selectable nodes are focusable buttons (Tab, Enter / Space to select)
 *   - Keyboard on the chart: + / = zoom in, - zoom out, 0 fit to screen
 *   - Respects prefers-reduced-motion for button zoom transitions
 *   - Note: full ARIA tree semantics are not possible in an SVG diagram;
 *     use OrgUnitTree for a fully keyboard-accessible list-based alternative
 *
 * Usage:
 *   <OrgChart
 *     nodes={orgNodes}
 *     selectedId={selectedId}
 *     onSelect={setSelectedId}
 *     aria-label="Company organization chart"
 *   />
 */

import * as d3 from 'd3';
import { useEffect, useRef, useId, useState, type KeyboardEvent } from 'react';
import { Scan, ZoomIn, ZoomOut } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrgChartNode {
  /** Unique identifier. */
  id: string;
  /** Primary label — org unit name. */
  label: string;
  /** Secondary text line inside the node. */
  description?: string;
  /**
   * Visual tone. `'muted'` renders a dashed, greyed-out card — use it for
   * inactive or archived units. Default: `'default'`.
   */
  tone?: 'default' | 'muted';
  /** Child nodes. */
  children?: OrgChartNode[];
}

export interface OrgChartProps {
  /**
   * Root-level nodes. The chart renders one connected tree.
   * If multiple roots are provided, a synthetic invisible root is created
   * to connect them (matching D3 hierarchy requirements).
   */
  nodes: OrgChartNode[];
  /** Currently selected node id — renders an indigo ring on the node. */
  selectedId?: string;
  /** Called when a node is clicked (or activated with Enter / Space). */
  onSelect?: (id: string) => void;
  /**
   * Changing this value re-fits the tree to the viewport, discarding the
   * user's zoom/pan. Use it when the chart shows a new context (e.g. a
   * different company scope). Data refreshes alone keep the user's view.
   */
  fitKey?: string | number;
  /**
   * Container height. Default: '75vh' — matching the production CompanyStructurePage.
   * Pass a fixed pixel value for demos: '480px'.
   */
  height?: string;
  /** Accessible label for the SVG element. */
  'aria-label'?: string;
  /** Additional class on the root container div. */
  className?: string;
}

// ── Internal D3 node data ─────────────────────────────────────────────────────

interface D3NodeDatum {
  id: string;
  name: string;
  description: string;
  isRoot: boolean;
  isSyntheticRoot: boolean;
  isMuted: boolean;
  originalId: string;
  children?: D3NodeDatum[];
}

type PointNode = d3.HierarchyPointNode<D3NodeDatum>;
type PointLink = d3.HierarchyPointLink<D3NodeDatum>;

const SYNTHETIC_ROOT_ID = '__synthetic_root__';
const NODE_W = 250;
const NODE_H = 84;
const TEXT_MAX_W = NODE_W - 32;
const MIN_SCALE = 0.05;
const MAX_SCALE = 1.8;
const FIT_PAD = 40;
const BUTTON_ZOOM_STEP = 1.2;

function buildD3Tree(nodes: OrgChartNode[]): D3NodeDatum {
  function convert(node: OrgChartNode, depth: number): D3NodeDatum {
    return {
      id: node.id,
      name: node.label,
      description: node.description ?? '',
      isRoot: depth === 0,
      isSyntheticRoot: false,
      isMuted: node.tone === 'muted',
      originalId: node.id,
      children: node.children?.map((c) => convert(c, depth + 1)),
    };
  }

  if (nodes.length === 1) {
    return convert(nodes[0]!, 0);
  }

  // Multiple roots: wrap in a transparent synthetic root
  return {
    id: SYNTHETIC_ROOT_ID,
    name: '',
    description: '',
    isRoot: true,
    isSyntheticRoot: true,
    isMuted: false,
    originalId: SYNTHETIC_ROOT_ID,
    children: nodes.map((n) => convert(n, 0)),
  };
}

/** Writes `text` into an SVG text element, truncating with an ellipsis to fit `maxWidth`. */
function fitText(el: SVGTextElement, text: string, maxWidth: number, fontSize: number) {
  el.textContent = text;
  if (!text) return;

  const measured = typeof el.getComputedTextLength === 'function' ? el.getComputedTextLength() : 0;
  // No layout available (jsdom, hidden container): estimate from the character count.
  if (!measured) {
    const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * 0.6)));
    if (text.length > maxChars) el.textContent = `${text.slice(0, maxChars - 1).trimEnd()}…`;
    return;
  }
  if (measured <= maxWidth) return;

  let lo = 0;
  let hi = text.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    el.textContent = `${text.slice(0, mid).trimEnd()}…`;
    if (el.getComputedTextLength() <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  el.textContent = `${text.slice(0, lo).trimEnd()}…`;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Component ─────────────────────────────────────────────────────────────────

export function OrgChart({
  nodes,
  selectedId,
  onSelect,
  fitKey,
  height = '75vh',
  'aria-label': ariaLabel = 'Organization chart',
  className = '',
}: OrgChartProps) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  // Tree coordinate bounds, so fitToView() can recalculate on resize.
  const treeBoundsRef = useRef<{ minX: number; maxX: number; minY: number; maxY: number } | null>(null);
  // True until the user zooms or pans; while true the chart keeps itself fitted.
  const autoFitRef = useRef(true);
  // Set while the chart moves the view itself, so those zoom events don't count as the user's.
  const programmaticRef = useRef(false);
  // A fit requested while the chart had no size (hidden); runs once it is laid out.
  const pendingFitRef = useRef(false);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);
  const onSelectRef = useRef(onSelect);
  const selectedIdRef = useRef(selectedId);
  const scaleFrameRef = useRef(0);
  const [scale, setScale] = useState(1);
  // Used as a CSS id selector, so strip the characters React puts in useId values.
  const uid = `oc-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const interactive = Boolean(onSelect);
  const isEmpty = nodes.length === 0;

  const getSize = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  };

  /** Applies a transform without handing control away from auto-fit. */
  const applyTransform = (t: d3.ZoomTransform) => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.interrupt();
    programmaticRef.current = true;
    try {
      svg.call(zoomRef.current.transform, t);
    } finally {
      programmaticRef.current = false;
    }
  };

  // ── fitToView: calculate and apply the centered fit transform ───────────────
  // Reads the SVG's actual rendered dimensions at call time.
  const fitToView = () => {
    if (!svgRef.current || !zoomRef.current || !treeBoundsRef.current) return;

    const { width: W, height: H } = getSize();
    if (W === 0 || H === 0) {
      pendingFitRef.current = true; // not laid out yet, or hidden
      return;
    }
    pendingFitRef.current = false;

    const { minX, maxX, minY, maxY } = treeBoundsRef.current;

    // Visual bounds of the tree content (nodes are centered at their coords).
    const contentLeft   = minX - NODE_W / 2;
    const contentRight  = maxX + NODE_W / 2;
    const contentTop    = minY - NODE_H / 2;
    const contentBottom = maxY + NODE_H / 2;
    const contentWidth  = contentRight  - contentLeft;
    const contentHeight = contentBottom - contentTop;

    // Scale to fill the viewport with padding, clamped to the zoom extent.
    const scaleX = (W - FIT_PAD * 2) / Math.max(1, contentWidth);
    const scaleY = (H - FIT_PAD * 2) / Math.max(1, contentHeight);
    const k = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleX, scaleY));

    // Translate so the content's visual center lands at the viewport center.
    const tx = W / 2 - ((contentLeft + contentRight) / 2) * k;
    const ty = H / 2 - ((contentTop + contentBottom) / 2) * k;

    applyTransform(d3.zoomIdentity.translate(tx, ty).scale(k));
  };

  /** Fit, and go back to keeping the chart fitted (Fit button, new fitKey). */
  const resetToFit = () => {
    autoFitRef.current = true;
    fitToView();
  };

  const zoomBy = (factor: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    autoFitRef.current = false;
    const svg = d3.select(svgRef.current);
    if (prefersReducedMotion()) {
      svg.interrupt().call(zoomRef.current.scaleBy, factor);
    } else {
      svg.transition().duration(250).call(zoomRef.current.scaleBy, factor);
    }
  };

  // Latest callback / selection, read by D3 handlers without redrawing.
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // ── Mount: zoom behavior, layers, resize handling (once) ────────────────────
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);

    const viewport = svg.append('g').attr('class', 'oc-viewport');
    viewport.append('g').attr('class', 'oc-links');
    viewport.append('g').attr('class', 'oc-nodes');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_SCALE, MAX_SCALE])
      // Measure the viewport from layout rather than SVG length attributes.
      .extent((): [[number, number], [number, number]] => {
        const { width, height } = getSize();
        return [[0, 0], [Math.max(1, width), Math.max(1, height)]];
      })
      // Small pointer jitter while clicking still counts as a click, not a pan.
      .clickDistance(5)
      // Double-click zoom fights with click-to-select; wheel, drag and pinch stay.
      .filter((event: Event) => {
        if (event.type === 'dblclick') return false;
        const e = event as MouseEvent;
        return (!e.ctrlKey || event.type === 'wheel') && !e.button;
      })
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        viewport.attr('transform', event.transform.toString());
        if (!programmaticRef.current) autoFitRef.current = false;
        cancelAnimationFrame(scaleFrameRef.current);
        scaleFrameRef.current = requestAnimationFrame(() => setScale(event.transform.k));
      });
    zoomRef.current = zoom;
    svg.call(zoom);

    const ro = new ResizeObserver(() => {
      const size = getSize();
      if (size.width === 0 || size.height === 0) return; // hidden — keep the last view
      const last = lastSizeRef.current;
      lastSizeRef.current = size;

      if (autoFitRef.current || pendingFitRef.current || !last) {
        fitToView();
        return;
      }
      // The user owns the view: keep what was at the center at the center.
      const dx = (size.width - last.width) / 2;
      const dy = (size.height - last.height) / 2;
      if (dx === 0 && dy === 0) return;
      const t = d3.zoomTransform(svgEl);
      applyTransform(d3.zoomIdentity.translate(t.x + dx, t.y + dy).scale(t.k));
    });
    ro.observe(svgEl);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(scaleFrameRef.current);
      svg.interrupt().on('.zoom', null);
      svg.selectAll('*').remove();
      zoomRef.current = null;
    };
    // Mount-only: handlers read refs, so they never go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Draw: keyed join, so a data refresh updates in place ─────────────────────
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    const linkLayer = svg.select<SVGGElement>('g.oc-links');
    const nodeLayer = svg.select<SVGGElement>('g.oc-nodes');

    if (nodes.length === 0) {
      linkLayer.selectAll('*').remove();
      nodeLayer.selectAll('*').remove();
      treeBoundsRef.current = null;
      return;
    }

    const root = d3.hierarchy(buildD3Tree(nodes));
    // Layout — matches production exactly: nodeSize([280, 185])
    const pointRoot = d3.tree<D3NodeDatum>().nodeSize([280, 185])(root);

    const descendants = pointRoot.descendants();
    treeBoundsRef.current = {
      minX: d3.min(descendants, (d) => d.x) ?? 0,
      maxX: d3.max(descendants, (d) => d.x) ?? 0,
      minY: d3.min(descendants, (d) => d.y) ?? 0,
      maxY: d3.max(descendants, (d) => d.y) ?? 0,
    };

    // ── Connectors ──────────────────────────────────────────────────────────
    linkLayer
      .selectAll<SVGPathElement, PointLink>('path')
      .data(
        pointRoot.links().filter((l) => !l.source.data.isSyntheticRoot),
        (l) => `${l.source.data.originalId}>${l.target.data.originalId}`,
      )
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1.5)
      .attr('d', (link) => {
        const mid = (link.source.y + link.target.y) / 2;
        return `M${link.source.x},${link.source.y}V${mid}H${link.target.x}V${link.target.y}`;
      });

    // ── Nodes ────────────────────────────────────────────────────────────────
    const node = nodeLayer
      .selectAll<SVGGElement, PointNode>('g.oc-node')
      .data(descendants.filter((d) => !d.data.isSyntheticRoot), (d) => d.data.originalId)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'oc-node');
        g.append('title');
        g.append('rect')
          .attr('class', 'oc-card')
          .attr('x', -NODE_W / 2)
          .attr('y', -NODE_H / 2)
          .attr('width', NODE_W)
          .attr('height', NODE_H)
          .attr('rx', 14)
          .attr('filter', 'drop-shadow(0 6px 12px rgba(15,23,42,0.08))');
        g.append('rect')
          .attr('class', 'oc-ring')
          .attr('x', -NODE_W / 2 - 3)
          .attr('y', -NODE_H / 2 - 3)
          .attr('width', NODE_W + 6)
          .attr('height', NODE_H + 6)
          .attr('rx', 16)
          .attr('fill', 'none');
        g.append('text').attr('class', 'oc-name').attr('text-anchor', 'middle').attr('y', -8).attr('font-size', 13).attr('font-weight', 800);
        g.append('text').attr('class', 'oc-desc').attr('text-anchor', 'middle').attr('y', 16).attr('font-size', 11).attr('font-weight', 600);
        return g;
      })
      .attr('transform', (d) => `translate(${d.x},${d.y})`)
      .classed('is-root', (d) => d.data.isRoot)
      .classed('is-muted', (d) => d.data.isMuted)
      .classed('is-selected', (d) => d.data.originalId === selectedIdRef.current)
      .attr('aria-label', (d) => (d.data.description ? `${d.data.name}, ${d.data.description}` : d.data.name))
      .on('click', (_e, d) => onSelectRef.current?.(d.data.originalId))
      .on('keydown', (event: globalThis.KeyboardEvent, d) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelectRef.current?.(d.data.originalId);
      })
      .on('focus', (_e, d) => {
        // Keyboard users tabbing to an off-screen node: bring it into view.
        if (!zoomRef.current) return;
        const { width: W, height: H } = getSize();
        const [sx, sy] = d3.zoomTransform(svgEl).apply([d.x, d.y]);
        const margin = 24;
        if (sx >= margin && sx <= W - margin && sy >= margin && sy <= H - margin) return;
        autoFitRef.current = false;
        svg.interrupt().call(zoomRef.current.translateTo, d.x, d.y);
      });

    node.select('title').text((d) => (d.data.description ? `${d.data.name}\n${d.data.description}` : d.data.name));
    node.select<SVGTextElement>('text.oc-name').each(function (d) {
      fitText(this, d.data.name, TEXT_MAX_W, 13);
    });
    node.select<SVGTextElement>('text.oc-desc').each(function (d) {
      fitText(this, d.data.description, TEXT_MAX_W, 11);
    });

    if (autoFitRef.current || pendingFitRef.current) fitToView();
    // fitToView reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // Focusability / button semantics follow whether nodes are selectable.
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll('g.oc-node')
      .attr('tabindex', interactive ? 0 : null)
      .attr('role', interactive ? 'button' : null);
  }, [interactive, nodes]);

  // ── Selection: restyle in place, never redraw or refit ──────────────────────
  useEffect(() => {
    selectedIdRef.current = selectedId;
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll<SVGGElement, PointNode>('g.oc-node')
      .classed('is-selected', (d) => d.data.originalId === selectedId)
      .attr('aria-pressed', interactive ? (d) => String(d.data.originalId === selectedId) : null);
  }, [selectedId, interactive, nodes]);

  // ── fitKey: a new context hands the view back to auto-fit ───────────────────
  const fitKeyRef = useRef(fitKey);
  useEffect(() => {
    if (fitKeyRef.current === fitKey) return;
    fitKeyRef.current = fitKey;
    resetToFit();
    // resetToFit reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isEmpty) return;
    if (event.key === '+' || event.key === '=') zoomBy(BUTTON_ZOOM_STEP);
    else if (event.key === '-' || event.key === '_') zoomBy(1 / BUTTON_ZOOM_STEP);
    else if (event.key === '0') resetToFit();
    else return;
    event.preventDefault();
  };

  const atMax = scale >= MAX_SCALE - 1e-3;
  const atMin = scale <= MIN_SCALE + 1e-3;

  const controlBtnClass = [
    'appearance-none border-0 bg-none font-[inherit]',
    'flex items-center justify-center rounded-lg p-2',
    'text-slate-500 transition hover:bg-slate-100 hover:text-slate-700',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30',
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
  ].join(' ');

  return (
    <div
      className={`relative w-full overflow-hidden bg-slate-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue/30 ${className}`}
      style={{ height }}
      tabIndex={isEmpty ? undefined : 0}
      aria-keyshortcuts={isEmpty ? undefined : '+ - 0'}
      onKeyDown={handleKeyDown}
    >
      <style>{`
        #${uid} .oc-card { fill: #fff; stroke: #e2e8f0; stroke-width: 1; transition: stroke 120ms ease; }
        #${uid} .oc-name { fill: #0f172a; }
        #${uid} .oc-desc { fill: #64748b; }
        #${uid} .oc-node.is-root .oc-card { fill: #0f172a; stroke: #0f172a; }
        #${uid} .oc-node.is-root .oc-name { fill: #fff; }
        #${uid} .oc-node.is-root .oc-desc { fill: #cbd5e1; }
        #${uid} .oc-node.is-muted .oc-card { fill: #f8fafc; stroke: #94a3b8; stroke-dasharray: 5 4; }
        #${uid} .oc-node.is-muted .oc-name { fill: #475569; }
        #${uid} .oc-node.is-muted .oc-desc { fill: #94a3b8; }
        #${uid} .oc-node.is-root.is-muted .oc-card { fill: #334155; stroke: #94a3b8; }
        #${uid} .oc-node.is-root.is-muted .oc-name { fill: #e2e8f0; }
        #${uid} .oc-node.is-root.is-muted .oc-desc { fill: #cbd5e1; }
        #${uid} .oc-ring { stroke: #6366f1; stroke-width: 2.5; opacity: 0; pointer-events: none; }
        #${uid}.is-interactive .oc-node { cursor: pointer; }
        #${uid}.is-interactive .oc-node:hover .oc-card { stroke: #a5b4fc; stroke-width: 1.5; }
        #${uid} .oc-node.is-selected .oc-card,
        #${uid}.is-interactive .oc-node.is-selected:hover .oc-card { stroke: #6366f1; stroke-width: 2.5; }
        #${uid} .oc-node.is-selected .oc-ring { opacity: 0.6; }
        #${uid} .oc-node:focus { outline: none; }
        #${uid} .oc-node:focus-visible .oc-ring { opacity: 1; stroke: #2563eb; }
      `}</style>

      {/* Zoom controls — top-right panel */}
      {!isEmpty && (
        <div className="absolute right-4 top-4 z-10 flex flex-col items-center gap-1 rounded-lg border border-slate-100 bg-white p-1.5 shadow-md">
          <button
            type="button"
            className={controlBtnClass}
            onClick={() => zoomBy(BUTTON_ZOOM_STEP)}
            disabled={atMax}
            aria-label="Zoom in"
            title="Zoom in (+)"
          >
            <ZoomIn size={16} aria-hidden="true" />
          </button>
          <span className="min-w-[3rem] select-none text-center text-[11px] font-semibold tabular-nums text-slate-500">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className={controlBtnClass}
            onClick={() => zoomBy(1 / BUTTON_ZOOM_STEP)}
            disabled={atMin}
            aria-label="Zoom out"
            title="Zoom out (-)"
          >
            <ZoomOut size={16} aria-hidden="true" />
          </button>
          <div className="my-0.5 h-px w-6 bg-slate-100" aria-hidden="true" />
          <button
            type="button"
            className={controlBtnClass}
            onClick={resetToFit}
            aria-label="Fit to screen"
            title="Fit to screen (0)"
          >
            <Scan size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-semibold text-slate-500">
          No units to display
        </div>
      )}

      {/* D3 SVG canvas */}
      <svg
        ref={svgRef}
        id={uid}
        width="100%"
        height="100%"
        className={`block touch-none ${interactive ? 'is-interactive' : ''}`}
        role={interactive ? 'group' : 'img'}
        aria-label={ariaLabel}
      />
    </div>
  );
}

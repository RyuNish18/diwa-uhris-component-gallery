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
 *     - Root (depth 0) or `emphasis`: dark navy fill (#0f172a), white text
 *     - Children: white fill (#fff), slate border (#e2e8f0)
 *     - Muted tone: dashed border, slate-50 fill, muted text (inactive units)
 *     - Vacant tone: flat slate-100 card without shadow (unfilled positions)
 *     - Filled tone: white card with a 1.5px brand-blue (#034EA2) border, no shadow (held positions)
 *     - `expanded`: +/− button on the bottom edge; `onToggle` owns the state
 *     - `stackLeaves`: childless siblings hang in one column under their parent
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
 *   - Selectable nodes are buttons with one Tab stop (roving tabindex):
 *     arrow keys move parent / child / sibling, Enter selects, Space toggles
 *     a node with `expanded` (else selects)
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
import { COL_GAP, layoutOrgChart, NODE_H, NODE_W, TIER_ROW_GAP, type PlacedNode } from './orgChartLayout';

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
   * inactive or archived units. `'vacant'` renders a flat grey card — use it
   * for an unfilled position. `'filled'` renders a white card with a brand-blue
   * border — use it for a position someone holds. Default: `'default'`.
   */
  tone?: 'default' | 'muted' | 'vacant' | 'filled';
  /**
   * Draws the card in the root's dark style, e.g. to set org units apart
   * from positions. Combines with `tone: 'muted'`. Default: `false`.
   */
  emphasis?: boolean;
  /**
   * Shows an expand / collapse button under the card: `true` = expanded,
   * `false` = collapsed. Leave it out for nodes that can't toggle. The
   * consumer owns the state: handle `onToggle` and pass new `children`.
   */
  expanded?: boolean;
  /**
   * Rank tier this card belongs to. When two or more sibling leaves share
   * a tier key, the layout groups them into horizontal rows instead of one
   * long column. `order` controls which tier sits highest (lowest order =
   * highest rank = top). `label` is shown as a small heading above each
   * tier's first row (e.g. "R1 MANAGEMENT").
   */
  tier?: { key: string; label: string; order: number };
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
  /** Called when a node is clicked (or activated with Enter, or Space on a node without `expanded`). */
  onSelect?: (id: string) => void;
  /** Called when a node's expand / collapse button is clicked, or Space is pressed on it. */
  onToggle?: (id: string) => void;
  /**
   * Hang a node's childless children in one column under it instead of a
   * wide row (two or more of them). Keeps big flat teams readable.
   */
  stackLeaves?: boolean;
  /**
   * Maximum position cards per row inside a rank-tier block. Cards beyond
   * this wrap to the next row in a balanced distribution. Default: 4.
   */
  tierMaxPerRow?: number;
  /**
   * The smallest zoom an automatic fit may use. When the whole tree would
   * only fit below it, the chart opens at this zoom with the top of the tree
   * in view, centred on the root, instead of shrinking past readability.
   * Default: no minimum beyond the zoom range.
   */
  minFitScale?: number;
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

const TEXT_MAX_W = NODE_W - 32;
const MIN_SCALE = 0.05;
const MAX_SCALE = 1.8;
const FIT_PAD = 40;
const BUTTON_ZOOM_STEP = 1.2;

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
  onToggle,
  stackLeaves = false,
  tierMaxPerRow,
  minFitScale = MIN_SCALE,
  fitKey,
  height = '75vh',
  'aria-label': ariaLabel = 'Organization chart',
  className = '',
}: OrgChartProps) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  // Tree coordinate bounds, so fitToView() can recalculate on resize; rootX centres a clamped fit.
  const treeBoundsRef = useRef<{ minX: number; maxX: number; minY: number; maxY: number; rootX: number } | null>(null);
  const minFitScaleRef = useRef(minFitScale);
  // True until the user zooms or pans; while true the chart keeps itself fitted.
  const autoFitRef = useRef(true);
  // Set while the chart moves the view itself, so those zoom events don't count as the user's.
  const programmaticRef = useRef(false);
  // A fit requested while the chart had no size (hidden); runs once it is laid out.
  const pendingFitRef = useRef(false);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);
  const onSelectRef = useRef(onSelect);
  const onToggleRef = useRef(onToggle);
  const selectedIdRef = useRef(selectedId);
  // The one node in the Tab order; arrow keys move it (roving tabindex).
  const activeIdRef = useRef<string | undefined>(undefined);
  const scaleFrameRef = useRef(0);
  const [scale, setScale] = useState(1);
  // Used as a CSS id selector, so strip the characters React puts in useId values.
  const uid = `oc-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const interactive = Boolean(onSelect);
  const togglable = Boolean(onToggle);
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

    const { minX, maxX, minY, maxY, rootX } = treeBoundsRef.current;

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
    const fit = Math.min(MAX_SCALE, scaleX, scaleY);
    const floor = Math.max(MIN_SCALE, minFitScaleRef.current);

    if (fit < floor) {
      // Too big to read whole: open at the floor zoom, top of the tree in view, centred on the root.
      const tx = W / 2 - rootX * floor;
      const ty = FIT_PAD - contentTop * floor;
      applyTransform(d3.zoomIdentity.translate(tx, ty).scale(floor));
      return;
    }

    // Translate so the content's visual center lands at the viewport center.
    const tx = W / 2 - ((contentLeft + contentRight) / 2) * fit;
    const ty = H / 2 - ((contentTop + contentBottom) / 2) * fit;

    applyTransform(d3.zoomIdentity.translate(tx, ty).scale(fit));
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
    onToggleRef.current = onToggle;
    // Declared before the draw effect, so a fit in the same commit reads the new value.
    minFitScaleRef.current = minFitScale;
  }, [onSelect, onToggle, minFitScale]);

  const nodeSelection = () =>
    d3.select(svgRef.current).selectAll<SVGGElement, PlacedNode>('g.oc-node');

  /** Puts exactly one node in the Tab order: the active one, else the selected one, else the first. */
  const syncTabStops = () => {
    const all = nodeSelection();
    if (!interactive) {
      all.attr('tabindex', null);
      return;
    }
    const ids = new Set(all.data().map((d) => d.data.originalId));
    const active = [activeIdRef.current, selectedIdRef.current].find((id) => id && ids.has(id)) ?? all.data()[0]?.data.originalId;
    activeIdRef.current = active;
    all.attr('tabindex', (d) => (d.data.originalId === active ? 0 : -1));
  };

  const focusNode = (target: PlacedNode) => {
    activeIdRef.current = target.data.originalId;
    syncTabStops();
    nodeSelection().filter((d) => d === target).node()?.focus();
  };

  // ── Mount: zoom behavior, layers, resize handling (once) ────────────────────
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);

    const viewport = svg.append('g').attr('class', 'oc-viewport');
    viewport.append('g').attr('class', 'oc-links');
    viewport.append('g').attr('class', 'oc-tier-labels');
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
      svg.select<SVGGElement>('g.oc-tier-labels').selectAll('*').remove();
      nodeLayer.selectAll('*').remove();
      treeBoundsRef.current = null;
      return;
    }

    const placed = layoutOrgChart(nodes, stackLeaves, tierMaxPerRow);
    const roots = placed.filter((d) => !d.parent);
    treeBoundsRef.current = {
      minX: d3.min(placed, (d) => d.x) ?? 0,
      maxX: d3.max(placed, (d) => d.x) ?? 0,
      minY: d3.min(placed, (d) => d.y) ?? 0,
      maxY: d3.max(placed, (d) => d.y) ?? 0,
      rootX: d3.mean(roots, (d) => d.x) ?? 0,
    };

    // ── Connectors ──────────────────────────────────────────────────────────
    linkLayer
      .selectAll<SVGPathElement, PlacedNode>('path')
      .data(placed.filter((d) => d.parent), (d) => `${d.parent!.data.originalId}>${d.data.originalId}`)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1.5)
      .attr('d', (d) => {
        const from = d.parent!;
        if (d.tier !== undefined) {
          const { row, col, blockY, spineX, busY } = d.tier;
          if (row === 0 && col === 0) {
            const mid = (from.y + blockY) / 2;
            return `M${from.x},${from.y}V${mid}H${spineX}V${busY}H${d.x}V${d.y}`;
          }
          if (col === 0) {
            return `M${spineX},${busY - TIER_ROW_GAP}V${busY}H${d.x}V${d.y}`;
          }
          return `M${d.x - COL_GAP},${busY}H${d.x}V${d.y}`;
        }
        // A stacked card hangs from the one above it; the line runs behind the cards.
        if (d.stackPrev) return `M${d.x},${d.stackPrev.y}V${d.y}`;
        const mid = (from.y + d.y) / 2;
        return `M${from.x},${from.y}V${mid}H${d.x}V${d.y}`;
      });

    // ── Tier headings ───────────────────────────────────────────────────────
    const tierLabelLayer = svg.select<SVGGElement>('g.oc-tier-labels');
    tierLabelLayer
      .selectAll<SVGTextElement, PlacedNode>('text.oc-tier-label')
      .data(placed.filter((d) => d.tier?.label !== undefined), (d) => `tl-${d.data.originalId}`)
      .join('text')
      .attr('class', 'oc-tier-label')
      .attr('x', (d) => d.tier!.labelX)
      .attr('y', (d) => d.tier!.busY - 6)
      .attr('text-anchor', 'start')
      .each(function (d) {
        fitText(this, d.tier!.label!, d.tier!.labelMaxWidth, 10);
      });

    /** The node an arrow key moves to: null when there is none, undefined for other keys. */
    const neighbour = (d: PlacedNode, key: string): PlacedNode | null | undefined => {
      const siblings = d.parent ? d.parent.children : roots;
      const index = siblings.indexOf(d);
      if (key === 'ArrowUp') return d.stackPrev ?? d.parent;
      if (key === 'ArrowDown') return d.stackNext ?? d.children[0] ?? null;
      if (key === 'ArrowLeft') return siblings[index - 1] ?? null;
      if (key === 'ArrowRight') return siblings[index + 1] ?? null;
      return undefined;
    };
    const canToggle = (d: PlacedNode) => d.data.expanded !== undefined && Boolean(onToggleRef.current);

    // ── Nodes ────────────────────────────────────────────────────────────────
    const node = nodeLayer
      .selectAll<SVGGElement, PlacedNode>('g.oc-node')
      .data(placed, (d) => d.data.originalId)
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
        // Mouse affordance only; keyboard users toggle with Space on the node.
        const toggle = g.append('g').attr('class', 'oc-toggle').attr('aria-hidden', 'true').attr('transform', `translate(0,${NODE_H / 2})`);
        toggle.append('circle').attr('r', 11);
        toggle.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em');
        return g;
      })
      .attr('transform', (d) => `translate(${d.x},${d.y})`)
      .classed('is-root', (d) => d.data.isRoot)
      .classed('is-muted', (d) => d.data.isMuted)
      .classed('is-vacant', (d) => Boolean(d.data.isVacant) && !d.data.isMuted)
      .classed('is-filled', (d) => Boolean(d.data.isFilled))
      .classed('is-selected', (d) => d.data.originalId === selectedIdRef.current)
      .attr('aria-label', (d) => (d.data.description ? `${d.data.name}, ${d.data.description}` : d.data.name))
      .attr('aria-expanded', (d) => (canToggle(d) ? String(d.data.expanded) : null))
      .on('click', (_e, d) => onSelectRef.current?.(d.data.originalId))
      .on('keydown', (event: globalThis.KeyboardEvent, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (event.key === ' ' && canToggle(d)) onToggleRef.current?.(d.data.originalId);
          else onSelectRef.current?.(d.data.originalId);
          return;
        }
        const next = neighbour(d, event.key);
        if (next === undefined) return;
        event.preventDefault();
        if (next) focusNode(next);
      })
      .on('focus', (_e, d) => {
        activeIdRef.current = d.data.originalId;
        syncTabStops();
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
    const toggle = node.select<SVGGElement>('g.oc-toggle')
      .style('display', (d) => (canToggle(d) ? null : 'none'))
      .on('click', (event: MouseEvent, d) => {
        event.stopPropagation(); // toggling is not selecting
        onToggleRef.current?.(d.data.originalId);
      });
    toggle.select('text').text((d) => (d.data.expanded ? '−' : '+'));

    if (autoFitRef.current || pendingFitRef.current) fitToView();
    // fitToView reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, stackLeaves, tierMaxPerRow, togglable]);

  // Focusability / button semantics follow whether nodes are selectable.
  useEffect(() => {
    if (!svgRef.current) return;
    nodeSelection().attr('role', interactive ? 'button' : null);
    syncTabStops();
    // syncTabStops reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, nodes, stackLeaves, tierMaxPerRow]);

  // ── Selection: restyle in place, never redraw or refit ──────────────────────
  useEffect(() => {
    selectedIdRef.current = selectedId;
    if (!svgRef.current) return;
    nodeSelection()
      .classed('is-selected', (d) => d.data.originalId === selectedId)
      .attr('aria-pressed', interactive ? (d) => String(d.data.originalId === selectedId) : null);
    // A new selection (e.g. from search) becomes the Tab stop.
    if (selectedId) {
      activeIdRef.current = selectedId;
      syncTabStops();
    }
    // syncTabStops reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        #${uid} .oc-node.is-vacant .oc-card { fill: #f1f5f9; stroke: #cbd5e1; filter: none; }
        #${uid} .oc-node.is-vacant .oc-name { fill: #334155; }
        #${uid} .oc-node.is-vacant .oc-desc { fill: #475569; }
        #${uid} .oc-node.is-filled .oc-card { stroke: #034ea2; stroke-width: 1.5; filter: none; }
        #${uid} .oc-toggle { cursor: pointer; }
        #${uid} .oc-toggle circle { fill: #fff; stroke: #94a3b8; stroke-width: 1; transition: stroke 120ms ease; }
        #${uid} .oc-toggle text { fill: #334155; font-size: 15px; font-weight: 700; pointer-events: none; }
        #${uid} .oc-toggle:hover circle { stroke: #6366f1; stroke-width: 1.5; }
        #${uid} .oc-ring { stroke: #6366f1; stroke-width: 2.5; opacity: 0; pointer-events: none; }
        #${uid}.is-interactive .oc-node { cursor: pointer; }
        #${uid}.is-interactive .oc-node:hover .oc-card { stroke: #a5b4fc; stroke-width: 1.5; }
        #${uid} .oc-node.is-selected .oc-card,
        #${uid}.is-interactive .oc-node.is-selected:hover .oc-card { stroke: #6366f1; stroke-width: 2.5; }
        #${uid} .oc-node.is-selected .oc-ring { opacity: 0.6; }
        #${uid} .oc-node:focus { outline: none; }
        #${uid} .oc-node:focus-visible .oc-ring { opacity: 1; stroke: #2563eb; }
        #${uid} .oc-tier-label { font-size: 10px; font-weight: 700; fill: #64748b; letter-spacing: 0.05em; text-transform: uppercase; pointer-events: none; }
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
        aria-describedby={interactive ? `${uid}-help` : undefined}
      />
      {interactive && (
        <p id={`${uid}-help`} className="sr-only">
          Arrow keys move between boxes. Enter opens a box.{togglable ? ' Space expands or collapses it.' : ''}
        </p>
      )}
    </div>
  );
}

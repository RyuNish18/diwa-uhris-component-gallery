/**
 * OrgChart layout: positions every node, optionally hanging childless
 * siblings in one column, or in rank tiers. Kept apart from the component so
 * it can be tested on its own and the component file only exports components.
 */

import * as d3 from 'd3';
import type { OrgChartNode } from './OrgChart';

// -- Internal D3 node data ----------------------------------------------------

export interface D3NodeDatum {
  id: string;
  name: string;
  description: string;
  isRoot: boolean;
  isSyntheticRoot: boolean;
  isMuted: boolean;
  isVacant?: boolean;
  isFilled?: boolean;
  expanded?: boolean;
  /** Rank tier this card belongs to (see OrgChartNode.tier). */
  tier?: { key: string; label: string; order: number };
  /** Layout-only: stands in for a column of stacked leaves. */
  stackItems?: D3NodeDatum[];
  /** Layout-only: stands in for a block of rank tiers (rows of cards). */
  tierItems?: Array<{ data: D3NodeDatum; slot: TierSlot }>;
  /** Layout-only: how many COL_GAP columns this stand-in (or its spacer) is wide. Default 1. */
  cols?: number;
  /** Layout-only: holds a stacked column's / tier block's slot in the levels below it. */
  isSpacer?: boolean;
  originalId: string;
  children?: D3NodeDatum[];
}

/** Where a card sits inside a tier block, relative to the block's centre / top. */
export interface TierSlot {
  dx: number;
  dy: number;
  /** Row index across the whole block (tiers wrap onto several rows). */
  row: number;
  /** Column index within the row, left-most = 0. */
  col: number;
  /** Set on the first card of a tier's first row: the tier's heading. */
  label?: string;
}

/** Geometry of one card laid out in a tier block, in chart coordinates. */
export interface PlacedTier {
  /** Row index across the whole block, top row = 0. */
  row: number;
  /** Column index within the row, left-most = 0. */
  col: number;
  /** Centre x and top-row y of the whole block. */
  blockX: number;
  blockY: number;
  /** x of the block's vertical connector spine, in the gutter left of the cards. */
  spineX: number;
  /** y of the horizontal connector bus above this card's row. */
  busY: number;
  /** Heading drawn above the first row of a tier (first card only). */
  label?: string;
  /** Left edge x of the heading and the widest it may be drawn. */
  labelX: number;
  labelMaxWidth: number;
}

/** A drawn node with its final position and its neighbours for keyboard moves. */
export interface PlacedNode {
  x: number;
  y: number;
  data: D3NodeDatum;
  parent: PlacedNode | null;
  children: PlacedNode[];
  /** Previous / next card in the same stacked column, or the nearest card in the row above / below a tier row. */
  stackPrev?: PlacedNode;
  stackNext?: PlacedNode;
  /** Present on cards laid out in rank tiers. */
  tier?: PlacedTier;
}

export const SYNTHETIC_ROOT_ID = '__synthetic_root__';
export const NODE_W = 250;
export const NODE_H = 84;
export const COL_GAP = 280;
const LEVEL_GAP = 185;
const STACK_GAP = NODE_H + 16;
/** Vertical distance between tier rows: card height plus room for a heading and the connector bus. */
export const TIER_ROW_GAP = NODE_H + 56;
/** Most cards in one tier row before it wraps onto the next row. */
export const TIER_MAX_PER_ROW = 4;
/** Extra width on the left of a tier block for its connector spine. */
const TIER_GUTTER = 40;
/** Spine distance from the left edge of the block's first card column. */
const TIER_SPINE_INSET = 20;
/** Bus distance above the top edge of a row's cards. */
const TIER_BUS_OFFSET = 26;

function buildD3Tree(nodes: OrgChartNode[]): D3NodeDatum {
  function convert(node: OrgChartNode, depth: number): D3NodeDatum {
    return {
      id: node.id,
      name: node.label,
      description: node.description ?? '',
      isRoot: depth === 0 || Boolean(node.emphasis),
      isSyntheticRoot: false,
      isMuted: node.tone === 'muted',
      isVacant: node.tone === 'vacant',
      isFilled: node.tone === 'filled',
      expanded: node.expanded,
      tier: node.tier,
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

// -- Stack leaves -------------------------------------------------------------

/**
 * Spacers hold a stand-in's slot in every level its cards reach, so the tree
 * layout keeps other boxes out from under it.
 */
function makeSpacers(nodeId: string, reach: number, cols: number): D3NodeDatum[] | undefined {
  let spacers: D3NodeDatum[] | undefined;
  for (let level = Math.ceil(reach / LEVEL_GAP) - 1; level > 0; level--) {
    const id = `${nodeId}\u0000spacer${level}`;
    spacers = [{ id, name: '', description: '', isRoot: false, isSyntheticRoot: false, isMuted: false, isSpacer: true, cols, originalId: id, children: spacers }];
  }
  return spacers;
}

/** Swaps `members` for one `block` stand-in, which takes the first member's place among its siblings. */
function replaceWithBlock(node: D3NodeDatum, members: D3NodeDatum[], block: D3NodeDatum) {
  const kids = node.children!;
  const isMember = new Set(members);
  const others = kids.filter((kid) => !isMember.has(kid));
  others.splice(kids.slice(0, kids.indexOf(members[0]!)).filter((kid) => !isMember.has(kid)).length, 0, block);
  node.children = others;
}

/** Replaces each run of two or more childless children with one column stand-in. */
function stackLeafChildren(node: D3NodeDatum) {
  const kids = node.children;
  if (!kids?.length) return;
  kids.forEach(stackLeafChildren);
  // A collapsed node hides children, so it is not a leaf: it keeps its own column.
  // A tier block is already laid out in rows, and a spacer only holds a slot: neither is a card.
  const leaves = kids.filter((kid) => !kid.children?.length && kid.expanded === undefined && !kid.tierItems && !kid.isSpacer);
  if (leaves.length < 2) return;
  const reach = (leaves.length - 1) * STACK_GAP + NODE_H + 16;
  const id = `${node.id}\u0000stack`;
  const stack: D3NodeDatum = { id, name: '', description: '', isRoot: false, isSyntheticRoot: false, isMuted: false, stackItems: leaves, originalId: id, children: makeSpacers(node.id, reach, 1) };
  replaceWithBlock(node, leaves, stack);
}

// -- Rank tiers ---------------------------------------------------------------

/** Balanced row sizes for `count` cards, at most `perRow` a row (10 / 4 -> 4, 3, 3). */
function balancedRows(count: number, perRow: number): number[] {
  const numRows = Math.max(1, Math.ceil(count / perRow));
  const base = Math.floor(count / numRows);
  const extra = count % numRows;
  return Array.from({ length: numRows }, (_, i) => (i < extra ? base + 1 : base));
}

/**
 * Pure geometry of a tier block. `tiers` lists each tier's heading and card
 * count, top tier first. Every tier starts on a new row, and a tier with more
 * than `maxPerRow` cards wraps onto balanced rows (10 cards -> 4 + 3 + 3, never
 * 4 + 4 + 2). Rows are left-aligned behind a gutter that holds the connector
 * spine, so each tier reads as one line under its heading.
 *
 * `width` is the whole block (gutter included) and `cols` the number of card
 * columns. Slot `dx` is relative to the block's centre; the first row is at dy 0.
 */
export function tierBlockGeometry(
  tiers: Array<{ key: string; label: string; count: number }>,
  maxPerRow = TIER_MAX_PER_ROW,
): { width: number; cols: number; tiers: Array<{ key: string; label: string; slots: TierSlot[] }> } {
  const perRow = Math.max(1, Math.floor(maxPerRow));
  const cols = Math.max(1, ...tiers.map((tier) => Math.min(perRow, tier.count)));
  const width = cols * COL_GAP + TIER_GUTTER;
  const firstDx = -width / 2 + TIER_GUTTER + COL_GAP / 2;
  let row = 0;

  return {
    width,
    cols,
    tiers: tiers.map(({ key, label, count }) => {
      const slots: TierSlot[] = [];
      balancedRows(count, perRow).forEach((rowSize) => {
        for (let col = 0; col < rowSize; col++) {
          slots.push({
            dx: firstDx + col * COL_GAP,
            dy: row * TIER_ROW_GAP,
            row,
            col,
            ...(slots.length === 0 && label ? { label: `${label} (${count})` } : {}),
          });
        }
        row++;
      });
      return { key, label, slots };
    }),
  };
}

/**
 * Groups the tier-annotated leaf children of `node` into one tier block
 * stand-in, as wide as its widest row. Its spacers are just as wide, so the
 * tree keeps every other box out of the block's rows.
 */
function buildTierBlocks(node: D3NodeDatum, tierMaxPerRow: number) {
  const kids = node.children;
  if (!kids?.length) return;
  kids.forEach((kid) => buildTierBlocks(kid, tierMaxPerRow));

  const tierLeaves = kids.filter(
    (kid) => !kid.children?.length && kid.expanded === undefined && kid.tier && !kid.isSpacer,
  );
  if (tierLeaves.length < 2) return;

  // Group by tier key; cards keep their sibling order inside a tier.
  const groups = new Map<string, { key: string; label: string; order: number; leaves: D3NodeDatum[] }>();
  tierLeaves.forEach((leaf) => {
    const { key, label, order } = leaf.tier!;
    const group = groups.get(key);
    if (group) group.leaves.push(leaf);
    else groups.set(key, { key, label, order, leaves: [leaf] });
  });

  // Lowest order = highest rank = top row. The sort is stable, so equal orders keep sibling order.
  const sorted = [...groups.values()].sort((a, b) => (a.order === b.order ? 0 : a.order < b.order ? -1 : 1));
  const geometry = tierBlockGeometry(
    sorted.map((tier) => ({ key: tier.key, label: tier.label, count: tier.leaves.length })),
    tierMaxPerRow,
  );

  const tierItems = sorted.flatMap((tier, tierIndex) =>
    tier.leaves.map((leaf, leafIndex) => ({ data: leaf, slot: geometry.tiers[tierIndex]!.slots[leafIndex]! })),
  );
  const reach = Math.max(...tierItems.map((item) => item.slot.dy)) + NODE_H + 16;
  const cols = geometry.width / COL_GAP;

  const id = `${node.id}\u0000tiers`;
  const block: D3NodeDatum = {
    id,
    name: '',
    description: '',
    isRoot: false,
    isSyntheticRoot: false,
    isMuted: false,
    tierItems,
    cols,
    originalId: id,
    children: makeSpacers(id, reach, cols),
  };
  replaceWithBlock(node, tierLeaves, block);
}

/** The card in `row` whose centre is closest to `x`. */
function nearestInRow(row: PlacedNode[] | undefined, x: number): PlacedNode | undefined {
  return row?.reduce((best, item) => (Math.abs(item.x - x) < Math.abs(best.x - x) ? item : best));
}

/**
 * Positions every drawn node. Exported for tests. With `stackLeaves`, a
 * node's childless children hang in one column (STACK_GAP apart) under it.
 * When nodes carry `tier` data, tier-annotated leaves are grouped into
 * horizontal rank rows before any remaining leaves are stacked.
 */
export function layoutOrgChart(nodes: OrgChartNode[], stackLeaves = false, tierMaxPerRow = TIER_MAX_PER_ROW): PlacedNode[] {
  const tree = buildD3Tree(nodes);

  // Tier grouping runs first so tier blocks are excluded from stack processing.
  buildTierBlocks(tree, tierMaxPerRow);
  if (stackLeaves) stackLeafChildren(tree);

  const root = d3.tree<D3NodeDatum>()
    .nodeSize([COL_GAP, LEVEL_GAP])
    // A wide stand-in (a tier block and its spacers) keeps its neighbours its own width away.
    // For one-column nodes this is d3's default: 1 between siblings, 2 between cousins.
    .separation((a, b) => ((a.data.cols ?? 1) + (b.data.cols ?? 1)) / 2 + (a.parent === b.parent ? 0 : 1))(
      d3.hierarchy(tree),
    );

  const placed: PlacedNode[] = [];
  const placedOf = new Map<d3.HierarchyPointNode<D3NodeDatum>, PlacedNode>();

  // Breadth-first so a parent is always placed before its children.
  root.each((d) => {
    if (d.data.isSyntheticRoot || d.data.isSpacer) return;
    const parent = (d.parent && placedOf.get(d.parent)) ?? null;

    const add = (data: D3NodeDatum, x: number, y: number, tierMeta?: PlacedTier): PlacedNode => {
      const item: PlacedNode = {
        x, y, data, parent, children: [],
        ...(tierMeta !== undefined ? { tier: tierMeta } : {}),
      };
      parent?.children.push(item);
      placed.push(item);
      return item;
    };

    if (d.data.stackItems) {
      let prev: PlacedNode | undefined;
      d.data.stackItems.forEach((data, index) => {
        const item = add(data, d.x, d.y + index * STACK_GAP);
        if (prev) {
          item.stackPrev = prev;
          prev.stackNext = item;
        }
        prev = item;
      });
      return;
    }

    if (d.data.tierItems) {
      const width = (d.data.cols ?? 1) * COL_GAP;
      const cardCols = Math.round((width - TIER_GUTTER) / COL_GAP);
      // Left edge of the first card column; the spine runs in the gutter just left of it.
      const labelX = d.x - width / 2 + TIER_GUTTER + (COL_GAP - NODE_W) / 2;
      const spineX = labelX - TIER_SPINE_INSET;
      const labelMaxWidth = cardCols * COL_GAP - (COL_GAP - NODE_W);
      const rows: PlacedNode[][] = [];
      d.data.tierItems.forEach(({ data, slot }) => {
        const y = d.y + slot.dy;
        const item = add(data, d.x + slot.dx, y, {
          row: slot.row,
          col: slot.col,
          blockX: d.x,
          blockY: d.y,
          spineX,
          busY: y - NODE_H / 2 - TIER_BUS_OFFSET,
          labelX,
          labelMaxWidth,
          ...(slot.label !== undefined ? { label: slot.label } : {}),
        });
        if (!rows[slot.row]) rows[slot.row] = [];
        rows[slot.row]!.push(item);
      });
      // Up / Down move to the nearest card in the row above / below.
      rows.forEach((row, index) => row.forEach((item) => {
        const prev = nearestInRow(rows[index - 1], item.x);
        const next = nearestInRow(rows[index + 1], item.x);
        if (prev) item.stackPrev = prev;
        if (next) item.stackNext = next;
      }));
      return;
    }

    placedOf.set(d, add(d.data, d.x, d.y));
  });

  return placed;
}

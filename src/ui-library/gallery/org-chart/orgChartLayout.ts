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
  /** Set on the first card of a tier's first row: the tier's heading. */
  label?: string;
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
  tier?: { row: number; blockX: number; blockY: number; label?: string };
}

export const SYNTHETIC_ROOT_ID = '__synthetic_root__';
export const NODE_W = 250;
export const NODE_H = 84;
const COL_GAP = 280;
const LEVEL_GAP = 185;
const STACK_GAP = NODE_H + 16;
/** Vertical distance between tier rows: card height plus room for the connector bus. */
export const TIER_ROW_GAP = NODE_H + 48;
/** Most cards in one tier row before it wraps onto the next row. */
export const TIER_MAX_PER_ROW = 4;

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
  // A tier block is already laid out in rows.
  const leaves = kids.filter((kid) => !kid.children?.length && kid.expanded === undefined && !kid.tierItems);
  if (leaves.length < 2) return;
  const reach = (leaves.length - 1) * STACK_GAP + NODE_H;
  const id = `${node.id}\u0000stack`;
  const stack: D3NodeDatum = { id, name: '', description: '', isRoot: false, isSyntheticRoot: false, isMuted: false, stackItems: leaves, originalId: id, children: makeSpacers(node.id, reach, 1) };
  replaceWithBlock(node, leaves, stack);
}

// -- Rank tiers ---------------------------------------------------------------

/**
 * Pure geometry of a tier block. `tiers` lists each tier's heading and card
 * count, top tier first. Every tier starts on a new row, and a tier with more
 * than `maxPerRow` cards wraps onto balanced rows (10 cards -> 4 + 3 + 3, never
 * 4 + 4 + 2). Cards are centred on the block's x; the first row is at dy 0.
 */
export function tierBlockGeometry(
  tiers: Array<{ key: string; label: string; count: number }>,
  maxPerRow = TIER_MAX_PER_ROW,
): Array<{ key: string; label: string; slots: TierSlot[] }> {
  let currentDy = 0;
  let globalRow = 0;

  return tiers.map(({ key, label, count }) => {
    const numRows = Math.max(1, Math.ceil(count / maxPerRow));
    const base = Math.floor(count / numRows);
    const extra = count % numRows;
    // e.g. 10 items, 3 rows: extra=1 -> rows [4, 3, 3]
    const rowSizes = Array.from({ length: numRows }, (_, i) => (i < extra ? base + 1 : base));

    const slots: TierSlot[] = [];
    let cardIndex = 0;

    rowSizes.forEach((rowSize, rowIndex) => {
      for (let col = 0; col < rowSize; col++) {
        const dx = (col - (rowSize - 1) / 2) * COL_GAP;
        slots.push({
          dx,
          dy: currentDy + rowIndex * TIER_ROW_GAP,
          row: globalRow + rowIndex,
          ...(cardIndex === 0 ? { label: `${label} ${count}` } : {}),
        });
        cardIndex++;
      }
    });

    currentDy += numRows * TIER_ROW_GAP;
    globalRow += numRows;
    return { key, label, slots };
  });
}

/** Groups tier-annotated leaf children of `node` into a tier block stand-in. */
function buildTierBlocks(node: D3NodeDatum, tierMaxPerRow: number) {
  const kids = node.children;
  if (!kids?.length) return;
  kids.forEach((kid) => buildTierBlocks(kid, tierMaxPerRow));

  // Leaves that carry tier data
  const tierLeaves = kids.filter(
    (kid) => !kid.children?.length && kid.expanded === undefined && kid.tier,
  );
  if (tierLeaves.length < 2) return;

  // Group by tier key, preserving order of first occurrence
  const tierMap = new Map<string, { key: string; label: string; order: number; leaves: D3NodeDatum[] }>();
  tierLeaves.forEach((leaf) => {
    const t = leaf.tier!;
    if (!tierMap.has(t.key)) {
      tierMap.set(t.key, { key: t.key, label: t.label, order: t.order, leaves: [] });
    }
    tierMap.get(t.key)!.leaves.push(leaf);
  });

  // Sort tiers by order ascending: lowest order = highest rank = top of diagram
  const sortedTiers = [...tierMap.values()].sort((a, b) => a.order - b.order);

  // Build geometry
  const geom = tierBlockGeometry(
    sortedTiers.map((t) => ({ key: t.key, label: t.label, count: t.leaves.length })),
    tierMaxPerRow,
  );

  // Build tierItems: map each leaf to its slot
  const tierItems: Array<{ data: D3NodeDatum; slot: TierSlot }> = [];
  sortedTiers.forEach((tier, tierIndex) => {
    const slots = geom[tierIndex]!.slots;
    tier.leaves.forEach((leaf, leafIndex) => {
      tierItems.push({ data: leaf, slot: slots[leafIndex]! });
    });
  });

  // Max cards per row (for cols metadata)
  const maxCols = Math.min(tierMaxPerRow, Math.max(...sortedTiers.map((t) => t.leaves.length)));
  // Vertical reach: distance from block anchor to bottom of last card
  const maxDy = Math.max(...tierItems.map((item) => item.slot.dy));
  const reach = maxDy + NODE_H;

  const id = `${node.id}\u0000tiers`;
  const block: D3NodeDatum = {
    id,
    name: '',
    description: '',
    isRoot: false,
    isSyntheticRoot: false,
    isMuted: false,
    tierItems,
    cols: maxCols,
    originalId: id,
    children: makeSpacers(id, reach, maxCols),
  };

  replaceWithBlock(node, tierLeaves, block);
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

  const root = d3.tree<D3NodeDatum>().nodeSize([COL_GAP, LEVEL_GAP])(d3.hierarchy(tree));

  const placed: PlacedNode[] = [];
  const placedOf = new Map<d3.HierarchyPointNode<D3NodeDatum>, PlacedNode>();

  // Breadth-first so a parent is always placed before its children.
  root.each((d) => {
    if (d.data.isSyntheticRoot || d.data.isSpacer) return;
    const parent = (d.parent && placedOf.get(d.parent)) ?? null;

    const add = (data: D3NodeDatum, x: number, y: number, tierMeta?: PlacedNode['tier']): PlacedNode => {
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
      // Place all cards in the tier block at their computed positions.
      d.data.tierItems.forEach(({ data, slot }) => {
        add(data, d.x + slot.dx, d.y + slot.dy, {
          row: slot.row,
          blockX: d.x,
          blockY: d.y,
          ...(slot.label !== undefined ? { label: slot.label } : {}),
        });
      });
      return;
    }

    placedOf.set(d, add(d.data, d.x, d.y));
  });

  return placed;
}

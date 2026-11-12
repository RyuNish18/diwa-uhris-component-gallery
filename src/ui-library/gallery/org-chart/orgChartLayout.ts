/**
 * OrgChart layout: positions every node, optionally hanging childless
 * siblings in one column. Kept apart from the component so it can be tested
 * on its own and the component file only exports components.
 */

import * as d3 from 'd3';
import type { OrgChartNode } from './OrgChart';

// ── Internal D3 node data ─────────────────────────────────────────────────────

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
  /** Layout-only: stands in for a column of stacked leaves. */
  stackItems?: D3NodeDatum[];
  /** Layout-only: holds a stacked column's slot in the levels below it. */
  isSpacer?: boolean;
  originalId: string;
  children?: D3NodeDatum[];
}

/** A drawn node with its final position and its neighbours for keyboard moves. */
export interface PlacedNode {
  x: number;
  y: number;
  data: D3NodeDatum;
  parent: PlacedNode | null;
  children: PlacedNode[];
  /** Previous / next card in the same stacked column. */
  stackPrev?: PlacedNode;
  stackNext?: PlacedNode;
}

export const SYNTHETIC_ROOT_ID = '__synthetic_root__';
export const NODE_W = 250;
export const NODE_H = 84;
const COL_GAP = 280;
const LEVEL_GAP = 185;
const STACK_GAP = NODE_H + 16;

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

/** Replaces each run of two or more childless children with one column stand-in. */
function stackLeafChildren(node: D3NodeDatum) {
  const kids = node.children;
  if (!kids?.length) return;
  kids.forEach(stackLeafChildren);
  // A collapsed node hides children, so it is not a leaf: it keeps its own column.
  const leaves = kids.filter((kid) => !kid.children?.length && kid.expanded === undefined);
  if (leaves.length < 2) return;
  // Spacers hold the column's slot in every level it reaches, so the tree
  // layout keeps other boxes out from under it.
  const reach = (leaves.length - 1) * STACK_GAP + NODE_H;
  let spacers: D3NodeDatum[] | undefined;
  for (let level = Math.ceil(reach / LEVEL_GAP) - 1; level > 0; level--) {
    const id = `${node.id}\u0000spacer${level}`;
    spacers = [{ id, name: '', description: '', isRoot: false, isSyntheticRoot: false, isMuted: false, isSpacer: true, originalId: id, children: spacers }];
  }
  const id = `${node.id}\u0000stack`;
  const stack: D3NodeDatum = { id, name: '', description: '', isRoot: false, isSyntheticRoot: false, isMuted: false, stackItems: leaves, originalId: id, children: spacers };
  const isLeaf = new Set(leaves);
  const others = kids.filter((kid) => !isLeaf.has(kid));
  // The column takes the place of the first leaf among its siblings.
  others.splice(kids.slice(0, kids.indexOf(leaves[0]!)).filter((kid) => !isLeaf.has(kid)).length, 0, stack);
  node.children = others;
}

/**
 * Positions every drawn node. Exported for tests. With `stackLeaves`, a
 * node's childless children hang in one column (STACK_GAP apart) under it.
 */
export function layoutOrgChart(nodes: OrgChartNode[], stackLeaves = false): PlacedNode[] {
  const tree = buildD3Tree(nodes);
  if (stackLeaves) stackLeafChildren(tree);
  const root = d3.tree<D3NodeDatum>().nodeSize([COL_GAP, LEVEL_GAP])(d3.hierarchy(tree));

  const placed: PlacedNode[] = [];
  const placedOf = new Map<d3.HierarchyPointNode<D3NodeDatum>, PlacedNode>();
  // Breadth-first, so a parent is always placed before its children.
  root.each((d) => {
    if (d.data.isSyntheticRoot || d.data.isSpacer) return;
    const parent = (d.parent && placedOf.get(d.parent)) ?? null;
    const add = (data: D3NodeDatum, y: number) => {
      const item: PlacedNode = { x: d.x, y, data, parent, children: [] };
      parent?.children.push(item);
      placed.push(item);
      return item;
    };
    if (d.data.stackItems) {
      let prev: PlacedNode | undefined;
      d.data.stackItems.forEach((data, index) => {
        const item = add(data, d.y + index * STACK_GAP);
        if (prev) {
          item.stackPrev = prev;
          prev.stackNext = item;
        }
        prev = item;
      });
      return;
    }
    placedOf.set(d, add(d.data, d.y));
  });
  return placed;
}

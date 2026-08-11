// eslint-disable-next-line import/no-named-as-default
import Graph from "graphology";
import { bidirectional } from "graphology-shortest-path";
import type { NovelRelationshipsPayload } from "@yemu/protocol/messages";
import type { RelationshipDirection, RelationshipStatus, RelationshipType } from "@yemu/novel-core";

export interface GraphFilters {
  /** null = all factions. */
  factionIds: string[] | null;
  /** null = all relationship types. */
  types: RelationshipType[] | null;
  /** null = all relationship statuses. */
  statuses: RelationshipStatus[] | null;
  /** Include relationships marked non-public (spoiler-protected). */
  showNonPublic: boolean;
}

export const DEFAULT_GRAPH_FILTERS: GraphFilters = {
  factionIds: null,
  types: null,
  statuses: null,
  showNonPublic: false,
};

export interface FactionSummary {
  id: string;
  name: string;
  count: number;
}

export function factionSummaries(snapshot: NovelRelationshipsPayload): FactionSummary[] {
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  for (const node of snapshot.nodes) {
    if (node.factionId) {
      counts.set(node.factionId, (counts.get(node.factionId) ?? 0) + 1);
      names.set(node.factionId, node.factionId);
    }
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, name: names.get(id) ?? id, count }))
    .sort((a, b) => b.count - a.count);
}

export function relationshipTypeCounts(
  snapshot: NovelRelationshipsPayload,
): Array<{ type: RelationshipType; count: number }> {
  const counts = new Map<RelationshipType, number>();
  for (const edge of snapshot.edges) {
    counts.set(edge.type, (counts.get(edge.type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

/** Node/edge data written into the graphology graph for rendering. */
export interface GraphNodeAttributes {
  label: string;
  x: number;
  y: number;
  size: number;
  color: string;
  factionId: string | null;
  status: string;
  role: string;
  aliases: string[];
  hidden: boolean;
}

export interface GraphEdgeAttributes {
  label: string;
  type: RelationshipType;
  direction: RelationshipDirection;
  strength: number;
  color: string;
  size: number;
  hidden: boolean;
  public: boolean;
}

const EDGE_COLORS: Record<RelationshipType, string> = {
  alliance: "#22c55e",
  conflict: "#ef4444",
  kinship: "#f59e0b",
  romance: "#ec4899",
  mentorship: "#a855f7",
  subordinate: "#3b82f6",
  debt: "#14b8a6",
  secret: "#9ca3af",
  other: "#6b7280",
};

export function edgeColor(type: RelationshipType): string {
  return EDGE_COLORS[type];
}

const NODE_ROLE_COLORS: Record<string, string> = {
  protagonist: "#3b82f6",
  supporting: "#22c55e",
  antagonist: "#ef4444",
  other: "#9ca3af",
};

export function nodeColor(role: string): string {
  return NODE_ROLE_COLORS[role] ?? NODE_ROLE_COLORS.other;
}

export function nodeSize(role: string, degree: number): number {
  const base = role === "protagonist" ? 10 : 7;
  const scaled = base + Math.sqrt(degree);
  return Math.min(16, scaled);
}

export function buildGraphology(snapshot: NovelRelationshipsPayload, filters: GraphFilters): Graph {
  const graph = new Graph({ multi: true });
  const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const keptNodeIds = keptNodeIdsFor(snapshot, filters);
  for (const node of snapshot.nodes) {
    graph.addNode(node.id, {
      label: node.name,
      x: 0,
      y: 0,
      size: nodeSize(node.role, 0),
      color: nodeColor(node.role),
      factionId: node.factionId,
      status: node.status,
      role: node.role,
      aliases: node.aliases,
      hidden: !keptNodeIds.has(node.id),
    });
  }
  const degreeById = new Map<string, number>();
  for (const edge of snapshot.edges) {
    if (!edgeVisible(edge, nodesById, filters)) {
      continue;
    }
    degreeById.set(edge.source, (degreeById.get(edge.source) ?? 0) + 1);
    degreeById.set(edge.target, (degreeById.get(edge.target) ?? 0) + 1);
    graph.addEdgeWithKey(edge.id, edge.source, edge.target, {
      label: edge.label ?? edge.type,
      type: edge.type,
      direction: edge.direction,
      strength: edge.strength,
      color: edgeColor(edge.type),
      size: Math.max(1, edge.strength * 0.9),
      hidden: false,
      public: edge.public,
    });
  }
  graph.forEachNode((nodeId: string) => {
    const role = graph.getNodeAttribute(nodeId, "role") as string;
    graph.setNodeAttribute(nodeId, "size", nodeSize(role, degreeById.get(nodeId) ?? 0));
  });
  return graph;
}

function keptNodeIdsFor(snapshot: NovelRelationshipsPayload, filters: GraphFilters): Set<string> {
  const factionIds = filters.factionIds ?? null;
  const kept = new Set<string>();
  for (const node of snapshot.nodes) {
    if (factionIds !== null && node.factionId !== null && !factionIds.includes(node.factionId)) {
      continue;
    }
    kept.add(node.id);
  }
  return kept;
}

function edgeVisible(
  edge: NovelRelationshipsPayload["edges"][number],
  nodesById: Map<string, NovelRelationshipsPayload["nodes"][number]>,
  filters: GraphFilters,
): boolean {
  if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) {
    return false;
  }
  if (filters.types !== null && !filters.types.includes(edge.type)) {
    return false;
  }
  if (filters.statuses !== null && !filters.statuses.includes(edge.status)) {
    return false;
  }
  if (!edge.public && !filters.showNonPublic) {
    return false;
  }
  return true;
}

export function applyLayout(graph: Graph, layout: Map<string, { x: number; y: number }>): void {
  graph.forEachNode((nodeId: string) => {
    const position = layout.get(nodeId);
    if (position) {
      graph.setNodeAttribute(nodeId, "x", position.x);
      graph.setNodeAttribute(nodeId, "y", position.y);
    }
  });
}

export function layoutToRecord(graph: Graph): Record<string, { x: number; y: number }> {
  const record: Record<string, { x: number; y: number }> = {};
  graph.forEachNode((nodeId: string) => {
    record[nodeId] = {
      x: graph.getNodeAttribute(nodeId, "x") as number,
      y: graph.getNodeAttribute(nodeId, "y") as number,
    };
  });
  return record;
}

/** Shortest relationship chain between two characters (node ids), or null. */
export function shortestPathBetween(
  graph: Graph,
  sourceId: string,
  targetId: string,
): string[] | null {
  if (!graph.hasNode(sourceId) || !graph.hasNode(targetId)) {
    return null;
  }
  if (sourceId === targetId) {
    return [sourceId];
  }
  return bidirectional(graph, sourceId, targetId);
}

/** All nodes within maxDistance hops of the given node (inclusive). */
export function neighborsWithin(graph: Graph, nodeId: string, maxDistance: number): string[] {
  const result = new Set<string>();
  let frontier = [nodeId];
  result.add(nodeId);
  for (let distance = 0; distance < maxDistance; distance += 1) {
    const next: string[] = [];
    for (const current of frontier) {
      graph.forEachNeighbor(current, (neighborId: string) => {
        if (!result.has(neighborId)) {
          result.add(neighborId);
          next.push(neighborId);
        }
      });
    }
    frontier = next;
    if (frontier.length === 0) {
      break;
    }
  }
  return [...result];
}

export function graphExtent(graph: Graph): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  graph.forEachNode((nodeId: string) => {
    const x = graph.getNodeAttribute(nodeId, "x") as number;
    const y = graph.getNodeAttribute(nodeId, "y") as number;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });
  if (!Number.isFinite(minX)) {
    return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  }
  return { minX, minY, maxX, maxY };
}

export function visibleNodeIds(graph: Graph): string[] {
  const ids: string[] = [];
  graph.forEachNode((nodeId: string) => {
    if (!graph.getNodeAttribute(nodeId, "hidden")) {
      ids.push(nodeId);
    }
  });
  return ids;
}

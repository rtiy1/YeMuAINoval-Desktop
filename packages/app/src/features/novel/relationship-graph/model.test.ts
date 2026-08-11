import { describe, expect, it } from "vitest";
import type { NovelRelationshipsPayload } from "@yemu/protocol/messages";
import {
  buildGraphology,
  DEFAULT_GRAPH_FILTERS,
  factionSummaries,
  graphExtent,
  neighborsWithin,
  nodeColor,
  relationshipTypeCounts,
  shortestPathBetween,
} from "./model";

function makeSnapshot(
  nodes: Array<{ id: string; name: string; factionId?: string | null }>,
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type?: string;
    public?: boolean;
    strength?: number;
  }>,
): NovelRelationshipsPayload {
  return {
    projectId: "p-1",
    revision: 1,
    nodes: nodes.map((node) => ({
      id: node.id,
      name: node.name,
      aliases: [],
      factionId: node.factionId ?? null,
      status: "active",
      role: "other",
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: (edge.type ?? "alliance") as never,
      label: null,
      direction: "bidirectional",
      strength: edge.strength ?? 3,
      status: "active",
      fromChapter: null,
      toChapter: null,
      public: edge.public ?? true,
      notes: null,
      sourceLabel: "",
      targetLabel: "",
    })),
    issues: [],
  };
}

describe("relationship graph model", () => {
  it("builds a graphology graph with filtered nodes and edges", () => {
    const snapshot = makeSnapshot(
      [
        { id: "a", name: "A", factionId: "f1" },
        { id: "b", name: "B", factionId: "f1" },
        { id: "c", name: "C", factionId: "f2" },
      ],
      [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "a", target: "c" },
      ],
    );
    const graph = buildGraphology(snapshot, DEFAULT_GRAPH_FILTERS);
    expect(graph.order).toBe(3);
    expect(graph.size).toBe(2);
    expect(graph.getNodeAttribute("a", "label")).toBe("A");
  });

  it("filters by faction and relationship type", () => {
    const snapshot = makeSnapshot(
      [
        { id: "a", name: "A", factionId: "f1" },
        { id: "b", name: "B", factionId: "f1" },
        { id: "c", name: "C", factionId: "f2" },
      ],
      [
        { id: "e1", source: "a", target: "b", type: "alliance" },
        { id: "e2", source: "a", target: "c", type: "conflict" },
      ],
    );
    const byFaction = buildGraphology(snapshot, {
      ...DEFAULT_GRAPH_FILTERS,
      factionIds: ["f1"],
    });
    expect(byFaction.order).toBe(3);
    expect(byFaction.getNodeAttribute("c", "hidden")).toBe(true);

    const byType = buildGraphology(snapshot, {
      ...DEFAULT_GRAPH_FILTERS,
      types: ["conflict"],
    });
    expect(byType.size).toBe(1);
  });

  it("hides non-public relationships unless requested", () => {
    const snapshot = makeSnapshot(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      [{ id: "e1", source: "a", target: "b", public: false }],
    );
    const hidden = buildGraphology(snapshot, DEFAULT_GRAPH_FILTERS);
    expect(hidden.size).toBe(0);
    const shown = buildGraphology(snapshot, { ...DEFAULT_GRAPH_FILTERS, showNonPublic: true });
    expect(shown.size).toBe(1);
  });

  it("computes the shortest path between characters", () => {
    const snapshot = makeSnapshot(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
        { id: "c", name: "C" },
        { id: "d", name: "D" },
      ],
      [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
        { id: "e3", source: "c", target: "d" },
      ],
    );
    const graph = buildGraphology(snapshot, DEFAULT_GRAPH_FILTERS);
    expect(shortestPathBetween(graph, "a", "d")).toEqual(["a", "b", "c", "d"]);
    expect(shortestPathBetween(graph, "a", "missing")).toBeNull();
    expect(shortestPathBetween(graph, "a", "a")).toEqual(["a"]);
  });

  it("collects neighbors within a hop distance", () => {
    const snapshot = makeSnapshot(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
        { id: "c", name: "C" },
        { id: "d", name: "D" },
      ],
      [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
        { id: "e3", source: "c", target: "d" },
      ],
    );
    const graph = buildGraphology(snapshot, DEFAULT_GRAPH_FILTERS);
    expect(neighborsWithin(graph, "a", 1)).toEqual(["a", "b"]);
    expect(neighborsWithin(graph, "a", 2).sort()).toEqual(["a", "b", "c"]);
  });

  it("summarizes factions and types", () => {
    const snapshot = makeSnapshot(
      [
        { id: "a", name: "A", factionId: "f1" },
        { id: "b", name: "B", factionId: "f1" },
        { id: "c", name: "C", factionId: "f2" },
      ],
      [
        { id: "e1", source: "a", target: "b", type: "alliance" },
        { id: "e2", source: "a", target: "c", type: "conflict" },
      ],
    );
    const factions = factionSummaries(snapshot);
    expect(factions.find((f) => f.id === "f1")?.count).toBe(2);
    const types = relationshipTypeCounts(snapshot);
    expect(types.find((t) => t.type === "alliance")?.count).toBe(1);
  });

  it("keeps a 500-node / 2000-edge dataset build fast and bounded", () => {
    const nodes = Array.from({ length: 500 }, (_, index) => ({
      id: `char-${index}`,
      name: `人物${index}`,
    }));
    const edges = Array.from({ length: 2000 }, (_, index) => ({
      id: `rel-${index}`,
      source: `char-${index % 500}`,
      target: `char-${(index * 7 + 13) % 500}`,
    }));
    const snapshot = makeSnapshot(nodes, edges);
    const started = performance.now();
    const graph = buildGraphology(snapshot, DEFAULT_GRAPH_FILTERS);
    const elapsed = performance.now() - started;
    expect(graph.order).toBe(500);
    expect(graph.size).toBe(2000);
    expect(elapsed).toBeLessThan(1000);
    const extent = graphExtent(graph);
    expect(extent.maxX >= extent.minX).toBe(true);
  });

  it("colors nodes by role and edges by type", () => {
    expect(nodeColor("protagonist")).toBe("#3b82f6");
    expect(nodeColor("antagonist")).toBe("#ef4444");
    expect(nodeColor("unknown-role")).toBe("#9ca3af");
  });
});

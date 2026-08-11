import { describe, expect, it } from "vitest";
import { buildGraphology, DEFAULT_GRAPH_FILTERS } from "./model";
import { runForceLayoutAsync } from "./force-layout";
import type { NovelRelationshipsPayload } from "@yemu/protocol/messages";

function makeSnapshot(nodeCount: number, edgeCount: number): NovelRelationshipsPayload {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `char-${index}`,
    name: `人物${index}`,
    aliases: [],
    factionId: null,
    status: "active" as const,
    role: "other" as const,
  }));
  const edges = Array.from({ length: edgeCount }, (_, index) => ({
    id: `rel-${index}`,
    source: `char-${index % nodeCount}`,
    target: `char-${(index * 7 + 13) % nodeCount}`,
    type: "alliance" as const,
    label: null,
    direction: "bidirectional" as const,
    strength: 3,
    status: "active" as const,
    fromChapter: null,
    toChapter: null,
    public: true,
    notes: null,
    sourceLabel: "",
    targetLabel: "",
  }));
  return { projectId: "bench", revision: 1, nodes, edges, issues: [] };
}

describe("force layout performance", () => {
  it("lays out a 500-node / 2000-edge graph in bounded time", async () => {
    const snapshot = makeSnapshot(500, 2000);
    const graph = buildGraphology(snapshot, DEFAULT_GRAPH_FILTERS);
    const started = performance.now();
    await runForceLayoutAsync(graph, { iterations: 200 });
    const elapsed = performance.now() - started;
    expect(graph.order).toBe(500);
    expect(elapsed).toBeLessThan(5000);
    let allFinite = true;
    graph.forEachNode((nodeId: string) => {
      const x = graph.getNodeAttribute(nodeId, "x") as number;
      const y = graph.getNodeAttribute(nodeId, "y") as number;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        allFinite = false;
      }
    });
    expect(allFinite).toBe(true);
  }, 15_000);

  it("stops early when cancelled", async () => {
    const snapshot = makeSnapshot(200, 800);
    const graph = buildGraphology(snapshot, DEFAULT_GRAPH_FILTERS);
    let cancelled = false;
    await runForceLayoutAsync(graph, {
      iterations: 400,
      chunkSize: 10,
      shouldCancel: () => {
        cancelled = true;
        return true;
      },
    });
    expect(cancelled).toBe(true);
  });
});

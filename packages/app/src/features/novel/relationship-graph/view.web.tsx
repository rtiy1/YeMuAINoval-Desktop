import { useEffect, useRef } from "react";
// eslint-disable-next-line import/no-named-as-default
import Graph from "graphology";
// eslint-disable-next-line import/no-named-as-default
import Sigma from "sigma";
import { graphExtent } from "./model";

interface RelationshipGraphViewProps {
  graph: Graph;
  selectedNodeId: string | null;
  /** Node ids that stay at full brightness (neighbors or shortest path). */
  highlightedNodeIds: string[] | null;
  onNodeClick: (nodeId: string | null) => void;
  onNodeDragEnd: (nodeId: string, x: number, y: number) => void;
}

export function RelationshipGraphView({
  graph,
  selectedNodeId,
  highlightedNodeIds,
  onNodeClick,
  onNodeDragEnd,
}: RelationshipGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const callbacksRef = useRef({ onNodeClick, onNodeDragEnd });
  callbacksRef.current = { onNodeClick, onNodeDragEnd };
  const highlightedRef = useRef<string[] | null>(highlightedNodeIds);
  highlightedRef.current = highlightedNodeIds;
  const selectedRef = useRef<string | null>(selectedNodeId);
  selectedRef.current = selectedNodeId;

  useEffect(() => {
    if (!containerRef.current) return;
    const sigma = new Sigma(graph, containerRef.current, {
      renderLabels: true,
      labelRenderedSizeThreshold: 6,
      labelFont: "14px sans-serif",
      labelColor: { color: "#9ca3af" },
      nodeReducer: (nodeId) => {
        const hidden = graph.getNodeAttribute(nodeId, "hidden") as boolean;
        const highlighted = highlightedRef.current;
        const dimmed = highlighted !== null && !highlighted.includes(nodeId);
        const selected = selectedRef.current === nodeId;
        let zIndex = 1;
        if (selected) {
          zIndex = 2;
        } else if (dimmed) {
          zIndex = 0;
        }
        const label = hidden ? "" : (graph.getNodeAttribute(nodeId, "label") as string);
        const size = hidden ? 0 : (graph.getNodeAttribute(nodeId, "size") as number);
        return {
          color: dimmed ? "#d1d5db" : (graph.getNodeAttribute(nodeId, "color") as string),
          label,
          size,
          halo: selected,
          zIndex,
        };
      },
      edgeReducer: (edgeId) => {
        const hidden = graph.getEdgeAttribute(edgeId, "hidden") as boolean;
        return {
          color: hidden ? "#ffffff00" : (graph.getEdgeAttribute(edgeId, "color") as string),
          size: hidden ? 0 : (graph.getEdgeAttribute(edgeId, "size") as number),
          type: "line",
        };
      },
    });
    sigmaRef.current = sigma;
    sigma.on("clickNode", (payload) => {
      callbacksRef.current.onNodeClick(payload.node);
    });
    sigma.on("clickStage", () => {
      callbacksRef.current.onNodeClick(null);
    });

    let dragNode: string | null = null;
    sigma.on("downNode", (payload) => {
      payload.preventSigmaDefault();
      dragNode = payload.node;
    });
    sigma.on("moveBody", (payload) => {
      if (!dragNode) return;
      const graphPosition = sigma.viewportToGraph(payload.event);
      graph.setNodeAttribute(dragNode, "x", graphPosition.x);
      graph.setNodeAttribute(dragNode, "y", graphPosition.y);
      sigma.refresh({ skipIndexation: true });
    });
    sigma.on("upNode", () => {
      if (!dragNode) return;
      const nodeId = dragNode;
      dragNode = null;
      callbacksRef.current.onNodeDragEnd(
        nodeId,
        graph.getNodeAttribute(nodeId, "x") as number,
        graph.getNodeAttribute(nodeId, "y") as number,
      );
    });

    fitToGraph(sigma);
    return () => {
      sigma.kill();
      sigmaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma) return;
    sigma.refresh();
  }, [graph]);

  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma) return;
    sigma.refresh();
  }, [highlightedNodeIds, selectedNodeId]);

  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma || !selectedNodeId || !graph.hasNode(selectedNodeId)) return;
    const camera = sigma.getCamera();
    const x = graph.getNodeAttribute(selectedNodeId, "x") as number;
    const y = graph.getNodeAttribute(selectedNodeId, "y") as number;
    camera.animate({ x, y, ratio: Math.min(camera.ratio, 0.9) });
  }, [graph, selectedNodeId]);

  return <div ref={containerRef} style={CONTAINER_STYLE} data-testid="relationship-graph-view" />;
}

function fitToGraph(sigma: Sigma): void {
  const graph = sigma.getGraph();
  if (graph.order === 0) return;
  const { minX, minY, maxX, maxY } = graphExtent(graph);
  const x = (minX + maxX) / 2;
  const y = (minY + maxY) / 2;
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const ratio = Math.min(1, 1200 / Math.max(width, height)) * 0.7;
  const camera = sigma.getCamera();
  camera.setState({ x, y, ratio });
}

const CONTAINER_STYLE: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  position: "relative",
  overflow: "hidden",
};

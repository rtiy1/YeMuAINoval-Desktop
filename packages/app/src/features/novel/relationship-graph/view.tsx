import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import Svg, { Circle, G, Line, Text as SvgText } from "react-native-svg";
// eslint-disable-next-line import/no-named-as-default
import Graph from "graphology";
import { useTranslation } from "react-i18next";

interface RelationshipGraphViewProps {
  graph: Graph;
  selectedNodeId: string | null;
  highlightedNodeIds: string[] | null;
  onNodeClick: (nodeId: string | null) => void;
  onNodeDragEnd: (nodeId: string, x: number, y: number) => void;
}

const VIEWBOX_SIZE = 800;

/**
 * Read-only simplified SVG view for mobile. Characters are laid out radially by
 * graph degree; interactions are limited to tap-to-inspect.
 */
export function RelationshipGraphView({
  graph,
  selectedNodeId,
  highlightedNodeIds,
  onNodeClick,
}: RelationshipGraphViewProps) {
  const { t } = useTranslation();
  const [size, setSize] = useState(400);

  const layout = useMemo(() => {
    const visible = graph.filterNodes(
      (nodeId: string) => !graph.getNodeAttribute(nodeId, "hidden"),
    );
    const count = visible.length;
    const positions = new Map<string, { x: number; y: number }>();
    visible.forEach((nodeId: string, index: number) => {
      const angle = (index / Math.max(count, 1)) * Math.PI * 2;
      const radius = count <= 1 ? 0 : VIEWBOX_SIZE * 0.36;
      positions.set(nodeId, {
        x: VIEWBOX_SIZE / 2 + Math.cos(angle) * radius,
        y: VIEWBOX_SIZE / 2 + Math.sin(angle) * radius,
      });
    });
    return positions;
  }, [graph]);

  const edges = useMemo(
    () =>
      graph.edges().map((edgeId: string) => ({
        id: edgeId,
        source: graph.source(edgeId),
        target: graph.target(edgeId),
        color: graph.getEdgeAttribute(edgeId, "color") as string,
        hidden: graph.getEdgeAttribute(edgeId, "hidden") as boolean,
      })),
    [graph],
  );

  const handlePressNode = useCallback(
    (nodeId: string) => {
      onNodeClick(nodeId);
    },
    [onNodeClick],
  );

  const handleClearSelection = useCallback(() => {
    onNodeClick(null);
  }, [onNodeClick]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setSize(event.nativeEvent.layout.width);
  }, []);

  return (
    <View style={styles.container} onLayout={handleLayout} testID="relationship-graph-native">
      <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}>
        {edges.map((edge) => (
          <EdgeLine key={edge.id} edge={edge} positions={layout} />
        ))}
        {[...layout.entries()].map(([nodeId, position]) => (
          <NodeGlyph
            key={nodeId}
            nodeId={nodeId}
            position={position}
            graph={graph}
            selected={selectedNodeId === nodeId}
            dimmed={highlightedNodeIds !== null && !highlightedNodeIds.includes(nodeId)}
            onPress={handlePressNode}
          />
        ))}
      </Svg>
      <View style={styles.hint}>
        <Text style={styles.hintText}>{t("novel.graph.nativeHint")}</Text>
      </View>
      <Pressable style={styles.reset} onPress={handleClearSelection} testID="graph-native-reset">
        <Text style={styles.resetText}>{t("novel.graph.clearSelection")}</Text>
      </Pressable>
    </View>
  );
}

function EdgeLine({
  edge,
  positions,
}: {
  edge: { id: string; source: string; target: string; color: string; hidden: boolean };
  positions: Map<string, { x: number; y: number }>;
}) {
  const source = positions.get(edge.source);
  const target = positions.get(edge.target);
  if (!source || !target || edge.hidden) {
    return null;
  }
  return (
    <Line
      x1={source.x}
      y1={source.y}
      x2={target.x}
      y2={target.y}
      stroke={edge.color}
      strokeWidth={2}
    />
  );
}

function NodeGlyph({
  nodeId,
  position,
  graph,
  selected,
  dimmed,
  onPress,
}: {
  nodeId: string;
  position: { x: number; y: number };
  graph: Graph;
  selected: boolean;
  dimmed: boolean;
  onPress: (nodeId: string) => void;
}) {
  const radius = Math.max(6, (graph.getNodeAttribute(nodeId, "size") as number) * 1.4);
  const handlePress = useCallback(() => onPress(nodeId), [nodeId, onPress]);
  const fill = dimmed ? "#d1d5db" : (graph.getNodeAttribute(nodeId, "color") as string);
  return (
    <G onPress={handlePress}>
      <Circle
        cx={position.x}
        cy={position.y}
        r={radius + (selected ? 6 : 0)}
        fill={selected ? "#3b82f6" : "transparent"}
      />
      <Circle
        cx={position.x}
        cy={position.y}
        r={radius}
        fill={fill}
        stroke="#ffffff"
        strokeWidth={1}
      />
      <SvgText
        x={position.x}
        y={position.y + radius + 14}
        fontSize={13}
        fill="#9ca3af"
        textAnchor="middle"
      >
        {graph.getNodeAttribute(nodeId, "label") as string}
      </SvgText>
    </G>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[2],
  },
  hint: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  hintText: {
    color: "#ffffff",
    fontSize: 11,
  },
  reset: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  resetText: {
    color: "#ffffff",
    fontSize: 11,
  },
}));

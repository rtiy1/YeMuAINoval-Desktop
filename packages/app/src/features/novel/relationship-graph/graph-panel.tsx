import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useNovelGraphLayout, useNovelMutations, useNovelRelationships } from "../hooks";
import { runForceLayoutAsync } from "./force-layout";
import type { RelationshipType } from "@yemu/novel-core";
import {
  buildGraphology,
  DEFAULT_GRAPH_FILTERS,
  edgeColor,
  factionSummaries,
  layoutToRecord,
  neighborsWithin,
  relationshipTypeCounts,
  shortestPathBetween,
  type FactionSummary,
  type GraphFilters,
} from "./model";
import { RelationshipGraphView } from "./view";

interface RelationshipGraphPanelProps {
  serverId: string;
  projectId: string;
}

type SelectedNodeMode = "none" | "neighbors" | "path";

export function RelationshipGraphPanel({ serverId, projectId }: RelationshipGraphPanelProps) {
  const { t } = useTranslation();
  const { snapshot, isLoading, refetch } = useNovelRelationships(serverId, projectId);
  const { layout: savedLayout } = useNovelGraphLayout(serverId, projectId);
  const mutations = useNovelMutations(serverId, projectId);
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_GRAPH_FILTERS);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [mode, setMode] = useState<SelectedNodeMode>("none");
  const [pathTarget, setPathTarget] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const layoutVersionRef = useRef(0);

  const graph = useMemo(() => {
    if (!snapshot) return null;
    return buildGraphology(snapshot, filters);
  }, [filters, snapshot]);

  const factions = useMemo(() => (snapshot ? factionSummaries(snapshot) : []), [snapshot]);
  const types = useMemo(() => (snapshot ? relationshipTypeCounts(snapshot) : []), [snapshot]);

  const highlightedNodeIds = useMemo(() => {
    if (!graph || mode === "none") return null;
    if (mode === "path") {
      if (!pathTarget || !selectedNodeId) return null;
      return shortestPathBetween(graph, selectedNodeId, pathTarget);
    }
    if (!selectedNodeId) return null;
    return neighborsWithin(graph, selectedNodeId, 2);
  }, [graph, mode, pathTarget, selectedNodeId]);

  const runLayout = useCallback(async () => {
    if (!graph) return;
    setIsLayoutRunning(true);
    layoutVersionRef.current += 1;
    const version = layoutVersionRef.current;
    try {
      await runForceLayoutAsync(graph, {
        iterations: 400,
        shouldCancel: () => version !== layoutVersionRef.current,
      });
      const positions = layoutToRecord(graph);
      mutations.upsertGraphLayout.mutate(positions, { onError: () => undefined });
    } finally {
      if (version === layoutVersionRef.current) {
        setIsLayoutRunning(false);
      }
    }
  }, [graph, mutations]);

  useEffect(() => {
    if (!graph) return;
    const positions = savedLayout;
    if (!positions || Object.keys(positions.nodes).length === 0) {
      void runLayout();
    } else {
      graph.forEachNode((nodeId) => {
        const position = positions.nodes[nodeId];
        if (position) {
          graph.setNodeAttribute(nodeId, "x", position.x);
          graph.setNodeAttribute(nodeId, "y", position.y);
        }
      });
    }
  }, [graph, runLayout, savedLayout]);

  const handleNodeClick = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    setPathTarget(null);
    setMode(nodeId ? "neighbors" : "none");
  }, []);

  const handleNodeDragEnd = useCallback(
    (_nodeId: string, _x: number, _y: number) => {
      if (!graph) return;
      const nodes = layoutToRecord(graph);
      mutations.upsertGraphLayout.mutate(nodes, { onError: () => undefined });
    },
    [graph, mutations],
  );

  const handleRelayout = useCallback(() => {
    void runLayout();
  }, [runLayout]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleSearch = useCallback(() => {
    if (!graph || !searchQuery.trim()) return;
    const query = searchQuery.trim().toLowerCase();
    let match: string | null = null;
    graph.forEachNode((nodeId: string) => {
      if (match) return;
      const label = String(graph.getNodeAttribute(nodeId, "label")).toLowerCase();
      const aliases = graph.getNodeAttribute(nodeId, "aliases") as string[];
      if (label.includes(query) || aliases.some((alias) => alias.toLowerCase().includes(query))) {
        match = nodeId;
      }
    });
    if (match) {
      handleNodeClick(match);
    }
  }, [graph, handleNodeClick, searchQuery]);

  const toggleFaction = useCallback(
    (factionId: string) => {
      setFilters((current) => {
        const currentIds = current.factionIds ?? factions.map((faction) => faction.id);
        const next = currentIds.includes(factionId)
          ? currentIds.filter((id) => id !== factionId)
          : [...currentIds, factionId];
        return { ...current, factionIds: next.length === factions.length ? null : next };
      });
    },
    [factions],
  );

  const toggleType = useCallback(
    (type: RelationshipType) => {
      setFilters((current) => {
        const currentTypes = current.types ?? types.map((entry) => entry.type);
        const next = currentTypes.includes(type)
          ? currentTypes.filter((entry) => entry !== type)
          : [...currentTypes, type];
        const allSelected = next.length === types.length;
        return { ...current, types: allSelected ? null : next };
      });
    },
    [types],
  );

  const selectedNodeInfo = useMemo(() => {
    if (!graph || !selectedNodeId || !graph.hasNode(selectedNodeId)) return null;
    const neighbors = graph.neighbors(selectedNodeId);
    return {
      id: selectedNodeId,
      label: String(graph.getNodeAttribute(selectedNodeId, "label")),
      role: String(graph.getNodeAttribute(selectedNodeId, "role")),
      status: String(graph.getNodeAttribute(selectedNodeId, "status")),
      factionId: graph.getNodeAttribute(selectedNodeId, "factionId") as string | null,
      aliases: graph.getNodeAttribute(selectedNodeId, "aliases") as string[],
      neighbors,
    };
  }, [graph, selectedNodeId]);

  const handleShortestPathClick = useCallback(() => {
    if (!graph || !selectedNodeId) return;
    setMode((current) => (current === "path" ? "neighbors" : "path"));
  }, [graph, selectedNodeId]);

  const handleToggleFaction = useCallback(
    (factionId: string) => toggleFaction(factionId),
    [toggleFaction],
  );

  const handleToggleType = useCallback((type: RelationshipType) => toggleType(type), [toggleType]);

  const handleToggleHidden = useCallback(() => {
    setFilters((current) => ({ ...current, showNonPublic: !current.showNonPublic }));
  }, []);

  if (isLoading && !snapshot) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t("novel.graph.loading")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="relationship-graph-panel">
      <View style={styles.toolbar}>
        <GraphSearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSearch={handleSearch}
        />
        <Button
          variant="outline"
          size="sm"
          onPress={handleRelayout}
          disabled={isLayoutRunning}
          testID="graph-relayout"
        >
          {isLayoutRunning ? t("novel.graph.layoutRunning") : t("novel.graph.relayout")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={handleShortestPathClick}
          disabled={!selectedNodeId}
          testID="graph-path-mode"
        >
          {t(mode === "path" ? "novel.graph.pathModeOn" : "novel.graph.pathMode")}
        </Button>
        <Button variant="outline" size="sm" onPress={handleRefresh} testID="graph-refresh">
          {t("novel.graph.refresh")}
        </Button>
      </View>

      <View style={styles.body}>
        <View style={styles.canvas}>
          {graph ? (
            <RelationshipGraphView
              graph={graph}
              selectedNodeId={selectedNodeId}
              highlightedNodeIds={highlightedNodeIds}
              onNodeClick={handleNodeClick}
              onNodeDragEnd={handleNodeDragEnd}
            />
          ) : (
            <View style={styles.center}>
              <Text style={styles.muted}>{t("novel.graph.noCharacters")}</Text>
            </View>
          )}
          {graph && graph.order === 0 ? (
            <View style={styles.center}>
              <Text style={styles.muted}>{t("novel.graph.noCharacters")}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.side}>
          <ScrollView>
            <Text style={styles.sectionTitle}>{t("novel.graph.factions")}</Text>
            {factions.map((faction) => (
              <FactionFilterRow
                key={faction.id}
                faction={faction}
                enabled={filters.factionIds === null || filters.factionIds.includes(faction.id)}
                onToggle={handleToggleFaction}
              />
            ))}

            <Text style={styles.sectionTitle}>{t("novel.graph.types")}</Text>
            {types.map((entry) => (
              <TypeFilterRow
                key={entry.type}
                entry={entry}
                enabled={filters.types === null || filters.types.includes(entry.type)}
                onToggle={handleToggleType}
              />
            ))}

            <FilterRow
              label={t("novel.graph.showHidden")}
              checked={filters.showNonPublic}
              onToggle={handleToggleHidden}
              testID="graph-filter-hidden"
            />
          </ScrollView>
        </View>
      </View>

      {selectedNodeInfo ? (
        <View style={styles.inspector} testID="graph-inspector">
          <Text style={styles.inspectorTitle}>{selectedNodeInfo.label}</Text>
          <Text style={styles.muted}>
            {selectedNodeInfo.role} · {selectedNodeInfo.status}
            {selectedNodeInfo.factionId ? ` · ${selectedNodeInfo.factionId}` : ""}
          </Text>
          <Text style={styles.muted} numberOfLines={2}>
            {selectedNodeInfo.aliases.length > 0
              ? `${t("novel.graph.aliases")}: ${selectedNodeInfo.aliases.join(", ")}`
              : ""}
          </Text>
          <Text style={styles.muted}>
            {t("novel.graph.neighbors", { count: selectedNodeInfo.neighbors.length })}
          </Text>
        </View>
      ) : null}

      {graph && graph.order > 0 ? <RelationshipLegend types={types} /> : null}
    </View>
  );
}

function GraphSearchInput({
  value,
  onChangeText,
  onSearch,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSearch: () => void;
}) {
  const handleSubmit = useCallback(() => onSearch(), [onSearch]);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onSubmitEditing={handleSubmit}
      placeholder="…"
      style={styles.searchInput}
      testID="graph-search-input"
    />
  );
}

function FactionFilterRow({
  faction,
  enabled,
  onToggle,
}: {
  faction: FactionSummary;
  enabled: boolean;
  onToggle: (factionId: string) => void;
}) {
  const handleToggle = useCallback(() => onToggle(faction.id), [faction.id, onToggle]);
  return (
    <FilterRow
      label={`${faction.name} (${faction.count})`}
      checked={enabled}
      onToggle={handleToggle}
      testID={`graph-filter-faction-${faction.id}`}
    />
  );
}

function TypeFilterRow({
  entry,
  enabled,
  onToggle,
}: {
  entry: { type: RelationshipType; count: number };
  enabled: boolean;
  onToggle: (type: RelationshipType) => void;
}) {
  const { t } = useTranslation();
  const handleToggle = useCallback(() => onToggle(entry.type), [entry.type, onToggle]);
  return (
    <FilterRow
      label={`${t(`novel.graph.type.${entry.type}`)} (${entry.count})`}
      checked={enabled}
      color={edgeColor(entry.type)}
      onToggle={handleToggle}
      testID={`graph-filter-type-${entry.type}`}
    />
  );
}

function FilterRow({
  label,
  checked,
  color,
  onToggle,
  testID,
}: {
  label: string;
  checked: boolean;
  color?: string;
  onToggle: () => void;
  testID: string;
}) {
  return (
    <Pressable style={styles.filterRow} onPress={onToggle} testID={testID}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]} />
      {color ? <View style={[styles.swatch, { backgroundColor: color }]} /> : null}
      <Text style={styles.filterLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function RelationshipLegend({
  types,
}: {
  types: Array<{ type: RelationshipType; count: number }>;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.legend} testID="graph-legend">
      {types.map((entry) => (
        <View key={entry.type} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: edgeColor(entry.type) }]} />
          <Text style={styles.legendLabel}>{t(`novel.graph.type.${entry.type}`)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.foreground,
    fontSize: 13,
    paddingHorizontal: 8,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  body: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
  },
  canvas: {
    flex: 1,
    minWidth: 0,
  },
  side: {
    width: 220,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
    padding: theme.spacing[2],
  },
  sectionTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textTransform: "uppercase",
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: 4,
  },
  checkbox: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  filterLabel: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  inspector: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 2,
  },
  inspectorTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));

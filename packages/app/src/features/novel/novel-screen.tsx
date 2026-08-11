import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import type { NovelEntityKind } from "@yemu/protocol/messages";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/utils/confirm-dialog";
import { NovelScreenHeader } from "./novel-header";
import { ChapterWorkspace } from "./chapter-workspace";
import { RelationshipGraphPanel } from "./relationship-graph/graph-panel";
import { EntityFormSheet, type EntityDraft } from "./entity-form";
import { useNovel, useNovelEntities, useNovelMutations } from "./hooks";
import { SnapshotsSheet } from "./snapshots-panel";

type EntityTab = "characters" | "locations" | "factions";
type MainView = "chapters" | EntityTab | "graph";

const ENTITY_KINDS: readonly EntityTab[] = ["characters", "locations", "factions"];

interface ChapterSelection {
  volume: number;
  chapter: number;
}

export interface NovelScreenProps {
  serverId: string;
  projectId: string;
}

export function NovelScreen({ serverId, projectId }: NovelScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { novel, tree, isLoading } = useNovel(serverId, projectId);
  const mutations = useNovelMutations(serverId, projectId);
  const charactersQuery = useNovelEntities(serverId, projectId, "characters");
  const locationsQuery = useNovelEntities(serverId, projectId, "locations");
  const factionsQuery = useNovelEntities(serverId, projectId, "factions");
  const [mainView, setMainView] = useState<MainView>("chapters");
  const [selection, setSelection] = useState<ChapterSelection | null>(null);
  const [editingEntity, setEditingEntity] = useState<{
    kind: NovelEntityKind;
    draft: EntityDraft | null;
  } | null>(null);
  const [snapshotSheetOpen, setSnapshotSheetOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isCompact = width < 900;

  const openFirstChapter = useCallback(() => {
    const firstVolume = tree?.volumes[0];
    const firstChapter = firstVolume?.chapters[0];
    if (firstChapter) {
      setSelection({ volume: firstVolume.number, chapter: firstChapter.number });
    }
  }, [tree]);

  useEffect(() => {
    if (isLoading) return;
    if (!selection && tree && tree.volumes.length > 0) {
      openFirstChapter();
    }
  }, [isLoading, openFirstChapter, selection, tree]);

  const handleAddVolume = useCallback(() => {
    mutations.addVolume.mutate(undefined, { onSuccess: () => undefined });
  }, [mutations.addVolume]);

  const handleAddChapter = useCallback(() => {
    if (!selection) return;
    const volume = selection.volume;
    mutations.addChapter.mutate(volume, {
      onSuccess: (result) => {
        setSelection({ volume, chapter: result.number });
      },
    });
  }, [mutations.addChapter, selection]);

  const handleEditEntity = useCallback((kind: NovelEntityKind, draft: EntityDraft) => {
    setEditingEntity({ kind, draft });
  }, []);

  const handleRemoveEntity = useCallback(
    (kind: EntityTab, id: string) => {
      void confirmDialog({
        title: t("novel.entities.removeTitle"),
        message: t("novel.entities.removeMessage", { id }),
        confirmLabel: t("novel.entities.remove"),
        cancelLabel: t("common.actions.cancel"),
        destructive: true,
      }).then((confirmed) => {
        if (!confirmed) {
          return;
        }
        mutations.removeEntity.mutate({ kind, id });
        return;
      });
    },
    [mutations.removeEntity, t],
  );

  const entitiesForTab = useMemo(() => {
    switch (mainView) {
      case "characters":
        return charactersQuery.entities ?? [];
      case "locations":
        return locationsQuery.entities ?? [];
      case "factions":
        return factionsQuery.entities ?? [];
      default:
        return [];
    }
  }, [charactersQuery.entities, factionsQuery.entities, locationsQuery.entities, mainView]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/open-project");
    }
  }, [router]);

  const handleOpenSnapshots = useCallback(() => setSnapshotSheetOpen(true), []);

  const mainContent = (() => {
    if (mainView === "graph") {
      return <RelationshipGraphPanel serverId={serverId} projectId={projectId} />;
    }
    if (selection) {
      return (
        <ChapterWorkspace
          key={`${selection.volume}:${selection.chapter}`}
          serverId={serverId}
          projectId={projectId}
          volume={selection.volume}
          chapter={selection.chapter}
        />
      );
    }
    return (
      <View style={styles.emptyMain}>
        <Text style={styles.emptyTitle}>
          {tree && tree.volumes.length > 0
            ? t("novel.empty.selectChapter")
            : t("novel.empty.noVolumes")}
        </Text>
        {isCompact ? (
          <Button
            variant="outline"
            size="sm"
            onPress={openFirstChapter}
            testID="novel-empty-open-first"
          >
            {t("novel.actions.openFirstChapter")}
          </Button>
        ) : null}
      </View>
    );
  })();

  const handleSelectChapter = useCallback((next: ChapterSelection) => {
    setMainView("chapters");
    setSelection(next);
  }, []);
  const handleCloseEditingEntity = useCallback(() => setEditingEntity(null), []);
  const handleCloseSnapshots = useCallback(() => setSnapshotSheetOpen(false), []);

  return (
    <View style={styles.container} testID="novel-screen">
      <NovelScreenHeader
        title={isLoading ? "…" : (novel?.title ?? projectId)}
        subtitle={novel?.projectRootPath ?? ""}
        onBack={handleBack}
        backTestID="novel-back"
      >
        <Button
          variant="outline"
          size="sm"
          onPress={handleAddChapter}
          disabled={!selection}
          testID="novel-add-chapter"
        >
          {t("novel.actions.addChapter")}
        </Button>
        <Button variant="outline" size="sm" onPress={handleAddVolume} testID="novel-add-volume">
          {t("novel.actions.addVolume")}
        </Button>
        <Button variant="outline" size="sm" onPress={handleOpenSnapshots} testID="novel-snapshots">
          {t("novel.actions.snapshots")}
        </Button>
      </NovelScreenHeader>

      <View style={styles.body}>
        {!isCompact ? (
          <NovelSidebar
            tree={tree}
            selection={selection}
            mainView={mainView}
            onSelectChapter={handleSelectChapter}
            onMainViewChange={setMainView}
            entitiesForTab={entitiesForTab}
            onEditEntity={handleEditEntity}
            onRemoveEntity={handleRemoveEntity}
          />
        ) : null}

        <View style={styles.main}>{mainContent}</View>
      </View>

      {editingEntity ? (
        <EntityFormSheet
          serverId={serverId}
          projectId={projectId}
          kind={editingEntity.kind}
          initial={editingEntity.draft}
          visible
          onClose={handleCloseEditingEntity}
          onSaved={handleCloseEditingEntity}
          factions={factionsQuery.entities ?? []}
          characters={charactersQuery.entities ?? []}
        />
      ) : null}

      <SnapshotsSheet
        serverId={serverId}
        projectId={projectId}
        visible={snapshotSheetOpen}
        onClose={handleCloseSnapshots}
      />
    </View>
  );
}

function tabLabel(t: ReturnType<typeof useTranslation>["t"], tab: EntityTab): string {
  switch (tab) {
    case "characters":
      return t("novel.tabs.characters");
    case "locations":
      return t("novel.tabs.locations");
    case "factions":
      return t("novel.tabs.factions");
  }
}

function ChapterTree({
  tree,
  selection,
  onSelect,
  addVolumeMessage,
}: {
  tree: ReturnType<typeof useNovel>["tree"];
  selection: ChapterSelection | null;
  onSelect: (selection: ChapterSelection) => void;
  addVolumeMessage: string;
}) {
  const handleSelect = useCallback((next: ChapterSelection) => onSelect(next), [onSelect]);
  const handleVolumeSelect = useCallback(
    (volume: number, chapter: number) => {
      handleSelect({ volume, chapter });
    },
    [handleSelect],
  );
  return (
    <>
      {tree?.volumes.map((volume) => (
        <View key={volume.dirName}>
          <Text style={styles.volumeLabel}>{volume.dirName}</Text>
          {volume.chapters.map((chapter) => (
            <ChapterRow
              key={chapter.fileName}
              volume={volume.number}
              chapter={chapter}
              isActive={
                selection?.chapter === chapter.number && selection?.volume === volume.number
              }
              onSelect={handleVolumeSelect}
            />
          ))}
        </View>
      ))}
      {tree && tree.volumes.length === 0 ? (
        <Text style={styles.emptyHint}>{addVolumeMessage}</Text>
      ) : null}
    </>
  );
}

function EntityTabButton({
  kind,
  label,
  isActive,
  onPress,
}: {
  kind: EntityTab;
  label: string;
  isActive: boolean;
  onPress: (kind: EntityTab) => void;
}) {
  const handlePress = useCallback(() => onPress(kind), [kind, onPress]);
  return (
    <Pressable
      style={[styles.sidebarTab, isActive && styles.sidebarTabActive]}
      onPress={handlePress}
      testID={`novel-tab-${kind}`}
    >
      <Text style={styles.sidebarTabText}>{label}</Text>
    </Pressable>
  );
}

function EntityRow({
  entity,
  onEdit,
  onRemove,
}: {
  entity: Record<string, unknown>;
  onEdit: (draft: EntityDraft) => void;
  onRemove: (id: string) => void;
}) {
  const id = String(entity.id);
  const handleEdit = useCallback(() => onEdit({ id, data: entity }), [entity, id, onEdit]);
  const handleRemove = useCallback(() => onRemove(id), [id, onRemove]);
  return (
    <Pressable style={styles.entityRow} onPress={handleEdit} testID={`novel-entity-${id}`}>
      <Text style={styles.entityName} numberOfLines={1}>
        {String(entity.name ?? id)}
      </Text>
      <Button variant="ghost" size="sm" onPress={handleRemove} testID={`novel-entity-remove-${id}`}>
        ×
      </Button>
    </Pressable>
  );
}

function ChapterRow({
  volume,
  chapter,
  isActive,
  onSelect,
}: {
  volume: number;
  chapter: { number: number; fileName: string; title: string | null; wordCount: number };
  isActive: boolean;
  onSelect: (volume: number, chapter: number) => void;
}) {
  const handlePress = useCallback(
    () => onSelect(volume, chapter.number),
    [chapter.number, onSelect, volume],
  );
  return (
    <Pressable
      style={[styles.chapterRow, isActive && styles.chapterRowActive]}
      onPress={handlePress}
      testID={`novel-chapter-${chapter.number}`}
    >
      <Text style={styles.chapterName} numberOfLines={1}>
        {chapter.title ?? chapter.fileName}
      </Text>
      <Text style={styles.chapterMeta}>{chapter.wordCount}</Text>
    </Pressable>
  );
}

function NovelSidebar({
  tree,
  selection: activeSelection,
  onSelectChapter,
  mainView,
  onMainViewChange,
  entitiesForTab,
  onEditEntity,
  onRemoveEntity,
}: {
  tree: ReturnType<typeof useNovel>["tree"];
  selection: ChapterSelection | null;
  onSelectChapter: (selection: ChapterSelection) => void;
  mainView: MainView;
  onMainViewChange: (view: MainView) => void;
  entitiesForTab: Array<Record<string, unknown>>;
  onEditEntity: (kind: NovelEntityKind, draft: EntityDraft) => void;
  onRemoveEntity: (kind: EntityTab, id: string) => void;
}) {
  const { t } = useTranslation();
  const entityTab: EntityTab =
    mainView === "characters" || mainView === "locations" || mainView === "factions"
      ? mainView
      : "characters";
  const handleSelectChapter = useCallback(
    (next: ChapterSelection) => onSelectChapter(next),
    [onSelectChapter],
  );
  const handleMainViewChange = useCallback(
    (view: MainView) => onMainViewChange(view),
    [onMainViewChange],
  );
  const handleChaptersTab = useCallback(
    () => handleMainViewChange("chapters"),
    [handleMainViewChange],
  );
  const handleGraphTab = useCallback(() => handleMainViewChange("graph"), [handleMainViewChange]);
  const handleKindTabChange = useCallback(
    (kind: EntityTab) => handleMainViewChange(kind),
    [handleMainViewChange],
  );
  const handleEditEntityForTab = useCallback(
    (draft: EntityDraft) => onEditEntity(entityTab, draft),
    [entityTab, onEditEntity],
  );
  const handleRemoveEntityForTab = useCallback(
    (id: string) => onRemoveEntity(entityTab, id),
    [entityTab, onRemoveEntity],
  );
  const handleNewEntity = useCallback(
    () => onEditEntity(entityTab, { id: "", data: {} }),
    [entityTab, onEditEntity],
  );
  const isEntityTab = mainView !== "chapters" && mainView !== "graph";

  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarTabs}>
        <Pressable
          style={[styles.sidebarTab, mainView === "chapters" && styles.sidebarTabActive]}
          onPress={handleChaptersTab}
          testID="novel-tab-chapters"
        >
          <Text style={styles.sidebarTabText}>{t("novel.tabs.chapters")}</Text>
        </Pressable>
        {ENTITY_KINDS.map((kind) => (
          <EntityTabButton
            key={kind}
            kind={kind}
            label={tabLabel(t, kind)}
            isActive={mainView === kind}
            onPress={handleKindTabChange}
          />
        ))}
        <Pressable
          style={[styles.sidebarTab, mainView === "graph" && styles.sidebarTabActive]}
          onPress={handleGraphTab}
          testID="novel-tab-graph"
        >
          <Text style={styles.sidebarTabText}>{t("novel.tabs.graph")}</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.sidebarList}>
        {isEntityTab ? (
          <>
            {entitiesForTab.map((entity) => (
              <EntityRow
                key={String(entity.id)}
                entity={entity}
                onEdit={handleEditEntityForTab}
                onRemove={handleRemoveEntityForTab}
              />
            ))}
            <Button
              variant="outline"
              size="sm"
              onPress={handleNewEntity}
              style={styles.newEntityButton}
              testID="novel-entity-new"
            >
              {t("novel.actions.newEntity")}
            </Button>
          </>
        ) : (
          <ChapterTree
            tree={tree}
            selection={activeSelection}
            onSelect={handleSelectChapter}
            addVolumeMessage={t("novel.empty.volumes")}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[3],
  },
  headerTitleRow: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  projectPath: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  body: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
  },
  sidebar: {
    width: 260,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  sidebarTabs: {
    flexDirection: "row",
    gap: theme.spacing[1],
    padding: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sidebarTab: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
  sidebarTabActive: {
    backgroundColor: theme.colors.surface3,
  },
  sidebarTabText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  sidebarList: {
    flex: 1,
    padding: theme.spacing[2],
  },
  volumeLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textTransform: "uppercase",
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
  },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing[2],
  },
  chapterRowActive: {
    backgroundColor: theme.colors.surface3,
  },
  chapterName: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  chapterMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  entityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  entityName: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  newEntityButton: {
    marginTop: theme.spacing[3],
  },
  emptyHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    padding: theme.spacing[3],
    textAlign: "center",
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  emptyMain: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  emptyTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));

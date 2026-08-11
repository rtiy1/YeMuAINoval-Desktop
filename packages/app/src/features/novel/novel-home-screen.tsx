import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { BookOpen, Plus } from "lucide-react-native";
import type { NovelDescriptor } from "@yemu/protocol/messages";
import { useHosts } from "@/runtime/host-runtime";
import { Button } from "@/components/ui/button";
import { buildNovelCreateRoute, buildNovelRoute } from "@/utils/host-routes";
import { NovelScreenHeader } from "./novel-header";
import { useNovels } from "./hooks";

export function NovelHomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const hosts = useHosts();
  const serverId = hosts[0]?.serverId ?? null;
  const { novels, isLoading } = useNovels(serverId);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/open-project");
    }
  }, [router]);

  const handleCreate = useCallback(() => {
    router.push(buildNovelCreateRoute() as never);
  }, [router]);

  const handleOpen = useCallback(
    (projectId: string) => {
      router.push(buildNovelRoute(projectId) as never);
    },
    [router],
  );

  return (
    <View style={styles.container} testID="novel-home-screen">
      <NovelScreenHeader
        title={t("novel.home.title")}
        onBack={handleBack}
        backTestID="novel-home-back"
      >
        <Button variant="default" size="sm" onPress={handleCreate} testID="novel-home-create">
          {t("novel.home.create")}
        </Button>
      </NovelScreenHeader>

      <ScrollView style={styles.list}>
        {isLoading && !novels ? <Text style={styles.empty}>{t("novel.home.loading")}</Text> : null}
        {novels?.map((novel) => (
          <NovelRow key={novel.projectId} novel={novel} onOpen={handleOpen} />
        ))}
        {novels && novels.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.empty}>{t("novel.home.empty")}</Text>
            <Button
              variant="outline"
              size="sm"
              onPress={handleCreate}
              testID="novel-home-create-empty"
            >
              <Plus size={14} color="#9ca3af" />
              {t("novel.home.create")}
            </Button>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function NovelRow({
  novel,
  onOpen,
}: {
  novel: NovelDescriptor;
  onOpen: (projectId: string) => void;
}) {
  const handlePress = useCallback(() => onOpen(novel.projectId), [novel.projectId, onOpen]);
  return (
    <Pressable
      style={styles.row}
      onPress={handlePress}
      testID={`novel-home-item-${novel.projectId}`}
    >
      <BookOpen size={18} color="#9ca3af" />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {novel.title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {novel.projectRootPath}
        </Text>
      </View>
      {novel.updatedAt ? (
        <Text style={styles.rowDate} numberOfLines={1}>
          {new Date(novel.updatedAt).toLocaleDateString()}
        </Text>
      ) : null}
    </Pressable>
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
    paddingVertical: theme.spacing[3],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
  },
  list: {
    flex: 1,
    paddingHorizontal: theme.spacing[4],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
    marginBottom: theme.spacing[2],
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  rowMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  rowDate: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  empty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    padding: theme.spacing[4],
  },
  emptyState: {
    alignItems: "center",
    gap: theme.spacing[3],
    paddingTop: theme.spacing[6],
  },
}));

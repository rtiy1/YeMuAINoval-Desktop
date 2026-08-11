import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { NovelSnapshot } from "@yemu/protocol/messages";
import {
  AdaptiveModalSheet,
  AdaptiveTextInput,
  type SheetHeader,
} from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/utils/confirm-dialog";
import { useNovelMutations, useNovelSnapshots } from "./hooks";

interface SnapshotsSheetProps {
  serverId: string;
  projectId: string;
  visible: boolean;
  onClose: () => void;
}

export function SnapshotsSheet({ serverId, projectId, visible, onClose }: SnapshotsSheetProps) {
  const { t } = useTranslation();
  const { snapshots, refetch } = useNovelSnapshots(serverId, projectId);
  const mutations = useNovelMutations(serverId, projectId);
  const [label, setLabel] = useState("");
  const header = useMemo<SheetHeader>(() => ({ title: t("novel.snapshots.title") }), [t]);

  useEffect(() => {
    if (visible) {
      refetch();
    }
  }, [refetch, visible]);

  const handleCreate = useCallback(() => {
    mutations.snapshotCreate.mutate(label.trim() || null, {
      onSuccess: () => {
        setLabel("");
        refetch();
      },
    });
  }, [label, mutations.snapshotCreate, refetch]);

  const handleRestore = useCallback(
    (snapshotId: string) => {
      void confirmDialog({
        title: t("novel.snapshots.restoreTitle"),
        message: t("novel.snapshots.restoreMessage"),
        confirmLabel: t("novel.snapshots.restoreConfirm"),
        cancelLabel: t("common.actions.cancel"),
        destructive: true,
      }).then((confirmed) => {
        if (!confirmed) {
          return;
        }
        mutations.snapshotRestore.mutate(snapshotId, {
          onSuccess: () => refetch(),
        });
        return;
      });
    },
    [mutations.snapshotRestore, refetch, t],
  );

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={onClose}
      testID="snapshots-sheet"
    >
      <View style={styles.createRow}>
        <AdaptiveTextInput
          value={label}
          onChangeText={setLabel}
          placeholder={t("novel.snapshots.labelPlaceholder")}
          style={styles.labelInput}
          testID="snapshot-label-input"
        />
        <Button
          variant="default"
          size="sm"
          onPress={handleCreate}
          disabled={mutations.snapshotCreate.isPending}
          testID="snapshot-create"
        >
          {t("novel.snapshots.create")}
        </Button>
      </View>

      <ScrollView style={styles.list}>
        {(snapshots ?? []).map((snapshot) => (
          <SnapshotRow
            key={snapshot.id}
            snapshot={snapshot}
            isRestoring={mutations.snapshotRestore.isPending}
            onRestore={handleRestore}
          />
        ))}
        {snapshots && snapshots.length === 0 ? (
          <Text style={styles.empty}>{t("novel.snapshots.empty")}</Text>
        ) : null}
      </ScrollView>
    </AdaptiveModalSheet>
  );
}

function SnapshotRow({
  snapshot,
  isRestoring,
  onRestore,
}: {
  snapshot: NovelSnapshot;
  isRestoring: boolean;
  onRestore: (snapshotId: string) => void;
}) {
  const { t } = useTranslation();
  const handleRestore = useCallback(() => onRestore(snapshot.id), [onRestore, snapshot.id]);
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {snapshot.label ?? snapshot.id}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {new Date(snapshot.createdAt).toLocaleString()}
        </Text>
      </View>
      <Button
        variant="outline"
        size="sm"
        onPress={handleRestore}
        disabled={isRestoring}
        testID={`snapshot-restore-${snapshot.id}`}
      >
        {t("novel.snapshots.restore")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  labelInput: {
    flex: 1,
  },
  list: {
    maxHeight: 420,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  rowMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  empty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    padding: theme.spacing[4],
  },
}));

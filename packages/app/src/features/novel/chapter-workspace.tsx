import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { Button } from "@/components/ui/button";
import { ChapterEditor, type ChapterEditorSaveState } from "./chapter-editor";
import { useChapter } from "./hooks";

interface ChapterWorkspaceProps {
  serverId: string;
  projectId: string;
  volume: number;
  chapter: number;
}

const AUTOSAVE_DEBOUNCE_MS = 900;

export function ChapterWorkspace({ serverId, projectId, volume, chapter }: ChapterWorkspaceProps) {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId);
  const { content, wordCount, modifiedAt, refetch } = useChapter(
    serverId,
    projectId,
    volume,
    chapter,
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<ChapterEditorSaveState>("idle");
  const lastSavedRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const draftRef = useRef<string | null>(null);

  useEffect(() => {
    if (content === undefined) return;
    dirtyRef.current = false;
    draftRef.current = null;
    lastSavedRef.current = modifiedAt ?? null;
    setDraft(content);
    setSaveState("idle");
  }, [content, modifiedAt]);

  const doSave = useCallback(
    async (expected: string | null) => {
      if (!client) return;
      const current = draftRef.current;
      if (current === null) return;
      setSaveState("saving");
      try {
        const result = await client.writeNovelChapter(
          projectId,
          volume,
          chapter,
          current,
          expected,
        );
        if (result.result.status === "written") {
          lastSavedRef.current = result.result.modifiedAt;
          dirtyRef.current = false;
          setSaveState("saved");
        } else if (result.result.status === "conflict") {
          setSaveState("conflict");
        } else {
          setSaveState("error");
        }
      } catch (error) {
        console.error("[Novel] chapter autosave failed", error);
        setSaveState("error");
      }
    },
    [chapter, client, projectId, volume],
  );

  useEffect(() => {
    flushRef.current = () => doSave(lastSavedRef.current);
  }, [doSave]);

  const handleEdit = useCallback((next: string) => {
    dirtyRef.current = true;
    draftRef.current = next;
    setDraft(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flushRef.current();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current) {
        void flushRef.current();
      }
    };
  }, []);

  const handleReload = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    dirtyRef.current = false;
    void refetch();
  }, [refetch]);

  const handleOverwrite = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void doSave(null);
  }, [doSave]);

  const visibleContent = draft ?? content;
  const chapterLabel = `chapter-${String(chapter).padStart(3, "0")}`;

  return (
    <View style={styles.container} testID="chapter-workspace">
      <View style={styles.bar}>
        <Text style={styles.title} numberOfLines={1}>
          {chapterLabel}
        </Text>
        <Text style={styles.meta}>
          {wordCount !== undefined ? `${wordCount} ${t("novel.editor.characters")}` : ""}
        </Text>
        <Text style={styles.saveState}>
          {saveState === "saving" ? t("novel.editor.saving") : null}
          {saveState === "saved" ? t("novel.editor.saved") : null}
          {saveState === "error" ? t("novel.editor.saveFailed") : null}
        </Text>
      </View>

      {saveState === "conflict" ? (
        <View style={styles.conflictBanner} testID="chapter-conflict-banner">
          <Text style={styles.conflictText}>{t("novel.editor.conflict")}</Text>
          <Button
            variant="outline"
            size="sm"
            onPress={handleReload}
            testID="chapter-conflict-reload"
          >
            {t("novel.editor.reload")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onPress={handleOverwrite}
            testID="chapter-conflict-overwrite"
          >
            {t("novel.editor.overwrite")}
          </Button>
        </View>
      ) : null}

      <ChapterEditor
        content={visibleContent}
        onEdit={handleEdit}
        accessibilityLabel={`Editor for ${chapterLabel}`}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  meta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  saveState: {
    marginLeft: "auto",
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  conflictBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.palette.amber[500],
  },
  conflictText: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));

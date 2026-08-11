import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useHostRuntimeClient, useHosts } from "@/runtime/host-runtime";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form-field";
import { AdaptiveTextInput } from "@/components/adaptive-modal-sheet";
import { pickDirectory } from "@/desktop/pick-directory";
import { isWeb } from "@/constants/platform";
import { buildNovelRoute } from "@/utils/host-routes";
import { NovelScreenHeader } from "./novel-header";
import { slugifyEntityName } from "./entity-form";

export function NovelCreateScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const hosts = useHosts();
  const serverId = hosts[0]?.serverId ?? null;
  const client = useHostRuntimeClient(serverId ?? "");
  const [title, setTitle] = useState("");
  const [parentPath, setParentPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/open-project");
    }
  }, [router]);

  const handleBrowse = useCallback(async () => {
    try {
      const selected = await pickDirectory();
      if (selected) {
        setParentPath(selected);
      }
    } catch (browseError) {
      setError(browseError instanceof Error ? browseError.message : String(browseError));
    }
  }, []);

  const handleCreate = useCallback(async () => {
    const name = title.trim();
    if (!name) {
      setError(t("novel.create.nameRequired"));
      return;
    }
    if (!parentPath.trim()) {
      setError(t("novel.create.directoryRequired"));
      return;
    }
    if (!client || !serverId) {
      setError(t("novel.create.noHost"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const dirName = slugifyEntityName(name);
      const payload = await client.createProjectDirectory({
        parentPath: parentPath.trim(),
        name: dirName,
      });
      if (payload.error || !payload.project) {
        setError(payload.error ?? t("novel.create.failed"));
        return;
      }
      await client.createNovel(payload.project.projectId, name);
      router.replace(buildNovelRoute(payload.project.projectId) as never);
    } catch (createError) {
      console.error("[NovelCreate] failed", createError);
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setIsSubmitting(false);
    }
  }, [client, parentPath, router, serverId, t, title]);

  return (
    <View style={styles.container} testID="novel-create-screen">
      <NovelScreenHeader
        title={t("novel.create.title")}
        onBack={handleBack}
        backTestID="novel-create-back"
      />
      <View style={styles.body}>
        <Text style={styles.title}>{t("novel.create.title")}</Text>
        <Text style={styles.subtitle}>{t("novel.create.subtitle")}</Text>

        <Field label={t("novel.create.nameLabel")}>
          <AdaptiveTextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t("novel.create.namePlaceholder")}
            testID="novel-create-name"
          />
        </Field>

        <Field
          label={t("novel.create.directoryLabel")}
          hint={isWeb ? undefined : t("novel.create.directoryHint")}
        >
          <View style={styles.directoryRow}>
            <AdaptiveTextInput
              value={parentPath}
              onChangeText={setParentPath}
              placeholder={t("novel.create.directoryPlaceholder")}
              autoCapitalize="none"
              style={styles.directoryInput}
              testID="novel-create-directory"
            />
            {!isWeb ? (
              <Button
                variant="outline"
                size="sm"
                onPress={handleBrowse}
                testID="novel-create-browse"
              >
                {t("novel.create.browse")}
              </Button>
            ) : null}
          </View>
        </Field>

        {error ? (
          <Text style={styles.error} testID="novel-create-error">
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            variant="default"
            size="md"
            onPress={handleCreate}
            disabled={isSubmitting}
            testID="novel-create-submit"
          >
            {isSubmitting ? t("novel.create.creating") : t("novel.create.create")}
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  body: {
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
  },
  subtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing[2],
  },
  directoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  directoryInput: {
    flex: 1,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
}));

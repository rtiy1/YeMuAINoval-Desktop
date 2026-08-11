import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AiCredentialType,
  AiModelProfile,
  AiModelProfileWithCredential,
} from "@yemu/protocol/ai-models/schema";
import { useFetchQuery } from "@/data/query";
import { Button } from "@/components/ui/button";
import { AdaptiveTextInput } from "@/components/adaptive-modal-sheet";
import { useHosts, useHostRuntimeClient } from "@/runtime/host-runtime";
import { SettingsSection } from "@/screens/settings/settings-section";
import { AI_MODELS_QUERY_KEY } from "@/features/ai-models/use-default-ai-model-profile";
import { useTranslation } from "react-i18next";

interface ProfileDraft {
  id: string | null;
  name: string;
  protocol: "anthropic" | "anthropic-compatible";
  baseUrl: string;
  model: string;
  smallFastModel: string;
  apiKey: string;
  authToken: string;
  contextWindow: string;
  maxOutputTokens: string;
  customHeaders: string;
  isDefault: boolean;
  enabled: boolean;
  existingHasCredential: boolean;
}

const EMPTY_DRAFT: ProfileDraft = {
  id: null,
  name: "",
  protocol: "anthropic",
  baseUrl: "",
  model: "",
  smallFastModel: "",
  apiKey: "",
  authToken: "",
  contextWindow: "",
  maxOutputTokens: "",
  customHeaders: "",
  isDefault: false,
  enabled: true,
  existingHasCredential: false,
};

export function AiModelsScreen() {
  const hosts = useHosts();
  const serverId = hosts[0]?.serverId ?? null;
  const client = useHostRuntimeClient(serverId ?? "");
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [editing, setEditing] = useState<ProfileDraft | null>(null);

  const { data: profiles = [] } = useFetchQuery({
    queryKey: AI_MODELS_QUERY_KEY,
    enabled: client !== null,
    dataShape: "list",
    staleTimeMs: 30_000,
    queryFn: async () => {
      const result = await client!.listAiModelProfiles();
      return result.profiles;
    },
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: AI_MODELS_QUERY_KEY });
  }, [queryClient]);

  const removeMutation = useMutation({
    mutationFn: async (profileId: string) => {
      await client!.removeAiModelProfile(profileId);
    },
    onSuccess: refresh,
  });

  const startEditing = useCallback((profile: AiModelProfileWithCredential | null) => {
    if (!profile) {
      setEditing(EMPTY_DRAFT);
      return;
    }
    setEditing({
      id: profile.id,
      name: profile.name,
      protocol: profile.protocol,
      baseUrl: profile.baseUrl ?? "",
      model: profile.model,
      smallFastModel: profile.smallFastModel ?? "",
      apiKey: "",
      authToken: "",
      contextWindow: profile.contextWindow != null ? String(profile.contextWindow) : "",
      maxOutputTokens: profile.maxOutputTokens != null ? String(profile.maxOutputTokens) : "",
      customHeaders: JSON.stringify(profile.customHeaders ?? {}),
      isDefault: profile.isDefault,
      enabled: profile.enabled,
      existingHasCredential: profile.hasCredential,
    });
  }, []);

  const handleEditPress = useCallback(
    (profile: AiModelProfileWithCredential) => startEditing(profile),
    [startEditing],
  );

  const handleDeletePress = useCallback(
    (profileId: string) => removeMutation.mutate(profileId),
    [removeMutation],
  );

  const handleNewProfilePress = useCallback(() => startEditing(null), [startEditing]);

  const handleEditorSaved = useCallback(() => {
    setEditing(null);
    refresh();
  }, [refresh]);

  const handleEditorCancel = useCallback(() => setEditing(null), []);

  const handleEditorChange = useCallback((draft: ProfileDraft) => setEditing(draft), []);

  const profileRows = useMemo(
    () =>
      profiles.map((profile) => (
        <ProfileRow
          key={profile.id}
          profile={profile}
          onEdit={handleEditPress}
          onDelete={handleDeletePress}
          t={t}
        />
      )),
    [handleDeletePress, handleEditPress, profiles, t],
  );

  const newProfileButton = useMemo(
    () => (
      <Button variant="default" size="sm" onPress={handleNewProfilePress}>
        {t("aiModels.newProfile")}
      </Button>
    ),
    [handleNewProfilePress, t],
  );

  if (!client) {
    return (
      <SettingsSection title={t("aiModels.title")}>
        <Text style={styles.muted}>{t("aiModels.unavailable")}</Text>
      </SettingsSection>
    );
  }

  return (
    <View style={styles.container}>
      <SettingsSection title={t("aiModels.title")} trailing={newProfileButton}>
        <Text style={styles.muted}>{t("aiModels.helper")}</Text>
        {profiles.length === 0 ? (
          <Text style={styles.empty}>{t("aiModels.empty")}</Text>
        ) : (
          profileRows
        )}
      </SettingsSection>

      {editing ? (
        <ProfileEditor
          client={client}
          draft={editing}
          onChange={handleEditorChange}
          onCancel={handleEditorCancel}
          onSaved={handleEditorSaved}
          t={t}
        />
      ) : null}
    </View>
  );
}

interface ProfileEditorProps {
  client: NonNullable<ReturnType<typeof useHostRuntimeClient>>;
  draft: ProfileDraft;
  onChange: (draft: ProfileDraft) => void;
  onCancel: () => void;
  onSaved: () => void;
  t: (key: string, params?: Record<string, string>) => string;
}

function ProfileEditor({ client, draft, onChange, onCancel, onSaved, t }: ProfileEditorProps) {
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string | null;
  } | null>(null);

  const update = useCallback(
    (patch: Partial<ProfileDraft>) => onChange({ ...draft, ...patch }),
    [draft, onChange],
  );

  const handleSave = useCallback(async () => {
    if (!draft.name.trim() || !draft.model.trim()) {
      Alert.alert(t("aiModels.form.invalid"), t("aiModels.form.requiredFields"));
      return;
    }
    setSaving(true);
    try {
      const profile: AiModelProfile = {
        id: draft.id ?? `profile_${Date.now()}`,
        name: draft.name.trim(),
        protocol: draft.protocol,
        baseUrl: draft.baseUrl.trim() || null,
        model: draft.model.trim(),
        smallFastModel: draft.smallFastModel.trim() || null,
        contextWindow: parseInt(draft.contextWindow, 10) || null,
        maxOutputTokens: parseInt(draft.maxOutputTokens, 10) || null,
        customHeaders: parseCustomHeaders(draft.customHeaders, t),
        credentialId: draft.id,
        isDefault: draft.isDefault,
        enabled: draft.enabled,
      };
      await client.upsertAiModelProfile(profile);
      const hasNewCredential = Boolean(draft.apiKey.trim() || draft.authToken.trim());
      if (hasNewCredential) {
        const type: AiCredentialType = draft.authToken.trim() ? "auth_token" : "api_key";
        const value = draft.authToken.trim() || draft.apiKey.trim();
        await client.setAiModelCredential(profile.id, type, value);
      }
      onSaved();
    } catch (error) {
      Alert.alert(
        t("aiModels.form.saveFailed"),
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setSaving(false);
    }
  }, [client, draft, onSaved, t]);

  const handleTest = useCallback(async () => {
    const profileId = draft.id;
    if (!profileId) {
      Alert.alert(t("aiModels.form.invalid"), t("aiModels.form.saveBeforeTest"));
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await client.testAiModelProfile(profileId);
      setTestResult({
        ok: result.ok,
        message: result.ok
          ? `${t("aiModels.testResult.ok")} (${result.latencyMs ?? "-"} ms)`
          : (result.message ?? t("aiModels.testResult.failed")),
      });
    } catch (error) {
      setTestResult({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTesting(false);
    }
  }, [client, draft.id, t]);

  const handleCancel = useCallback(() => onCancel(), [onCancel]);

  const handleClearCredential = useCallback(() => {
    if (draft.id) {
      void client.removeAiModelCredential(draft.id);
    }
    update({ existingHasCredential: false, apiKey: "", authToken: "" });
  }, [client, draft.id, update]);

  const handleNameChange = useCallback((value: string) => update({ name: value }), [update]);
  const handleBaseUrlChange = useCallback((value: string) => update({ baseUrl: value }), [update]);
  const handleModelChange = useCallback((value: string) => update({ model: value }), [update]);
  const handleSmallFastChange = useCallback(
    (value: string) => update({ smallFastModel: value }),
    [update],
  );
  const handleCredentialChange = useCallback(
    (value: string) => update(draft.authToken.trim() ? { authToken: value } : { apiKey: value }),
    [draft.authToken, update],
  );
  const handleContextWindowChange = useCallback(
    (value: string) => update({ contextWindow: value }),
    [update],
  );
  const handleMaxOutputChange = useCallback(
    (value: string) => update({ maxOutputTokens: value }),
    [update],
  );
  const handleHeadersChange = useCallback(
    (value: string) => update({ customHeaders: value }),
    [update],
  );
  const handleEnabledChange = useCallback((value: boolean) => update({ enabled: value }), [update]);
  const handleDefaultChange = useCallback(
    (value: boolean) => update({ isDefault: value }),
    [update],
  );
  const handleProtocolSelect = useCallback(
    (protocol: "anthropic" | "anthropic-compatible") => update({ protocol }),
    [update],
  );
  const handleSelectAnthropic = useCallback(
    () => handleProtocolSelect("anthropic"),
    [handleProtocolSelect],
  );
  const handleSelectCompatible = useCallback(
    () => handleProtocolSelect("anthropic-compatible"),
    [handleProtocolSelect],
  );

  const hasCredential = draft.existingHasCredential || Boolean(draft.apiKey || draft.authToken);

  return (
    <SettingsSection title={draft.id ? t("aiModels.form.editTitle") : t("aiModels.form.newTitle")}>
      <Field label={t("aiModels.form.name")}>
        <AdaptiveTextInput
          value={draft.name}
          onChangeText={handleNameChange}
          placeholder="My Anthropic"
          style={styles.input}
        />
      </Field>

      <Field label={t("aiModels.form.protocol")}>
        <View style={styles.segmentedRow}>
          <ProtocolSegment
            label="Anthropic"
            active={draft.protocol === "anthropic"}
            onPress={handleSelectAnthropic}
          />
          <ProtocolSegment
            label="Anthropic Compatible"
            active={draft.protocol === "anthropic-compatible"}
            onPress={handleSelectCompatible}
          />
        </View>
      </Field>

      <Field label={t("aiModels.form.baseUrl")}>
        <AdaptiveTextInput
          value={draft.baseUrl}
          onChangeText={handleBaseUrlChange}
          placeholder="https://api.anthropic.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
        />
      </Field>

      <Field label={t("aiModels.form.model")}>
        <AdaptiveTextInput
          value={draft.model}
          onChangeText={handleModelChange}
          placeholder="claude-sonnet-4-5"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      </Field>

      <Field label={t("aiModels.form.smallFastModel")}>
        <AdaptiveTextInput
          value={draft.smallFastModel}
          onChangeText={handleSmallFastChange}
          placeholder="claude-haiku-4-5"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      </Field>

      <Field label={t("aiModels.form.credential")}>
        <AdaptiveTextInput
          value={draft.authToken.trim() ? draft.authToken : draft.apiKey}
          onChangeText={handleCredentialChange}
          placeholder={
            hasCredential
              ? t("aiModels.form.credentialKeepPlaceholder")
              : t("aiModels.form.credentialPlaceholder")
          }
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        {hasCredential ? (
          <Button variant="secondary" size="sm" onPress={handleClearCredential}>
            {t("aiModels.form.credentialClear")}
          </Button>
        ) : null}
      </Field>

      <Field label={t("aiModels.form.contextWindow")}>
        <AdaptiveTextInput
          value={draft.contextWindow}
          onChangeText={handleContextWindowChange}
          placeholder="200000"
          keyboardType="number-pad"
          style={styles.input}
        />
      </Field>

      <Field label={t("aiModels.form.maxOutputTokens")}>
        <AdaptiveTextInput
          value={draft.maxOutputTokens}
          onChangeText={handleMaxOutputChange}
          placeholder="8192"
          keyboardType="number-pad"
          style={styles.input}
        />
      </Field>

      <Field label={t("aiModels.form.customHeaders")}>
        <AdaptiveTextInput
          value={draft.customHeaders}
          onChangeText={handleHeadersChange}
          placeholder='{"x-api-key-override": "..."}'
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          style={[styles.input, styles.multiline]}
        />
      </Field>

      <Field label={t("aiModels.form.enabled")}>
        <Switch value={draft.enabled} onValueChange={handleEnabledChange} />
      </Field>

      <Field label={t("aiModels.form.isDefault")}>
        <Switch value={draft.isDefault} onValueChange={handleDefaultChange} />
      </Field>

      {testResult ? (
        <Text style={testResult.ok ? styles.testOk : styles.testFail}>{testResult.message}</Text>
      ) : null}

      <View style={styles.editorActions}>
        <Button variant="secondary" onPress={handleCancel} disabled={saving}>
          {t("aiModels.cancel")}
        </Button>
        <Button variant="secondary" onPress={handleTest} disabled={saving || testing || !draft.id}>
          {testing ? t("aiModels.testing") : t("aiModels.test")}
        </Button>
        <Button variant="default" onPress={handleSave} disabled={saving} loading={saving}>
          {t("aiModels.save")}
        </Button>
      </View>
    </SettingsSection>
  );
}

function ProfileRow({
  profile,
  onEdit,
  onDelete,
  t,
}: {
  profile: AiModelProfileWithCredential;
  onEdit: (profile: AiModelProfileWithCredential) => void;
  onDelete: (profileId: string) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const handleEdit = useCallback(() => onEdit(profile), [onEdit, profile]);
  const handleDelete = useCallback(() => onDelete(profile.id), [onDelete, profile.id]);

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle}>{profile.name}</Text>
          {profile.isDefault ? (
            <Text style={styles.defaultBadge}>{t("aiModels.defaultBadge")}</Text>
          ) : null}
          {!profile.enabled ? (
            <Text style={styles.disabledBadge}>{t("aiModels.disabledBadge")}</Text>
          ) : null}
        </View>
        <Text style={styles.rowModel}>{profile.model}</Text>
        <Text style={styles.rowMeta}>
          {profile.hasCredential
            ? `${t("aiModels.credentialSet")} ${profile.maskedKey ?? ""}`
            : t("aiModels.credentialMissing")}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <Button variant="secondary" size="sm" onPress={handleEdit}>
          {t("aiModels.edit")}
        </Button>
        <Button variant="secondary" size="sm" onPress={handleDelete}>
          {t("aiModels.delete")}
        </Button>
      </View>
    </View>
  );
}

function ProtocolSegment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const handlePress = useCallback(() => onPress(), [onPress]);
  return (
    <Pressable style={[styles.segment, active ? styles.segmentActive : null]} onPress={handlePress}>
      <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function parseCustomHeaders(
  raw: string,
  t: (key: string, params?: Record<string, string>) => string,
): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
          key,
          String(value),
        ]),
      );
    }
  } catch {
    Alert.alert(t("aiModels.form.invalid"), t("aiModels.form.customHeadersInvalid"));
  }
  return {};
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[4],
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    lineHeight: theme.lineHeight.diff,
  },
  empty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    lineHeight: theme.lineHeight.diff,
    paddingVertical: theme.spacing[3],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  rowMain: {
    flex: 1,
    gap: theme.spacing[1],
  },
  rowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  rowTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: "600",
  },
  defaultBadge: {
    color: theme.colors.primary,
    fontSize: theme.fontSize.sm,
  },
  disabledBadge: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  rowModel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  rowMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  rowActions: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  field: {
    gap: theme.spacing[1],
  },
  fieldLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  multiline: {
    minHeight: 64,
    textAlignVertical: "top",
  },
  segmentedRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  segment: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  segmentActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  segmentText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  segmentTextActive: {
    color: theme.colors.background,
  },
  editorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  testOk: {
    color: theme.colors.success,
    fontSize: theme.fontSize.sm,
  },
  testFail: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));

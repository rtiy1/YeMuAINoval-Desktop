import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { NovelEntityKind } from "@yemu/protocol/messages";
import {
  AdaptiveModalSheet,
  AdaptiveTextInput,
  type SheetHeader,
} from "@/components/adaptive-modal-sheet";
import { Field } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { useNovelMutations } from "./hooks";

export interface EntityDraft {
  id: string;
  data: Record<string, unknown>;
}

function entityLabel(kind: NovelEntityKind): string {
  switch (kind) {
    case "characters":
      return "character";
    case "locations":
      return "location";
    case "factions":
      return "faction";
    case "items":
      return "item";
  }
}

/** Slug an entity name into a stable id, keeping CJK characters intact. */
export function slugifyEntityName(name: string): string {
  const slug = name
    .trim()
    .replace(/[^\p{L}\p{N}\u3400-\u9FFF_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
  if (!slug) {
    return `entity-${Date.now().toString(36)}`;
  }
  return slug;
}

interface EntityFormSheetProps {
  serverId: string;
  projectId: string;
  kind: NovelEntityKind;
  initial: EntityDraft | null;
  visible: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  factions: Array<Record<string, unknown>>;
  characters: Array<Record<string, unknown>>;
}

export function EntityFormSheet({
  serverId,
  projectId,
  kind,
  initial,
  visible,
  onClose,
  onSaved,
  factions,
  characters: _characters,
}: EntityFormSheetProps) {
  const { upsertEntity } = useNovelMutations(serverId, projectId);
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");
  const [role, setRole] = useState("other");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [faction, setFaction] = useState("");
  const [kindValue, setKindValue] = useState("other");
  const [leader, setLeader] = useState("");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const data = initial?.data ?? {};
    setName(String(data.name ?? ""));
    setAliases(String(data.aliases ?? "").replace(/[[\]",]/g, " "));
    setDescription(String(data.description ?? ""));
    setStatus(String(data.status ?? "active"));
    setNotes(String(data.notes ?? ""));
    setRole(String(data.role ?? "other"));
    setGender(String(data.gender ?? ""));
    setAge(String(data.age ?? ""));
    setFaction(String(data.faction ?? ""));
    setKindValue(String(data.kind ?? "other"));
    setLeader(String(data.leader ?? ""));
    setOwner(String(data.owner ?? ""));
    setError(null);
  }, [initial, visible]);

  const factionOptions = useMemo(
    () =>
      factions.map((entry) => ({
        label: `${String(entry.name)} (${String(entry.id)})`,
        value: String(entry.id),
      })),
    [factions],
  );

  const header = useMemo<SheetHeader>(
    () => ({
      title: initial ? `Edit ${entityLabel(kind)}` : `New ${entityLabel(kind)}`,
    }),
    [initial, kind],
  );

  const handleSave = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    const id = initial?.id ?? slugifyEntityName(trimmed);
    const aliasesList = aliases
      .split(/[,\n]/)
      .map((alias) => alias.trim())
      .filter(Boolean);
    const data: Record<string, unknown> = {
      name: trimmed,
      aliases: aliasesList,
      description: description.trim() || null,
      status,
      notes: notes.trim() || null,
    };
    if (kind === "characters") {
      data.role = role;
      data.gender = gender.trim() || null;
      data.age = age.trim() || null;
      data.faction = faction.trim() || null;
      data.tags = [];
    } else if (kind === "locations") {
      data.kind = kindValue;
      data.faction = faction.trim() || null;
    } else if (kind === "factions") {
      data.leader = leader.trim() || null;
      data.members = [];
    } else if (kind === "items") {
      data.owner = owner.trim() || null;
    }
    setError(null);
    upsertEntity.mutate(
      { kind, id, data },
      {
        onSuccess: () => {
          onSaved(id);
        },
        onError: (saveError) => {
          setError(saveError instanceof Error ? saveError.message : String(saveError));
        },
      },
    );
  }, [
    age,
    aliases,
    description,
    faction,
    gender,
    initial,
    kind,
    kindValue,
    leader,
    name,
    notes,
    onSaved,
    owner,
    role,
    status,
    upsertEntity,
  ]);

  const isSaving = upsertEntity.isPending;

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={onClose}
      testID="entity-form-sheet"
      desktopMaxWidth={560}
    >
      <ScrollView style={styles.scroll}>
        <Field label="Name">
          <AdaptiveTextInput
            value={name}
            onChangeText={setName}
            placeholder="林晚"
            autoCapitalize="none"
            testID="entity-form-name"
          />
        </Field>

        <Field label="Aliases" hint="Comma separated">
          <AdaptiveTextInput
            value={aliases}
            onChangeText={setAliases}
            placeholder="阿晚, 晚儿"
            testID="entity-form-aliases"
          />
        </Field>

        {kind === "characters" ? (
          <Field label="Role">
            <AdaptiveTextInput
              value={role}
              onChangeText={setRole}
              placeholder="protagonist / supporting / antagonist / other"
              testID="entity-form-role"
            />
          </Field>
        ) : null}

        {kind === "characters" ? (
          <Field label="Gender">
            <AdaptiveTextInput
              value={gender}
              onChangeText={setGender}
              testID="entity-form-gender"
            />
          </Field>
        ) : null}

        {kind === "characters" ? (
          <Field label="Age">
            <AdaptiveTextInput value={age} onChangeText={setAge} testID="entity-form-age" />
          </Field>
        ) : null}

        {kind === "locations" ? (
          <Field label="Kind">
            <AdaptiveTextInput
              value={kindValue}
              onChangeText={setKindValue}
              placeholder="city / region / building / world / other"
              testID="entity-form-kind"
            />
          </Field>
        ) : null}

        {kind === "characters" || kind === "locations" ? (
          <Field label="Faction (id)">
            <AdaptiveTextInput
              value={faction}
              onChangeText={setFaction}
              placeholder={factionOptions.length > 0 ? factionOptions[0].label : "faction id"}
              autoCapitalize="none"
              testID="entity-form-faction"
            />
          </Field>
        ) : null}

        {kind === "factions" ? (
          <Field label="Leader (character id)">
            <AdaptiveTextInput
              value={leader}
              onChangeText={setLeader}
              placeholder="lin-wan"
              autoCapitalize="none"
              testID="entity-form-leader"
            />
          </Field>
        ) : null}

        {kind === "items" ? (
          <Field label="Owner (character id)">
            <AdaptiveTextInput
              value={owner}
              onChangeText={setOwner}
              placeholder="lin-wan"
              autoCapitalize="none"
              testID="entity-form-owner"
            />
          </Field>
        ) : null}

        <Field label="Status">
          <AdaptiveTextInput
            value={status}
            onChangeText={setStatus}
            placeholder="active"
            autoCapitalize="none"
            testID="entity-form-status"
          />
        </Field>

        <Field label="Description">
          <AdaptiveTextInput
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            testID="entity-form-description"
          />
        </Field>

        <Field label="Notes">
          <AdaptiveTextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            testID="entity-form-notes"
          />
        </Field>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.actions}>
        <Button
          variant="ghost"
          size="sm"
          onPress={onClose}
          disabled={isSaving}
          testID="entity-form-cancel"
        >
          Cancel
        </Button>
        <Button
          variant="default"
          size="sm"
          onPress={handleSave}
          disabled={isSaving}
          testID="entity-form-save"
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  scroll: {
    maxHeight: 420,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    paddingTop: theme.spacing[3],
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    paddingTop: theme.spacing[2],
  },
}));

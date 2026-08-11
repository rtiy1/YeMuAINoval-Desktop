import { useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type EditorTargetId = string;

const PREFERRED_EDITOR_STORAGE_KEY = "@yemu:preferred-editor";
const PREFERRED_EDITOR_QUERY_KEY = ["preferred-editor"];

async function loadPreferredEditor(): Promise<EditorTargetId | null> {
  // COMPAT(preferredEditorKey): legacy key read back once, remove after 2026-11-30.
  const stored =
    (await AsyncStorage.getItem(PREFERRED_EDITOR_STORAGE_KEY)) ??
    (await AsyncStorage.getItem("@paseo:preferred-editor"));
  if (!stored) {
    return null;
  }
  return stored.trim() || null;
}

export function resolvePreferredEditorId(
  availableEditorIds: readonly EditorTargetId[],
  storedEditorId: EditorTargetId | null | undefined,
): EditorTargetId | null {
  if (storedEditorId === undefined) {
    return null;
  }
  if (
    storedEditorId &&
    availableEditorIds.some((availableEditorId) => availableEditorId === storedEditorId)
  ) {
    return storedEditorId;
  }
  return availableEditorIds[0] ?? null;
}

export function usePreferredEditor() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: PREFERRED_EDITOR_QUERY_KEY,
    queryFn: loadPreferredEditor,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const updatePreferredEditor = useCallback(
    async (editorId: EditorTargetId | null) => {
      queryClient.setQueryData(PREFERRED_EDITOR_QUERY_KEY, editorId);
      if (editorId) {
        await AsyncStorage.setItem(PREFERRED_EDITOR_STORAGE_KEY, editorId);
        return;
      }
      await AsyncStorage.removeItem(PREFERRED_EDITOR_STORAGE_KEY);
    },
    [queryClient],
  );

  return {
    preferredEditorId: isPending ? undefined : (data ?? null),
    isLoading: isPending,
    updatePreferredEditor,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type ChapterEditorSaveState = "idle" | "saving" | "saved" | "conflict" | "error";

interface ChapterEditorProps {
  /** External content snapshot; the editor adopts it when it changes identity. */
  content: string | undefined;
  onEdit: (content: string) => void;
  disabled?: boolean;
  accessibilityLabel: string;
}

const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * Native chapter editor. A plain multiline input with debounced autosave;
 * the web platform uses the CodeMirror implementation in chapter-editor.web.tsx.
 */
export function ChapterEditor({
  content,
  onEdit,
  disabled,
  accessibilityLabel,
}: ChapterEditorProps) {
  const [value, setValue] = useState(content ?? "");
  const lastAdopted = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (content === undefined) return;
    if (content === lastAdopted.current) return;
    lastAdopted.current = content;
    setValue(content);
  }, [content]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChangeText = useCallback(
    (next: string) => {
      setValue(next);
      lastAdopted.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onEdit(next), AUTOSAVE_DEBOUNCE_MS);
    },
    [onEdit],
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={handleChangeText}
        multiline
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={accessibilityLabel}
        testID="chapter-editor-native"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  input: {
    flex: 1,
    textAlignVertical: "top",
    padding: 12,
    fontSize: 16,
    lineHeight: 24,
  },
});

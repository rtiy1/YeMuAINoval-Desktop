import { useEffect, useMemo, useRef } from "react";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { UnistylesRuntime } from "react-native-unistyles";
import {
  editorBaseExtensions,
  editorTheme,
  type EditorVisualTheme,
} from "@/file-pane/editor/extensions.web";

export type ChapterEditorSaveState = "idle" | "saving" | "saved" | "conflict" | "error";

interface ChapterEditorProps {
  /** External content snapshot; the editor adopts it when it changes identity. */
  content: string | undefined;
  onEdit: (content: string) => void;
  disabled?: boolean;
  accessibilityLabel: string;
}

/**
 * Desktop/web chapter editor backed by CodeMirror. Autosave is debounced by
 * the parent; this view only reports document edits.
 */
export function ChapterEditor({
  content,
  onEdit,
  disabled,
  accessibilityLabel,
}: ChapterEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const initialContent = useRef(content ?? "");

  const theme = useMemo<EditorVisualTheme>(() => {
    const themeColors = UnistylesRuntime.getTheme();
    return {
      colorScheme: themeColors.colorScheme,
      background: themeColors.colors.surface0,
      foreground: themeColors.colors.foreground,
      cursor: themeColors.colors.terminal.cursor,
      foregroundMuted: themeColors.colors.foregroundMuted,
      border: themeColors.colors.border,
      selection: themeColors.colors.terminal.selectionBackground,
      monoFont: themeColors.fontFamily.mono,
      codeFontSize: themeColors.fontSize.code,
      syntax: themeColors.colors.syntax,
    };
  }, []);

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialContent.current,
        extensions: [
          ...editorBaseExtensions(() => undefined),
          EditorView.lineWrapping,
          editorTheme(theme),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((tr) => tr.annotation(remoteUpdate))
            ) {
              onEditRef.current(update.state.doc.toString());
            }
          }),
          readOnlyCompartment.of(EditorState.readOnly.of(Boolean(disabled))),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(Boolean(disabled))),
    });
  }, [disabled]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || content === undefined) return;
    const document = view.state.toText(content);
    if (view.state.doc.eq(document)) return;
    const head = Math.min(view.state.selection.main.head, document.length);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: document },
      selection: { anchor: head },
      annotations: [remoteUpdate.of(true)],
    });
  }, [content]);

  return (
    <div
      ref={hostRef}
      data-pmono=""
      data-testid="chapter-editor"
      aria-label={accessibilityLabel}
      style={HOST_STYLE}
    />
  );
}

const remoteUpdate = Annotation.define<boolean>();
const readOnlyCompartment = new Compartment();
const HOST_STYLE = { flex: 1, minHeight: 0, overflow: "hidden" } as const;

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GraphLayout, NovelMetadata } from "@yemu/novel-core";
import type {
  NovelDescriptor,
  NovelEntityKind,
  NovelRelationshipsPayload,
  NovelSnapshot,
  NovelTree,
} from "@yemu/protocol/messages";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient } from "@/runtime/host-runtime";

export const NOVELS_QUERY_KEY = ["novels"] as const;

function novelQueryKey(serverId: string, projectId: string) {
  return ["novels", serverId, projectId] as const;
}

function chapterQueryKey(serverId: string, projectId: string, volume: number, chapter: number) {
  return ["novels", serverId, projectId, "chapter", volume, chapter] as const;
}

function entitiesQueryKey(serverId: string, projectId: string, kind: NovelEntityKind) {
  return ["novels", serverId, projectId, "entities", kind] as const;
}

function snapshotsQueryKey(serverId: string, projectId: string) {
  return ["novels", serverId, projectId, "snapshots"] as const;
}

function relationshipsQueryKey(serverId: string, projectId: string) {
  return ["novels", serverId, projectId, "relationships"] as const;
}

export function useNovels(serverId: string | null): {
  novels: NovelDescriptor[] | undefined;
  isLoading: boolean;
  refetch: () => void;
} {
  const client = useHostRuntimeClient(serverId ?? "");
  const query = useFetchQuery({
    queryKey: NOVELS_QUERY_KEY,
    enabled: client !== null && serverId !== null,
    dataShape: "list",
    staleTimeMs: 15_000,
    queryFn: async () => (await client!.listNovels()).novels,
  });
  return {
    novels: query.data,
    isLoading: query.isLoading,
    refetch: () => void query.refetch(),
  };
}

export function useNovel(
  serverId: string | null,
  projectId: string | null,
): {
  novel: NovelDescriptor | undefined;
  metadata: NovelMetadata | undefined;
  tree: NovelTree | undefined;
  isLoading: boolean;
  refetch: () => void;
} {
  const client = useHostRuntimeClient(serverId ?? "");
  const query = useFetchQuery({
    queryKey: novelQueryKey(serverId ?? "", projectId ?? ""),
    enabled: client !== null && serverId !== null && projectId !== null,
    dataShape: "value",
    staleTimeMs: 15_000,
    queryFn: async () => {
      const result = await client!.getNovel(projectId!);
      return { novel: result.novel, metadata: result.metadata, tree: result.tree };
    },
  });
  return {
    novel: query.data?.novel,
    metadata: query.data?.metadata,
    tree: query.data?.tree,
    isLoading: query.isLoading,
    refetch: () => void query.refetch(),
  };
}

export function useChapter(
  serverId: string | null,
  projectId: string | null,
  volume: number | null,
  chapter: number | null,
): {
  content: string | undefined;
  title: string | null | undefined;
  wordCount: number | undefined;
  modifiedAt: string | null | undefined;
  isLoading: boolean;
  refetch: () => void;
} {
  const client = useHostRuntimeClient(serverId ?? "");
  const query = useFetchQuery({
    queryKey: chapterQueryKey(serverId ?? "", projectId ?? "", volume ?? 0, chapter ?? 0),
    enabled:
      client !== null &&
      serverId !== null &&
      projectId !== null &&
      volume !== null &&
      chapter !== null,
    dataShape: "value",
    staleTimeMs: 5_000,
    queryFn: async () => {
      const result = await client!.readNovelChapter(projectId!, volume!, chapter!);
      return result;
    },
  });
  return {
    content: query.data?.content,
    title: query.data?.title,
    wordCount: query.data?.wordCount,
    modifiedAt: query.data?.modifiedAt ?? null,
    isLoading: query.isLoading,
    refetch: () => void query.refetch(),
  };
}

export function useNovelEntities(
  serverId: string | null,
  projectId: string | null,
  kind: NovelEntityKind | null,
): {
  entities: Array<Record<string, unknown>> | undefined;
  issues:
    | Array<{
        file: string;
        location: string | null;
        message: string;
        severity: "error" | "warning";
      }>
    | undefined;
  isLoading: boolean;
  refetch: () => void;
} {
  const client = useHostRuntimeClient(serverId ?? "");
  const query = useFetchQuery({
    queryKey: entitiesQueryKey(serverId ?? "", projectId ?? "", kind ?? "characters"),
    enabled: client !== null && serverId !== null && projectId !== null && kind !== null,
    dataShape: "list",
    staleTimeMs: 15_000,
    queryFn: async () => {
      const result = await client!.listNovelEntities(projectId!, kind!);
      return { entities: result.entities, issues: result.issues };
    },
  });
  return {
    entities: query.data?.entities,
    issues: query.data?.issues,
    isLoading: query.isLoading,
    refetch: () => void query.refetch(),
  };
}

export function useNovelSnapshots(
  serverId: string | null,
  projectId: string | null,
): {
  snapshots: NovelSnapshot[] | undefined;
  isLoading: boolean;
  refetch: () => void;
} {
  const client = useHostRuntimeClient(serverId ?? "");
  const query = useFetchQuery({
    queryKey: snapshotsQueryKey(serverId ?? "", projectId ?? ""),
    enabled: client !== null && serverId !== null && projectId !== null,
    dataShape: "list",
    staleTimeMs: 15_000,
    queryFn: async () => (await client!.listNovelSnapshots(projectId!)).snapshots,
  });
  return {
    snapshots: query.data,
    isLoading: query.isLoading,
    refetch: () => void query.refetch(),
  };
}

export function useNovelRelationships(
  serverId: string | null,
  projectId: string | null,
): {
  snapshot: NovelRelationshipsPayload | undefined;
  isLoading: boolean;
  refetch: () => void;
} {
  const client = useHostRuntimeClient(serverId ?? "");
  const query = useFetchQuery({
    queryKey: relationshipsQueryKey(serverId ?? "", projectId ?? ""),
    enabled: client !== null && serverId !== null && projectId !== null,
    dataShape: "value",
    staleTimeMs: 15_000,
    queryFn: async () => (await client!.getNovelRelationships(projectId!)).snapshot,
  });
  return {
    snapshot: query.data,
    isLoading: query.isLoading,
    refetch: () => void query.refetch(),
  };
}

export function useNovelGraphLayout(
  serverId: string | null,
  projectId: string | null,
): {
  layout: GraphLayout | null | undefined;
  isLoading: boolean;
  refetch: () => void;
} {
  const client = useHostRuntimeClient(serverId ?? "");
  const query = useFetchQuery({
    queryKey: ["novels", serverId ?? "", projectId ?? "", "graph-layout"],
    enabled: client !== null && serverId !== null && projectId !== null,
    dataShape: "value",
    staleTimeMs: 30_000,
    queryFn: async () => (await client!.getNovelGraphLayout(projectId!)).layout,
  });
  return {
    layout: query.data,
    isLoading: query.isLoading,
    refetch: () => void query.refetch(),
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useNovelMutations(serverId: string | null, projectId: string | null) {
  const client = useHostRuntimeClient(serverId ?? "");
  const queryClient = useQueryClient();
  const invalidateNovel = () => {
    if (!projectId) return;
    void queryClient.invalidateQueries({ queryKey: novelQueryKey(serverId ?? "", projectId) });
    void queryClient.invalidateQueries({ queryKey: NOVELS_QUERY_KEY });
  };

  const addVolume = useMutation({
    mutationFn: async () => {
      if (!client || !projectId) throw new Error("No host connection");
      return client.addNovelVolume(projectId);
    },
    onSuccess: invalidateNovel,
  });

  const addChapter = useMutation({
    mutationFn: async (volume: number) => {
      if (!client || !projectId) throw new Error("No host connection");
      return client.addNovelChapter(projectId, volume);
    },
    onSuccess: invalidateNovel,
  });

  const upsertEntity = useMutation({
    mutationFn: async (input: {
      kind: NovelEntityKind;
      id: string;
      data: Record<string, unknown>;
    }) => {
      if (!client || !projectId) throw new Error("No host connection");
      return client.upsertNovelEntity(projectId, input.kind, input.id, input.data);
    },
    onSuccess: (_result, input) => {
      invalidateNovel();
      void queryClient.invalidateQueries({
        queryKey: entitiesQueryKey(serverId ?? "", projectId ?? "", input.kind),
      });
    },
  });

  const removeEntity = useMutation({
    mutationFn: async (input: { kind: NovelEntityKind; id: string }) => {
      if (!client || !projectId) throw new Error("No host connection");
      return client.removeNovelEntity(projectId, input.kind, input.id);
    },
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({
        queryKey: entitiesQueryKey(serverId ?? "", projectId ?? "", input.kind),
      });
      invalidateNovel();
    },
  });

  const updateMetadata = useMutation({
    mutationFn: async (metadata: NovelMetadata) => {
      if (!client || !projectId) throw new Error("No host connection");
      return client.updateNovelMetadata(projectId, metadata);
    },
    onSuccess: invalidateNovel,
  });

  const snapshotCreate = useMutation({
    mutationFn: async (label: string | null) => {
      if (!client || !projectId) throw new Error("No host connection");
      return client.createNovelSnapshot(projectId, label);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: snapshotsQueryKey(serverId ?? "", projectId ?? ""),
      });
    },
  });

  const snapshotRestore = useMutation({
    mutationFn: async (snapshotId: string) => {
      if (!client || !projectId) throw new Error("No host connection");
      return client.restoreNovelSnapshot(projectId, snapshotId);
    },
    onSuccess: () => {
      invalidateNovel();
      void queryClient.invalidateQueries({
        queryKey: snapshotsQueryKey(serverId ?? "", projectId ?? ""),
      });
    },
  });

  const upsertGraphLayout = useMutation({
    mutationFn: async (positions: Record<string, { x: number; y: number }>) => {
      if (!client || !projectId) throw new Error("No host connection");
      return client.setNovelGraphLayout(projectId, {
        nodes: positions,
        revision: Date.now(),
      });
    },
  });

  return {
    addVolume,
    addChapter,
    upsertEntity,
    removeEntity,
    updateMetadata,
    snapshotCreate,
    snapshotRestore,
    upsertGraphLayout,
  };
}

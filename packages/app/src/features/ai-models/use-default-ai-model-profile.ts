import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useHosts } from "@/runtime/host-runtime";

export const AI_MODELS_QUERY_KEY = ["ai-models"] as const;

export function useDefaultAiModelProfile(): {
  profileId: string | null;
  profileName: string | null;
  loading: boolean;
} {
  const hosts = useHosts();
  const serverId = hosts[0]?.serverId ?? null;
  const client = useHostRuntimeClient(serverId ?? "");

  const { data, isLoading } = useFetchQuery({
    queryKey: AI_MODELS_QUERY_KEY,
    enabled: client !== null,
    dataShape: "list",
    staleTimeMs: 30_000,
    queryFn: async () => {
      const result = await client!.listAiModelProfiles();
      return result.profiles;
    },
  });

  const defaultProfile =
    data?.find(
      (candidate) => candidate.isDefault && candidate.enabled && candidate.hasCredential,
    ) ??
    data?.find((candidate) => candidate.enabled && candidate.hasCredential) ??
    null;

  return {
    profileId: defaultProfile?.id ?? null,
    profileName: defaultProfile?.name ?? null,
    loading: isLoading,
  };
}

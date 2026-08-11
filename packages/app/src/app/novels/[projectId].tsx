import { useLocalSearchParams } from "expo-router";
import { useHosts } from "@/runtime/host-runtime";
import { NovelScreen } from "@/features/novel/novel-screen";

export default function NovelDetailRoute() {
  const params = useLocalSearchParams<{ projectId: string | string[] }>();
  const hosts = useHosts();
  const serverId = hosts[0]?.serverId ?? null;
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;

  if (!serverId || !projectId) {
    return null;
  }
  return <NovelScreen serverId={serverId} projectId={projectId} />;
}

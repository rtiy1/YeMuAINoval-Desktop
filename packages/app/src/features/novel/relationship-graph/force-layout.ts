// eslint-disable-next-line import/no-named-as-default
import Graph from "graphology";
// eslint-disable-next-line import/no-named-as-default
import forceAtlas2 from "graphology-layout-forceatlas2";

export interface ForceLayoutOptions {
  iterations?: number;
  chunkSize?: number;
  onProgress?: (fraction: number) => void;
  shouldCancel?: () => boolean;
}

const yieldToEventLoop = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * Run ForceAtlas2 in small chunks, yielding to the event loop between chunks
 * so chapter editing stays responsive while the layout converges.
 */
export async function runForceLayoutAsync(
  graph: Graph,
  options: ForceLayoutOptions = {},
): Promise<void> {
  const iterations = options.iterations ?? 400;
  const chunkSize = options.chunkSize ?? 40;
  const onProgress = options.onProgress ?? (() => undefined);
  const shouldCancel = options.shouldCancel ?? (() => false);

  const settings = forceAtlas2.inferSettings(graph);
  const chunks = Math.max(1, Math.ceil(iterations / chunkSize));
  for (let chunk = 0; chunk < chunks; chunk += 1) {
    if (shouldCancel()) {
      return;
    }
    const remaining = Math.min(chunkSize, iterations - chunk * chunkSize);
    forceAtlas2.assign(graph, {
      iterations: remaining,
      settings,
    });
    onProgress((chunk + 1) / chunks);
    await yieldToEventLoop();
  }
}

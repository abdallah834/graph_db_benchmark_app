import { Injectable, Logger } from '@nestjs/common';
import { GraphDriver } from '../../drivers/graph-driver.interface';
import { DatasetLoaderService } from '../../dataset/dataset-loader.service';

@Injectable()
export class TraversalWorkload {
  private readonly logger = new Logger(TraversalWorkload.name);

  constructor(private readonly datasetLoader: DatasetLoaderService) {}

  /** Runs 1, 2, and 3-hop traversals for `iterations` random start nodes each,
   * and returns the flattened latency array (used for both warm-up and measurement).
   *
   * A single sample can occasionally hit an expensive high-degree "hub" node
   * whose traversal times out or gets killed server-side - that's a real,
   * worth-reporting data point about the platform/dataset combination, not a
   * reason to lose every other sample in the run. Failed samples are logged
   * and skipped rather than aborting the whole workload. */
  async runAllHopDepths(
    driver: GraphDriver,
    iterations: number,
  ): Promise<number[]> {
    const startNodeIds =
      await this.datasetLoader.sampleRandomNodeIds(iterations);
    const timings: number[] = [];
    let failureCount = 0;

    for (const hops of [1, 2, 3] as const) {
      for (const nodeId of startNodeIds) {
        try {
          const { durationMs } = await driver.traverse(nodeId, hops);
          timings.push(durationMs);
        } catch (error) {
          failureCount++;
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `[${driver.platformName}] traverse(${nodeId}, ${hops} hops) failed, skipping: ${message}`,
          );
        }
      }
    }

    if (failureCount > 0) {
      this.logger.warn(
        `[${driver.platformName}] ${failureCount}/${iterations * 3} traversal samples failed and were excluded from p50/p95 - note this in your README's caveats.`,
      );
    }

    return timings;
  }
}

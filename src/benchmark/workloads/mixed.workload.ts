import { Injectable } from '@nestjs/common';
import { GraphDriver } from '../../drivers/graph-driver.interface';
import { DatasetLoaderService } from '../../dataset/dataset-loader.service';

// 80/20 read/write mix is a reasonable default; state this explicitly in the README.
const READ_WRITE_RATIO = 0.8;

@Injectable()
export class MixedWorkload {
  constructor(private readonly datasetLoader: DatasetLoaderService) {}

  /** Fires `concurrency` clients in parallel, each doing `iterations / concurrency`
   * ops, and returns per-op latencies. Sustained throughput = timings.length / totalWallClockSec. */
  async run(driver: GraphDriver, iterations: number, concurrency: number): Promise<number[]> {
    const opsPerClient = Math.ceil(iterations / concurrency);
    const nodeIds = await this.datasetLoader.sampleRandomNodeIds(iterations);

    const clientTasks = Array.from({ length: concurrency }, (_, clientIdx) =>
      this.runClient(driver, nodeIds, clientIdx, opsPerClient, concurrency),
    );

    const perClientTimings = await Promise.all(clientTasks);
    return perClientTimings.flat();
  }

  private async runClient(
    driver: GraphDriver,
    nodeIds: string[],
    clientIdx: number,
    opsPerClient: number,
    concurrency: number,
  ): Promise<number[]> {
    const timings: number[] = [];
    for (let i = 0; i < opsPerClient; i++) {
      const nodeId = nodeIds[(clientIdx + i * concurrency) % nodeIds.length];
      const isRead = Math.random() < READ_WRITE_RATIO;

      const start = performance.now();
      if (isRead) {
        await driver.pointLookup(nodeId);
      } else {
        // Writes reuse traverse() as a stand-in write-ish op unless the driver
        // exposes a dedicated write method; swap in a real write query per platform.
        await driver.traverse(nodeId, 1);
      }
      timings.push(performance.now() - start);
    }
    return timings;
  }
}

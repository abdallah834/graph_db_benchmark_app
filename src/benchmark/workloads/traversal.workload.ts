import { Injectable } from '@nestjs/common';
import { GraphDriver } from '../../drivers/graph-driver.interface';
import { DatasetLoaderService } from '../../dataset/dataset-loader.service';

@Injectable()
export class TraversalWorkload {
  constructor(private readonly datasetLoader: DatasetLoaderService) {}

  /** Runs 1, 2, and 3-hop traversals for `iterations` random start nodes each,
   * and returns the flattened latency array (used for both warm-up and measurement). */
  async runAllHopDepths(driver: GraphDriver, iterations: number): Promise<number[]> {
    const startNodeIds = await this.datasetLoader.sampleRandomNodeIds(iterations);
    const timings: number[] = [];

    for (const hops of [1, 2, 3] as const) {
      for (const nodeId of startNodeIds) {
        const { durationMs } = await driver.traverse(nodeId, hops);
        timings.push(durationMs);
      }
    }
    return timings;
  }
}

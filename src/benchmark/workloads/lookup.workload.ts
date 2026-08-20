import { Injectable } from '@nestjs/common';
import { GraphDriver } from '../../drivers/graph-driver.interface';
import { DatasetLoaderService } from '../../dataset/dataset-loader.service';

const INDEXED_PROPERTY = 'label';

@Injectable()
export class LookupWorkload {
  constructor(private readonly datasetLoader: DatasetLoaderService) {}

  async run(driver: GraphDriver, iterations: number): Promise<number[]> {
    const nodeIds = await this.datasetLoader.sampleRandomNodeIds(iterations);
    const labels = await this.datasetLoader.sampleRandomLabels(iterations);
    const timings: number[] = [];

    for (const id of nodeIds) {
      const { durationMs } = await driver.pointLookup(id);
      timings.push(durationMs);
    }
    for (const label of labels) {
      const { durationMs } = await driver.indexedLookup(INDEXED_PROPERTY, label);
      timings.push(durationMs);
    }
    return timings;
  }
}

import { Injectable } from '@nestjs/common';
import { GraphDriver } from '../../drivers/graph-driver.interface';
import { DatasetLoaderService } from '../../dataset/dataset-loader.service';

@Injectable()
export class AggregationWorkload {
  constructor(private readonly datasetLoader: DatasetLoaderService) {}

  async run(driver: GraphDriver, iterations: number): Promise<number[]> {
    const labels = await this.datasetLoader.sampleRandomLabels(iterations);
    const timings: number[] = [];

    for (const label of labels) {
      const { durationMs } = await driver.aggregate(label);
      timings.push(durationMs);
    }
    return timings;
  }
}

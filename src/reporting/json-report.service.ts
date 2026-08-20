import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { LoadStats } from '../drivers/graph-driver.interface';

interface WorkloadSummary {
  count: number;
  p50: number;
  p95: number;
  mean: number;
  min: number;
  max: number;
}

interface WorkloadRecord {
  platform: string;
  workload: string;
  rawTimingsMs: number[];
  summary: WorkloadSummary;
  recordedAt: string;
}

export interface PlatformResults {
  platform: string;
  loadStats: LoadStats | null;
  workloads: WorkloadRecord[];
}

const RESULTS_DIR = path.resolve(process.cwd(), 'results');

@Injectable()
export class JsonReportService {
  async readAllResults(): Promise<PlatformResults[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(RESULTS_DIR);
    } catch {
      throw new Error(
        `No results directory found at ${RESULTS_DIR}. Run "load" and "run" first.`,
      );
    }

    const workloadFiles = entries.filter(
      (f) => f.endsWith('.json') && !f.endsWith('.load.json'),
    );
    const platforms = workloadFiles.map((f) => f.replace(/\.json$/, ''));

    const results: PlatformResults[] = [];
    for (const platform of platforms) {
      const workloads: WorkloadRecord[] = JSON.parse(
        await fs.readFile(path.join(RESULTS_DIR, `${platform}.json`), 'utf-8'),
      ) as WorkloadRecord[];

      let loadStats: LoadStats | null = null;
      try {
        loadStats = JSON.parse(
          await fs.readFile(
            path.join(RESULTS_DIR, `${platform}.load.json`),
            'utf-8',
          ),
        ) as LoadStats;
      } catch {
        // load stats optional - platform may only have workload results
      }

      results.push({ platform, loadStats, workloads });
    }

    return results;
  }
}

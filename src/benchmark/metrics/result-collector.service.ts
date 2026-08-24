import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { summarize } from './stats.util';

interface WorkloadRecord {
  platform: string;
  workload: string;
  rawTimingsMs: number[];
  summary: ReturnType<typeof summarize>;
  recordedAt: string;
}

@Injectable()
export class ResultCollectorService {
  private readonly logger = new Logger(ResultCollectorService.name);
  private readonly records: WorkloadRecord[] = [];
  private readonly outDir = path.resolve(process.cwd(), 'results');

  record(platform: string, workload: string, rawTimingsMs: number[]): void {
    this.records.push({
      platform,
      workload,
      rawTimingsMs,
      summary: summarize(rawTimingsMs),
      recordedAt: new Date().toISOString(),
    });
  }

  async flush(): Promise<void> {
    await fs.mkdir(this.outDir, { recursive: true });
    const byPlatform = new Map<string, WorkloadRecord[]>();

    for (const record of this.records) {
      const existing = byPlatform.get(record.platform) ?? [];
      existing.push(record);
      byPlatform.set(record.platform, existing);
    }

    for (const [platform, newRecords] of byPlatform) {
      const filePath = path.join(this.outDir, `${platform}.json`);
      const merged = await this.mergeWithExisting(filePath, newRecords);
      await fs.writeFile(filePath, JSON.stringify(merged, null, 2));
      this.logger.log(
        `Wrote ${filePath} (${merged.length} workload record(s) total for ${platform})`,
      );
    }
  }

  /** Each CLI invocation of `run` only knows about the one workload it just
   * ran - its in-memory `records` array starts empty every time the process
   * starts. Without this merge step, writing `results/<platform>.json`
   * would overwrite whatever a *previous* `run --workload X` invocation
   * already wrote, silently losing every earlier workload's results.
   *
   * Merge keeps at most one record per (platform, workload) pair - a
   * re-run of the same workload replaces its old result rather than
   * duplicating it, everything else on disk is preserved. */
  private async mergeWithExisting(
    filePath: string,
    newRecords: WorkloadRecord[],
  ): Promise<WorkloadRecord[]> {
    let existingRecords: WorkloadRecord[] = [];
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      existingRecords = JSON.parse(raw) as WorkloadRecord[];
    } catch {
      // no existing file yet - nothing to merge with
    }

    const newWorkloadNames = new Set(newRecords.map((r) => r.workload));
    const keptExisting = existingRecords.filter(
      (r) => !newWorkloadNames.has(r.workload),
    );

    return [...keptExisting, ...newRecords];
  }
}

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

    for (const [platform, records] of byPlatform) {
      const filePath = path.join(this.outDir, `${platform}.json`);
      await fs.writeFile(filePath, JSON.stringify(records, null, 2));
      this.logger.log(`Wrote ${filePath}`);
    }
  }
}

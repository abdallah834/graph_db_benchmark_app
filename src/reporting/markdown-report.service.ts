import { Injectable } from '@nestjs/common';
import { PlatformResults } from './json-report.service';

const fmt = (n: number | null | undefined, digits = 1): string =>
  n === null || n === undefined || Number.isNaN(n) ? 'n/a' : n.toFixed(digits);

@Injectable()
export class MarkdownReportService {
  generate(allResults: PlatformResults[]): string {
    const sections = [
      this.header(allResults),
      this.ingestTable(allResults),
      this.workloadTable(
        allResults,
        'traversal',
        'Traversal latency (1/2/3-hop)',
      ),
      this.workloadTable(
        allResults,
        'lookup',
        'Lookup latency (point + indexed)',
      ),
      this.workloadTable(allResults, 'aggregation', 'Aggregation latency'),
      this.workloadTable(allResults, 'mixed', 'Mixed read/write throughput'),
    ];
    return sections.join('\n\n');
  }

  private header(allResults: PlatformResults[]): string {
    const generatedAt = new Date().toISOString();
    return [
      '## Results matrix',
      '',
      `_Generated ${generatedAt} from ${allResults.length} platform result file(s) in \`results/\`._`,
    ].join('\n');
  }

  private ingestTable(allResults: PlatformResults[]): string {
    const rows = allResults.map((r) => {
      const s = r.loadStats;
      return `| ${r.platform} | ${s ? fmt(s.nodesPerSecond) : 'n/a'} | ${s ? fmt(s.relationshipsPerSecond) : 'n/a'} | ${s ? s.wallClockMs.toLocaleString() : 'n/a'} |`;
    });

    return [
      '### Data loading',
      '',
      '| Platform | Nodes/sec | Relationships/sec | Total wall-clock (ms) |',
      '|---|---|---|---|',
      ...rows,
    ].join('\n');
  }

  private workloadTable(
    allResults: PlatformResults[],
    workloadName: string,
    title: string,
  ): string {
    const rows = allResults.map((r) => {
      const record = r.workloads.find((w) => w.workload === workloadName);
      if (!record) return `| ${r.platform} | n/a | n/a | n/a |`;
      return `| ${r.platform} | ${fmt(record.summary.p50, 2)} | ${fmt(record.summary.p95, 2)} | ${record.summary.count} |`;
    });

    return [
      `### ${title}`,
      '',
      '| Platform | p50 (ms) | p95 (ms) | Iterations |',
      '|---|---|---|---|',
      ...rows,
    ].join('\n');
  }
}

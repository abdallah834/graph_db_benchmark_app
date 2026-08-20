import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { JsonReportService } from '../reporting/json-report.service';
import { MarkdownReportService } from '../reporting/markdown-report.service';

interface ReportCommandOptions {
  out: string;
}

@Command({
  name: 'report',
  description: 'Generate the markdown results matrix from results/*.json',
})
export class ReportCommand extends CommandRunner {
  private readonly logger = new Logger(ReportCommand.name);

  constructor(
    private readonly jsonReport: JsonReportService,
    private readonly markdownReport: MarkdownReportService,
  ) {
    super();
  }

  async run(_inputs: string[], options: ReportCommandOptions): Promise<void> {
    const allResults = await this.jsonReport.readAllResults();
    if (allResults.length === 0) {
      this.logger.warn(
        'No results found in results/. Run "load" and "run" first.',
      );
      return;
    }

    const markdown = this.markdownReport.generate(allResults);
    const outPath = path.resolve(process.cwd(), options.out);
    await fs.writeFile(outPath, markdown);

    this.logger.log(
      `Wrote ${outPath} covering platforms: ${allResults.map((r) => r.platform).join(', ')}`,
    );
    this.logger.log(
      'Paste this into README under the results section, or include it via a link.',
    );
  }

  @Option({
    flags: '-o, --out <path>',
    description: 'Output markdown file path',
    defaultValue: 'results/RESULTS.md',
  })
  parseOut(val: string): string {
    return val;
  }
}

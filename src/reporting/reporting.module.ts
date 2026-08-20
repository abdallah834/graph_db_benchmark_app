import { Module } from '@nestjs/common';
import { JsonReportService } from './json-report.service';
import { MarkdownReportService } from './markdown-report.service';

@Module({
  providers: [JsonReportService, MarkdownReportService],
  exports: [JsonReportService, MarkdownReportService],
})
export class ReportingModule {}

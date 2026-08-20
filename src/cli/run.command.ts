import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { DriverRegistry } from '../drivers/driver.registry';
import { ResultCollectorService } from '../benchmark/metrics/result-collector.service';
import { TraversalWorkload } from '../benchmark/workloads/traversal.workload';
import { LookupWorkload } from '../benchmark/workloads/lookup.workload';
import { AggregationWorkload } from '../benchmark/workloads/aggregation.workload';
import { MixedWorkload } from '../benchmark/workloads/mixed.workload';
import { GraphDriver } from '../drivers/graph-driver.interface';
import { canLoad } from './load.command';

interface RunCommandOptions {
  platform: string;
  workload: string;
  iterations: number;
  concurrency: number;
}

const WARMUP_ITERATIONS = 10;

@Command({
  name: 'run',
  description:
    'Run a workload against one platform or all platforms and record latencies',
})
export class RunCommand extends CommandRunner {
  private readonly logger = new Logger(RunCommand.name);

  constructor(
    private readonly registry: DriverRegistry,
    private readonly resultCollector: ResultCollectorService,
    private readonly traversal: TraversalWorkload,
    private readonly lookup: LookupWorkload,
    private readonly aggregation: AggregationWorkload,
    private readonly mixed: MixedWorkload,
  ) {
    super();
  }

  async run(_inputs: string[], options: RunCommandOptions): Promise<void> {
    const targets: Partial<GraphDriver>[] =
      options.platform === 'all'
        ? this.registry.all()
        : [this.registry.get(options.platform)];

    for (const driver of targets) {
      if (!canLoad(driver)) {
        this.logger.warn(
          `Skipping ${driver.platformName ?? '(unnamed platform)'} - ` +
            'driver does not implement connect/loadData/disconnect yet.',
        );
        continue;
      }
      await driver.connect();
      this.logger.log(
        `[${driver.platformName}] warming up (${WARMUP_ITERATIONS} iterations)...`,
      );

      const runWorkload = this.pickWorkload(options.workload);
      await runWorkload(driver, WARMUP_ITERATIONS, options.concurrency);

      this.logger.log(
        `[${driver.platformName}] measuring "${options.workload}" (${options.iterations} iterations)...`,
      );
      const timings = await runWorkload(
        driver,
        options.iterations,
        options.concurrency,
      );

      this.resultCollector.record(
        driver.platformName ?? '',
        options.workload,
        timings,
      );
      await driver.disconnect();
    }

    await this.resultCollector.flush();
    this.logger.log('Run complete. Results written to ./results/*.json');
  }

  private pickWorkload(name: string) {
    switch (name) {
      case 'traversal':
        return (driver, n) => this.traversal.runAllHopDepths(driver, n);
      case 'lookup':
        return (driver, n) => this.lookup.run(driver, n);
      case 'aggregation':
        return (driver, n) => this.aggregation.run(driver, n);
      case 'mixed':
        return (driver, n, concurrency) =>
          this.mixed.run(driver, n, concurrency);
      default:
        throw new Error(
          `Unknown workload "${name}". Use: traversal | lookup | aggregation | mixed`,
        );
    }
  }

  @Option({
    flags: '-p, --platform <platform>',
    description: 'Platform or "all"',
    defaultValue: 'all',
  })
  parsePlatform(val: string): string {
    return val;
  }

  @Option({
    flags: '-w, --workload <workload>',
    description: 'traversal | lookup | aggregation | mixed',
  })
  parseWorkload(val: string): string {
    return val;
  }

  @Option({
    flags: '-i, --iterations <iterations>',
    description: 'Iterations after warm-up',
    defaultValue: '100',
  })
  parseIterations(val: string): number {
    return parseInt(val, 10);
  }

  @Option({
    flags: '-c, --concurrency <concurrency>',
    description: 'Concurrent clients for mixed workload',
    defaultValue: '10',
  })
  parseConcurrency(val: string): number {
    return parseInt(val, 10);
  }
}

import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import { DriverRegistry } from '../drivers/driver.registry';
import { DatasetLoaderService } from '../dataset/dataset-loader.service';
import { GraphDriver } from '../drivers/graph-driver.interface';

interface LoadCommandOptions {
  platform: string;
}

/** The subset of GraphDriver this command actually needs. A driver that's
 * still work-in-progress and only implements Partial<GraphDriver> can still
 * be registered - it'll just be skipped here with a clear warning instead of
 * crashing on a missing method partway through a run. */
type LoadableDriver = Pick<
  GraphDriver,
  'platformName' | 'connect' | 'loadData' | 'disconnect'
>;

export function canLoad(
  driver: Partial<GraphDriver>,
): driver is LoadableDriver {
  return (
    typeof driver.platformName === 'string' &&
    typeof driver.connect === 'function' &&
    typeof driver.loadData === 'function' &&
    typeof driver.disconnect === 'function'
  );
}

@Command({
  name: 'load',
  description: 'Load the benchmark dataset into one platform or all platforms',
})
export class LoadCommand extends CommandRunner {
  private readonly logger = new Logger(LoadCommand.name);

  constructor(
    private readonly registry: DriverRegistry,
    private readonly datasetLoader: DatasetLoaderService,
  ) {
    super();
  }

  async run(_inputs: string[], options: LoadCommandOptions): Promise<void> {
    const { nodes, edges } = await this.datasetLoader.getDataset();
    const targets: Partial<GraphDriver>[] =
      options.platform === 'all'
        ? this.registry.all()
        : [this.registry.get(options.platform)];

    // Track failures instead of throwing immediately - one platform's bug
    // (e.g. a query-syntax difference) shouldn't hide problems in the rest.
    const failures: { platform: string; message: string }[] = [];

    for (const driver of targets) {
      if (!canLoad(driver)) {
        this.logger.warn(
          `Skipping ${driver.platformName ?? '(unnamed platform)'} - ` +
            'driver does not implement connect/loadData/disconnect yet.',
        );
        continue;
      }

      try {
        this.logger.log(`[${driver.platformName}] connecting...`);
        await driver.connect();

        this.logger.log(
          `[${driver.platformName}] loading ${nodes.length} nodes / ${edges.length} relationships...`,
        );
        const stats = await driver.loadData(nodes, edges);

        this.logger.log(
          `[${driver.platformName}] done in ${stats.wallClockMs}ms ` +
            `(${stats.nodesPerSecond.toFixed(1)} nodes/s, ${stats.relationshipsPerSecond.toFixed(1)} rels/s)`,
        );

        await this.datasetLoader.persistLoadStats(driver.platformName, stats);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`[${driver.platformName}] load failed: ${message}`);
        failures.push({ platform: driver.platformName, message });
      } finally {
        // Best-effort cleanup even if loadData() threw partway through -
        // an open session shouldn't leak just because ingest failed.
        try {
          await driver.disconnect();
        } catch (disconnectError) {
          this.logger.warn(
            `[${driver.platformName}] disconnect also failed: ${disconnectError}`,
          );
        }
      }
    }

    if (failures.length > 0) {
      this.logger.error(`${failures.length} platform(s) failed to load:`);
      for (const { platform, message } of failures) {
        this.logger.error(`  - ${platform}: ${message}`);
      }
      // Exit non-zero so CI/scripts/run-all.sh notice, but only after every
      // platform got a fair attempt.
      process.exitCode = 1;
    }
  }

  @Option({
    flags: '-p, --platform <platform>',
    description: 'Platform to load into, or "all"',
    defaultValue: 'all',
  })
  parsePlatform(val: string): string {
    return val;
  }
}

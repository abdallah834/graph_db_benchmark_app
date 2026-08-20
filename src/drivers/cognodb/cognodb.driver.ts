import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import neo4j, { Driver, Node, Session } from 'neo4j-driver';
import { cognodbConfig } from '../../config/platforms.config';
import {
  EdgeRecord,
  GraphDriver,
  LoadStats,
  NodeRecord,
  TimedResult,
} from '../graph-driver.interface';

const INGEST_BATCH_SIZE = 250;

@Injectable()
export class CognodbDriver implements Partial<GraphDriver> {
  readonly platformName = 'cognodb';
  private readonly logger = new Logger(CognodbDriver.name);
  private driver!: Driver;

  constructor(
    @Inject(cognodbConfig.KEY)
    private readonly config: ConfigType<typeof cognodbConfig>,
  ) {}

  async connect(): Promise<void> {
    if (!this.config.uri || !this.config.password) {
      throw new BadRequestException('missing cognoDB credentials');
    }
    this.driver = neo4j.driver(
      this.config.uri,
      neo4j.auth.basic(this.config.user, this.config.password),
    );
    await this.driver.verifyConnectivity();
    this.logger.log(`Connected to CognoDB at ${this.config.uri}`);
  }

  async disconnect(): Promise<void> {
    await this.driver?.close();
  }

  async loadData(nodes: NodeRecord[], edges: EdgeRecord[]): Promise<LoadStats> {
    const start = Date.now();
    const session = this.driver.session();

    try {
      // Index first so relationship MATCH lookups during load aren't full scans.
      await session.run(
        'CREATE INDEX node_id_index IF NOT EXISTS FOR (n:Entity) ON (n.id)',
      );
      await session.run(
        'CREATE INDEX node_label_index IF NOT EXISTS FOR (n:Entity) ON (n.label)',
      );
      for (let i = 0; i < nodes.length; i += INGEST_BATCH_SIZE) {
        const batch = nodes.slice(i, i + INGEST_BATCH_SIZE);
        await session.executeWrite((tx) =>
          tx.run(
            `UNWIND $batch AS row
             CREATE (n:Entity {id: row.id, label: row.label})
             SET n += COALESCE(row.properties, {})`,
            { batch },
          ),
        );
      }

      for (let i = 0; i < edges.length; i += INGEST_BATCH_SIZE) {
        const batch = edges.slice(i, i + INGEST_BATCH_SIZE);
        await session.executeWrite((tx) =>
          tx.run(
            `UNWIND $batch AS row
             MATCH (a:Entity {id: row.from}), (b:Entity {id: row.to})
             CREATE (a)-[r:RELATES {type: row.type}]->(b)
             SET r += COALESCE(row.properties, {})`,
            { batch },
          ),
        );
      }

      const wallClockMs = Date.now() - start;
      const seconds = wallClockMs / 1000;

      return {
        nodesLoaded: nodes.length,
        relationshipsLoaded: edges.length,
        wallClockMs,
        nodesPerSecond: nodes.length / seconds,
        relationshipsPerSecond: edges.length / seconds,
      };
    } finally {
      await session.close();
    }
  }

  async traverse(
    startNodeId: string,
    hops: 1 | 2 | 3,
  ): Promise<TimedResult<number>> {
    return this.timed((session) =>
      session.run(
        `MATCH (start:Entity {id: $startNodeId})-[*${hops}]-(reached)
         RETURN count(DISTINCT reached) AS reachedCount`,
        { startNodeId },
      ),
    ).then(({ result, durationMs }) => ({
      result: Number(result.records[0]?.get('reachedCount') ?? 0),
      durationMs,
    }));
  }

  async pointLookup(id: string): Promise<TimedResult<unknown>> {
    return this.timed((session) =>
      session.run('MATCH (n:Entity {id: $id}) RETURN n', { id }),
    ).then(({ result, durationMs }) => ({
      result: (result.records[0]?.get('n') as Node)?.properties,
      durationMs,
    }));
  }

  async indexedLookup(
    property: string,
    value: string | number,
  ): Promise<TimedResult<unknown>> {
    // Property name is validated/whitelisted by the caller (workload layer),
    // never taken raw from user input, before being interpolated here.
    return this.timed((session) =>
      session.run(
        `MATCH (n:Entity) WHERE n.${property} = $value RETURN n LIMIT 1`,
        {
          value,
        },
      ),
    ).then(({ result, durationMs }) => ({
      result: (result.records[0]?.get('n') as Node)?.properties,
      durationMs,
    }));
  }

  async aggregate(groupByLabel: string): Promise<TimedResult<unknown>> {
    return this.timed((session) =>
      session.run(
        `MATCH (n:Entity {label: $groupByLabel})
         RETURN n.label AS label, count(n) AS total`,
        { groupByLabel },
      ),
    ).then(({ result, durationMs }) => ({
      result: result.records.map((r) => ({
        label: r.get('label') as string,
        total: Number(r.get('total')),
      })),
      durationMs,
    }));
  }

  getFootprint() {
    // CognoDB's free tier does not expose a storage/memory introspection API
    // at time of writing - be explicit about that rather than guessing.
    return {
      storedDataBytes: null,
      memoryUsageBytes: null,
      notes:
        'Not observable via CognoDB free-tier console or driver; advertised limit is 1 GB disk / 256 MB RAM (c0 instance).',
    };
  }

  private async timed<T>(
    fn: (session: Session) => Promise<T>,
  ): Promise<TimedResult<T>> {
    const session = this.driver.session();
    const start = performance.now();
    try {
      const result = await fn(session);
      return { result, durationMs: performance.now() - start };
    } finally {
      await session.close();
    }
  }
}

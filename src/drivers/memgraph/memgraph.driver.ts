import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import neo4j, { Driver, Node, Session } from 'neo4j-driver';
import { memgraphConfig } from '../../config/platforms.config';
import {
  EdgeRecord,
  GraphDriver,
  LoadStats,
  NodeRecord,
  TimedResult,
} from '../graph-driver.interface';

const INGEST_BATCH_SIZE = 250;

/**
 * Memgraph Cloud implementation. Memgraph speaks the bolt protocol and a
 * Cypher-compatible dialect, so this driver is structurally identical to
 * CognoDB's and AuraDB's - another useful "same protocol" data point for
 * the report's cross-platform analysis.
 *
 * One real difference: Memgraph's index syntax is `CREATE INDEX ON :Label(prop)`
 * rather than Neo4j's `CREATE INDEX ... FOR (n:Label) ON (n.prop)` - noted below.
 */
@Injectable()
export class MemgraphDriver implements Partial<GraphDriver> {
  readonly platformName = 'memgraph';
  private readonly logger = new Logger(MemgraphDriver.name);
  private driver!: Driver;

  constructor(
    @Inject(memgraphConfig.KEY)
    private readonly config: ConfigType<typeof memgraphConfig>,
  ) {}

  async connect(): Promise<void> {
    if (!this.config.uri) {
      throw new BadRequestException('memGraph URI missing');
    }
    const auth =
      this.config.user && this.config.password
        ? neo4j.auth.basic(this.config.user, this.config.password)
        : undefined;
    this.driver = neo4j.driver(this.config.uri, auth);
    await this.driver.verifyConnectivity();
    this.logger.log(`Connected to Memgraph at ${this.config.uri}`);
  }

  async disconnect(): Promise<void> {
    await this.driver?.close();
  }

  async loadData(nodes: NodeRecord[], edges: EdgeRecord[]): Promise<LoadStats> {
    const start = Date.now();
    const session = this.driver.session();

    try {
      // Memgraph's index DDL differs from Neo4j's - this is exactly the kind
      // of "query-language difference" the assignment asks you to caveat.
      await session.run('CREATE INDEX ON :Entity(id)');
      await session.run('CREATE INDEX ON :Entity(label)');
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
    // Memgraph exposes `SHOW STORAGE INFO` which returns memory/disk usage -
    // worth calling here if your plan/tier permits it. Left conservative for now.
    return {
      storedDataBytes: null,
      memoryUsageBytes: null,
      notes:
        'Not queried in this driver; Memgraph supports "SHOW STORAGE INFO" for live memory stats if you want to wire it up.',
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

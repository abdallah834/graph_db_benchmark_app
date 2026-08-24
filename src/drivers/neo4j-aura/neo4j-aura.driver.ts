import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import neo4j, { Driver, Node, Session } from 'neo4j-driver';
import { neo4jAuraConfig } from '../../config/platforms.config';
import {
  EdgeRecord,
  GraphDriver,
  LoadStats,
  NodeRecord,
  TimedResult,
} from '../graph-driver.interface';
import { sanitizeRecord } from '../../utils/record.sanitize';

const INGEST_BATCH_SIZE = 250;

/**
 * Neo4j AuraDB Free implementation. Bolt/Cypher is identical to CognoDB's
 * driver on purpose - this lets the README's analysis section make a clean
 * claim: "same protocol, same query language, so latency deltas here are
 * attributable to the managed platform itself, not client/driver differences."
 */
@Injectable()
export class Neo4jAuraDriver implements Partial<GraphDriver> {
  readonly platformName = 'neo4j-aura';
  private readonly logger = new Logger(Neo4jAuraDriver.name);
  private driver!: Driver;

  constructor(
    @Inject(neo4jAuraConfig.KEY)
    private readonly config: ConfigType<typeof neo4jAuraConfig>,
  ) {}

  async connect(): Promise<void> {
    if (!this.config.uri || !this.config.password) {
      throw new BadRequestException('missing neo4j-aura credentials');
    }
    this.driver = neo4j.driver(
      this.config.uri,
      neo4j.auth.basic(this.config.user, this.config.password),
      { maxConnectionLifetime: 5 * 60 * 1000 },
    );
    await this.driver.verifyConnectivity();
    this.logger.log(`Connected to Neo4j AuraDB at ${this.config.uri}`);
  }

  async disconnect(): Promise<void> {
    await this.driver?.close();
  }

  async loadData(nodes: NodeRecord[], edges: EdgeRecord[]): Promise<LoadStats> {
    const start = Date.now();
    const session = this.driver.session();

    try {
      await session.run(
        'CREATE INDEX node_id_index IF NOT EXISTS FOR (n:Entity) ON (n.id)',
      );
      await session.run(
        'CREATE INDEX node_label_index IF NOT EXISTS FOR (n:Entity) ON (n.label)',
      );

      for (let i = 0; i < nodes.length; i += INGEST_BATCH_SIZE) {
        const batch = nodes.slice(i, i + INGEST_BATCH_SIZE).map(sanitizeRecord);
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

      // `UNWIND $batch AS row
      //  MATCH (a:Entity {id: row.from}), (b:Entity {id: row.to})
      //  CREATE (a)-[r:RELATES {type: row.type}]->(b)
      //  SET r += row.properties`,
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
      session.executeRead(
        (tx) =>
          tx.run(
            `MATCH (start:Entity {id: $startNodeId})-[*${hops}]->(reached)
             RETURN count(DISTINCT reached) AS reachedCount`,
            { startNodeId },
          ),
        { timeout: 15000 },
      ),
    ).then(({ result, durationMs }) => ({
      result: Number(result.records[0]?.get('reachedCount') ?? 0),
      durationMs,
    }));
  }

  async pointLookup(id: string): Promise<TimedResult<unknown>> {
    return this.timed((session) =>
      session.executeRead((tx) =>
        tx.run('MATCH (n:Entity {id: $id}) RETURN n', { id }),
      ),
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
      session.executeRead((tx) =>
        tx.run(
          `MATCH (n:Entity) WHERE n.${property} = $value RETURN n LIMIT 1`,
          { value },
        ),
      ),
    ).then(({ result, durationMs }) => ({
      result: (result.records[0]?.get('n') as Node)?.properties,
      durationMs,
    }));
  }

  async aggregate(groupByLabel: string): Promise<TimedResult<unknown>> {
    return this.timed((session) =>
      session.executeRead((tx) =>
        tx.run(
          `MATCH (n:Entity {label: $groupByLabel})
           RETURN n.label AS label, count(n) AS total`,
          { groupByLabel },
        ),
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
    // AuraDB Free exposes a "used memory" figure in its console but not via
    // driver/API at time of writing - record it manually in the README instead.
    return {
      storedDataBytes: null,
      memoryUsageBytes: null,
      notes:
        'Not observable via driver; AuraDB Free advertises 1 GB storage / shared vCPU - check console for live usage and record manually.',
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

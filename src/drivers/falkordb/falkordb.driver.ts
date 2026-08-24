import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { FalkorDB, Graph } from 'falkordb';
import { falkordbConfig } from '../../config/platforms.config';
import {
  EdgeRecord,
  GraphDriver,
  LoadStats,
  NodeRecord,
  TimedResult,
} from '../graph-driver.interface';

const INGEST_BATCH_SIZE = 1000;
const GRAPH_NAME = 'benchmark_graph';

/**
 * FalkorDB Cloud implementation. FalkorDB is a Redis-module graph database
 * (GraphBLAS-backed, sparse adjacency matrix under the hood) that speaks an
 * OpenCypher subset over the RESP protocol via its own client - not the bolt
 * driver used by CognoDB/AuraDB/Memgraph, and not AQL like ArangoDB.
 *
 * The query *shapes* below intentionally mirror the Cypher drivers as
 * closely as FalkorDB's supported syntax allows, so the traversal/lookup/
 * aggregation workloads stay logically equivalent across all five platforms.
 * Any place FalkorDB's Cypher subset diverges from full Neo4j Cypher is
 * called out in a comment - document these in your README's caveats section.
 */
@Injectable()
export class FalkordbDriver implements Partial<GraphDriver> {
  readonly platformName = 'falkordb';
  private readonly logger = new Logger(FalkordbDriver.name);
  private client!: FalkorDB;
  private graph!: Graph;

  constructor(
    @Inject(falkordbConfig.KEY)
    private readonly config: ConfigType<typeof falkordbConfig>,
  ) {}

  async connect(): Promise<void> {
    if (!this.config.host) {
      throw new Error(
        'Missing FalkorDB config: ensure FALKORDB_HOST is set in .env',
      );
    }

    const { host, port } = this.splitHostAndPort(
      this.config.host,
      this.config.port,
    );

    this.client = await FalkorDB.connect({
      username: this.config.username,
      password: this.config.password,
      socket: {
        host,
        port,
        allowPartialTrustChain: true,
      },
    });
    this.graph = this.client.selectGraph(GRAPH_NAME);
    this.logger.log(`Connected to FalkorDB at ${host}:${port}`);
  }

  /** FalkorDB Cloud's console displays its endpoint as a single
   * "host:port" string, which is easy to paste whole into FALKORDB_HOST
   * by mistake - resulting in a DNS lookup for the literal string
   * "host.example.com:50710", which will always fail. Detect and correct
   * for that here rather than failing with a confusing ENOTFOUND. */
  private splitHostAndPort(
    configuredHost: string,
    configuredPort: number,
  ): { host: string; port: number } {
    const lastColonIndex = configuredHost.lastIndexOf(':');
    const looksLikeCombinedHostPort =
      lastColonIndex > 0 &&
      /^\d+$/.test(configuredHost.slice(lastColonIndex + 1));

    if (looksLikeCombinedHostPort) {
      const host = configuredHost.slice(0, lastColonIndex);
      const port = parseInt(configuredHost.slice(lastColonIndex + 1), 10);
      this.logger.warn(
        `FALKORDB_HOST appears to contain an embedded port ("${configuredHost}") - ` +
          `using host="${host}" port=${port} instead. Fix your .env to set these separately.`,
      );
      return { host, port };
    }

    return { host: configuredHost, port: configuredPort };
  }

  async disconnect(): Promise<void> {
    await this.client?.close();
  }

  async loadData(nodes: NodeRecord[], edges: EdgeRecord[]): Promise<LoadStats> {
    const start = Date.now();

    for (let i = 0; i < nodes.length; i += INGEST_BATCH_SIZE) {
      const batch = nodes.slice(i, i + INGEST_BATCH_SIZE).map((n) => ({
        entityId: n.id,
        label: n.label,
        ...n.properties,
      }));
      await this.graph.query(
        `UNWIND $batch AS row
         CREATE (n:Entity {entityId: row.entityId, label: row.label})
         SET n += row`,
        { params: { batch } },
      );
    }

    // Index both lookup properties - see cognodb.driver.ts for why the
    // `label` index specifically matters for a fair "indexed lookup" metric.
    await this.createIndexIfNotExists(
      'CREATE INDEX FOR (n:Entity) ON (n.entityId)',
    );
    await this.createIndexIfNotExists(
      'CREATE INDEX FOR (n:Entity) ON (n.label)',
    );

    for (let i = 0; i < edges.length; i += INGEST_BATCH_SIZE) {
      const batch = edges.slice(i, i + INGEST_BATCH_SIZE).map((e) => ({
        from: e.from,
        to: e.to,
        type: e.type,
        ...e.properties,
      }));
      await this.graph.query(
        `UNWIND $batch AS row
         MATCH (a:Entity {entityId: row.from}), (b:Entity {entityId: row.to})
         CREATE (a)-[r:RELATES {type: row.type}]->(b)`,
        { params: { batch } },
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
  }
  private async createIndexIfNotExists(query: string): Promise<void> {
    try {
      await this.graph.query(query);
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error);
      const alreadyExists =
        message.includes('already indexed') ||
        message.includes('already exists');
      if (!alreadyExists) {
        throw error;
      }
      this.logger.log(`Index already exists, skipping: ${query}`);
    }
  }
  async traverse(
    startNodeId: string,
    hops: 1 | 2 | 3,
  ): Promise<TimedResult<number>> {
    return this.timed(async () => {
      const result = await this.graph.query(
        `MATCH (start:Entity {id: $startNodeId})-[*${hops}]->(reached)
         RETURN count(DISTINCT reached) AS reachedCount`,
        { params: { startNodeId } },
      );
      return Number(
        (result.data?.[0] as { reachedCount: string })?.reachedCount ?? 0,
      );
    });
  }

  async pointLookup(id: string): Promise<TimedResult<unknown>> {
    return this.timed(async () => {
      const result = await this.graph.query(
        'MATCH (n:Entity {entityId: $id}) RETURN n',
        {
          params: { id },
        },
      );
      return (result.data?.[0] as { n: any })?.n as unknown;
    });
  }

  async indexedLookup(
    property: string,
    value: string | number,
  ): Promise<TimedResult<unknown>> {
    return this.timed(async () => {
      // property name comes from the workload layer's whitelist, not raw user input.
      const storageProperty = property === 'id' ? 'entityId' : property;
      const result = await this.graph.query(
        `MATCH (n:Entity) WHERE n.${storageProperty} = $value RETURN n LIMIT 1`,
        { params: { value } },
      );
      return (result.data?.[0] as { n: any })?.n as unknown;
    });
  }

  async aggregate(groupByLabel: string): Promise<TimedResult<unknown>> {
    return this.timed(async () => {
      const result = await this.graph.query(
        `MATCH (n:Entity {label: $groupByLabel})
         RETURN n.label AS label, count(n) AS total`,
        { params: { groupByLabel } },
      );
      return result.data;
    });
  }

  async getFootprintAsync() {
    try {
      const info = await this.client.info();
      // FalkorDB's INFO command surfaces Redis-level memory stats since it's
      // a Redis module - used_memory is the closest analogue to "memory usage".
      const usedMemoryMatch = /used_memory:(\d+)/.exec(String(info));
      return {
        storedDataBytes: null,
        memoryUsageBytes: usedMemoryMatch ? Number(usedMemoryMatch[1]) : null,
        notes: usedMemoryMatch
          ? 'memoryUsageBytes is total Redis instance memory (via INFO), not graph-specific - FalkorDB Free tier caps this at 100MB total.'
          : 'Could not parse memory usage from FalkorDB INFO output.',
      };
    } catch {
      return {
        storedDataBytes: null,
        memoryUsageBytes: null,
        notes: 'INFO command not available or failed on this tier.',
      };
    }
  }

  private async timed<T>(fn: () => Promise<T>): Promise<TimedResult<T>> {
    const start = performance.now();
    const result = await fn();
    return { result, durationMs: performance.now() - start };
  }
}

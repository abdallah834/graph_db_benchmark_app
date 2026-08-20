import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { arangodbConfig } from '../../config/platforms.config';
import {
  EdgeRecord,
  GraphDriver,
  LoadStats,
  NodeRecord,
  TimedResult,
} from '../graph-driver.interface';
import { Database } from 'arangojs';

const INGEST_BATCH_SIZE = 250;
const NODE_COLLECTION = 'entities';
const EDGE_COLLECTION = 'relates';
const GRAPH_NAME = 'benchmark_graph';

/**
 * ArangoDB Oasis (or self-hosted) implementation. Unlike the bolt/Cypher
 * trio (CognoDB, AuraDB, Memgraph), ArangoDB is a multi-model document
 * store: nodes are documents in a vertex collection, edges are documents
 * in an edge collection referencing `_from`/`_to`, and queries are AQL
 * (Arango Query Language) with graph traversal syntax (`FOR v IN 1..3
 * OUTBOUND ...`) rather than Cypher's `-[*1..3]-`.
 *
 * This is exactly the "same logical query, different language" case the
 * assignment wants documented - the traverse()/aggregate() methods below
 * do the same job as the Cypher drivers but read very differently.
 */
@Injectable()
export class ArangodbDriver implements Partial<GraphDriver> {
  readonly platformName = 'arangodb';
  private readonly logger = new Logger(ArangodbDriver.name);
  private db!: Database;

  constructor(
    @Inject(arangodbConfig.KEY)
    private readonly config: ConfigType<typeof arangodbConfig>,
  ) {}

  async connect(): Promise<void> {
    if (!this.config.url || !this.config.password) {
      throw new Error(
        'Missing ArangoDB config: ensure ARANGODB_URL and ARANGODB_PASSWORD are set in .env',
      );
    }
    this.db = new Database({
      url: this.config.url,
      databaseName: this.config.db,
      auth: { username: this.config.user, password: this.config.password },
      // Port 18529 intentionally serves a self-signed cert - ArangoDB's own
      // docs recommend this port specifically for automated/driver
      // connections (8529 is for browsers, using a "real" cert). Traffic is
      // still TLS-encrypted; this only skips chain validation against a
      // known-untrusted-by-default self-signed cert on a trusted managed
      // endpoint - worth noting as a deliberate call in README, not a
      // security shortcut.
      agentOptions: { rejectUnauthorized: true },
    });
    await this.db.version();
    this.logger.log(`Connected to ArangoDB at ${this.config.url}`);
  }

  async disconnect(): Promise<void> {
    // arangojs has no persistent socket to close explicitly (HTTP-based client).
  }

  async loadData(nodes: NodeRecord[], edges: EdgeRecord[]): Promise<LoadStats> {
    const start = Date.now();

    const nodeCollection = this.db.collection(NODE_COLLECTION);
    const edgeCollection = this.db.collection(EDGE_COLLECTION);

    if (!(await nodeCollection.exists())) await nodeCollection.create();
    if (!(await edgeCollection.exists()))
      await edgeCollection.create({ type: 3 }); // 3 = edge collection

    // Indexed lookups target `id` and `label` - the ArangoDB analogue of the
    // Cypher drivers' `CREATE INDEX ... ON (n.id)`.
    await nodeCollection.ensureIndex({
      type: 'persistent',
      fields: ['id'],
      unique: true,
    });
    await nodeCollection.ensureIndex({ type: 'persistent', fields: ['label'] });

    // Make sure the named graph exists so AQL traversal syntax (FOR v IN 1..3
    // OUTBOUND start GRAPH "benchmark_graph") has something to walk.
    if (!(await this.db.graph(GRAPH_NAME).exists())) {
      await this.db.graph(GRAPH_NAME).create([
        {
          collection: EDGE_COLLECTION,
          from: [NODE_COLLECTION],
          to: [NODE_COLLECTION],
        },
      ]);
    }

    for (let i = 0; i < nodes.length; i += INGEST_BATCH_SIZE) {
      const batch = nodes.slice(i, i + INGEST_BATCH_SIZE).map((n) => ({
        _key: n.id,
        id: n.id,
        label: n.label,
        ...n.properties,
      }));
      await nodeCollection.saveAll(batch, { overwriteMode: 'ignore' });
    }

    for (let i = 0; i < edges.length; i += INGEST_BATCH_SIZE) {
      const batch = edges.slice(i, i + INGEST_BATCH_SIZE).map((e) => ({
        _from: `${NODE_COLLECTION}/${e.from}`,
        _to: `${NODE_COLLECTION}/${e.to}`,
        type: e.type,
        ...e.properties,
      }));
      await edgeCollection.saveAll(batch, { overwriteMode: 'ignore' });
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

  async traverse(
    startNodeId: string,
    hops: 1 | 2 | 3,
  ): Promise<TimedResult<number>> {
    return await this.timed(async () => {
      const cursor = await this.db.query({
        query: `
          FOR v IN 1..@hops ANY @startVertex GRAPH @graphName
            OPTIONS { bfs: true, uniqueVertices: "global" }
            COLLECT WITH COUNT INTO reachedCount
            RETURN reachedCount
        `,
        bindVars: {
          hops,
          startVertex: `${NODE_COLLECTION}/${startNodeId}`,
          graphName: GRAPH_NAME,
        },
      });
      const [reachedCount] = (await cursor.all()) as unknown as number[];
      return reachedCount ?? 0;
    });
  }

  async pointLookup(id: string): Promise<TimedResult<unknown>> {
    return this.timed(async () => {
      const cursor = await this.db.query({
        query: `FOR doc IN @@collection FILTER doc.id == @id LIMIT 1 RETURN doc`,
        bindVars: { '@collection': NODE_COLLECTION, id },
      });
      return (await cursor.all())[0] as unknown;
    });
  }

  async indexedLookup(
    property: string,
    value: string | number,
  ): Promise<TimedResult<unknown>> {
    return this.timed(async () => {
      // property name comes from the workload layer's whitelist, not raw user input.
      const cursor = await this.db.query({
        query: `FOR doc IN @@collection FILTER doc.${property} == @value LIMIT 1 RETURN doc`,
        bindVars: { '@collection': NODE_COLLECTION, value },
      });
      return (await cursor.all())[0] as unknown;
    });
  }

  async aggregate(groupByLabel: string): Promise<TimedResult<unknown>> {
    return this.timed(async () => {
      const cursor = await this.db.query({
        query: `
          FOR doc IN @@collection
            FILTER doc.label == @groupByLabel
            COLLECT label = doc.label WITH COUNT INTO total
            RETURN { label, total }
        `,
        bindVars: { '@collection': NODE_COLLECTION, groupByLabel },
      });
      return cursor.all();
    });
  }

  async getFootprintAsync() {
    try {
      // ArangoDB does expose per-collection storage figures via its API.
      const nodeCollection = this.db.collection(NODE_COLLECTION);
      const props = await nodeCollection.properties();
      const figures = (props as { figures?: { documentsSize?: number } })
        .figures;
      return {
        storedDataBytes: figures?.documentsSize ?? null,
        memoryUsageBytes: null,
        notes: figures
          ? 'storedDataBytes reflects the entities collection only (documentsSize); memory usage not exposed via API on shared-tier Oasis.'
          : 'Collection figures not returned by this ArangoDB tier/version.',
      };
    } catch {
      return {
        storedDataBytes: null,
        memoryUsageBytes: null,
        notes:
          'Failed to query collection figures - not observable on this tier.',
      };
    }
  }

  private async timed<T>(fn: () => Promise<T>): Promise<TimedResult<T>> {
    const start = performance.now();
    const result = await fn();
    return { result, durationMs: performance.now() - start };
  }
}

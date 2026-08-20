export interface NodeRecord {
  id: string;
  label: string;
  properties: Record<string, string | number | boolean>;
}

export interface EdgeRecord {
  from: string;
  to: string;
  type: string;
  properties?: Record<string, string | number | boolean>;
}

export interface LoadStats {
  nodesLoaded: number;
  relationshipsLoaded: number;
  wallClockMs: number;
  nodesPerSecond: number;
  relationshipsPerSecond: number;
}

export interface TimedResult<T> {
  result: T;
  durationMs: number;
}

/**
 * Every platform (CognoDB, Neo4j AuraDB, Memgraph, ArangoDB, Neptune, ...)
 * implements this same contract. Workloads only ever talk to this interface,
 * never to a platform-specific client directly - that's what keeps the
 * benchmark's "same logical queries everywhere" guarantee honest.
 */
export interface GraphDriver {
  readonly platformName: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /** Bulk-load the identical dataset. Implementations choose their own
   * fastest ingest path (batched driver calls, bulk import tool, etc.)
   * but must report accurate wall-clock + throughput numbers. */
  loadData(nodes: NodeRecord[], edges: EdgeRecord[]): Promise<LoadStats>;

  /** N-hop traversal from a given start node. hops is 1, 2, or 3. */
  traverse(startNodeId: string, hops: 1 | 2 | 3): Promise<TimedResult<number>>;

  /** Lookup by primary id (point lookup). */
  pointLookup(id: string): Promise<TimedResult<unknown>>;

  /** Lookup via a secondary/indexed property. */
  indexedLookup(
    property: string,
    value: string | number,
  ): Promise<TimedResult<unknown>>;

  /** Count / group-by style aggregation over a label or relationship type. */
  aggregate(groupByLabel: string): Promise<TimedResult<unknown>>;

  /** Whatever footprint metrics the platform exposes (storage size, memory).
   * Return null fields for anything "not observable" rather than guessing. */
  getFootprint(): {
    storedDataBytes: number | null;
    memoryUsageBytes: number | null;
    notes: string;
  };
  getFootprintAsync(): Promise<{
    storedDataBytes: number | null;
    memoryUsageBytes: number | null;
    notes: string;
  }>;
}

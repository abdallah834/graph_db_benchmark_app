import { Injectable } from '@nestjs/common';
import { CognodbDriver } from './cognodb/cognodb.driver';
import { Neo4jAuraDriver } from './neo4j-aura/neo4j-aura.driver';
import { MemgraphDriver } from './memgraph/memgraph.driver';
import { ArangodbDriver } from './arangodb/arangodb.driver';
import { FalkordbDriver } from './falkordb/falkordb.driver';
import { GraphDriver } from './graph-driver.interface';

@Injectable()
export class DriverRegistry {
  private readonly drivers: Map<string, Partial<GraphDriver>>;

  constructor(
    cognodb: CognodbDriver,
    neo4jAura: Neo4jAuraDriver,
    memgraph: MemgraphDriver,
    arangodb: ArangodbDriver,
    falkordb: FalkordbDriver,
  ) {
    this.drivers = new Map<string, Partial<GraphDriver>>([
      [cognodb.platformName, cognodb],
      [neo4jAura.platformName, neo4jAura],
      [memgraph.platformName, memgraph],
      [arangodb.platformName, arangodb],
      [falkordb.platformName, falkordb],
    ]);
  }

  get(platform: string): Partial<GraphDriver> {
    const driver = this.drivers.get(platform);
    if (!driver) {
      throw new Error(
        `Unknown platform "${platform}". Available: ${[...this.drivers.keys()].join(', ')}`,
      );
    }
    return driver;
  }

  all(): Partial<GraphDriver>[] {
    return [...this.drivers.values()];
  }

  names(): string[] {
    return [...this.drivers.keys()];
  }
}

import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { CognodbModule } from './drivers/cognodb/cognodb.module';
import { Neo4jAuraModule } from './drivers/neo4j-aura/neo4j-aura.module';
import { MemgraphModule } from './drivers/memgraph/memgraph.module';
import { ArangodbModule } from './drivers/arangodb/arangodb.module';
import { FalkordbModule } from './drivers/falkordb/falkordb.module';
import { DriverRegistry } from './drivers/driver.registry';
import { DatasetModule } from './dataset/dataset.module';
import { ResultCollectorService } from './benchmark/metrics/result-collector.service';
import { TraversalWorkload } from './benchmark/workloads/traversal.workload';
import { LookupWorkload } from './benchmark/workloads/lookup.workload';
import { AggregationWorkload } from './benchmark/workloads/aggregation.workload';
import { MixedWorkload } from './benchmark/workloads/mixed.workload';
import { LoadCommand } from './cli/load.command';
import { RunCommand } from './cli/run.command';
import { ReportCommand } from './cli/report.command';
import { ReportingModule } from './reporting/reporting.module';

@Module({
  imports: [
    ConfigModule,
    DatasetModule,
    CognodbModule,
    Neo4jAuraModule,
    MemgraphModule,
    ArangodbModule,
    FalkordbModule,
    ReportingModule,
  ],
  providers: [
    DriverRegistry,
    ResultCollectorService,
    TraversalWorkload,
    LookupWorkload,
    AggregationWorkload,
    MixedWorkload,
    LoadCommand,
    RunCommand,
    ReportCommand,
  ],
})
export class AppModule {}

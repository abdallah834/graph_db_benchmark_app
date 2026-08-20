import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { neo4jAuraConfig } from '../../config/platforms.config';
import { Neo4jAuraDriver } from './neo4j-aura.driver';

@Module({
  imports: [ConfigModule.forFeature(neo4jAuraConfig)],
  providers: [Neo4jAuraDriver],
  exports: [Neo4jAuraDriver],
})
export class Neo4jAuraModule {}

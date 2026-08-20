import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { memgraphConfig } from '../../config/platforms.config';
import { MemgraphDriver } from './memgraph.driver';

@Module({
  imports: [ConfigModule.forFeature(memgraphConfig)],
  providers: [MemgraphDriver],
  exports: [MemgraphDriver],
})
export class MemgraphModule {}

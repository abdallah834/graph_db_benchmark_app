import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { falkordbConfig } from '../../config/platforms.config';
import { FalkordbDriver } from './falkordb.driver';

@Module({
  imports: [ConfigModule.forFeature(falkordbConfig)],
  providers: [FalkordbDriver],
  exports: [FalkordbDriver],
})
export class FalkordbModule {}

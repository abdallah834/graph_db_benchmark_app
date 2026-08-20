import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { arangodbConfig } from '../../config/platforms.config';
import { ArangodbDriver } from './arangodb.driver';

@Module({
  imports: [ConfigModule.forFeature(arangodbConfig)],
  providers: [ArangodbDriver],
  exports: [ArangodbDriver],
})
export class ArangodbModule {}

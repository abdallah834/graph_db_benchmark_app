import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { cognodbConfig } from '../../config/platforms.config';
import { CognodbDriver } from './cognodb.driver';

@Module({
  imports: [ConfigModule.forFeature(cognodbConfig)],
  providers: [CognodbDriver],
  exports: [CognodbDriver],
})
export class CognodbModule {}

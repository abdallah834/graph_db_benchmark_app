import { Module } from '@nestjs/common';
import { DatasetLoaderService } from './dataset-loader.service';

@Module({
  providers: [DatasetLoaderService],
  exports: [DatasetLoaderService],
})
export class DatasetModule {}

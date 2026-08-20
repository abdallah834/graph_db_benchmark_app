import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { allPlatformConfigs } from './platforms.config';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.development', '.env.production'],
      load: allPlatformConfigs,
      // Fail fast: missing credentials should stop the CLI before any
      // workload runs, not surface as a confusing connection error later.
      validationSchema: Joi.object({
        COGNODB_URI: Joi.string().uri().required(),
        COGNODB_PASSWORD: Joi.string().required(),

        NEO4J_AURA_URI: Joi.string().uri().required(),
        NEO4J_AURA_PASSWORD: Joi.string().required(),

        MEMGRAPH_URI: Joi.string().uri().required(),
        // Memgraph Cloud typically ships with auth disabled on the free tier,
        // so user/password stay optional even though the URI is required.

        ARANGODB_URL: Joi.string().uri().required(),
        ARANGODB_PASSWORD: Joi.string().required(),

        FALKORDB_HOST: Joi.string().required(),
        FALKORDB_PORT: Joi.string().optional(),
        FALKORDB_PASSWORD: Joi.string().optional(),
        // FalkorDB Cloud free-tier instances are typically provisioned with a
        // password; self-hosted/local Docker instances often have none.
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
  ],
})
export class ConfigModule {}

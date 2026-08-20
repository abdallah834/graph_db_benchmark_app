import { registerAs } from '@nestjs/config';

export const cognodbConfig = registerAs('cognodb', () => ({
  uri: process.env.COGNODB_URI,
  user: process.env.COGNODB_USER ?? 'cognodb',
  password: process.env.COGNODB_PASSWORD,
}));

export const neo4jAuraConfig = registerAs('neo4jAura', () => ({
  uri: process.env.NEO4J_AURA_URI,
  user: process.env.NEO4J_AURA_USER ?? 'neo4j',
  password: process.env.NEO4J_AURA_PASSWORD,
}));

export const memgraphConfig = registerAs('memgraph', () => ({
  uri: process.env.MEMGRAPH_URI,
  user: process.env.MEMGRAPH_USER ?? '',
  password: process.env.MEMGRAPH_PASSWORD ?? '',
}));

export const arangodbConfig = registerAs('arangodb', () => ({
  url: process.env.ARANGODB_URL,
  db: process.env.ARANGODB_DB ?? '_system',
  user: process.env.ARANGODB_USER ?? 'root',
  password: process.env.ARANGODB_PASSWORD,
}));

export const falkordbConfig = registerAs('falkordb', () => ({
  host: process.env.FALKORDB_HOST,
  port: process.env.FALKORDB_PORT
    ? parseInt(process.env.FALKORDB_PORT, 10)
    : 6379,
  username: process.env.FALKORDB_USERNAME,
  password: process.env.FALKORDB_PASSWORD,
}));

// Add every new platform's config here so ConfigModule.forRoot({ load }) picks it up.
export const allPlatformConfigs = [
  cognodbConfig,
  neo4jAuraConfig,
  memgraphConfig,
  arangodbConfig,
  falkordbConfig,
];

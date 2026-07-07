export * from './client';
export * as schema from './schema/index';
// Seed entry points (used by api integration tests and dev tooling)
export { seedLibrary } from './seed/library';
export { seedDemo } from './seed/demo';
// Query vocabulary, re-exported so consumers share this package's drizzle-orm
// instance (a second peer-resolved instance breaks type identity — better-auth's
// kysely peer forks the resolution otherwise)
export {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
export { migrate } from 'drizzle-orm/node-postgres/migrator';

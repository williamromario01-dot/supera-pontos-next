import { MongoClient } from "mongodb";

import {
  ACTIVITY_PERSISTENCE_INDEXES,
  ensureActivityPersistenceIndexes,
} from "../src/lib/activity-persistence.ts";
import {
  ensureScoringModeIndexes,
  SCORING_MODE_COLLECTION,
  SCORING_MODE_INDEXES,
} from "../src/lib/school-scoring-mode.ts";

const uri = process.env.MONGODB_ACTIVITY_STAGING_URI?.trim();
const databaseName = process.env.MONGODB_ACTIVITY_STAGING_DB?.trim();

function fail(message) {
  throw new Error(`SAFE_INDEX_SETUP_REFUSED: ${message}`);
}

if (process.env.NODE_ENV === "production") fail("NODE_ENV cannot be production");
if (process.env.ACTIVITY_INDEX_SETUP_ALLOWED !== "true") fail("ACTIVITY_INDEX_SETUP_ALLOWED must equal true");
if (!uri || !databaseName) fail("dedicated staging URI and database name are required");
if (uri === process.env.MONGODB_URI) fail("staging URI must not equal MONGODB_URI");
if (!/(localhost|127\.0\.0\.1|mongodb\.net)/i.test(uri)) fail("URI is not a recognized local or Atlas MongoDB endpoint");
if (!/(staging|homolog|test|dev)/i.test(databaseName)) fail("database name must identify a non-production environment");

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
try {
  await client.connect();
  const db = client.db(databaseName);
  await ensureActivityPersistenceIndexes(db);
  await ensureScoringModeIndexes(db);

  const expected = [
    ...ACTIVITY_PERSISTENCE_INDEXES.map((index) => ({ collection: index.collection, name: index.options.name, unique: Boolean(index.options.unique) })),
    ...SCORING_MODE_INDEXES.map((index) => ({ collection: SCORING_MODE_COLLECTION, name: index.options.name, unique: Boolean(index.options.unique) })),
  ];
  for (const item of expected) {
    const indexes = await db.collection(item.collection).indexes();
    const actual = indexes.find((index) => index.name === item.name);
    if (!actual || Boolean(actual.unique) !== item.unique) fail(`index verification failed: ${item.collection}.${item.name}`);
  }
  console.log(`Verified ${expected.length} automatic-scoring indexes in isolated database ${databaseName}.`);
} finally {
  await client.close();
}

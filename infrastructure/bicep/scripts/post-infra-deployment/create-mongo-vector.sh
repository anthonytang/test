#!/usr/bin/env bash
# =============================================================================
# Create vector index for Azure Cosmos DB for MongoDB vCore
# =============================================================================
# Usage Example:
#   ./create-mongo-vector.sh "mongodb+srv://user:password@mongocluster.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000"
# =============================================================================

set -euo pipefail

URI="${1:-}"

if [[ -z "$URI" ]]; then
  echo "❌ Missing MongoDB connection string."
  echo "Usage: $0 \"mongodb+srv://user:password@cluster.mongodb.net/?tls=true\""
  exit 1
fi

DB="vectordb"
COLL="documents"
IDX_OLD="vectorSearchIndex"
IDX_NEW="vector_index"

echo "🔗 Connecting to MongoDB..."
echo "📦 Database:  $DB"
echo "📄 Collection: $COLL"
echo ""

mongosh "$URI" --quiet <<'MONGO'
const dbName = "vectordb";
const collName = "documents";
const oldIndex = "vectorSearchIndex";
const newIndex = "vector_index";

const db = db.getSiblingDB(dbName);
const coll = db.getCollection(collName);

print(`Checking collection ${dbName}.${collName}...`);

if (!db.getCollectionNames().includes(collName)) {
  throw new Error(`Collection ${collName} not found in ${dbName}.`);
}

// Drop legacy index if it exists
const old = coll.getIndexes().find(i => i.name === oldIndex);
if (old) {
  print(`Found old index '${oldIndex}' → dropping...`);
  coll.dropIndex(oldIndex);
  print(`Dropped '${oldIndex}'.`);
}

// Drop conflicting vector_index if exists
const current = coll.getIndexes().find(i => i.name === newIndex);
if (current) {
  print(`Existing '${newIndex}' found → dropping to recreate...`);
  coll.dropIndex(newIndex);
}

// Step 1: Create regular index on file_id for filtering
// This is REQUIRED for filtered vector search to work
print(`Creating index on 'file_id' for filter support...`);
try {
  coll.createIndex({ file_id: 1 }, { name: "file_id_idx" });
  print(`✅ Created 'file_id_idx' index`);
} catch (e) {
  if (e.message.includes("already exists")) {
    print(`ℹ️ 'file_id_idx' already exists`);
  } else {
    throw e;
  }
}

// Step 2: Create regular index on user_id for filtering (optional but recommended)
print(`Creating index on 'user_id' for filter support...`);
try {
  coll.createIndex({ user_id: 1 }, { name: "user_id_idx" });
  print(`✅ Created 'user_id_idx' index`);
} catch (e) {
  if (e.message.includes("already exists")) {
    print(`ℹ️ 'user_id_idx' already exists`);
  } else {
    throw e;
  }
}

// Step 3: Create new vector index using HNSW (required for filtered vector search)
// NOTE: vector-ivf does NOT support pre-filtering, only vector-hnsw does
print(`Creating vector index '${newIndex}' (HNSW, COS, dim=1536)...`);
const res = db.runCommand({
  createIndexes: collName,
  indexes: [
    {
      name: newIndex,
      key: { embedding: "cosmosSearch" },
      cosmosSearchOptions: {
        kind: "vector-hnsw",
        m: 16,
        efConstruction: 64,
        similarity: "COS",
        dimensions: 1536
      }
    }
  ]
});

if (res.ok !== 1) {
  throw new Error(`❌ Index creation failed: ${tojson(res)}`);
}

print(`✅ Vector index '${newIndex}' created successfully!`);

// Show all indexes for verification
print(`\n📋 Current indexes on ${collName}:`);
coll.getIndexes().forEach(idx => {
  print(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
});

// Sanity check
const sample = coll.findOne({ embedding: { $exists: true } }, { embedding: 1 });
if (sample?.embedding) {
  print(`Found embedding with length ${sample.embedding.length}.`);
} else {
  print(`⚠️ No documents with embeddings found yet.`);
}

print("🎉 Done.");
MONGO

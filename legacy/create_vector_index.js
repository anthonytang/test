// Create vector similarity index for Cosmos DB MongoDB vCore
// This creates the required index for vector similarity search

// Connect to the collection
use vectordb;

// Create vector search index on the 'embedding' field
db.documents.createIndex(
  { "embedding": "cosmosSearch" },
  { 
    "cosmosSearchOptions": {
      "kind": "vector-ivf",
      "numLists": 100,
      "similarity": "COS",
      "dimensions": 1536
    }
  }
);

// Verify the index was created
db.documents.getIndexes();

print("Vector similarity index created successfully!");
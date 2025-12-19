#!/usr/bin/env python3
"""
Script to check indexes in working Cosmos DB MongoDB vCore
"""

from pymongo import MongoClient

# Test-run Cosmos DB connection string
WORKING_CONNECTION_STRING = "mongodb+srv://mongodbadmin:TestRun2024%21%40%23@testrun-studio-test-mongo.mongocluster.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000"
DATABASE_NAME = "vectordb"
COLLECTION_NAME = "documents"

def check_indexes():
    """Check existing indexes in the working database"""
    try:
        print("Connecting to TEST-RUN Cosmos DB MongoDB...")
        client = MongoClient(WORKING_CONNECTION_STRING)
        
        # Get database and collection
        database = client[DATABASE_NAME]
        collection = database[COLLECTION_NAME]
        
        print(f"Checking indexes on collection '{COLLECTION_NAME}'...")
        
        # List all indexes
        print("\nExisting indexes in TEST-RUN database:")
        indexes = list(collection.list_indexes())
        
        for i, index in enumerate(indexes, 1):
            print(f"\n{i}. Index: {index.get('name', 'unnamed')}")
            print(f"   Key: {index.get('key', {})}")
            if 'cosmosSearchOptions' in index:
                print(f"   Vector Search Options: {index['cosmosSearchOptions']}")
            if index.get('key', {}).get('embedding') == 'cosmosSearch':
                print("   ✅ VECTOR SIMILARITY INDEX FOUND!")
        
        if not indexes:
            print("   No indexes found")
        
        # Check collection stats
        stats = database.command("collStats", COLLECTION_NAME)
        print(f"\nCollection stats:")
        print(f"   Document count: {stats.get('count', 0)}")
        print(f"   Size: {stats.get('size', 0)} bytes")
        
    except Exception as e:
        print(f"Error checking indexes: {e}")
        return False
    
    finally:
        try:
            client.close()
        except:
            pass
    
    return True

if __name__ == "__main__":
    check_indexes()
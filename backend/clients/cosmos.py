"""Cosmos DB MongoDB vCore client for embeddings, vector storage, and search."""

import asyncio
import logging
from typing import List, Dict, Any, Union, Optional

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

from .openai import get_azure_client
from core.config import (
    COSMOS_MONGODB_CONNECTION_STRING,
    COSMOS_DATABASE_NAME,
    COSMOS_COLLECTION_NAME,
    EMBEDDING_MODEL_NAME,
    COSMOS_BATCH_SIZE,
    COSMOS_RATE_LIMIT_DELAY,
    COSMOS_EMBEDDING_BATCH_DELAY,
    COSMOS_MAX_EMBEDDING_BATCH_SIZE,
    COSMOS_MAX_POOL_SIZE,
    COSMOS_MIN_POOL_SIZE,
    COSMOS_MAX_IDLE_TIME_MS,
    COSMOS_SERVER_SELECTION_TIMEOUT_MS,
    COSMOS_CONNECT_TIMEOUT_MS,
    COSMOS_SOCKET_TIMEOUT_MS
)


class CosmosVectorError(Exception):
    """Simple exception for Cosmos vector operations"""
    pass


class CosmosVectorClient:
    """
    Azure Cosmos DB for MongoDB vCore client for document storage and retrieval.

    Features:
    - Azure OpenAI embedding generation
    - Vector storage with metadata
    - Similarity search with filtering
    - Batch and individual document operations
    """

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.batch_size = COSMOS_BATCH_SIZE
        self.connection_string = COSMOS_MONGODB_CONNECTION_STRING
        self.database_name = COSMOS_DATABASE_NAME
        self.collection_name = COSMOS_COLLECTION_NAME

        self.client = MongoClient(
            self.connection_string,
            maxPoolSize=COSMOS_MAX_POOL_SIZE,
            minPoolSize=COSMOS_MIN_POOL_SIZE,
            maxIdleTimeMS=COSMOS_MAX_IDLE_TIME_MS,
            serverSelectionTimeoutMS=COSMOS_SERVER_SELECTION_TIMEOUT_MS,
            connectTimeoutMS=COSMOS_CONNECT_TIMEOUT_MS,
            socketTimeoutMS=COSMOS_SOCKET_TIMEOUT_MS
        )
        self.database: Database = self.client[self.database_name]
        self.collection: Collection = self.database[self.collection_name]

        self.azure_client = get_azure_client()
        self.embedding_model = EMBEDDING_MODEL_NAME

    async def get_embeddings(self, texts: Union[str, List[str]]) -> Union[List[float], List[List[float]]]:
        """Generate embeddings for text(s). Returns single embedding for string, list for list."""
        try:
            if not texts:
                raise CosmosVectorError("Text input cannot be empty")

            is_single = isinstance(texts, str)
            texts_list = [texts] if is_single else texts
            all_embeddings = []

            for batch_start in range(0, len(texts_list), COSMOS_MAX_EMBEDDING_BATCH_SIZE):
                batch_texts = texts_list[batch_start:batch_start + COSMOS_MAX_EMBEDDING_BATCH_SIZE]

                try:
                    response = await self.azure_client.embeddings.create(
                        model=self.embedding_model,
                        input=batch_texts
                    )
                    all_embeddings.extend([data.embedding for data in response.data])

                    if batch_start + COSMOS_MAX_EMBEDDING_BATCH_SIZE < len(texts_list):
                        await asyncio.sleep(COSMOS_EMBEDDING_BATCH_DELAY)

                except Exception as e:
                    if "429" in str(e) or "rate limit" in str(e).lower():
                        self.logger.warning(f"Rate limit hit, retrying after delay")
                        await asyncio.sleep(COSMOS_EMBEDDING_BATCH_DELAY * 2)
                        response = await self.azure_client.embeddings.create(
                            model=self.embedding_model,
                            input=batch_texts
                        )
                        all_embeddings.extend([data.embedding for data in response.data])
                    else:
                        raise

            return all_embeddings[0] if is_single else all_embeddings

        except Exception as e:
            self.logger.error(f"Embedding generation failed: {e}")
            raise CosmosVectorError(f"Failed to generate embeddings: {e}")

    async def batch_upsert_documents(self, chunks: List[Dict[str, Any]], file_id: str, file_name: str, namespace: str, document_metadata: Optional[Dict[str, Any]] = None):
        """Batch upsert document chunks with embeddings to vector store."""
        if not chunks or not file_id or not file_name or not namespace:
            raise CosmosVectorError("All parameters (chunks, file_id, file_name, namespace) are required")

        total_vectors = 0
        reserved_keys = {'text', 'file_id', 'file_name', 'user_id', 'chunk_index', 'start_line'}

        for i in range(0, len(chunks), self.batch_size):
            batch = chunks[i:i + self.batch_size]

            texts = [chunk['text'] for chunk in batch]
            embeddings = await self.get_embeddings(texts)

            documents = []
            for j, (chunk, embedding) in enumerate(zip(batch, embeddings)):
                chunk_index = i + j
                document = {
                    "_id": f"{file_id}_{chunk_index}",
                    "text": chunk['text'],
                    "embedding": embedding,
                    "file_id": file_id,
                    "file_name": file_name,
                    "chunk_index": chunk_index,
                    "start_line": chunk['start_line'],
                    "token_count": chunk.get('token_count', 0),
                    "user_id": namespace
                }

                # Add chunk metadata (Excel fields like sheet_name, sheet_index)
                if 'metadata' in chunk:
                    for key, value in chunk['metadata'].items():
                        if value is not None and key not in reserved_keys:
                            document[key] = value

                # Add document-level metadata
                if document_metadata:
                    for key, value in document_metadata.items():
                        if value is not None:
                            document[key] = value

                documents.append(document)

            # Insert or replace on duplicate
            try:
                await asyncio.to_thread(self.collection.insert_many, documents, ordered=False)
            except Exception as insert_error:
                if "duplicate" in str(insert_error).lower():
                    for doc in documents:
                        await asyncio.to_thread(self.collection.replace_one, {"_id": doc["_id"]}, doc, upsert=True)
                else:
                    raise

            total_vectors += len(documents)

            if i + self.batch_size < len(chunks):
                await asyncio.sleep(COSMOS_RATE_LIMIT_DELAY)

        self.logger.info(f"Batch upsert completed: {total_vectors} vectors")

    async def search(self, query: str, file_ids: List[str], top_k: int = 5, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Search vectors by file IDs and return ranked results with metadata."""
        try:
            if not query or not file_ids:
                raise CosmosVectorError("Query and file_ids are required")
            if top_k <= 0 or top_k > 100:
                raise CosmosVectorError("top_k must be between 1 and 100")

            query_embedding = await self.get_embeddings(query)

            mongo_filter = {"file_id": {"$in": file_ids}}
            if filters:
                for key, value in filters.items():
                    if value is not None:
                        mongo_filter[key] = value

            pipeline = [
                {
                    "$search": {
                        "cosmosSearch": {
                            "vector": query_embedding,
                            "path": "embedding",
                            "k": top_k,
                            "filter": mongo_filter
                        },
                        "returnStoredSource": True
                    }
                },
                {
                    "$project": {
                        "_id": 1, "text": 1, "file_id": 1, "file_name": 1,
                        "chunk_index": 1, "start_line": 1, "token_count": 1, "user_id": 1,
                        "sheet_name": 1, "sheet_index": 1,
                        "doc_type": 1, "ticker": 1, "period_label": 1,
                        "blurb": 1, "company": 1, "sector": 1, "source_url": 1,
                        "score": {"$meta": "searchScore"}
                    }
                }
            ]

            results = await asyncio.to_thread(lambda: list(self.collection.aggregate(pipeline)))

            optional_fields = [
                'sheet_name', 'sheet_index', 'doc_type', 'ticker',
                'period_label', 'blurb', 'company', 'sector', 'source_url'
            ]

            matches = []
            for result in results:
                match = {
                    "id": result["_id"],
                    "score": result["score"],
                    "text": result["text"],
                    "file_id": result["file_id"],
                    "file_name": result["file_name"],
                    "chunk_index": result["chunk_index"],
                    "start_line": result["start_line"],
                    "token_count": result.get("token_count", 1024),
                    "user_id": result["user_id"]
                }

                metadata = {
                    "text": result["text"],
                    "file_id": result["file_id"],
                    "file_name": result["file_name"],
                    "chunk_index": result["chunk_index"],
                    "start_line": result["start_line"],
                    "user_id": result["user_id"]
                }

                for field in optional_fields:
                    if field in result and result[field] is not None:
                        metadata[field] = result[field]

                match["metadata"] = metadata
                matches.append(match)

            return matches

        except Exception as e:
            self.logger.error(f"Search failed: {e}")
            raise CosmosVectorError(f"Search operation failed: {e}")

    async def delete_document(self, document_id: str, namespace: str):
        """Delete all chunks for a document."""
        if not document_id or not namespace:
            raise CosmosVectorError("document_id and namespace are required")

        result = await asyncio.to_thread(
            self.collection.delete_many,
            {"file_id": document_id, "user_id": namespace}
        )
        self.logger.info(f"Deleted document {document_id}: {result.deleted_count} chunks")

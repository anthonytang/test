"""Cosmos DB MongoDB vCore client for embeddings, vector storage, and search."""

import asyncio
import logging
from typing import List, Dict, Any, Union, Optional

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

from core.exceptions import DatabaseError, AIError
from core import Chunk, Match, File, Slice, Meta, Unit
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
    COSMOS_SOCKET_TIMEOUT_MS,
)


class CosmosVectorError(DatabaseError):
    """Specific error for Cosmos vector operations"""

    pass


class CosmosVectorClient:
    """
    Azure Cosmos DB for MongoDB vCore client for document storage and retrieval.

    Features:
    - Azure OpenAI embedding generation
    - Vector storage with units array
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
            socketTimeoutMS=COSMOS_SOCKET_TIMEOUT_MS,
        )
        self.database: Database = self.client[self.database_name]
        self.collection: Collection = self.database[self.collection_name]

        self.azure_client = get_azure_client()
        self.embedding_model = EMBEDDING_MODEL_NAME

    async def get_embeddings(
        self, texts: Union[str, List[str]]
    ) -> Union[List[float], List[List[float]]]:
        """Generate embeddings for text(s). Returns single embedding for string, list for list."""
        try:
            is_single = isinstance(texts, str)
            texts_list = [texts] if is_single else texts
            all_embeddings = []

            for batch_start in range(
                0, len(texts_list), COSMOS_MAX_EMBEDDING_BATCH_SIZE
            ):
                batch_texts = texts_list[
                    batch_start : batch_start + COSMOS_MAX_EMBEDDING_BATCH_SIZE
                ]

                try:
                    response = await self.azure_client.embeddings.create(
                        model=self.embedding_model, input=batch_texts
                    )
                    all_embeddings.extend([data.embedding for data in response.data])

                    if batch_start + COSMOS_MAX_EMBEDDING_BATCH_SIZE < len(texts_list):
                        await asyncio.sleep(COSMOS_EMBEDDING_BATCH_DELAY)

                except Exception as e:
                    if "429" in str(e) or "rate limit" in str(e).lower():
                        self.logger.warning("Rate limit hit, retrying after delay")
                        await asyncio.sleep(COSMOS_EMBEDDING_BATCH_DELAY * 2)
                        response = await self.azure_client.embeddings.create(
                            model=self.embedding_model, input=batch_texts
                        )
                        all_embeddings.extend(
                            [data.embedding for data in response.data]
                        )
                    else:
                        raise

            return all_embeddings[0] if is_single else all_embeddings

        except Exception as e:
            self.logger.error(f"Embedding generation failed: {e}", exc_info=True)
            raise AIError(f"Failed to generate embeddings: {e}")

    async def batch_upsert_documents(
        self, chunks: List[Chunk], namespace: str, meta: Meta
    ):
        """Batch upsert document chunks with embeddings to vector store."""
        total_vectors = 0

        for i in range(0, len(chunks), self.batch_size):
            batch = chunks[i : i + self.batch_size]

            texts = ["\n".join(unit.text for unit in chunk.units) for chunk in batch]
            embeddings = await self.get_embeddings(texts)

            documents = []
            for j, (chunk, embedding) in enumerate(zip(batch, embeddings)):
                chunk_index = i + j
                document = {
                    "_id": f"{chunk.file.id}_{chunk_index}",
                    "embedding": embedding,
                    "units": [unit.model_dump() for unit in chunk.units],
                    "tokens": chunk.tokens,
                    "file_id": chunk.file.id,
                    "file_name": chunk.file.name,
                    "chunk_index": chunk_index,
                    "user_id": namespace,
                    "company": meta.company,
                    "ticker": meta.ticker,
                    "doc_type": meta.doc_type,
                    "period_label": meta.period_label,
                    "blurb": meta.blurb,
                }

                if chunk.slice:
                    document["sheet"] = chunk.slice.sheet
                    document["truncated"] = chunk.slice.truncated

                documents.append(document)

            try:
                await asyncio.to_thread(
                    self.collection.insert_many, documents, ordered=False
                )
            except Exception as insert_error:
                if "duplicate" in str(insert_error).lower():
                    for doc in documents:
                        await asyncio.to_thread(
                            self.collection.replace_one,
                            {"_id": doc["_id"]},
                            doc,
                            upsert=True,
                        )
                else:
                    raise

            total_vectors += len(documents)

            if i + self.batch_size < len(chunks):
                await asyncio.sleep(COSMOS_RATE_LIMIT_DELAY)

        self.logger.info(f"Batch upsert completed: {total_vectors} vectors")

    async def search(
        self,
        query: str,
        file_ids: List[str],
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Match]:
        """Search vectors by file IDs and return ranked matches."""
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
                            "filter": mongo_filter,
                        },
                        "returnStoredSource": True,
                    }
                },
                {
                    "$project": {
                        "_id": 1,
                        "units": 1,
                        "tokens": 1,
                        "file_id": 1,
                        "file_name": 1,
                        "sheet": 1,
                        "truncated": 1,
                        "doc_type": 1,
                        "ticker": 1,
                        "company": 1,
                        "period_label": 1,
                        "blurb": 1,
                        "score": {"$meta": "searchScore"},
                    }
                },
            ]

            results = await asyncio.to_thread(
                lambda: list(self.collection.aggregate(pipeline))
            )

            matches = []
            for r in results:
                units = [Unit(**u) for u in r["units"]]

                slice = None
                if "sheet" in r and r["sheet"]:
                    slice = Slice(sheet=r["sheet"], truncated=r["truncated"])

                match = Match(
                    id=r["_id"],
                    score=r["score"],
                    file=File(id=r["file_id"], name=r["file_name"]),
                    units=units,
                    tokens=r["tokens"],
                    slice=slice,
                    meta=Meta(
                        company=r.get("company"),
                        ticker=r.get("ticker"),
                        doc_type=r.get("doc_type"),
                        period_label=r.get("period_label"),
                        blurb=r.get("blurb"),
                    ),
                )
                matches.append(match)

            return matches

        except Exception as e:
            self.logger.error(f"Search failed: {e}", exc_info=True)
            raise CosmosVectorError(f"Search operation failed: {e}")

    async def delete_file(self, file_id: str, namespace: str):
        """Delete all chunks for an file."""
        if not file_id or not namespace:
            raise CosmosVectorError("file_id and namespace are required")

        result = await asyncio.to_thread(
            self.collection.delete_many, {"file_id": file_id, "user_id": namespace}
        )
        self.logger.info(f"Deleted file {file_id}: {result.deleted_count} chunks")

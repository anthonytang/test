import json
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
import redis.asyncio as redis
from core.config import REDIS_URL, USE_REDIS

logger = logging.getLogger(__name__)

class StateStore(ABC):
    @abstractmethod
    async def set(self, key: str, value: Any, expire: int = 3600): pass
    @abstractmethod
    async def get(self, key: str) -> Optional[Any]: pass
    @abstractmethod
    async def delete(self, key: str): pass

class MemoryStore(StateStore):
    def __init__(self):
        self._data: Dict[str, str] = {}
    async def set(self, key: str, value: Any, expire: int = 3600):
        self._data[key] = json.dumps(value)
    async def get(self, key: str) -> Optional[Any]:
        val = self._data.get(key)
        return json.loads(val) if val else None
    async def delete(self, key: str):
        self._data.pop(key, None)

class RedisStore(StateStore):
    def __init__(self):
        self.client = redis.from_url(REDIS_URL, decode_responses=True)
    async def set(self, key: str, value: Any, expire: int = 3600):
        await self.client.set(key, json.dumps(value), ex=expire)
    async def get(self, key: str) -> Optional[Any]:
        val = await self.client.get(key)
        return json.loads(val) if val else None
    async def delete(self, key: str):
        await self.client.delete(key)

class StateManager:
    def __init__(self):
        if USE_REDIS:
            logger.info("StateManager: Using Redis mode")
            self.store = RedisStore()
        else:
            logger.info("StateManager: Using Memory mode fallback")
            self.store = MemoryStore()

    def _get_key(self, job_type: str, job_id: str) -> str:
        return f"job:{job_type}:{job_id}"

    async def set_job_state(self, job_type: str, job_id: str, data: Dict):
        await self.store.set(self._get_key(job_type, job_id), data)

    async def get_job_state(self, job_type: str, job_id: str) -> Optional[Dict]:
        return await self.store.get(self._get_key(job_type, job_id))

    async def update_progress(self, job_type: str, job_id: str, progress: int, message: str, extra: Dict = {}):
        state = await self.get_job_state(job_type, job_id) or {}
        state.update({"progress": progress, "message": message, **extra})
        await self.set_job_state(job_type, job_id, state)

    async def delete_job_state(self, job_type: str, job_id: str):
        await self.store.delete(self._get_key(job_type, job_id))
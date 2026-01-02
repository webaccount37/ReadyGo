"""
Generic async HTTP client wrapper using aiohttp.
Provides retry/backoff placeholder functionality.
"""

import asyncio
from typing import Optional, Dict, Any
import aiohttp
import logging

logger = logging.getLogger(__name__)


class HttpClient:
    """
    Async HTTP client wrapper using aiohttp.
    Provides get/post/put/delete methods with retry/backoff support.
    """
    
    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout: int = 30,
        max_retries: int = 3,
        retry_delay: float = 1.0,
    ):
        """
        Initialize HTTP client.
        
        Args:
            base_url: Optional base URL for all requests
            timeout: Request timeout in seconds
            max_retries: Maximum number of retry attempts
            retry_delay: Initial delay between retries in seconds
        """
        self.base_url = base_url
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=self.timeout)
        return self._session
    
    async def close(self) -> None:
        """Close the HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()
    
    def _build_url(self, endpoint: str) -> str:
        """Build full URL from endpoint."""
        if self.base_url:
            return f"{self.base_url.rstrip('/')}/{endpoint.lstrip('/')}"
        return endpoint
    
    async def _request_with_retry(
        self,
        method: str,
        url: str,
        **kwargs: Any,
    ) -> aiohttp.ClientResponse:
        """
        Make HTTP request with retry logic.
        
        Args:
            method: HTTP method
            url: Request URL
            **kwargs: Additional arguments for aiohttp request
            
        Returns:
            aiohttp ClientResponse
        """
        session = await self._get_session()
        last_exception = None
        
        for attempt in range(self.max_retries):
            try:
                async with session.request(method, url, **kwargs) as response:
                    # Raise for status codes >= 400
                    response.raise_for_status()
                    return response
            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                last_exception = e
                if attempt < self.max_retries - 1:
                    delay = self.retry_delay * (2 ** attempt)  # Exponential backoff
                    logger.warning(
                        f"Request failed (attempt {attempt + 1}/{self.max_retries}): {e}. Retrying in {delay}s..."
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(f"Request failed after {self.max_retries} attempts: {e}")
        
        raise last_exception or Exception("Request failed")
    
    async def get(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Make GET request.
        
        Args:
            endpoint: API endpoint
            params: Query parameters
            headers: Request headers
            
        Returns:
            JSON response as dictionary
        """
        url = self._build_url(endpoint)
        response = await self._request_with_retry("GET", url, params=params, headers=headers)
        return await response.json()
    
    async def post(
        self,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Make POST request.
        
        Args:
            endpoint: API endpoint
            data: Form data
            json: JSON data
            headers: Request headers
            
        Returns:
            JSON response as dictionary
        """
        url = self._build_url(endpoint)
        response = await self._request_with_retry("POST", url, data=data, json=json, headers=headers)
        return await response.json()
    
    async def put(
        self,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Make PUT request.
        
        Args:
            endpoint: API endpoint
            data: Form data
            json: JSON data
            headers: Request headers
            
        Returns:
            JSON response as dictionary
        """
        url = self._build_url(endpoint)
        response = await self._request_with_retry("PUT", url, data=data, json=json, headers=headers)
        return await response.json()
    
    async def delete(
        self,
        endpoint: str,
        headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Make DELETE request.
        
        Args:
            endpoint: API endpoint
            headers: Request headers
            
        Returns:
            JSON response as dictionary
        """
        url = self._build_url(endpoint)
        response = await self._request_with_retry("DELETE", url, headers=headers)
        return await response.json()













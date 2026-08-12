"""
Middleware for security, error handling, and request processing.
Production-ready middleware for MMPI platform.
"""
import os
import time
import logging
from typing import Callable
from datetime import datetime, timezone
from collections import defaultdict

from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("mmpi")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        
        if os.getenv("ENVIRONMENT", "development") == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Simple in-memory rate limiting middleware.
    For production, consider using Redis-based rate limiting.
    """
    
    def __init__(self, app, requests_per_minute: int = 60, burst_limit: int = 10):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.burst_limit = burst_limit
        self.request_counts = defaultdict(list)
        self.cleanup_interval = 60
        self.last_cleanup = time.time()
    
    def _get_client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
    
    def _cleanup_old_requests(self):
        """Remove request timestamps older than 1 minute."""
        current_time = time.time()
        if current_time - self.last_cleanup < self.cleanup_interval:
            return
        
        cutoff = current_time - 60
        for ip in list(self.request_counts.keys()):
            self.request_counts[ip] = [
                ts for ts in self.request_counts[ip] if ts > cutoff
            ]
            if not self.request_counts[ip]:
                del self.request_counts[ip]
        
        self.last_cleanup = current_time
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Public GET endpoints (profile pages, availability, resources) are read-only
        # and stay unthrottled for booking-widget UX. Public POST endpoints that create
        # DB rows (bookings, intake submissions) are unauthenticated and would otherwise
        # be an open spam vector, so they stay rate limited even under /api/public/.
        # Exception: the payment-confirm endpoint is a payment-provider webhook target
        # (see confirm_payment's docstring in main.py) — callbacks all originate from a
        # small set of provider IPs and must never be throttled, or a real payment
        # confirmation could be dropped.
        is_public = request.url.path.startswith("/api/public/")
        is_payment_webhook = request.url.path.startswith("/api/public/pay/") and request.url.path.endswith("/confirm")
        if is_public and (request.method == "GET" or is_payment_webhook):
            return await call_next(request)
        
        self._cleanup_old_requests()
        
        client_ip = self._get_client_ip(request)
        current_time = time.time()
        cutoff = current_time - 60
        
        recent_requests = [ts for ts in self.request_counts[client_ip] if ts > cutoff]
        self.request_counts[client_ip] = recent_requests
        
        if len(recent_requests) >= self.requests_per_minute:
            logger.warning(f"Rate limit exceeded for IP: {client_ip}")
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests. Please try again later.",
                    "retry_after": 60
                },
                headers={"Retry-After": "60"}
            )
        
        recent_second = [ts for ts in recent_requests if ts > current_time - 1]
        if len(recent_second) >= self.burst_limit:
            logger.warning(f"Burst limit exceeded for IP: {client_ip}")
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Request rate too high. Please slow down.",
                    "retry_after": 1
                },
                headers={"Retry-After": "1"}
            )
        
        self.request_counts[client_ip].append(current_time)
        
        return await call_next(request)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log all requests with timing information."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        
        response = await call_next(request)
        
        process_time = (time.time() - start_time) * 1000
        
        if request.url.path.startswith("/api/"):
            log_data = {
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round(process_time, 2),
            }
            
            if response.status_code >= 400:
                logger.warning(f"Request failed: {log_data}")
            elif process_time > 1000:
                logger.warning(f"Slow request: {log_data}")
            else:
                logger.debug(f"Request: {log_data}")
        
        response.headers["X-Process-Time"] = str(round(process_time, 2))
        
        return response


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """
    Global error handler that catches unhandled exceptions
    and returns consistent error responses.
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        try:
            return await call_next(request)
        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"Unhandled exception: {str(e)}")
            
            is_production = os.getenv("ENVIRONMENT", "development") == "production"
            
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "An unexpected error occurred. Please try again later.",
                    "error_code": "INTERNAL_ERROR",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    **({"debug": str(e)} if not is_production else {})
                }
            )


def configure_cors_origins() -> list:
    """
    Configure CORS origins based on environment.
    Returns list of allowed origins.
    """
    env = os.getenv("ENVIRONMENT", "development")
    
    if env == "production":
        allowed_origins = os.getenv("ALLOWED_ORIGINS", "")
        if allowed_origins:
            return [origin.strip() for origin in allowed_origins.split(",")]
        return []
    
    return [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

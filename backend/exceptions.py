"""
Custom exceptions and error handling for MMPI platform.
Provides consistent error responses across the API.
"""
from typing import Optional, Any
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError as PydanticValidationError


class AppException(Exception):
    """Base application exception."""
    
    def __init__(
        self,
        message: str,
        status_code: int = 400,
        error_code: str = None,
        details: dict = None,
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code or "APP_ERROR"
        self.details = details or {}
        super().__init__(message)


class NotFoundError(AppException):
    """Resource not found."""
    
    def __init__(self, resource: str, resource_id: str = None):
        message = f"{resource} not found"
        if resource_id:
            message = f"{resource} with ID '{resource_id}' not found"
        super().__init__(
            message=message,
            status_code=404,
            error_code="NOT_FOUND",
            details={"resource": resource, "resource_id": resource_id}
        )


class UnauthorizedError(AppException):
    """Authentication required or failed."""
    
    def __init__(self, message: str = "Authentication required"):
        super().__init__(
            message=message,
            status_code=401,
            error_code="UNAUTHORIZED"
        )


class ForbiddenError(AppException):
    """Access denied."""
    
    def __init__(self, message: str = "Access denied"):
        super().__init__(
            message=message,
            status_code=403,
            error_code="FORBIDDEN"
        )


class ValidationError(AppException):
    """Input validation failed."""
    
    def __init__(self, message: str, field: str = None, details: dict = None):
        super().__init__(
            message=message,
            status_code=400,
            error_code="VALIDATION_ERROR",
            details={
                "field": field,
                **(details or {})
            }
        )


class ConflictError(AppException):
    """Resource conflict (e.g., duplicate)."""
    
    def __init__(self, message: str, resource: str = None):
        super().__init__(
            message=message,
            status_code=409,
            error_code="CONFLICT",
            details={"resource": resource}
        )


class RateLimitError(AppException):
    """Rate limit exceeded."""
    
    def __init__(self, retry_after: int = 60):
        super().__init__(
            message="Too many requests. Please try again later.",
            status_code=429,
            error_code="RATE_LIMITED",
            details={"retry_after": retry_after}
        )


class ServiceUnavailableError(AppException):
    """External service unavailable."""
    
    def __init__(self, service: str, message: str = None):
        super().__init__(
            message=message or f"{service} service is temporarily unavailable",
            status_code=503,
            error_code="SERVICE_UNAVAILABLE",
            details={"service": service}
        )


class PaymentError(AppException):
    """Payment processing failed."""
    
    def __init__(self, message: str, payment_id: str = None, gateway_error: str = None):
        super().__init__(
            message=message,
            status_code=400,
            error_code="PAYMENT_ERROR",
            details={
                "payment_id": payment_id,
                "gateway_error": gateway_error
            }
        )


class FileUploadError(AppException):
    """File upload failed."""
    
    def __init__(self, message: str, filename: str = None):
        super().__init__(
            message=message,
            status_code=400,
            error_code="FILE_UPLOAD_ERROR",
            details={"filename": filename}
        )


class IntegrationError(AppException):
    """External integration failed."""
    
    def __init__(self, integration: str, message: str, details: dict = None):
        super().__init__(
            message=message,
            status_code=502,
            error_code="INTEGRATION_ERROR",
            details={
                "integration": integration,
                **(details or {})
            }
        )


def create_error_response(exc: AppException) -> dict:
    """Create standardized error response."""
    return {
        "error": True,
        "message": exc.message,
        "error_code": exc.error_code,
        **({"details": exc.details} if exc.details else {})
    }


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """Handle AppException."""
    return JSONResponse(
        status_code=exc.status_code,
        content=create_error_response(exc)
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle HTTPException with consistent format."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "message": exc.detail,
            "error_code": "HTTP_ERROR",
        }
    )


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError
) -> JSONResponse:
    """Handle Pydantic validation errors with user-friendly messages."""
    errors = []
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"] if loc != "body")
        message = error["msg"]
        
        if "field required" in message.lower():
            message = f"{field} is required"
        elif "not a valid" in message.lower():
            message = f"Invalid value for {field}"
        
        errors.append({
            "field": field,
            "message": message,
        })
    
    return JSONResponse(
        status_code=422,
        content={
            "error": True,
            "message": "Validation failed",
            "error_code": "VALIDATION_ERROR",
            "details": {"errors": errors}
        }
    )


def register_exception_handlers(app):
    """Register all exception handlers with the FastAPI app."""
    from fastapi.exceptions import RequestValidationError
    
    app.add_exception_handler(AppException, app_exception_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)

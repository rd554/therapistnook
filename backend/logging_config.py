"""
Centralized logging configuration for MMPI platform.
Supports structured logging for production monitoring.
"""
import os
import sys
import json
import logging
from datetime import datetime, timezone
from typing import Any


class JSONFormatter(logging.Formatter):
    """
    JSON log formatter for production environments.
    Outputs structured logs compatible with log aggregation services.
    """
    
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        if hasattr(record, "extra_data"):
            log_data["data"] = record.extra_data
        
        return json.dumps(log_data, default=str)


class ColoredFormatter(logging.Formatter):
    """
    Colored log formatter for development environments.
    Makes logs easier to read in terminal.
    """
    
    COLORS = {
        "DEBUG": "\033[36m",     # Cyan
        "INFO": "\033[32m",      # Green
        "WARNING": "\033[33m",   # Yellow
        "ERROR": "\033[31m",     # Red
        "CRITICAL": "\033[35m",  # Magenta
    }
    RESET = "\033[0m"
    
    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, self.RESET)
        record.levelname = f"{color}{record.levelname}{self.RESET}"
        return super().format(record)


def setup_logging(
    level: str = None,
    json_format: bool = None,
) -> logging.Logger:
    """
    Configure application logging.
    
    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        json_format: Whether to use JSON formatting (default: True in production)
    
    Returns:
        Configured logger instance
    """
    env = os.getenv("ENVIRONMENT", "development")
    
    if level is None:
        level = os.getenv("LOG_LEVEL", "INFO" if env == "production" else "DEBUG")
    
    if json_format is None:
        json_format = env == "production"
    
    logger = logging.getLogger("mmpi")
    logger.setLevel(getattr(logging, level.upper()))
    
    logger.handlers.clear()
    
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(getattr(logging, level.upper()))
    
    if json_format:
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(ColoredFormatter(
            fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        ))
    
    logger.addHandler(handler)
    
    logging.getLogger("uvicorn.access").handlers = []
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    
    return logger


def get_logger(name: str = None) -> logging.Logger:
    """Get a logger instance."""
    if name:
        return logging.getLogger(f"mmpi.{name}")
    return logging.getLogger("mmpi")


class LogContext:
    """
    Context manager for adding extra data to log records.
    
    Usage:
        with LogContext(user_id="123", action="login"):
            logger.info("User logged in")
    """
    
    def __init__(self, **kwargs):
        self.extra = kwargs
        self.old_factory = None
    
    def __enter__(self):
        self.old_factory = logging.getLogRecordFactory()
        extra = self.extra
        
        def record_factory(*args, **kwargs):
            record = self.old_factory(*args, **kwargs)
            record.extra_data = extra
            return record
        
        logging.setLogRecordFactory(record_factory)
        return self
    
    def __exit__(self, *args):
        logging.setLogRecordFactory(self.old_factory)


def log_audit(
    logger: logging.Logger,
    action: str,
    user_id: str = None,
    resource_type: str = None,
    resource_id: str = None,
    details: dict = None,
    ip_address: str = None,
):
    """
    Log an audit event.
    
    Args:
        logger: Logger instance
        action: Action performed (e.g., "login", "create_patient")
        user_id: ID of user performing action
        resource_type: Type of resource affected
        resource_id: ID of resource affected
        details: Additional details
        ip_address: Client IP address
    """
    audit_data = {
        "audit": True,
        "action": action,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    
    if user_id:
        audit_data["user_id"] = user_id
    if resource_type:
        audit_data["resource_type"] = resource_type
    if resource_id:
        audit_data["resource_id"] = resource_id
    if ip_address:
        audit_data["ip_address"] = ip_address
    if details:
        audit_data["details"] = details
    
    logger.info(f"AUDIT: {action}", extra={"extra_data": audit_data})

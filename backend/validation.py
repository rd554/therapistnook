"""
Input validation utilities for MMPI platform.
Centralized validation functions for consistency and security.
"""
import re
import os
from typing import Optional, Tuple
from datetime import date


EMAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
PHONE_PATTERN = re.compile(r'^[\+]?[0-9]{7,15}$')
UUID_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
SLUG_PATTERN = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')

MAX_NAME_LENGTH = 200
MAX_EMAIL_LENGTH = 254
MAX_PHONE_LENGTH = 20
MAX_TEXT_LENGTH = 10000
MAX_NOTES_LENGTH = 50000


class ValidationError(Exception):
    """Custom validation error with field information."""
    
    def __init__(self, message: str, field: str = None):
        self.message = message
        self.field = field
        super().__init__(message)


def validate_email(email: str, required: bool = True) -> Optional[str]:
    """
    Validate and normalize email address.
    
    Args:
        email: Email address to validate
        required: Whether email is required
    
    Returns:
        Normalized email or None
    
    Raises:
        ValidationError: If email is invalid
    """
    if not email:
        if required:
            raise ValidationError("Email is required", "email")
        return None
    
    email = email.strip().lower()
    
    if len(email) > MAX_EMAIL_LENGTH:
        raise ValidationError(f"Email must be less than {MAX_EMAIL_LENGTH} characters", "email")
    
    if not EMAIL_PATTERN.match(email):
        raise ValidationError("Please enter a valid email address", "email")
    
    return email


def validate_phone(phone: str, required: bool = False) -> Optional[str]:
    """
    Validate and normalize phone number.
    
    Args:
        phone: Phone number to validate
        required: Whether phone is required
    
    Returns:
        Normalized phone or None
    
    Raises:
        ValidationError: If phone is invalid
    """
    if not phone:
        if required:
            raise ValidationError("Phone number is required", "phone")
        return None
    
    phone = phone.strip()
    
    if len(phone) > MAX_PHONE_LENGTH:
        raise ValidationError(f"Phone number must be less than {MAX_PHONE_LENGTH} characters", "phone")
    
    phone_clean = re.sub(r'[\s\-\(\)]', '', phone)
    
    if not PHONE_PATTERN.match(phone_clean):
        raise ValidationError("Please enter a valid phone number", "phone")
    
    return phone


def validate_name(name: str, field_name: str = "name", required: bool = True) -> Optional[str]:
    """
    Validate and sanitize a name field.
    
    Args:
        name: Name to validate
        field_name: Name of the field for error messages
        required: Whether name is required
    
    Returns:
        Sanitized name or None
    
    Raises:
        ValidationError: If name is invalid
    """
    if not name or not name.strip():
        if required:
            raise ValidationError(f"{field_name.title()} is required", field_name)
        return None
    
    name = name.strip()
    
    if len(name) > MAX_NAME_LENGTH:
        raise ValidationError(f"{field_name.title()} must be less than {MAX_NAME_LENGTH} characters", field_name)
    
    name = re.sub(r'<[^>]*>', '', name)
    
    return name


def validate_date_of_birth(dob: date) -> date:
    """
    Validate date of birth.
    
    Args:
        dob: Date of birth
    
    Returns:
        Validated date
    
    Raises:
        ValidationError: If date is invalid
    """
    if not dob:
        raise ValidationError("Date of birth is required", "date_of_birth")
    
    today = date.today()
    
    if dob > today:
        raise ValidationError("Date of birth cannot be in the future", "date_of_birth")
    
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    if age > 150:
        raise ValidationError("Please enter a valid date of birth", "date_of_birth")
    
    return dob


def validate_uuid(uuid_str: str, field_name: str = "id") -> str:
    """
    Validate UUID format.
    
    Args:
        uuid_str: UUID string to validate
        field_name: Name of the field for error messages
    
    Returns:
        Validated UUID string
    
    Raises:
        ValidationError: If UUID is invalid
    """
    if not uuid_str:
        raise ValidationError(f"{field_name} is required", field_name)
    
    if not UUID_PATTERN.match(uuid_str):
        raise ValidationError(f"Invalid {field_name} format", field_name)
    
    return uuid_str


def validate_text(
    text: str,
    field_name: str = "text",
    required: bool = True,
    max_length: int = MAX_TEXT_LENGTH,
) -> Optional[str]:
    """
    Validate and sanitize text content.
    
    Args:
        text: Text to validate
        field_name: Name of the field for error messages
        required: Whether text is required
        max_length: Maximum allowed length
    
    Returns:
        Sanitized text or None
    
    Raises:
        ValidationError: If text is invalid
    """
    if not text or not text.strip():
        if required:
            raise ValidationError(f"{field_name.title()} is required", field_name)
        return None
    
    text = text.strip()
    
    if len(text) > max_length:
        raise ValidationError(f"{field_name.title()} must be less than {max_length} characters", field_name)
    
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.IGNORECASE | re.DOTALL)
    
    return text


def validate_password(password: str, min_length: int = 6) -> str:
    """
    Validate password strength.
    
    Args:
        password: Password to validate
        min_length: Minimum password length
    
    Returns:
        Validated password
    
    Raises:
        ValidationError: If password is too weak
    """
    if not password:
        raise ValidationError("Password is required", "password")
    
    if len(password) < min_length:
        raise ValidationError(f"Password must be at least {min_length} characters long", "password")
    
    return password


def validate_enum(value: str, allowed_values: list, field_name: str) -> str:
    """
    Validate that a value is in an allowed list.
    
    Args:
        value: Value to validate
        allowed_values: List of allowed values
        field_name: Name of the field for error messages
    
    Returns:
        Validated value
    
    Raises:
        ValidationError: If value is not allowed
    """
    if value not in allowed_values:
        raise ValidationError(
            f"Invalid {field_name}. Must be one of: {', '.join(allowed_values)}",
            field_name
        )
    
    return value


def validate_file_upload(
    filename: str,
    content_type: str,
    file_size: int,
    allowed_extensions: list = None,
    allowed_mime_types: list = None,
    max_size_mb: int = 10,
) -> Tuple[bool, Optional[str]]:
    """
    Validate file upload.
    
    Args:
        filename: Name of uploaded file
        content_type: MIME type of file
        file_size: Size of file in bytes
        allowed_extensions: List of allowed file extensions
        allowed_mime_types: List of allowed MIME types
        max_size_mb: Maximum file size in megabytes
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not filename:
        return False, "Filename is required"
    
    filename = os.path.basename(filename)
    
    if allowed_extensions:
        ext = os.path.splitext(filename)[1].lower()
        if ext not in allowed_extensions:
            return False, f"File type not allowed. Allowed types: {', '.join(allowed_extensions)}"
    
    if allowed_mime_types and content_type:
        if content_type not in allowed_mime_types:
            return False, f"File type not allowed. Allowed types: {', '.join(allowed_mime_types)}"
    
    max_size_bytes = max_size_mb * 1024 * 1024
    if file_size > max_size_bytes:
        return False, f"File too large. Maximum size is {max_size_mb}MB"
    
    dangerous_extensions = ['.exe', '.dll', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js']
    ext = os.path.splitext(filename)[1].lower()
    if ext in dangerous_extensions:
        return False, "This file type is not allowed for security reasons"
    
    return True, None


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename for safe storage.
    
    Args:
        filename: Original filename
    
    Returns:
        Sanitized filename
    """
    filename = os.path.basename(filename)
    
    filename = re.sub(r'[^\w\s\-.]', '', filename)
    filename = re.sub(r'\s+', '_', filename)
    filename = re.sub(r'\.+', '.', filename)
    
    name, ext = os.path.splitext(filename)
    if len(name) > 100:
        name = name[:100]
    
    return name + ext

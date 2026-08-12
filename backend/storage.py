"""
Secure file storage service for clinical documents.
Files are stored locally with secure access control.
"""
import os
import hashlib
import aiofiles
from pathlib import Path
from datetime import datetime
from typing import Optional, Tuple
from fastapi import UploadFile, HTTPException

# Storage configuration
STORAGE_ROOT = os.getenv("STORAGE_ROOT", os.path.join(os.path.dirname(__file__), "uploads"))
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

ALLOWED_EXTENSIONS = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".txt": "text/plain",
}

# Audio file extensions for Session Intelligence
AUDIO_EXTENSIONS = {
    ".mp3": ["audio/mpeg", "audio/mp3"],
    ".wav": ["audio/wav", "audio/x-wav", "audio/wave"],
    ".m4a": ["audio/m4a", "audio/x-m4a", "audio/mp4"],
    ".mp4": ["audio/mp4", "video/mp4"],
}


def ensure_storage_exists():
    """Create storage directory if it doesn't exist."""
    Path(STORAGE_ROOT).mkdir(parents=True, exist_ok=True)


def get_patient_storage_path(patient_id: str) -> Path:
    """Get the storage path for a patient's documents."""
    path = Path(STORAGE_ROOT) / patient_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def validate_file_type(filename: str, content_type: str) -> Tuple[bool, str]:
    """Validate file type based on extension and content type."""
    ext = Path(filename).suffix.lower()
    
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"File type '{ext}' is not supported. Allowed types: {', '.join(ALLOWED_EXTENSIONS.keys())}"
    
    expected_mime = ALLOWED_EXTENSIONS[ext]
    
    # Handle multiple valid MIME types for certain extensions
    valid_mimes = {
        ".jpg": ["image/jpeg", "image/jpg"],
        ".jpeg": ["image/jpeg", "image/jpg"],
    }
    
    if ext in valid_mimes:
        if content_type not in valid_mimes[ext]:
            return False, f"Invalid content type for {ext} file"
    elif content_type != expected_mime:
        # Allow generic octet-stream as fallback
        if content_type != "application/octet-stream":
            return False, f"Content type mismatch for {ext} file"
    
    return True, ""


async def compute_file_hash(file_content: bytes) -> str:
    """Compute SHA-256 hash of file content."""
    return hashlib.sha256(file_content).hexdigest()


async def save_file(
    file: UploadFile,
    patient_id: str,
    document_id: str,
) -> Tuple[str, int, str]:
    """
    Save uploaded file securely.
    
    Returns: (storage_path, file_size, file_hash)
    """
    ensure_storage_exists()
    
    # Read file content
    content = await file.read()
    file_size = len(content)
    
    # Validate file size
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum allowed size of {MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    if file_size == 0:
        raise HTTPException(status_code=400, detail="Cannot upload empty file")
    
    # Compute hash for duplicate detection
    file_hash = await compute_file_hash(content)
    
    # Get file extension
    original_ext = Path(file.filename).suffix.lower()
    
    # Create storage path: uploads/{patient_id}/{document_id}{ext}
    patient_path = get_patient_storage_path(patient_id)
    storage_filename = f"{document_id}{original_ext}"
    storage_path = patient_path / storage_filename
    
    # Write file
    async with aiofiles.open(storage_path, "wb") as f:
        await f.write(content)
    
    # Return relative storage path
    relative_path = f"{patient_id}/{storage_filename}"
    
    return relative_path, file_size, file_hash


async def get_file_path(storage_path: str) -> Optional[Path]:
    """Get the absolute path to a stored file."""
    full_path = Path(STORAGE_ROOT) / storage_path
    if full_path.exists():
        return full_path
    return None


async def read_file(storage_path: str) -> Optional[bytes]:
    """Read file content from storage."""
    full_path = Path(STORAGE_ROOT) / storage_path
    if not full_path.exists():
        return None
    
    async with aiofiles.open(full_path, "rb") as f:
        return await f.read()


async def delete_file(storage_path: str) -> bool:
    """Delete a file from storage."""
    full_path = Path(STORAGE_ROOT) / storage_path
    if full_path.exists():
        full_path.unlink()
        return True
    return False


def get_mime_type(filename: str) -> str:
    """Get MIME type based on file extension."""
    ext = Path(filename).suffix.lower()
    return ALLOWED_EXTENSIONS.get(ext, "application/octet-stream")


# ═══════════════════════════════════════════════════════════════════════════════
#  AUDIO FILE STORAGE — Voice Profiles and Therapy Sessions
# ═══════════════════════════════════════════════════════════════════════════════

MAX_AUDIO_SIZE = 500 * 1024 * 1024  # 500MB for audio files


def validate_audio_file(filename: str, content_type: str) -> Tuple[bool, str]:
    """Validate audio file type based on extension and content type."""
    ext = Path(filename).suffix.lower()
    
    if ext not in AUDIO_EXTENSIONS:
        return False, f"Audio file type '{ext}' is not supported. Allowed types: {', '.join(AUDIO_EXTENSIONS.keys())}"
    
    expected_mimes = AUDIO_EXTENSIONS[ext]
    
    # Allow the file if content type matches any expected MIME type
    if content_type in expected_mimes:
        return True, ""
    
    # Also allow generic octet-stream as fallback
    if content_type == "application/octet-stream":
        return True, ""
    
    return False, f"Invalid content type for {ext} file. Expected one of: {expected_mimes}"


def get_voice_profile_storage_path(practitioner_id: str) -> Path:
    """Get the storage path for practitioner voice profiles."""
    path = Path(STORAGE_ROOT) / "voice_profiles" / practitioner_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_therapy_session_storage_path(patient_id: str) -> Path:
    """Get the storage path for patient therapy session recordings."""
    path = Path(STORAGE_ROOT) / "therapy_sessions" / patient_id
    path.mkdir(parents=True, exist_ok=True)
    return path


async def save_voice_profile(
    file: UploadFile,
    practitioner_id: str,
    profile_id: str,
) -> Tuple[str, int]:
    """
    Save voice profile audio file.
    
    Returns: (storage_path, file_size)
    """
    ensure_storage_exists()
    
    content = await file.read()
    file_size = len(content)
    
    if file_size > MAX_AUDIO_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Audio file size exceeds maximum allowed size of {MAX_AUDIO_SIZE // (1024*1024)}MB"
        )
    
    if file_size == 0:
        raise HTTPException(status_code=400, detail="Cannot upload empty file")
    
    original_ext = Path(file.filename).suffix.lower()
    profile_path = get_voice_profile_storage_path(practitioner_id)
    storage_filename = f"{profile_id}{original_ext}"
    storage_path = profile_path / storage_filename
    
    async with aiofiles.open(storage_path, "wb") as f:
        await f.write(content)
    
    relative_path = f"voice_profiles/{practitioner_id}/{storage_filename}"
    return relative_path, file_size


async def save_therapy_session_audio(
    file: UploadFile,
    patient_id: str,
    session_id: str,
) -> Tuple[str, int]:
    """
    Save therapy session audio file.
    
    Returns: (storage_path, file_size)
    """
    ensure_storage_exists()
    
    content = await file.read()
    file_size = len(content)
    
    if file_size > MAX_AUDIO_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Audio file size exceeds maximum allowed size of {MAX_AUDIO_SIZE // (1024*1024)}MB"
        )
    
    if file_size == 0:
        raise HTTPException(status_code=400, detail="Cannot upload empty file")
    
    original_ext = Path(file.filename).suffix.lower()
    session_path = get_therapy_session_storage_path(patient_id)
    storage_filename = f"{session_id}{original_ext}"
    storage_path = session_path / storage_filename
    
    async with aiofiles.open(storage_path, "wb") as f:
        await f.write(content)
    
    relative_path = f"therapy_sessions/{patient_id}/{storage_filename}"
    return relative_path, file_size


def get_audio_mime_type(filename: str) -> str:
    """Get MIME type for audio file based on extension."""
    ext = Path(filename).suffix.lower()
    mimes = AUDIO_EXTENSIONS.get(ext, [])
    return mimes[0] if mimes else "audio/mpeg"

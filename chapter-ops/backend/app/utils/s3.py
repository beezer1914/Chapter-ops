"""
S3-compatible storage utilities for Cloudflare R2 / AWS S3.

Provides functions for:
- Uploading files with validation
- Deleting files
- Generating public URLs
- Multi-tenant file organization
"""

import os
import uuid
import time
from typing import Tuple, Optional
from werkzeug.datastructures import FileStorage
import boto3
from botocore.exceptions import ClientError
from flask import current_app

# Allowed image types
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp', 'ico'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
MAX_FAVICON_SIZE = 1 * 1024 * 1024  # 1MB for favicons

# Magic byte signatures keyed by extension; each entry is a list of (offset, bytes) checks
_IMAGE_MAGIC: dict[str, list[tuple[int, bytes]]] = {
    'jpg':  [(0, b'\xff\xd8\xff')],
    'jpeg': [(0, b'\xff\xd8\xff')],
    'png':  [(0, b'\x89PNG\r\n\x1a\n')],
    'webp': [(0, b'RIFF'), (8, b'WEBP')],
    'ico':  [(0, b'\x00\x00\x01\x00')],
}


def _check_image_magic(data: bytes, ext: str) -> bool:
    checks = _IMAGE_MAGIC.get(ext)
    if not checks:
        return False
    return all(data[offset:offset + len(magic)] == magic for offset, magic in checks)


def get_s3_client():
    """Create boto3 S3 client from config."""
    return boto3.client(
        's3',
        endpoint_url=current_app.config['S3_ENDPOINT_URL'],
        aws_access_key_id=current_app.config['S3_ACCESS_KEY_ID'],
        aws_secret_access_key=current_app.config['S3_SECRET_ACCESS_KEY'],
        region_name=current_app.config['S3_REGION']
    )


def validate_image_file(file: FileStorage) -> Tuple[bool, Optional[str]]:
    """
    Validate uploaded file is an allowed image type and under size limit.

    Returns:
        (is_valid, error_message)
    """
    # Check filename exists
    if not file.filename:
        return False, "No file selected."

    # Check extension
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"

    # Check size (read and reset)
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)

    if size > MAX_FILE_SIZE:
        return False, f"File too large. Maximum size: {MAX_FILE_SIZE / 1024 / 1024}MB"

    # Validate magic bytes match declared extension
    header = file.read(16)
    file.seek(0)
    if not _check_image_magic(header, ext):
        return False, "File content does not match the declared image type."

    return True, None


def validate_favicon_file(file: FileStorage) -> Tuple[bool, Optional[str]]:
    """
    Validate uploaded favicon file (.ico or .png, max 1MB).

    Returns:
        (is_valid, error_message)
    """
    # Check filename exists
    if not file.filename:
        return False, "No file selected."

    # Check extension (only .ico and .png allowed for favicons)
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in {'ico', 'png'}:
        return False, "Favicon must be .ico or .png format."

    # Check size (read and reset) - stricter limit for favicons
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)

    if size > MAX_FAVICON_SIZE:
        return False, f"Favicon too large. Maximum size: {MAX_FAVICON_SIZE / 1024 / 1024}MB"

    # Validate magic bytes match declared extension
    header = file.read(16)
    file.seek(0)
    if not _check_image_magic(header, ext):
        return False, "File content does not match the declared favicon type."

    return True, None


def upload_file(
    file: FileStorage,
    resource_type: str,
    resource_id: str,
) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Upload file to S3.

    Args:
        file: FileStorage object from Flask request
        resource_type: 'users', 'organizations', 'chapters'
        resource_id: UUID of the resource

    Returns:
        (success, url_or_error, filename)
        - success: True if upload succeeded
        - url_or_error: Public URL if success, error message if failed
        - filename: S3 object key (path) if success, None if failed
    """
    # Validate
    is_valid, error = validate_image_file(file)
    if not is_valid:
        return False, error, None

    # Generate unique filename
    ext = file.filename.rsplit('.', 1)[1].lower()
    timestamp = int(time.time())
    unique_id = str(uuid.uuid4())[:8]
    filename = f"{resource_type}/{resource_id}/{timestamp}_{unique_id}.{ext}"

    try:
        s3 = get_s3_client()
        bucket = current_app.config['S3_BUCKET_NAME']

        # Derive ContentType from validated extension (never trust client-supplied value)
        _ext_to_mime = {
            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
            'webp': 'image/webp', 'ico': 'image/x-icon',
        }
        content_type = _ext_to_mime.get(ext, 'application/octet-stream')

        # Upload to R2 (public access controlled at bucket level)
        s3.put_object(
            Bucket=bucket,
            Key=filename,
            Body=file.read(),
            ContentType=content_type,
        )

        # Generate public URL (using R2.dev public domain, not API endpoint)
        public_base = current_app.config['S3_PUBLIC_URL']
        public_url = f"{public_base}/{filename}"

        return True, public_url, filename

    except ClientError as e:
        current_app.logger.error(f"S3 upload failed: {e}")
        return False, "File upload failed. Please try again.", None
    except Exception as e:
        current_app.logger.error(f"Unexpected error during upload: {e}")
        return False, "An unexpected error occurred.", None


def delete_file(filename: str) -> bool:
    """
    Delete a file from S3.

    Args:
        filename: S3 object key (path)

    Returns:
        True if deletion succeeded or file doesn't exist, False on error
    """
    try:
        s3 = get_s3_client()
        bucket = current_app.config['S3_BUCKET_NAME']
        s3.delete_object(Bucket=bucket, Key=filename)
        return True
    except ClientError as e:
        current_app.logger.error(f"S3 delete failed: {e}")
        return False
    except Exception as e:
        current_app.logger.error(f"Unexpected error during delete: {e}")
        return False


def extract_filename_from_url(url: str) -> Optional[str]:
    """
    Extract S3 object key from a public URL.

    Handles two URL formats:
      1. R2.dev public URL (no bucket in path):
         https://pub-xxx.r2.dev/users/123/file.jpg  ->  users/123/file.jpg
      2. R2 / S3 API URL (bucket in path):
         https://account.r2.cloudflarestorage.com/bucket/users/123/file.jpg  ->  users/123/file.jpg
    """
    if not url:
        return None

    # Try R2.dev public URL first — strip the configured public base URL prefix
    public_base = current_app.config.get('S3_PUBLIC_URL', '').rstrip('/')
    if public_base and url.startswith(public_base + '/'):
        return url[len(public_base) + 1:]

    # Fall back to bucket-in-path format (R2 API / standard S3)
    bucket = current_app.config['S3_BUCKET_NAME']
    parts = url.split(f"/{bucket}/")
    if len(parts) == 2:
        return parts[1]

    return None

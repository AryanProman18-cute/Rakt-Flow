import base64
import hashlib
import hmac
import json
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class PrivacyVault:
    """Small application-layer envelope encryption helper.

    Production deployments should source the 32-byte key from a managed secret store and
    rotate it through a versioned keyring. The database never receives plaintext phone or
    screening answers.
    """

    def __init__(self, encryption_key_b64: str, hash_pepper: str) -> None:
        if encryption_key_b64:
            key = base64.urlsafe_b64decode(encryption_key_b64.encode())
        else:
            # Development-only deterministic key; production configuration rejects this path.
            key = hashlib.sha256(b"raktflow-development-pii-key").digest()
        if len(key) != 32:
            raise ValueError("PII_ENCRYPTION_KEY must decode to exactly 32 bytes")
        self.cipher = AESGCM(key)
        self.hash_pepper = hash_pepper.encode()

    def encrypt_bytes(self, plaintext: bytes, *, context: str) -> bytes:
        nonce = os.urandom(12)
        ciphertext = self.cipher.encrypt(nonce, plaintext, context.encode())
        return b"RF1" + nonce + ciphertext

    def decrypt_bytes(self, envelope: bytes, *, context: str) -> bytes:
        if not envelope.startswith(b"RF1"):
            raise ValueError("Unknown encrypted envelope version")
        return self.cipher.decrypt(envelope[3:15], envelope[15:], context.encode())

    def encrypt_text(self, plaintext: str, *, context: str) -> str:
        return base64.urlsafe_b64encode(self.encrypt_bytes(plaintext.encode(), context=context)).decode()

    def encrypt_json(self, value: dict[str, Any], *, context: str) -> bytes:
        canonical = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
        return self.encrypt_bytes(canonical, context=context)

    def keyed_hash(self, normalized_value: str) -> bytes:
        return hmac.new(self.hash_pepper, normalized_value.encode(), hashlib.sha256).digest()


def normalize_phone(value: str) -> str:
    digits = "".join(character for character in value if character.isdigit())
    if not 10 <= len(digits) <= 15:
        raise ValueError("Phone number must contain 10 to 15 digits")
    return f"+{digits}"

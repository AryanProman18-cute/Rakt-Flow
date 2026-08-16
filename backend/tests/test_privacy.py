import base64
import secrets

from app.services.privacy import PrivacyVault, normalize_phone


def test_sensitive_values_are_encrypted_and_bound_to_context() -> None:
    key = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()
    vault = PrivacyVault(key, "p" * 32)
    envelope = vault.encrypt_bytes(b"+919876543210", context="donor-phone:123")
    assert b"9876543210" not in envelope
    assert vault.decrypt_bytes(envelope, context="donor-phone:123") == b"+919876543210"


def test_phone_hash_is_deterministic_but_not_plain_sha256() -> None:
    key = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()
    first = PrivacyVault(key, "first-pepper" * 3)
    second = PrivacyVault(key, "second-pepper" * 3)
    assert first.keyed_hash("+919876543210") == first.keyed_hash("+919876543210")
    assert first.keyed_hash("+919876543210") != second.keyed_hash("+919876543210")


def test_phone_normalization() -> None:
    assert normalize_phone("+91 98765-43210") == "+919876543210"

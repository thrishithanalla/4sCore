import hashlib
import hmac


class LocalHmacSigner:
    def __init__(self, key_id: str, key_raw: bytes):
        self._kid = key_id
        self._key = key_raw
    def signing_key_id(self) -> str:
        return self._kid
    def sign(self, payload: bytes) -> str:
        return hmac.new(self._key, payload, hashlib.sha256).hexdigest()

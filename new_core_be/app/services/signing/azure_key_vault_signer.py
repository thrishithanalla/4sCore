# Enable when moving to cloud (uses azure-identity & azure-keyvault-keys)
# from azure.identity import DefaultAzureCredential
# from azure.keyvault.keys import KeyClient
# from azure.keyvault.keys.crypto import CryptographyClient, SignatureAlgorithm
#
# class AzureKeyVaultSigner:
#     def __init__(self, vault_url: str, key_name: str, key_version: str | None = None):
#         cred = DefaultAzureCredential(exclude_shared_token_cache_credential=True)
#         kc = KeyClient(vault_url=vault_url, credential=cred)
#         key = kc.get_key(key_name, key_version) if key_version else kc.get_key(key_name)
#         self._id = key.id
#         self._crypto = CryptographyClient(key=key, credential=cred)
#     def signing_key_id(self) -> str:
#         return self._id
#     def sign(self, payload: bytes) -> str:
#         mac = self._crypto.sign(SignatureAlgorithm.HS256, payload).signature
#         return mac.hex()

from app.core.config import settings

from .local_hmac_signer import LocalHmacSigner
from .signer import Signer

# from .azure_key_vault_signer import AzureKeyVaultSigner   # enable when needed

def get_signer() -> Signer:
    if settings.SIGNING_MODE == "local":
        return LocalHmacSigner(settings.SIGNING_MODE, settings.LOG_KEY_ACTIVE_RAW.encode("utf-8"))
    # elif settings.signing_mode == "azure":
    #     return AzureKeyVaultSigner(settings.key_vault_url, settings.signing_key_name, settings.signing_key_version)
    return LocalHmacSigner(settings.SIGNING_MODE, settings.LOG_KEY_ACTIVE_RAW.encode("utf-8"))

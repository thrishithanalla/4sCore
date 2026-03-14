/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_FILE_UPLOAD_API: string
  readonly VITE_NOTIFICATIONS_API_BASE_URL: string
  readonly VITE_AUDITLOG_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

export type TurnStartTime = number

/** Max parallel file uploads per turn (restored tree: constant only). */
export const DEFAULT_UPLOAD_CONCURRENCY = 4

/** Hard cap on persisted files per turn. */
export const FILE_COUNT_LIMIT = 200

/** Directory (relative to the task output root) holding generated files. */
export const OUTPUTS_SUBDIR = 'outputs'

export interface PersistedFile {
  fileId: string
  filePath: string
}

export interface FailedPersistence {
  filePath: string
  error: string
}

export interface FilesPersistedEventData {
  persisted: PersistedFile[]
  failed: FailedPersistence[]
  skipped: string[]
}


// In its own file to avoid circular dependencies
export const FILE_EDIT_TOOL_NAME = 'Edit'

// Permission pattern for granting session-level access to the project's .mcode/ folder
export const MCODE_FOLDER_PERMISSION_PATTERN = '/.mcode/**'

// Permission pattern for granting session-level access to the global ~/.mcode/ folder
export const GLOBAL_MCODE_FOLDER_PERMISSION_PATTERN = '~/.mcode/**'

export const FILE_UNEXPECTEDLY_MODIFIED_ERROR =
  'File has been unexpectedly modified. Read it again before attempting to write it.'

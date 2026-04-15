export enum ERROR_MESSAGES {
  // AUTH / TOKEN
  UNAUTHORIZED = 'Unauthorized access.',
  FORBIDDEN = 'You do not have permission to perform this action.',
  INVALID_TOKEN = 'Invalid or expired token.',
  TOKEN_MISSING = 'Authentication token is missing.',
  TOKEN_EXPIRED = 'Token has expired.',

  // USER
  USER_NOT_FOUND = 'User not found.',
  USER_ALREADY_EXISTS = 'User already exists.',
  INVALID_CREDENTIALS = 'Invalid username or password.',

  // VALIDATION
  VALIDATION_FAILED = 'Validation failed for the provided input.',
  INVALID_PAYLOAD = 'Invalid request payload.',
  MISSING_REQUIRED_FIELDS = 'Missing required fields.',

  // DATABASE
  DB_ERROR = 'An unexpected database error occurred.',
  DB_CONNECTION_FAILED = 'Database connection failed.',
  RECORD_NOT_FOUND = 'Requested record does not exist.',
  DUPLICATE_RECORD = 'Record already exists.',

  // REQUEST / API
  BAD_REQUEST = 'Bad request.',
  INVALID_QUERY = 'Invalid query parameters.',
  INVALID_PARAMS = 'Invalid route parameters.',
  RESOURCE_NOT_FOUND = 'Requested resource not found.',
  TOO_MANY_REQUEST = 'ThrottlerException: Too Many Requests',

  // FILE UPLOAD
  FILE_TOO_LARGE = 'Uploaded file size is too large.',
  FILE_TYPE_NOT_ALLOWED = 'File type is not allowed.',

  // SERVER / UNKNOWN
  INTERNAL_SERVER_ERROR = 'An internal server error occurred.',
  UNKNOWN_ERROR = 'Something went wrong.',

  // UNIVERSAL VALID / REQUIRED
  VALID_TEXT = 'a valid text.',
  IS_REQUIRED = 'is required.',

  // Header missing
  HEADER_MISSING = 'Missing x-odoo-event or Invalid headeer',
}

export interface ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  error?: {
    code: string;
    details?: string | object;
  };
  meta?: {
    timestamp: string;
    requestId: string; //Always UUID, required for tracking
    [key: string]: any; // Optional additional metadata
  };
}

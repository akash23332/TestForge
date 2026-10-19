export interface HealthResponse {
  status: 'healthy' | 'degraded';
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  dependencies: {
    mongodb: {
      status: string;
      connected: boolean;
      databaseName: string | null;
      host: string | null;
    };
    redis: {
      configured: boolean;
      connected: boolean;
      mode: string;
    };
  };
  system: {
    nodeVersion: string;
    platform: string;
    memory: {
      rssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
    };
  };
  requestId?: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    requestId: string;
  };
}

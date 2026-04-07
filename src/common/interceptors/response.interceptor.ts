import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from 'src/common/interfaces';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx?.getResponse();
    const requestId = uuidv4();
    return next.handle().pipe(
      map((data: any) => {
        const message = data?.message || 'Request processed successfully';
        delete data?.message;
        return {
          success: true,
          statusCode: response.statusCode,
          message,
          data: data,
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
          },
        };
      }),
    );
  }
}

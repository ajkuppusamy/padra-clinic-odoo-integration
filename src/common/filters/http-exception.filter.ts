import { ERROR_MESSAGES } from 'src/common/constants';
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let safeMessage: any = ERROR_MESSAGES.UNKNOWN_ERROR;

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      let message: any;

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object') {
        message = (res as any).message;
      }

      const knownMessages = Object.values(ERROR_MESSAGES);

      if (Array.isArray(message)) {
        const safeMessages: string[] = [];

        message.forEach((msg: string) => {
          if (msg?.includes(ERROR_MESSAGES?.VALID_TEXT) || msg?.includes(ERROR_MESSAGES?.IS_REQUIRED)) {
            safeMessages.push(msg);
          }
        });

        safeMessage = safeMessages.length > 0 ? safeMessages.join(', ') : ERROR_MESSAGES.UNKNOWN_ERROR;
      } else {
        safeMessage = knownMessages.includes(message) ? message : message || ERROR_MESSAGES.UNKNOWN_ERROR;
      }
    } else {
      safeMessage = exception?.message || ERROR_MESSAGES.UNKNOWN_ERROR;
    }

    const errorResponse = {
      success: false,
      statusCode: status,
      message: safeMessage,
      meta: {
        timestamp: new Date().toISOString(),
        path: request.url,
        requestId: request.headers['x-request-id'] || undefined,
      },
    };
    response.status(status).json(errorResponse);
  }
}

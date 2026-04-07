import { ERROR_MESSAGES } from 'src/common/constants';
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let safeMessage: any = ERROR_MESSAGES.UNKNOWN_ERROR;

    if (exception instanceof HttpException) {
      const message = exception.message;
      const knownMessages = Object.values(ERROR_MESSAGES);
      safeMessage = knownMessages.includes(message as ERROR_MESSAGES)
        ? message
        : ERROR_MESSAGES.UNKNOWN_ERROR;

      if (Array.isArray(exception?.['response']?.message)) {
        const safeMessages: string[] = [];
        exception?.['response']?.message?.forEach((message: string) => {
          if (
            message?.includes(ERROR_MESSAGES?.VALID_TEXT) ||
            message?.includes(ERROR_MESSAGES?.IS_REQUIRED)
          ) {
            safeMessages.push(message);
          }
        });
        safeMessage = safeMessages?.join(', ') || safeMessage;
      }
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

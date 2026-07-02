import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoggerService } from '../shared/logger/logger.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const internalMessage = this.extractMessage(exception);
    const message =
      statusCode >= 500
        ? 'Une erreur interne est survenue. Réessayez plus tard.'
        : internalMessage;

    const payload = {
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    const context = 'AllExceptionsFilter';
    if (statusCode >= 500) {
      const trace =
        exception instanceof Error && exception.stack
          ? exception.stack
          : undefined;
      this.logger.error(
        `${request.method} ${request.url} -> ${String(statusCode)}: ${internalMessage}`,
        trace,
        context,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${String(statusCode)}: ${message}`,
        context,
      );
    }

    response.status(statusCode).json(payload);
  }

  private extractMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return response;
      }

      if (response && typeof response === 'object') {
        const message = (response as { message?: unknown }).message;
        if (Array.isArray(message)) {
          return message.join(', ');
        }
        if (typeof message === 'string' && message.trim()) {
          return message;
        }

        const error = (response as { error?: unknown }).error;
        if (typeof error === 'string' && error.trim()) {
          return error;
        }
      }

      return exception.message || 'Erreur HTTP';
    }

    if (exception instanceof Error && exception.message.trim()) {
      return exception.message;
    }

    return 'Erreur interne du serveur';
  }
}

import { Injectable } from '@nestjs/common';
import * as winston from 'winston';

type ActionResult = 'ok' | 'fail';

@Injectable()
export class LoggerService {
  private readonly logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL?.trim() || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      defaultMeta: {
        service: 'deploy-automation-backend',
      },
      transports: [new winston.transports.Console()],
    });
  }

  log(message: string, context?: string): void {
    this.logger.info({
      message,
      context,
    });
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error({
      message,
      context,
      trace,
    });
  }

  warn(message: string, context?: string): void {
    this.logger.warn({
      message,
      context,
    });
  }

  debug(message: string, context?: string): void {
    this.logger.debug({
      message,
      context,
    });
  }

  logAction(
    userId: string,
    action: string,
    resourceId: string,
    result: ActionResult,
    metadata?: object,
  ): void {
    this.logger.info({
      context: 'Audit',
      message: 'Action utilisateur',
      userId,
      action,
      resourceId,
      result,
      metadata: metadata ?? {},
    });
  }
}

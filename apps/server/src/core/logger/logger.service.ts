import { Injectable } from '@nestjs/common';
import * as winston from 'winston';
import { getLogContext } from './log-context';

type ActionResult = 'ok' | 'fail';

@Injectable()
export class LoggerService {
  private readonly logger: winston.Logger;

  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL?.trim() || 'info',
      format: isProduction
        ? // Production: one strict JSON object per line (ingestible by Loki/ELK).
          winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json(),
          )
        : // Development: readable, colorized text with the context fields appended.
          winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.colorize(),
            winston.format.printf((info) => {
              const { timestamp, level, message, context, correlationId, deploymentId } =
                info as Record<string, unknown>;
              const ctx = context ? ` [${String(context)}]` : '';
              const corr = correlationId ? ` (req:${String(correlationId)})` : '';
              const dep = deploymentId ? ` (dep:${String(deploymentId)})` : '';
              return `${String(timestamp)} ${level}${ctx}${corr}${dep} ${String(message)}`;
            }),
          ),
      defaultMeta: {
        service: 'deploy-automation-backend',
      },
      transports: [new winston.transports.Console()],
    });
  }

  /** Merge the active async-context (correlationId, deploymentId, …) into a log. */
  private withContext(fields: Record<string, unknown>): Record<string, unknown> {
    return { ...getLogContext(), ...fields };
  }

  log(message: string, context?: string): void {
    this.logger.info(this.withContext({ message, context }));
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error(this.withContext({ message, context, trace }));
  }

  warn(message: string, context?: string): void {
    this.logger.warn(this.withContext({ message, context }));
  }

  debug(message: string, context?: string): void {
    this.logger.debug(this.withContext({ message, context }));
  }

  logAction(
    userId: string,
    action: string,
    resourceId: string,
    result: ActionResult,
    metadata?: object,
  ): void {
    this.logger.info(
      this.withContext({
        context: 'Audit',
        message: 'Action utilisateur',
        userId,
        action,
        resourceId,
        result,
        metadata: metadata ?? {},
      }),
    );
  }
}

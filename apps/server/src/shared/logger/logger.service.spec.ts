jest.mock('winston', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return {
    createLogger: jest.fn(() => mockLogger),
    format: {
      combine: jest.fn(() => ({})),
      timestamp: jest.fn(() => ({})),
      errors: jest.fn(() => ({})),
      json: jest.fn(() => ({})),
      colorize: jest.fn(() => ({})),
      printf: jest.fn(() => ({})),
    },
    transports: {
      Console: jest.fn(() => ({})),
    },
  };
});

import * as winston from 'winston';
import { LoggerService } from './logger.service';

function getMockLogger() {
  const createLogger = winston.createLogger as jest.Mock;
  return createLogger.mock.results[createLogger.mock.results.length - 1]
    .value as {
    info: jest.Mock;
    error: jest.Mock;
    warn: jest.Mock;
    debug: jest.Mock;
  };
}

function makeSvc() {
  const svc = new LoggerService();
  const ml = getMockLogger();
  return {
    svc,
    infoSpy: ml.info,
    errorSpy: ml.error,
    warnSpy: ml.warn,
    debugSpy: ml.debug,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LoggerService', () => {
  describe('log', () => {
    it('calls logger.info with message and context', () => {
      const { svc, infoSpy } = makeSvc();
      svc.log('hello', 'TestCtx');
      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'hello', context: 'TestCtx' }),
      );
    });

    it('calls logger.info without context when omitted', () => {
      const { svc, infoSpy } = makeSvc();
      svc.log('msg only');
      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'msg only' }),
      );
    });
  });

  describe('error', () => {
    it('calls logger.error with message, trace, and context', () => {
      const { svc, errorSpy } = makeSvc();
      svc.error('boom', 'stack trace', 'ErrCtx');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'boom',
          trace: 'stack trace',
          context: 'ErrCtx',
        }),
      );
    });
  });

  describe('warn', () => {
    it('calls logger.warn with message and context', () => {
      const { svc, warnSpy } = makeSvc();
      svc.warn('watch out', 'WarnCtx');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'watch out', context: 'WarnCtx' }),
      );
    });
  });

  describe('debug', () => {
    it('calls logger.debug with message and context', () => {
      const { svc, debugSpy } = makeSvc();
      svc.debug('debug msg', 'DbgCtx');
      expect(debugSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'debug msg', context: 'DbgCtx' }),
      );
    });
  });

  describe('logAction', () => {
    it('calls logger.info with audit fields', () => {
      const { svc, infoSpy } = makeSvc();
      svc.logAction('user-1', 'DEPLOY', 'proj-1', 'ok', { env: 'prod' });
      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'Audit',
          userId: 'user-1',
          action: 'DEPLOY',
          resourceId: 'proj-1',
          result: 'ok',
          metadata: { env: 'prod' },
        }),
      );
    });

    it('uses empty object as metadata when not provided', () => {
      const { svc, infoSpy } = makeSvc();
      svc.logAction('user-1', 'LOGIN', 'user-1', 'ok');
      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: {} }),
      );
    });
  });
});

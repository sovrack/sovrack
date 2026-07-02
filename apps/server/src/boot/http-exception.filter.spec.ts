import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { LoggerService } from '../shared/logger/logger.service';
import { AllExceptionsFilter } from './http-exception.filter';

function makeHost(): {
  host: ArgumentsHost;
  status: jest.Mock;
  json: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/x', method: 'GET' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  let logger: { error: jest.Mock; warn: jest.Mock };
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    logger = { error: jest.fn(), warn: jest.fn() };
    filter = new AllExceptionsFilter(logger as unknown as LoggerService);
  });

  it('returns the real message + warns for a 4xx HttpException', () => {
    const { host, status, json } = makeHost();
    filter.catch(new BadRequestException('bad input'), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'bad input',
        path: '/x',
      }),
    );
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('hides internals (generic message) + logs the stack for a 5xx', () => {
    const { host, status, json } = makeHost();
    filter.catch(new Error('DB password leaked in message'), host);
    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0] as { message: string };
    expect(body.message).toBe(
      'Une erreur interne est survenue. Réessayez plus tard.',
    );
    expect(body.message).not.toContain('password');
    // The real cause + stack are logged server-side only.
    expect(logger.error).toHaveBeenCalled();
    const [, trace] = logger.error.mock.calls[0];
    expect(typeof trace).toBe('string');
  });

  it('flattens a class-validator array message', () => {
    const { host, json } = makeHost();
    filter.catch(
      new HttpException({ message: ['name required', 'port invalid'] }, 422),
      host,
    );
    expect((json.mock.calls[0][0] as { message: string }).message).toBe(
      'name required, port invalid',
    );
  });
});

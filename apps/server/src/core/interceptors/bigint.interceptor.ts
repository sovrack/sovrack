import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class BigIntSerializationInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((payload) => serializeBigInts(payload)));
  }
}

export function serializeBigInts(
  value: unknown,
  seen = new WeakMap<object, unknown>(),
): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return seen.get(value);
    }

    const converted: unknown[] = [];
    seen.set(value, converted);

    for (const item of value) {
      converted.push(serializeBigInts(item, seen));
    }

    return converted;
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) {
      return seen.get(value);
    }

    const converted: Record<string, unknown> = {};
    seen.set(value, converted);

    for (const [key, nestedValue] of Object.entries(value)) {
      converted[key] = serializeBigInts(nestedValue, seen);
    }

    return converted;
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

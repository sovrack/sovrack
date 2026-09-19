import { NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProductCapabilityGuard } from './product-capability.guard';

describe('ProductCapabilityGuard', () => {
  const context = {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;

  it('allows routes without capability metadata', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    expect(new ProductCapabilityGuard(reflector).canActivate(context)).toBe(
      true,
    );
  });

  it('returns a neutral 404 for planned capabilities', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('managedInfrastructure'),
    } as unknown as Reflector;
    expect(() =>
      new ProductCapabilityGuard(reflector).canActivate(context),
    ).toThrow(NotFoundException);
  });
});

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  isProductCapabilityEnabled,
  type ProductCapability,
} from './product-capability';
import { PRODUCT_CAPABILITY_KEY } from './requires-product-capability.decorator';

@Injectable()
export class ProductCapabilityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const capability = this.reflector.getAllAndOverride<ProductCapability>(
      PRODUCT_CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!capability || isProductCapabilityEnabled(capability)) return true;

    throw new NotFoundException({
      code: 'PRODUCT_CAPABILITY_UNAVAILABLE',
      message: "Cette fonctionnalité n'est pas disponible dans la V1",
    });
  }
}

import { SetMetadata } from '@nestjs/common';
import type { ProductCapability } from './product-capability';

export const PRODUCT_CAPABILITY_KEY = 'sovrack:product-capability';

export const RequiresProductCapability = (capability: ProductCapability) =>
  SetMetadata(PRODUCT_CAPABILITY_KEY, capability);

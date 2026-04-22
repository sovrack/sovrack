import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSshKeyDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(10)
  privateKey: string;

  @IsString()
  @MinLength(10)
  publicKey: string;

  @IsOptional()
  @IsIn(['rsa', 'ed25519'])
  keyType?: string;
}

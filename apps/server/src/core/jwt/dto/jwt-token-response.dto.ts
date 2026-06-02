/**
 * JWT Token Response DTO — what clients receive after login.
 */
export class JwtTokenResponseDto {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string = 'Bearer';
}

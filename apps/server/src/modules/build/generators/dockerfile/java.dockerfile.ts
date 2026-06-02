import { DockerfileGenerateOptions } from './dockerfile.types';

/**
 * Used for both `java` and `spring-boot` types.
 */
export function generateJavaDockerfile(
  options: DockerfileGenerateOptions,
): string {
  const port = options.port ?? 3000;
  const startCmd = options.startCmd ?? 'java -jar app.jar';
  return [
    'FROM maven:3.9-eclipse-temurin-21 AS builder',
    'WORKDIR /app',
    'COPY pom.xml .',
    'RUN mvn dependency:go-offline -B || true',
    'COPY src ./src',
    'RUN mvn package -DskipTests -B',
    '',
    'FROM eclipse-temurin:21-jre-alpine AS runner',
    'WORKDIR /app',
    'RUN apk add --no-cache wget',
    'RUN addgroup -g 1001 -S java && \\',
    '    adduser -u 1001 -S java -G java',
    'COPY --from=builder --chown=java:java /app/target/*.jar app.jar',
    'USER java',
    `EXPOSE ${port}`,
    'HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \\',
    `  CMD wget -qO- http://localhost:${port}/actuator/health || exit 1`,
    `CMD ["sh", "-c", "${startCmd}"]`,
  ].join('\n');
}

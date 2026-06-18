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
    'FROM eclipse-temurin:21-jdk-alpine AS builder',
    'WORKDIR /app',
    'COPY pom.xml* build.gradle* build.gradle.kts* gradle* ./',
    'RUN if [ -f pom.xml ]; then \\',
    '      mvn dependency:go-offline -B || true; \\',
    '    elif [ -f build.gradle ] || [ -f build.gradle.kts ]; then \\',
    '      if [ -f gradlew ]; then ./gradlew --no-daemon build -x test || true; else gradle build -x test || true; fi \\',
    '    fi',
    'COPY src ./src',
    'RUN if [ -f pom.xml ]; then \\',
    '      mvn package -DskipTests -B; \\',
    '    elif [ -f build.gradle ] || [ -f build.gradle.kts ]; then \\',
    '      if [ -f gradlew ]; then ./gradlew --no-daemon build -x test; else gradle build -x test; fi \\',
    '    else \\',
    '      echo "No pom.xml or build.gradle found" >&2; exit 1; \\',
    '    fi',
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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { buildSwaggerConfig } from '../boot/swagger';

async function exportOpenApi() {
  // Contract generation must be deterministic and must not contact Redis or
  // start background workers/crons. The dynamic import ensures these flags are
  // set before AppModule and its providers are evaluated.
  process.env.OPENAPI_EXPORT = 'true';
  process.env.PROCESS_ROLE = 'api';
  const { AppModule } = await import('../app.module.js');

  const app = await NestFactory.create(AppModule, { logger: false });
  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());

  const outputPath = resolve(
    process.cwd(),
    process.env.OPENAPI_OUTPUT_PATH ??
      '../frontend/src/generated/api-contract.openapi.json',
  );

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(document, null, 2) + '\n', 'utf8');

  await app.close();
  process.stdout.write(`OpenAPI exported to ${outputPath}\n`);
}

void exportOpenApi().catch((error: unknown) => {
  process.stderr.write(
    `Failed to export OpenAPI schema: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});

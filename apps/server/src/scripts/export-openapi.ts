import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../app.module';
import { buildSwaggerConfig } from '../core/config/swagger';

async function exportOpenApi() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());

  const outputPath = resolve(
    process.cwd(),
    '../frontend/src/generated/api-contract.openapi.json',
  );

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(document, null, 2) + '\n', 'utf8');

  await app.close();
  process.stdout.write(`OpenAPI exported to ${outputPath}\n`);
}

exportOpenApi()
  // Force exit: background workers (BullMQ deploy worker, cron schedulers)
  // keep the event loop alive even after app.close(), so the script would
  // otherwise hang instead of returning to the shell / CI.
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    process.stderr.write(
      `Failed to export OpenAPI schema: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exit(1);
  });

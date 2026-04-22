import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../app.module';
import { buildSwaggerConfig } from '../common/config/swagger';

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

exportOpenApi().catch((error: unknown) => {
  process.stderr.write(
    `Failed to export OpenAPI schema: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
});

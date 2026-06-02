import { Injectable } from '@nestjs/common';
import { generateDefaultDockerfile } from './default.dockerfile';
import { DockerfileGenerateOptions } from './dockerfile.types';
import { generateGoDockerfile } from './go.dockerfile';
import { generateJavaDockerfile } from './java.dockerfile';
import { generateNestjsDockerfile } from './nestjs.dockerfile';
import { generateNextjsDockerfile } from './nextjs.dockerfile';
import { generateLaravelDockerfile, generatePhpDockerfile } from './php.dockerfile';
import { generatePostgresDockerfile } from './postgres.dockerfile';
import { generateDjangoDockerfile, generatePythonDockerfile } from './python.dockerfile';
import { generateReactDockerfile } from './react.dockerfile';
import { generateRedisDockerfile } from './redis.dockerfile';
import { generateRubyDockerfile } from './ruby.dockerfile';
import { generateRustDockerfile } from './rust.dockerfile';
import { generateStaticDockerfile } from './static.dockerfile';

export type { DockerfileGenerateOptions } from './dockerfile.types';

@Injectable()
export class DockerfileGenerator {
  generate(type: string, options: DockerfileGenerateOptions): string {
    const normalizedType = type.toLowerCase();

    switch (normalizedType) {
      case 'nestjs':
      case 'nodejs':
        return generateNestjsDockerfile(options);
      case 'nextjs':
        return generateNextjsDockerfile(options);
      case 'python':
        return generatePythonDockerfile(options);
      case 'django':
        return generateDjangoDockerfile(options);
      case 'php':
        return generatePhpDockerfile(options);
      case 'laravel':
        return generateLaravelDockerfile(options);
      case 'ruby':
        return generateRubyDockerfile(options);
      case 'go':
      case 'golang':
        return generateGoDockerfile(options);
      case 'spring-boot':
      case 'java':
        return generateJavaDockerfile(options);
      case 'postgres-service':
        return generatePostgresDockerfile(options);
      case 'redis-service':
        return generateRedisDockerfile(options);
      case 'react':
        return generateReactDockerfile(options);
      case 'rust':
        return generateRustDockerfile(options);
      case 'static-frontend':
      case 'static':
      case 'docker':
      case 'dockerized':
      case 'compose':
        return generateStaticDockerfile(options);
      default:
        return generateDefaultDockerfile(options);
    }
  }
}

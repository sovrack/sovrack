import { Injectable } from '@nestjs/common';
import { generateDefaultDockerfile } from './default.dockerfile';
import { DockerfileGenerateOptions } from './dockerfile.types';
import { generateGoDockerfile } from './go.dockerfile';
import { generateJavaDockerfile } from './java.dockerfile';
import { generateNestjsDockerfile } from './nestjs.dockerfile';
import { generateNextjsDockerfile } from './nextjs.dockerfile';
import {
  generateLaravelDockerfile,
  generatePhpDockerfile,
} from './php.dockerfile';
import {
  generateDjangoDockerfile,
  generatePythonDockerfile,
} from './python.dockerfile';
import { generateReactDockerfile } from './react.dockerfile';
import { generatePostgresDockerfile } from '../../../../templates/docker-images/postgres.dockerfile';
import { generateRedisDockerfile } from '../../../../templates/docker-images/redis.dockerfile';
import { generateMysqlDockerfile } from '../../../../templates/docker-images/mysql.dockerfile';
import { generateMongoDockerfile } from '../../../../templates/docker-images/mongo.dockerfile';
import { generateRabbitmqDockerfile } from '../../../../templates/docker-images/rabbitmq.dockerfile';
import { generateRubyDockerfile } from './ruby.dockerfile';
import { generateRustDockerfile } from './rust.dockerfile';
import { generateStaticDockerfile } from './static.dockerfile';

export type { DockerfileGenerateOptions } from './dockerfile.types';

@Injectable()
export class DockerfileGenerator {
  generate(type: string, options: DockerfileGenerateOptions): string {
    const normalizedType = type.toLowerCase();
    const typeAwareOptions = { ...options, type: normalizedType };

    switch (normalizedType) {
      case 'nestjs':
      case 'nodejs':
        return generateNestjsDockerfile(typeAwareOptions);
      case 'nextjs':
        return generateNextjsDockerfile(typeAwareOptions);
      case 'python':
        return generatePythonDockerfile(typeAwareOptions);
      case 'django':
        return generateDjangoDockerfile(typeAwareOptions);
      case 'php':
        return generatePhpDockerfile(typeAwareOptions);
      case 'laravel':
        return generateLaravelDockerfile(typeAwareOptions);
      case 'ruby':
        return generateRubyDockerfile(typeAwareOptions);
      case 'go':
      case 'golang':
        return generateGoDockerfile(typeAwareOptions);
      case 'spring-boot':
      case 'java':
        return generateJavaDockerfile(typeAwareOptions);
      case 'postgres-service':
        return generatePostgresDockerfile(typeAwareOptions);
      case 'redis-service':
        return generateRedisDockerfile(typeAwareOptions);
      case 'mysql-service':
        return generateMysqlDockerfile(typeAwareOptions);
      case 'mongo-service':
        return generateMongoDockerfile(typeAwareOptions);
      case 'rabbitmq-service':
        return generateRabbitmqDockerfile(typeAwareOptions);
      case 'react':
        return generateReactDockerfile(typeAwareOptions);
      case 'rust':
        return generateRustDockerfile(typeAwareOptions);
      case 'static-frontend':
      case 'static':
      case 'docker':
      case 'dockerized':
      case 'compose':
        return generateStaticDockerfile(typeAwareOptions);
      default:
        return generateDefaultDockerfile(typeAwareOptions);
    }
  }
}

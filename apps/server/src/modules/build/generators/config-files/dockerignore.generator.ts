import { Injectable } from '@nestjs/common';

@Injectable()
export class DockerignoreGenerator {
  generate(): string {
    return [
      '.git',
      '.gitlab',
      '.github',
      'node_modules',
      'dist',
      'build',
      '.next',
      '.turbo',
      'coverage',
      '.env',
      '.env.*',
      '*.log',
      'tmp',
      '.DS_Store',
    ].join('\n');
  }
}

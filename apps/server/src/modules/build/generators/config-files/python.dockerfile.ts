import { DockerfileGenerateOptions } from './dockerfile.types';

/**
 * Used for both `python` and `django` types.
 * The startCmd defaults differ depending on the type.
 */
export function generatePythonDockerfile(
  options: DockerfileGenerateOptions,
  isDjango = false,
): string {
  const port = options.port ?? 3000;
  const defaultCmd = isDjango
    ? `gunicorn app.wsgi:application --bind 0.0.0.0:${String(port)}`
    : `python -m uvicorn main:app --host 0.0.0.0 --port ${String(port)}`;
  const startCmd = options.startCmd ?? defaultCmd;
  return [
    'FROM python:3.12-slim AS builder',
    'WORKDIR /app',
    'RUN pip install --upgrade pip',
    'COPY requirements.txt* pyproject.toml* ./',
    'RUN if [ -f requirements.txt ]; then pip install --user -r requirements.txt; elif [ -f pyproject.toml ]; then pip install --user .; else echo "WARNING: No requirements.txt or pyproject.toml found" >&2; fi',
    '',
    'FROM python:3.12-slim AS runner',
    'WORKDIR /app',
    'ENV PYTHONDONTWRITEBYTECODE=1',
    'ENV PYTHONUNBUFFERED=1',
    'RUN groupadd --gid 1001 python && \\',
    '    useradd --uid 1001 --gid python --shell /bin/bash --create-home python',
    'COPY --from=builder /root/.local /home/python/.local',
    'COPY --chown=python:python . .',
    'USER python',
    'ENV PATH=/home/python/.local/bin:$PATH',
    `EXPOSE ${port}`,
    'HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\',
    `  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${port}/health')" || exit 1`,
    `CMD ["sh", "-c", "${startCmd}"]`,
  ].join('\n');
}

export function generateDjangoDockerfile(
  options: DockerfileGenerateOptions,
): string {
  return generatePythonDockerfile(options, true);
}

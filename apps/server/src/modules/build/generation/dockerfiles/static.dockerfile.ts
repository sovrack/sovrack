import { DockerfileGenerateOptions } from './dockerfile.types';

/**
 * Used for static frontend (HTML/CSS/JS) — serves a static folder via Nginx with SPA routing & compression.
 */
export function generateStaticDockerfile(
  options: DockerfileGenerateOptions,
): string {
  const port = options.port ?? 80;
  return [
    'FROM nginx:alpine',
    "RUN printf 'server {\\n\\",
    '    listen 80;\\n\\',
    '    server_name _;\\n\\',
    '    root /usr/share/nginx/html;\\n\\',
    '    index index.html index.htm;\\n\\',
    '\\n\\',
    '    gzip on;\\n\\',
    '    gzip_vary on;\\n\\',
    '    gzip_proxied any;\\n\\',
    '    gzip_comp_level 6;\\n\\',
    '    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;\\n\\',
    '\\n\\',
    '    location / {\\n\\',
    '        try_files $uri $uri/ /index.html =404;\\n\\',
    '    }\\n\\',
    '\\n\\',
    '    location ~* \\\\.(?:css|js|woff2?|svg|gif|png|jpe?g|webp|avif|ico)$ {\\n\\',
    '        expires 1y;\\n\\',
    '        add_header Cache-Control "public, max-age=31536000, immutable";\\n\\',
    '        access_log off;\\n\\',
    '    }\\n\\',
    '\\n\\',
    '    location ~* \\\\.(?:html|htm)$ {\\n\\',
    '        add_header Cache-Control "no-cache, no-store, must-revalidate";\\n\\',
    '        expires 0;\\n\\',
    '    }\\n\\',
    "}\\n' > /etc/nginx/conf.d/default.conf",
    '',
    'COPY . /usr/share/nginx/html',
    `EXPOSE ${port}`,
    `HEALTHCHECK --interval=30s --timeout=5s --start-period=5s CMD wget -qO- http://127.0.0.1:${port}/ >/dev/null 2>&1 || exit 1`,
  ].join('\n');
}

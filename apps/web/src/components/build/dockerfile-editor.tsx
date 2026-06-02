'use client';

import Editor from '@monaco-editor/react';

type DockerfileEditorProps = {
  value: string;
  onChange: (value: string) => void;
  readonly?: boolean;
};

export function DockerfileEditor({
  value,
  onChange,
  readonly = false,
}: DockerfileEditorProps) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
        Dockerfile
      </p>
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <Editor
          height="320px"
          defaultLanguage="dockerfile"
          value={value}
          onChange={(next) => onChange(next ?? '')}
          options={{
            readOnly: readonly,
            minimap: { enabled: false },
            fontSize: 13,
            scrollBeyondLastLine: false,
          }}
          theme="vs-dark"
        />
      </div>
    </div>
  );
}

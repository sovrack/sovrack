'use client';

import Editor from '@monaco-editor/react';

type CicdEditorProps = {
  value: string;
  onChange: (value: string) => void;
  readonly?: boolean;
};

export function CicdEditor({
  value,
  onChange,
  readonly = false,
}: CicdEditorProps) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
        .gitlab-ci.yml
      </p>
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <Editor
          height="320px"
          defaultLanguage="yaml"
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

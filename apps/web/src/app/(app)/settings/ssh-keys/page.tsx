'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Download, KeyRound, Loader2, Plus, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { getApiErrorMessage } from '@/lib/api';
import { sshKeysService } from '@/services/ssh-keys.service';
import type { SshKey } from '@/types/ssh-key';

type KeyType = 'ed25519' | 'rsa';

type GenerateState = 'idle' | 'generating' | 'done';

type GeneratedKey = {
  privateKey: string;
  publicKey: string;
  keyType: KeyType;
};

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function generateKeyPair(type: KeyType): Promise<GeneratedKey> {
  const res = await fetch('/api/generate-ssh-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  });
  if (!res.ok) throw new Error('Key generation failed');
  return res.json() as Promise<GeneratedKey>;
}

type DialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (key: SshKey) => void;
};

function AddSshKeyDialog({ open, onClose, onCreated }: DialogProps) {
  const [name, setName] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [keyType, setKeyType] = useState<KeyType>('ed25519');
  const [genState, setGenState] = useState<GenerateState>('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setPrivateKey('');
      setPublicKey('');
      setKeyType('ed25519');
      setGenState('idle');
      setError(null);
      window.setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const handleGenerate = async (type: KeyType) => {
    setGenState('generating');
    setKeyType(type);
    setError(null);
    try {
      const generated = await generateKeyPair(type);
      setPrivateKey(generated.privateKey);
      setPublicKey(generated.publicKey);
      setKeyType(generated.keyType);
      setGenState('done');
    } catch {
      setError('Failed to generate key pair. Paste keys manually.');
      setGenState('idle');
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!privateKey.trim()) { setError('Private key is required'); return; }
    if (!publicKey.trim()) { setError('Public key is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const created = await sshKeysService.create({
        name: name.trim(),
        privateKey: privateKey.trim(),
        publicKey: publicKey.trim(),
        keyType,
      });
      onCreated(created);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />

      <div className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
              Settings
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">Add SSH Key</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Generate or paste an SSH key pair to use for deployments.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          {error && <Alert tone="error">{error}</Alert>}

          {/* Generate buttons */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              Generate key pair
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleGenerate('ed25519')}
                disabled={genState === 'generating'}
                className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover)] disabled:opacity-50"
              >
                {genState === 'generating' && keyType === 'ed25519' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <KeyRound size={14} />
                )}
                Generate ED25519
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate('rsa')}
                disabled={genState === 'generating'}
                className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover)] disabled:opacity-50"
              >
                {genState === 'generating' && keyType === 'rsa' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <KeyRound size={14} />
                )}
                Generate RSA
              </button>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Key name <span className="text-red-400">*</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Deploy Key"
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:ring-2 focus:ring-zinc-500/20"
            />
          </div>

          {/* Private key */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                Private key <span className="text-red-400">*</span>
              </label>
              {privateKey && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(privateKey)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
                  >
                    <Copy size={11} /> Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadText('id_' + keyType, privateKey)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
                  >
                    <Download size={11} /> Download
                  </button>
                </div>
              )}
            </div>
            <textarea
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              rows={6}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 font-mono text-xs text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:ring-2 focus:ring-zinc-500/20"
            />
          </div>

          {/* Public key */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                Public key <span className="text-red-400">*</span>
              </label>
              {publicKey && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(publicKey)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
                  >
                    <Copy size={11} /> Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadText('id_' + keyType + '.pub', publicKey)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
                  >
                    <Download size={11} /> Download
                  </button>
                </div>
              )}
            </div>
            <textarea
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="ssh-ed25519 AAAA..."
              rows={3}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 font-mono text-xs text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:ring-2 focus:ring-zinc-500/20"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-card)] px-6 py-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} loading={saving}>
            Add SSH Key
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SshKeysPage() {
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const data = await sshKeysService.getAll();
      setKeys(data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchKeys(); }, [fetchKeys]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await sshKeysService.remove(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreated = (key: SshKey) => {
    setKeys((prev) => [key, ...prev]);
    setDialogOpen(false);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-[var(--hover)]" />
        <div className="h-32 animate-pulse rounded-2xl bg-[var(--hover)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="SSH Keys"
        description="Manage SSH key pairs used to authenticate deployments to your servers."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus size={15} />
            Add SSH Key
          </Button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] py-16">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-app)]">
            <KeyRound className="h-6 w-6 text-[var(--text-secondary)]" />
          </div>
          <p className="mb-2 text-sm font-medium text-[var(--text-primary)]">
            No SSH keys yet
          </p>
          <p className="mb-6 text-sm text-[var(--text-secondary)]">
            Add an SSH key to authenticate with your servers.
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus size={15} />
            Add SSH Key
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-app)]">
                <KeyRound className="h-5 w-5 text-[var(--text-secondary)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{key.name}</p>
                <p className="mt-0.5 truncate font-mono text-xs text-[var(--text-secondary)]">
                  {key.publicKey.slice(0, 60)}…
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-app)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                {key.keyType}
              </span>
              <button
                type="button"
                onClick={() => void handleDelete(key.id)}
                disabled={deletingId === key.id}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                title="Delete key"
              >
                {deletingId === key.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <AddSshKeyDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

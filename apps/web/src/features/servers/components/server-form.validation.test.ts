import { describe, it, expect } from 'vitest';
import {
  validateServerForm,
  buildCreatePayload,
  createDefaultValues,
  type ServerFormValues,
} from './server-form.validation';

const valid: ServerFormValues = {
  name: 'prod-1',
  description: 'Primary VPS',
  host: '192.168.1.10',
  port: '22',
  username: 'ubuntu',
  sshKeyId: 'key-1',
  connectionMode: 'ssh',
};

describe('validateServerForm', () => {
  it('accepts a fully valid create form and returns the parsed payload', () => {
    const { errors, parsed } = validateServerForm('create', valid);
    expect(errors).toEqual({});
    expect(parsed).toMatchObject({ host: '192.168.1.10', port: 22 });
  });

  it('requires name, host and username', () => {
    const { errors } = validateServerForm('create', {
      ...valid,
      name: '  ',
      host: '',
      username: '',
    });
    expect(errors.name).toBeDefined();
    expect(errors.host).toBeDefined();
    expect(errors.username).toBeDefined();
  });

  it('rejects an invalid host', () => {
    const { errors } = validateServerForm('create', {
      ...valid,
      host: 'http://bad host!',
    });
    expect(errors.host).toBeDefined();
  });

  it('rejects a port outside 1–65535', () => {
    expect(validateServerForm('create', { ...valid, port: '0' }).errors.port).toBeDefined();
    expect(validateServerForm('create', { ...valid, port: '70000' }).errors.port).toBeDefined();
    expect(validateServerForm('create', { ...valid, port: 'abc' }).errors.port).toBeDefined();
  });

  it('rejects an invalid username pattern', () => {
    const { errors } = validateServerForm('create', {
      ...valid,
      username: '1bad user',
    });
    expect(errors.username).toBeDefined();
  });

  it('requires an SSH key on create but not on edit', () => {
    const noKey = { ...valid, sshKeyId: '' };
    expect(validateServerForm('create', noKey).errors.sshKeyId).toBeDefined();
    expect(validateServerForm('edit', noKey).errors.sshKeyId).toBeUndefined();
  });
});

describe('buildCreatePayload', () => {
  it('maps parsed values and omits empty optionals', () => {
    const { parsed } = validateServerForm('create', valid);
    const payload = buildCreatePayload(parsed!);
    expect(payload).toMatchObject({
      name: 'prod-1',
      host: '192.168.1.10',
      port: 22,
      username: 'ubuntu',
      sshKeyId: 'key-1',
    });
  });
});

describe('createDefaultValues', () => {
  it('defaults port 22 / ssh mode', () => {
    expect(createDefaultValues()).toMatchObject({ port: '22', connectionMode: 'ssh' });
  });
});

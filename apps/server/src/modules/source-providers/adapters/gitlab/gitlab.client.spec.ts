import { BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import { GitlabClient } from './gitlab.client';
import { throwGitlabRequestError } from './gitlab-pagination.helper';

const id = (u: string) => u;
const config = {
  providerToken: 'enc-token',
  providerUrl: 'https://gitlab.com',
} as Parameters<GitlabClient['getBranches']>[0];

describe('GitlabClient', () => {
  let http: { get: jest.Mock; post: jest.Mock };
  let client: GitlabClient;

  beforeEach(() => {
    http = { get: jest.fn(), post: jest.fn() };
    const crypto = {
      decrypt: jest.fn().mockReturnValue('plain-token'),
    } as unknown as CryptoService;
    client = new GitlabClient(http as unknown as HttpService, crypto);
  });

  it('getBranches hits the v4 API with the decrypted PRIVATE-TOKEN header', async () => {
    http.get.mockReturnValue(of({ data: [{ name: 'main' }] }));
    const res = await client.getBranches(config, 42, id);
    expect(res).toEqual([{ name: 'main' }]);
    const [url, opts] = http.get.mock.calls[0];
    expect(url).toBe(
      'https://gitlab.com/api/v4/projects/42/repository/branches',
    );
    expect(opts.headers['PRIVATE-TOKEN']).toBe('plain-token');
  });

  it('triggerPipeline posts the ref to the pipeline endpoint', async () => {
    http.post.mockReturnValue(of({ data: { id: 7 } }));
    const res = await client.triggerPipeline(config, 42, 'release', id);
    expect(res).toEqual({ id: 7 });
    const [url, body] = http.post.mock.calls[0];
    expect(url).toBe('https://gitlab.com/api/v4/projects/42/pipeline');
    expect(body).toEqual({ ref: 'release' });
  });

  describe('error mapping (throwGitlabRequestError)', () => {
    it('maps any failure to a descriptive BadRequest with the HTTP status', async () => {
      http.get.mockReturnValue(
        throwError(() => ({
          response: { status: 404, data: { message: 'Not found' } },
        })),
      );
      await expect(client.getBranches(config, 1, id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('adds a 401 hint about the token', () => {
      expect(() =>
        throwGitlabRequestError('x', { response: { status: 401 } }),
      ).toThrow(/Token invalide/);
    });

    it('detects an unexpected HTML response (wrong API URL)', () => {
      expect(() =>
        throwGitlabRequestError('x', {
          response: { status: 200, data: '<!doctype html><html></html>' },
        }),
      ).toThrow(/HTML inattendue/);
    });
  });
});

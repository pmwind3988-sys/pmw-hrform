import { afterEach, describe, expect, it, vi } from 'vitest';

describe('SharePoint REST helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('continues with an OAuth MERGE when contextinfo rejects digest lookup', async () => {
    vi.resetModules();
    vi.stubEnv('SP_SITE_URL', 'https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs');

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/_api/contextinfo')) {
        return new Response('{}', { status: 401 });
      }
      if (url.includes('$select=ListItemEntityTypeFullName')) {
        return Response.json({ ListItemEntityTypeFullName: 'SP.Data.TrainingRequisitionFormListItem' });
      }
      if (url.includes('/items(27)')) {
        const headers = init?.headers as Record<string, string>;
        expect(headers['X-RequestDigest']).toBeUndefined();
        expect(headers['X-HTTP-Method']).toBe('MERGE');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          applicantSignature: {
            __metadata: { type: 'SP.FieldUrlValue' },
            Url: 'https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs/Signature%20Images/signature.png',
            Description: 'Signature',
          },
        });
        return new Response(null, { status: 204 });
      }
      return new Response('unexpected request', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { patchHyperlinkViaSPRest } = await import('./sharepointRest.ts');
    await patchHyperlinkViaSPRest(
      'sharepoint-token',
      'Training Requisition Form',
      '27',
      'applicantSignature',
      'https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs/Signature%20Images/signature.png',
      'Signature',
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

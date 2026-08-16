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

  it('creates a list item through SharePoint REST without a digest when OAuth is enough', async () => {
    vi.resetModules();
    vi.stubEnv('SP_SITE_URL', 'https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs');

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/_api/contextinfo')) {
        return new Response('{}', { status: 401 });
      }
      if (url.includes('$select=ListItemEntityTypeFullName')) {
        return Response.json({ ListItemEntityTypeFullName: 'SP.Data.InternalJobListingListItem' });
      }
      if (url.endsWith("/_api/web/lists/getbytitle('Internal%20Job%20Listing')/items")) {
        const headers = init?.headers as Record<string, string>;
        expect(headers['X-RequestDigest']).toBeUndefined();
        expect(headers['Content-Type']).toBe('application/json;odata=verbose');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          __metadata: { type: 'SP.Data.InternalJobListingListItem' },
          Title: 'Senior Analyst',
          Status: 'New',
        });
        return Response.json({ Id: 42 });
      }
      return new Response('unexpected request', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { createListItemViaSPRest } = await import('./sharepointRest.ts');
    const created = await createListItemViaSPRest('sharepoint-token', 'Internal Job Listing', {
      Title: 'Senior Analyst',
      Status: 'New',
    });

    expect(created.id).toBe('42');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('creates a missing custom list with the delegated token', async () => {
    vi.resetModules();
    vi.stubEnv('SP_SITE_URL', 'https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs');

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/_api/contextinfo')) {
        return Response.json({ FormDigestValue: 'digest-value' });
      }
      if (url.includes("getbytitle('Internal%20Accounts')?$select=Id")) {
        return new Response('List does not exist at site with URL', { status: 404 });
      }
      if (url.endsWith('/_api/web/lists')) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({
          __metadata: { type: 'SP.List' },
          Title: 'Internal Accounts',
          BaseTemplate: 100,
        });
        return Response.json({ Id: 'new-list-id' });
      }
      return new Response('unexpected request', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ensureListViaSPRest } = await import('./sharepointRest.ts');
    await ensureListViaSPRest('sharepoint-token', 'Internal Accounts');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('asks for the document library template when that is what is wanted', async () => {
    vi.resetModules();
    vi.stubEnv('SP_SITE_URL', 'https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs');

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/_api/contextinfo')) return new Response('{}', { status: 401 });
      if (url.includes('getbytitle')) return new Response('does not exist', { status: 404 });
      if (url.endsWith('/_api/web/lists')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ BaseTemplate: 101 });
        return Response.json({ Id: 'new-library-id' });
      }
      return new Response('unexpected request', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ensureListViaSPRest } = await import('./sharepointRest.ts');
    await ensureListViaSPRest('sharepoint-token', 'Learning Materials', 'documentLibrary');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('leaves an existing list alone rather than recreating it', async () => {
    vi.resetModules();
    vi.stubEnv('SP_SITE_URL', 'https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs');

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('getbytitle')) return Response.json({ Id: 'existing-list-id' });
      return new Response('unexpected request', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ensureListViaSPRest } = await import('./sharepointRest.ts');
    await ensureListViaSPRest('sharepoint-token', 'Internal Accounts');

    // One lookup and nothing else: no digest, and above all no POST to /lists.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('accepts the loser of a two-admin race, since the list they wanted now exists', async () => {
    vi.resetModules();
    vi.stubEnv('SP_SITE_URL', 'https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs');

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/_api/contextinfo')) return Response.json({ FormDigestValue: 'digest-value' });
      if (url.includes('getbytitle')) return new Response('does not exist', { status: 404 });
      if (url.endsWith('/_api/web/lists')) {
        return new Response(
          JSON.stringify({ error: { message: { value: 'A list, survey, discussion board, or document library with the specified title already exists in this Web site.' } } }),
          { status: 400 },
        );
      }
      return new Response('unexpected request', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ensureListViaSPRest } = await import('./sharepointRest.ts');
    await expect(ensureListViaSPRest('sharepoint-token', 'Internal Accounts')).resolves.toBeUndefined();
  });

  it('surfaces a refusal to create the list rather than reporting success', async () => {
    vi.resetModules();
    vi.stubEnv('SP_SITE_URL', 'https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs');

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/_api/contextinfo')) return Response.json({ FormDigestValue: 'digest-value' });
      if (url.includes('getbytitle')) return new Response('does not exist', { status: 404 });
      if (url.endsWith('/_api/web/lists')) return new Response('Access denied.', { status: 403 });
      return new Response('unexpected request', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ensureListViaSPRest } = await import('./sharepointRest.ts');
    await expect(ensureListViaSPRest('sharepoint-token', 'Internal Accounts')).rejects.toThrow(
      /SP REST create list 403/,
    );
  });
});

import { describe, expect, it, vi } from 'vitest';

import { __test__ } from '../submit-form.ts';

const SIGNATURE_DATA_URI = 'data:image/png;base64,aGVsbG8=';
const SIGNATURE_URL = 'https://pmwgroupcom.sharepoint.com/sites/PMWHRDocs/Signature%20Images/signature.png';

describe('public form signature submission', () => {
  it('uploads signaturepad data and defers the SharePoint URL field write', async () => {
    const schema = __test__.collectSubmissionSchema({
      pages: [
        {
          elements: [
            { type: 'text', name: 'EmployeeName' },
            { type: 'signaturepad', name: 'EmployeeSignature' },
          ],
        },
      ],
    });
    const uploadDataUri = vi.fn(async () => ({
      url: SIGNATURE_URL,
      fileName: 'signature.png',
    }));

    const result = await __test__.buildSubmissionFields(
      'token',
      'Leave Application',
      {
        EmployeeName: 'Avery',
        EmployeeSignature: SIGNATURE_DATA_URI,
      },
      {
        CurrentVersion: '3.1',
        FormID: 'FORM-001',
      },
      schema,
      { uploadDataUri },
    );

    expect(result.fields.EmployeeName).toBe('Avery');
    expect(result.fields.EmployeeSignature).toBeUndefined();
    expect(result.fields.RawJSON).toContain('[uploaded file omitted]');
    expect(result.urlFieldPatches).toEqual([
      {
        fieldName: 'EmployeeSignature',
        url: SIGNATURE_URL,
        description: 'Signature',
      },
    ]);
    expect(uploadDataUri).toHaveBeenCalledTimes(1);
    const uploadCalls = uploadDataUri.mock.calls as unknown[][];
    expect(uploadCalls[0]?.[4]).toBe('signature');
  });

  it('falls back to Graph field patch when SharePoint REST URL patching fails', async () => {
    const deps = {
      patchHyperlinkViaSPRest: vi.fn(async () => {
        throw new Error('SP REST hyperlink rejected');
      }),
      updateListItemViaSPRest: vi.fn(async () => {
        throw new Error('SP REST text rejected');
      }),
      updateListItemFields: vi.fn(async () => undefined),
    };

    await expect(
      __test__.patchUrlFieldWithFallback(
        'graph-token',
        'sharepoint-token',
        'Leave Application',
        '42',
        'EmployeeSignature',
        SIGNATURE_URL,
        'Signature',
        deps,
      ),
    ).resolves.toBeUndefined();

    expect(deps.patchHyperlinkViaSPRest).toHaveBeenCalledWith(
      'sharepoint-token',
      'Leave Application',
      '42',
      'EmployeeSignature',
      SIGNATURE_URL,
      'Signature',
    );
    expect(deps.updateListItemViaSPRest).toHaveBeenCalledWith(
      'sharepoint-token',
      'Leave Application',
      '42',
      { EmployeeSignature: SIGNATURE_URL },
    );
    expect(deps.updateListItemFields).toHaveBeenCalledWith(
      'graph-token',
      'Leave Application',
      '42',
      { EmployeeSignature: SIGNATURE_URL },
    );
  });

  it('uses Graph field patch when no SharePoint REST token is available', async () => {
    const deps = {
      patchHyperlinkViaSPRest: vi.fn(async () => undefined),
      updateListItemViaSPRest: vi.fn(async () => undefined),
      updateListItemFields: vi.fn(async () => undefined),
    };

    await expect(
      __test__.patchUrlFieldWithFallback(
        'graph-token',
        null,
        'Leave Application',
        '42',
        'EmployeeSignature',
        SIGNATURE_URL,
        'Signature',
        deps,
      ),
    ).resolves.toBeUndefined();

    expect(deps.patchHyperlinkViaSPRest).not.toHaveBeenCalled();
    expect(deps.updateListItemViaSPRest).not.toHaveBeenCalled();
    expect(deps.updateListItemFields).toHaveBeenCalledWith(
      'graph-token',
      'Leave Application',
      '42',
      { EmployeeSignature: SIGNATURE_URL },
    );
  });
});

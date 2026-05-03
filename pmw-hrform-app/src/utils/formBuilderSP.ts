import type { FormConfig, FormVersionData, FormLogEntry, Submission } from '../types/index.ts';

const SP_SITE_URL = (import.meta.env.VITE_SP_SITE_URL as string || '').replace(/\/$/, '');

const DIGEST_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
let cachedDigest: string | null = null;
let digestExpiry: number | null = null;

async function getDigest(token: string): Promise<string> {
  const now = Date.now();
  if (cachedDigest && digestExpiry && now < digestExpiry) {
    return cachedDigest;
  }

  const url = `${SP_SITE_URL}/_api/contextinfo`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch request digest: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.FormDigestValue) {
    throw new Error('No FormDigestValue returned from contextinfo endpoint');
  }

  const digestValue: string = data.FormDigestValue;
  cachedDigest = digestValue;
  digestExpiry = now + DIGEST_EXPIRY_MS;
  return digestValue;
}

export async function getFormConfig(formId: string, token: string): Promise<FormConfig | null> {
  const encodedFormId = formId.replace(/'/g, "''");
  const url = `${SP_SITE_URL}/_api/web/lists/getByTitle('Master%20Form')/items?$filter=FormId eq '${encodedFormId}'&$select=Id,Title,FormId,TotalLayers,IsPublic,ActiveVersion,Created,Modified`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch form config: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.value[0] || null;
}

export async function saveFormConfig(
  config: Omit<FormConfig, 'Id' | 'Created' | 'Modified'>,
  token: string
): Promise<FormConfig> {
  const digest = await getDigest(token);
  const url = `${SP_SITE_URL}/_api/web/lists/getByTitle('Master%20Form')/items`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
      'X-RequestDigest': digest,
    },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    throw new Error(`Failed to save form config: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function getFormVersions(formId: string, token: string): Promise<FormVersionData[]> {
  const encodedFormId = formId.replace(/'/g, "''");
  const url = `${SP_SITE_URL}/_api/web/lists/getByTitle('Web%20Form%20Versions')/items?$filter=FormId eq '${encodedFormId}'&$orderby=Version desc`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch form versions: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.value || [];
}

export async function saveFormVersion(
  versionData: Omit<FormVersionData, 'Id' | 'Created'>,
  token: string
): Promise<FormVersionData> {
  const digest = await getDigest(token);
  const url = `${SP_SITE_URL}/_api/web/lists/getByTitle('Web%20Form%20Versions')/items`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
      'X-RequestDigest': digest,
    },
    body: JSON.stringify(versionData),
  });

  if (!response.ok) {
    throw new Error(`Failed to save form version: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function logFormAction(
  logEntry: Omit<FormLogEntry, 'Id' | 'Timestamp'>,
  token: string
): Promise<FormLogEntry> {
  const digest = await getDigest(token);
  const url = `${SP_SITE_URL}/_api/web/lists/getByTitle('Form%20Builder%20Log')/items`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
      'X-RequestDigest': digest,
    },
    body: JSON.stringify(logEntry),
  });

  if (!response.ok) {
    throw new Error(`Failed to log form action: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function getFormSubmissions(formId: string, token: string): Promise<Submission[]> {
  const encodedFormId = formId.replace(/'/g, "''");
  const url = `${SP_SITE_URL}/_api/web/lists/getByTitle('Submissions')/items?$filter=FormId eq '${encodedFormId}'&$orderby=Created desc`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch form submissions: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.value || [];
}

export async function submitFormResponse(
  formId: string,
  responseData: unknown,
  token: string
): Promise<Submission> {
  const digest = await getDigest(token);
  const url = `${SP_SITE_URL}/_api/web/lists/getByTitle('Submissions')/items`;
  const body = {
    FormId: formId,
    Response: JSON.stringify(responseData),
    Submitted: new Date().toISOString(),
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
      'X-RequestDigest': digest,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to submit form response: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function getSharePointChoices(
  listTitle: string,
  fieldName: string,
  token: string
): Promise<string[]> {
  const encodedListTitle = encodeURIComponent(listTitle);
  const encodedFieldName = encodeURIComponent(fieldName);
  const url = `${SP_SITE_URL}/_api/web/lists/getByTitle('${encodedListTitle}')/fields?$filter=Title eq '${encodedFieldName}'`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch SharePoint choices: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const field = data.value?.[0];
  if (!field) {
    return [];
  }
  const choices = field.Choices;
  if (!choices) {
    return [];
  }
  return choices.results || choices || [];
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-zA-Z0-9_\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function checkSlugConflict(
  token: string,
  slug: string,
  excludeFormTitle?: string
): Promise<string | null> {
  const slugToCheck = slugify(slug);
  if (slugToCheck.length === 0) return null;
  const encodedSlug = encodeURIComponent(slugToCheck);
  const url = `${SP_SITE_URL}/_api/web/lists/getByTitle('/forms/${encodedSlug}')`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (response.ok) {
    try {
      const data = await response.json();
      // odata=nometadata returns d.results directly
      if (data.results || (data.d && data.d.results)) {
        const title = data.results?.Title || data.d?.results?.Title;
        if (excludeFormTitle && title === excludeFormTitle) {
          return null;
        }
        return title;
      }
    } catch (e) {
      // Ignore JSON parsing errors
    }
  }
  return null;
}

export async function getFormLog(formId: string, token: string): Promise<FormLogEntry[]> {
  const encodedFormId = formId.replace(/'/g, "''");
  const url = `${SP_SITE_URL}/_api/web/lists/getByTitle('Form%20Builder%20Log')/items?$filter=FormId eq '${encodedFormId}'&$orderBy=Timestamp%20asc`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  return data.value || [];
}

export async function getFormVersion(formId: string, versionNumber: string, token: string): Promise<any> {
  const versions = await getFormVersions(formId, token);
  const version = versions.find(v => v.FormVersion === versionNumber);
  return version || null;
}

export async function addColumn(
  token: string,
  listTitle: string,
  fieldName: string,
  fieldType: number
): Promise<void> {
  const encodedListTitle = encodeURIComponent(listTitle);
  const url = `${SP_SITE_URL}/_api/web/lists/getByTitle('${encodedListTitle}')/Fields`;
  const columnId = fieldName.replace(/[ \-_]+/g, '_');
  const digest = await getDigest(token);
  await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
      'X-RequestDigest': digest,
    },
    body: JSON.stringify({
      'Title': fieldName,
      'FieldDataType': fieldType,
    }),
  }).catch(() => {});
}

export async function deleteListColumnsWhere(
  listTitle: string,
  filterExpr: string,
  token: string
): Promise<number> {
  const encodedListTitle = encodeURIComponent(listTitle);
  const url = `${SP_SITE_URL}/_api/web/lists/getByTitle('${encodedListTitle}')/Fields?$filter=${encodeURIComponent(filterExpr)}`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    return 0;
  }
  const data = await response.json();
  const columns = data.value || [];
  let deleted = 0;
  for (const item of columns) {
    if (!item.Id) continue;
    const encodedId = encodeURIComponent(item.Id.toString());
    const deleteUrl = `${SP_SITE_URL}/_api/web/lists/getByTitle('${encodedListTitle}')/Fields('${encodedId}')`;
    const digest = await getDigest(token);
    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json;odata=nometadata',
        'Authorization': `Bearer ${token}`,
        'X-RequestDigest': digest,
      },
    });
    if (deleteResponse.ok) {
      deleted += 1;
    }
  }
  return deleted;
}

export async function createSpList(
  token: string,
  listTitle: string
): Promise<void> {
  const encodedListTitle = encodeURIComponent(listTitle);
  const url = `${SP_SITE_URL}/_api/web/lists`;
  const typeText = "Text";
  const typeNumber = "Number";
  const typeChoice = "Choice";
  const typeMultiChoice = "MultiChoice";
  await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Authorization': `Bearer ${token}`,
      'X-RequestDigest': await getDigest(token),
      'Content-Type': 'application/json;odata=nometadata',
    },
    body: JSON.stringify({
      'Title': listTitle,
      'TemplateType': 100,
      'AllowContentTypes': false,
    }),
  }).catch(() => {});
}

export async function listExists(
  token: string,
  listTitle: string
): Promise<boolean> {
  const encodedListTitle = encodeURIComponent(listTitle);
  const url = `${SP_SITE_URL}/_api/web/lists/getByTitle('${encodedListTitle}')`;
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json;odata=nometadata',
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch (e: any) {
    return !e?.response?.ok;
  }
}

/**
 * orgDirectoryGraph.ts — reading the company list with the app-only Graph
 * credential, for the public form endpoint.
 *
 * The admin screen reads the same list on a delegated token (orgDirectorySP.ts
 * in the client bundle). A public submitter has no token of their own, so their
 * form's Company selector is filled here instead — the server-side counterpart
 * of that read. The rules stay in the pure `orgDirectory.ts`.
 */
import { queryAllListItems } from "./graphClient.js";
import { COMPANY_LIST, companyRowsFromItems, type CompanyRow } from "./orgDirectory.js";

export async function loadCompaniesGraph(token: string): Promise<CompanyRow[]> {
  const items = await queryAllListItems(token, COMPANY_LIST);
  return companyRowsFromItems(items);
}

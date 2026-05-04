export interface MatrixRow {
  [colKey: string]: string;
}

export interface MatrixToHtmlResult {
  html: string;
  json: string;
}

export function matrixToHtml(
  matrixData: MatrixRow[] | null | undefined
): MatrixToHtmlResult {
  if (!matrixData || !Array.isArray(matrixData) || matrixData.length === 0) {
    return { html: "", json: "[]" };
  }

  const headers = Object.keys(matrixData[0]);

  let html = '<table class="matrix-table" style="border-collapse: collapse; width: 100%;">';
  html += "<thead><tr>";
  headers.forEach((h) => {
    html += `<th style="padding: 8px 12px; text-align: left; border: 1px solid #E5E7EB; background-color: #E5E7EB; font-weight: 600;">${h}</th>`;
  });
  html += "</tr></thead><tbody>";

  matrixData.forEach((row) => {
    html += "<tr>";
    headers.forEach((h) => {
      html += `<td style="padding: 8px 12px; border: 1px solid #E5E7EB;">${row[h] || ""}</td>`;
    });
    html += "</tr>";
  });

  html += "</tbody></table>";

  return {
    html,
    json: JSON.stringify(matrixData),
  };
}

export function htmlToMatrix(html: string): MatrixRow[] {
  if (!html || typeof html !== "string") {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const rows = doc.querySelectorAll("table tr");
  const matrix: MatrixRow[] = [];

  rows.forEach((row, index) => {
    if (index === 0) return; // Skip header
    const cells = row.querySelectorAll("td");
    const rowData: MatrixRow = {};
    cells.forEach((cell, cellIndex) => {
      rowData[`col${cellIndex + 1}`] = cell.textContent || "";
    });
    matrix.push(rowData);
  });

  return matrix;
}

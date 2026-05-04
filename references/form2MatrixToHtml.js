export function matrixToHtmlTable(rows = []) {
  const headers = [
    "No.", "Emp. ID", "Name", "Training Needs",
    "Current Skill Level", "Required Skill Level",
    "Priority", "Relevance to Job Function", "Tentative Date"
  ];

  const headerRow = headers.map(h => `<th style="border:1px solid #ccc;padding:8px;background:#f0f0f0;text-align:left">${h}</th>`).join("");

  const bodyRows = rows.map((row, i) => {
    const cells = [
      i + 1,
      row.employee_no ?? "",
      row.trainee_name ?? "",
      row.training_needs ?? "",
      (row.current_skill_level ?? []).join(", "),
      (row.required_skill_level ?? []).join(", "),
      (row.priority ?? []).join(", "),
      row.relevance_to_job_function ?? "",
      row.tentative_date ?? "",
    ];
    return `<tr>${cells.map(c => `<td style="border:1px solid #ccc;padding:8px;vertical-align:top">${c}</td>`).join("")}</tr>`;
  }).join("");

  return `<table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px">
    <thead><tr>${headerRow}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>`;
}
// utils/matrixToHtml.js
export const ratingMatrixToHtml = (matrixData, rowLabels) => {
  if (!matrixData) return "";

  let html = `<table border="1" style="border-collapse: collapse; width: 100%; font-family: sans-serif;">`;
  html += `<tr style="background-color: #f2f2f2;"><th style="padding: 8px; text-align: left;">Aspect</th><th style="padding: 8px; text-align: center;">Rating (1-4)</th></tr>`;

  Object.keys(rowLabels).forEach((key) => {
    const rating = matrixData[key] || "N/A";
    html += `<tr>
      <td style="padding: 8px;">${rowLabels[key]}</td>
      <td style="padding: 8px; text-align: center;">${rating}</td>
    </tr>`;
  });

  html += `</table>`;
  return html;
};
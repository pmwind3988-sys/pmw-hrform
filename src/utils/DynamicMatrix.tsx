import type { ChangeEvent } from "react";
import type { Question } from "survey-core";
import { CustomWidgetCollection } from "survey-core";
import { createRoot } from "react-dom/client";

// Stub functions for backward compatibility
export function registerDynamicMatrix(): void {
  // Already registered via CustomWidgetCollection below
}
export function registerQuestionData(_json: unknown): void {
  // No-op for backward compatibility
}

const C = {
  black: "#000000",
  white: "#FFFFFF",
  gray200: "#E5E7EB",
  gray500: "#6B7280",
  primary: "#0078D4",
  secondary: "#6264A7",
} as const;

interface MatrixRow {
  row: string;
  [key: string]: string;
}

interface DynamicMatrixProps {
  question: Question;
  readOnly: boolean;
}

export const DynamicMatrix = ({ question, readOnly }: DynamicMatrixProps) => {
  const matrixData: MatrixRow[] =
    (question.value as MatrixRow[]) || [{ row: "", col1: "", col2: "" }];

  const addRow = () => {
    const baseRow = matrixData[0];
    const colCount = baseRow ? Object.keys(baseRow).length - 1 : 2;
    const newRow: MatrixRow = { row: "" };
    for (let i = 1; i <= colCount; i++) {
      newRow[`col${i}`] = "";
    }
    question.value = [...matrixData, newRow];
  };

  const updateCell = (rowIndex: number, colKey: string, value: string) => {
    const newData = [...matrixData];
    newData[rowIndex] = { ...newData[rowIndex], [colKey]: value };
    question.value = newData;
  };

  const headers = matrixData[0] ? Object.keys(matrixData[0]) : [];

  return (
    <div className="dynamic-matrix" style={{ margin: "8px 0" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          border: `1px solid ${C.gray200}`,
        }}
      >
        <thead>
          <tr style={{ backgroundColor: C.gray200 }}>
            {headers.map((header) => (
              <th
                key={header}
                style={{
                  padding: "8px 12px",
                  textAlign: "left",
                  border: `1px solid ${C.gray200}`,
                  color: C.black,
                  fontWeight: 600,
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrixData.map((row, rowIndex) => (
            <tr key={rowIndex} style={{ borderBottom: `1px solid ${C.gray200}` }}>
              {headers.map((col) => (
                <td
                  key={col}
                  style={{
                    padding: "8px 12px",
                    border: `1px solid ${C.gray200}`,
                  }}
                >
                  <input
                    value={row[col] || ""}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      updateCell(rowIndex, col, e.target.value)
                    }
                    disabled={readOnly}
                    style={{
                      width: "100%",
                      padding: "4px 8px",
                      border: `1px solid ${C.gray200}`,
                      borderRadius: "4px",
                      color: C.black,
                      backgroundColor: C.white,
                      ...(readOnly && {
                        backgroundColor: C.gray200,
                        cursor: "not-allowed",
                      }),
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <button
          onClick={addRow}
          style={{
            marginTop: "8px",
            padding: "8px 16px",
            backgroundColor: C.primary,
            color: C.white,
            border: "none",
            borderRadius: "12px",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Add Row
        </button>
      )}
    </div>
  );
};

CustomWidgetCollection.Instance.addCustomWidget({
  name: "dynamicmatrix",
  title: "Dynamic Matrix",
  isFit: (question: Question) => question.getType() === "dynamicmatrix",
  htmlTemplate: "<div></div>",
  afterRender: (question: Question, el: HTMLElement) => {
    const root = createRoot(el);
    root.render(
      <DynamicMatrix question={question} readOnly={question.isReadOnly} />
    );
    question.onDispose.add(() => {
      root.unmount();
    });
  },
});

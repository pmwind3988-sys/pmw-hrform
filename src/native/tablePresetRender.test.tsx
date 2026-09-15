/**
 * What a preset table actually draws.
 *
 * `presetRows.test.ts` covers the row arithmetic; this covers the part an
 * author would notice if it broke — that the fixed labels appear as text rather
 * than as inputs, and that the row controls are gone.
 *
 * Rendered to static markup rather than into a DOM: the repo carries no jsdom
 * or testing-library, and the questions here are about output, not interaction.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TableControl } from "./fields";
import { parseForm } from "./schema";
import type { NativeElement } from "./schema";

const POLES = ["7.5m-10-1.1kN", "7.5m-14-2.0kN", "9.0m-14-2.0kN"];

function tableElement(poleColumn: Record<string, unknown>): NativeElement {
  const form = parseForm({
    pages: [
      {
        name: "p1",
        elements: [
          {
            type: "matrixdynamic",
            name: "bendingTest",
            title: "Bending test record",
            minRows: 1,
            maxRows: 8,
            columns: [
              { name: "poleType", title: "Type of Pole", cellType: "text", ...poleColumn },
              { name: "serialNo", title: "Bending Test Serial No.", cellType: "text" },
            ],
          },
        ],
      },
    ],
  });
  return form.pages[0].elements[0];
}

function render(element: NativeElement, value: unknown): string {
  return renderToStaticMarkup(
    <TableControl element={element} value={value} onChange={() => {}} disabled={false} invalid={false} controlId={element.name} />,
  );
}

describe("a table with preset rows", () => {
  const element = tableElement({ presetValues: POLES });
  const html = render(element, undefined);

  it("draws one row per preset value, whatever Min rows said", () => {
    expect(html.match(/<tr/g)?.length).toBe(4); // one header row + three body rows
    for (const pole of POLES) expect(html).toContain(pole);
  });

  it("draws the preset cell as locked text, not an input", () => {
    expect(html).toContain('<span class="nf-table-preset">7.5m-10-1.1kN</span>');
    expect(html).not.toContain('value="7.5m-10-1.1kN"');
  });

  it("still gives every row an editable cell for the answer", () => {
    expect(html.match(/<input/g)?.length).toBe(3);
  });

  it("offers no way to add or remove a row", () => {
    expect(html).not.toContain("Remove");
    expect(html).not.toContain("nf-table-foot");
  });

  it("keeps an answer already typed beside the preset", () => {
    expect(render(element, [{ poleType: POLES[0], serialNo: "A1" }])).toContain('value="A1"');
  });
});

describe("a table without preset rows", () => {
  const html = render(tableElement({}), undefined);

  it("behaves exactly as before — editable cells, Add and Remove", () => {
    expect(html).toContain("Remove");
    expect(html).toContain("nf-table-foot");
    expect(html).not.toContain("nf-table-preset");
  });
});

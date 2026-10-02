import type { ReactNode } from "react";
import { CARD_SHADOW, R } from "./reviewerTheme";

/** The card the reviewer acts in: navy title bar, white body. */
export default function DecisionCard({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} style={{ background: R.card, borderRadius: 10, overflow: "hidden", boxShadow: CARD_SHADOW, marginBottom: 20 }}>
      <h2 style={{ margin: 0, padding: "12px 18px", background: R.navy, color: R.card, fontSize: 15, fontWeight: 600 }}>
        {title}
      </h2>
      <div style={{ padding: 20 }}>{children}</div>
    </section>
  );
}

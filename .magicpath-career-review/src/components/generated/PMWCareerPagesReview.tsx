import { useState } from "react";

type View = "portal" | "apply" | "applications" | "openings" | "cards";

const jobs = [
  { title: "Senior Project Executive", company: "PMW Industries", department: "Operations", location: "Shah Alam", type: "Full-time", applicants: 8, closing: "18 Jun 2026" },
  { title: "HR Systems Analyst", company: "PMW Group", department: "People", location: "Kuala Lumpur", type: "Contract", applicants: 4, closing: "22 Jun 2026" },
  { title: "Warehouse Supervisor", company: "PMW Logistics", department: "Supply Chain", location: "Port Klang", type: "Full-time", applicants: 11, closing: "30 Jun 2026" },
];

const applications = [
  { ref: "APP-2606-014", applicant: "Nur Aisyah", email: "aisyah@pmw-group.com", role: "Senior Project Executive", status: "Shortlisted", submitted: "5 Jun 2026" },
  { ref: "APP-2606-013", applicant: "Daniel Tan", email: "daniel@pmw-group.com", role: "HR Systems Analyst", status: "KIV", submitted: "5 Jun 2026" },
  { ref: "APP-2606-012", applicant: "Mei Ling", email: "mei@pmw-group.com", role: "Warehouse Supervisor", status: "New", submitted: "4 Jun 2026" },
];

const tabs: { id: View; label: string }[] = [
  { id: "portal", label: "Opportunities" },
  { id: "apply", label: "Apply" },
  { id: "applications", label: "Applications" },
  { id: "openings", label: "Openings" },
  { id: "cards", label: "Cards" },
];

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    New: "bg-sky-50 text-sky-700",
    KIV: "bg-amber-50 text-amber-800",
    Shortlisted: "bg-emerald-50 text-emerald-700",
    Active: "bg-emerald-50 text-emerald-700",
    Hidden: "bg-zinc-100 text-zinc-600",
  };
  return (
    <span className={`inline-flex min-h-7 items-center rounded-lg px-2.5 text-xs font-bold ${styles[status] ?? "bg-zinc-100 text-zinc-700"}`}>
      {status}
    </span>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: string }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white/90 px-6 py-12 text-center shadow-none">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-sky-50 text-sm font-black text-zinc-700">
        PMW
      </div>
      <h3 className="text-balance text-lg font-black text-zinc-950">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-pretty text-sm leading-6 text-zinc-600">{body}</p>
      {action ? (
        <button className="mt-5 min-h-10 rounded-lg bg-zinc-950 px-4 text-sm font-bold text-white transition-transform active:scale-[0.96]">
          {action}
        </button>
      ) : null}
    </section>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="rounded-lg border border-red-200 bg-white/95 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-black text-zinc-950">Something needs attention</h3>
          <p className="mt-1 text-sm leading-6 text-zinc-600">Could not reach the career service. Check your connection and retry.</p>
        </div>
        <button onClick={onRetry} className="min-h-10 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-900 transition-transform hover:bg-sky-50 active:scale-[0.96]">
          Retry
        </button>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white/90 p-4">
      <div className="font-mono text-2xl font-black tabular-nums text-zinc-950">{value}</div>
      <div className="mt-1 text-xs font-bold text-zinc-500">{label}</div>
    </div>
  );
}

function Header({ view, setView }: { view: View; setView: (view: View) => void }) {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-xs font-black text-zinc-950">
            PMW
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black text-zinc-950">PMW Careers</h1>
            <p className="truncate text-sm text-zinc-600">Internal opportunities and HR career administration</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto pb-1 lg:pb-0" aria-label="Career preview views">
          {tabs.map((tab) => {
            const selected = view === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-bold transition-colors active:scale-[0.96] ${
                  selected ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-sky-50 hover:text-zinc-950"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function PortalView() {
  const [query, setQuery] = useState("");
  const filtered = jobs.filter((job) => [job.title, job.company, job.department, job.location].join(" ").toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-lg border border-zinc-200 bg-white/90 p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <span className="inline-flex min-h-7 items-center rounded-full border border-zinc-300 bg-yellow-100 px-3 text-xs font-black text-zinc-950">Welcome back</span>
          <h2 className="mt-3 text-balance text-3xl font-black tracking-normal text-zinc-950 sm:text-4xl">Internal advancement starts here</h2>
          <p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-zinc-600">Browse open roles, compare fit, and keep your application progress easy to find.</p>
        </div>
        <div className="rounded-lg bg-sky-50 p-4">
          <h3 className="font-black text-zinc-950">Your progress stays visible</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600">Applications, statuses, and references are gathered in one focused view.</p>
          <button className="mt-4 min-h-10 rounded-lg border border-zinc-950 bg-white px-4 text-sm font-bold transition-transform hover:bg-yellow-100 active:scale-[0.96]">
            My applications
          </button>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Open roles" value={jobs.length} />
        <Metric label="Visible now" value={filtered.length} />
        <Metric label="My applications" value={2} />
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white/90 p-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search opportunities"
            className="min-h-10 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(255,245,70,0.55)]"
          />
          <button onClick={() => setQuery("")} className="min-h-10 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-700 transition-transform hover:bg-zinc-50 active:scale-[0.96]">
            Clear
          </button>
        </div>
      </section>

      {filtered.length ? (
        <div className="space-y-3">
          {filtered.map((job) => (
            <article key={job.title} className="rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-950">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_230px] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start gap-2">
                    <h3 className="min-w-0 flex-1 text-lg font-black text-zinc-950">{job.title}</h3>
                    <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-black text-zinc-950">{job.department}</span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-600">{job.company} / {job.location} / Closing {job.closing}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-700">{job.type}</span>
                  <span className="font-mono text-sm font-black tabular-nums text-zinc-950">{job.applicants} applicants</span>
                  <button className="min-h-10 rounded-lg bg-zinc-950 px-4 text-sm font-bold text-white transition-transform active:scale-[0.96]">View role</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="No opportunities match" body="Try adjusting your search, company, department, type, or applied filter." />
      )}
    </div>
  );
}

function ApplyView() {
  const [submitted, setSubmitted] = useState(false);
  const [resume, setResume] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-zinc-200 bg-white/95 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-lg font-black text-emerald-700">OK</div>
        <h2 className="mt-4 text-balance text-2xl font-black text-zinc-950">Application submitted</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">Your reference number is <span className="font-mono font-black text-zinc-950">APP-2606-015</span>.</p>
        <button onClick={() => setSubmitted(false)} className="mt-5 min-h-10 rounded-lg border border-zinc-950 bg-white px-4 text-sm font-bold transition-transform hover:bg-yellow-100 active:scale-[0.96]">
          Browse opportunities
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="h-fit rounded-lg border border-zinc-200 bg-white/90 p-4 lg:sticky lg:top-24">
        <h2 className="text-lg font-black text-zinc-950">Senior Project Executive</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">Operations / Shah Alam / Full-time</p>
        <div className="mt-4 rounded-lg bg-sky-50 p-3 text-sm leading-6 text-zinc-700">Your Microsoft profile can fill name and email. You can edit optional details before submitting.</div>
      </aside>

      <form
        className="rounded-lg border border-zinc-200 bg-white/95 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!resume) {
            setError("A resume or CV is required.");
            return;
          }
          if (!accepted) {
            setError("Consent is required before submission.");
            return;
          }
          setError("");
          setSubmitted(true);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-zinc-700">
            Full name
            <input className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 px-3 font-normal outline-none focus:shadow-[0_0_0_3px_rgba(255,245,70,0.55)]" defaultValue="Ashraf Azahari" />
          </label>
          <label className="text-sm font-bold text-zinc-700">
            Email
            <input className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 font-normal text-zinc-600" defaultValue="ashraf@pmw-group.com" readOnly />
          </label>
          <label className="text-sm font-bold text-zinc-700">
            Phone
            <input className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 px-3 font-normal outline-none focus:shadow-[0_0_0_3px_rgba(255,245,70,0.55)]" placeholder="+60 12-345 6789" />
          </label>
          <label className="text-sm font-bold text-zinc-700">
            Current department
            <input className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 px-3 font-normal outline-none focus:shadow-[0_0_0_3px_rgba(255,245,70,0.55)]" placeholder="People" />
          </label>
        </div>

        <label className="mt-4 block text-sm font-bold text-zinc-700">
          Resume / CV
          <button
            type="button"
            onClick={() => {
              setResume("Ashraf_Azahari_CV.pdf");
              setError("");
            }}
            className="mt-1 flex min-h-24 w-full flex-col items-center justify-center rounded-lg border border-dashed border-zinc-400 bg-white px-4 text-sm font-bold text-zinc-700 transition-colors hover:bg-sky-50"
          >
            {resume || "Upload PDF, DOC, DOCX, JPEG, or PNG"}
            <span className="mt-1 text-xs font-medium text-zinc-500">Maximum 10 MB</span>
          </button>
        </label>

        <label className="mt-4 flex gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-sky-600" />
          <span>I consent to PMW processing my application data according to the Privacy Notice.</span>
        </label>

        {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div> : null}

        <button type="submit" className="mt-5 min-h-11 w-full rounded-lg bg-zinc-950 px-4 text-sm font-black text-white transition-transform active:scale-[0.96]">
          Submit application
        </button>
      </form>
    </div>
  );
}

function ApplicationsView() {
  const [showError, setShowError] = useState(false);

  if (showError) return <ErrorState onRetry={() => setShowError(false)} />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total applications" value={24} />
        <Metric label="New" value={7} />
        <Metric label="KIV" value={5} />
        <Metric label="Shortlisted" value={9} />
      </div>
      <section className="rounded-lg border border-zinc-200 bg-white/95 p-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input placeholder="Search applicant, email, role, ref" className="min-h-10 flex-1 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:shadow-[0_0_0_3px_rgba(255,245,70,0.55)]" />
          <button className="min-h-10 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold">Advanced</button>
          <button onClick={() => setShowError(true)} className="min-h-10 rounded-lg border border-red-200 bg-white px-4 text-sm font-bold text-red-700">Preview error</button>
        </div>
      </section>
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white/95">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs font-black text-zinc-500">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Applicant</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((application) => (
              <tr key={application.ref} className="border-t border-zinc-100 hover:bg-sky-50/50">
                <td className="px-4 py-3 font-mono font-black text-sky-700">{application.ref}</td>
                <td className="px-4 py-3"><div className="font-bold text-zinc-950">{application.applicant}</div><div className="text-xs text-zinc-500">{application.email}</div></td>
                <td className="px-4 py-3 text-zinc-700">{application.role}</td>
                <td className="px-4 py-3"><StatusPill status={application.status} /></td>
                <td className="px-4 py-3 text-zinc-600">{application.submitted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OpeningsView() {
  const [empty, setEmpty] = useState(false);
  if (empty) return <EmptyState title="No opportunities" body="Create the first internal advancement opening for PMW employees." action="Create opening" />;

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white/95 p-3 sm:flex-row">
        <input placeholder="Search role, department, location" className="min-h-10 flex-1 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:shadow-[0_0_0_3px_rgba(255,245,70,0.55)]" />
        <button className="min-h-10 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold">Advanced</button>
        <button onClick={() => setEmpty(true)} className="min-h-10 rounded-lg bg-zinc-950 px-4 text-sm font-bold text-white">Empty state</button>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Total openings" value={12} />
        <Metric label="Active" value={9} />
        <Metric label="Closed" value={3} />
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white/95">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs font-black text-zinc-500">
            <tr>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Applicants</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.title} className="border-t border-zinc-100 hover:bg-sky-50/50">
                <td className="px-4 py-3 font-bold text-zinc-950">{job.title}<div className="text-xs font-normal text-zinc-500">{job.location}</div></td>
                <td className="px-4 py-3 text-zinc-700">{job.company}</td>
                <td className="px-4 py-3"><span className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white">{job.department}</span></td>
                <td className="px-4 py-3"><StatusPill status="Active" /></td>
                <td className="px-4 py-3 font-mono font-black tabular-nums text-sky-700">{job.applicants}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CardsView() {
  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white/95 p-3 sm:flex-row">
        <input placeholder="Search cards, targets, links" className="min-h-10 flex-1 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:shadow-[0_0_0_3px_rgba(255,245,70,0.55)]" />
        <button className="min-h-10 rounded-lg bg-zinc-950 px-4 text-sm font-bold text-white">Add card</button>
      </section>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {["Grow into your next role", "Your progress stays visible", "Built for PMW talent"].map((title, index) => (
          <article key={title} className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <div className={`h-36 ${index === 0 ? "bg-sky-100" : index === 1 ? "bg-zinc-100" : "bg-yellow-100"}`} />
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-black text-zinc-950">{title}</h3>
                  <p className="mt-1 text-xs font-bold text-zinc-500">Order {index + 1}</p>
                </div>
                <StatusPill status={index === 2 ? "Hidden" : "Active"} />
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600">A concise carousel card for the careers portal welcome panel.</p>
              <div className="mt-4 flex justify-end gap-2">
                <button className="min-h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-bold">Edit</button>
                {index !== 0 ? <button className="min-h-10 rounded-lg border border-red-200 bg-white px-3 text-sm font-bold text-red-700">Delete</button> : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export const PMWCareerPagesReview = () => {
  const [view, setView] = useState<View>("portal");

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#BFDDF4_0%,#DCECF8_45%,#F7F5EF_100%)] font-sans text-zinc-950 antialiased">
      <Header view={view} setView={setView} />
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        {view === "portal" ? <PortalView /> : null}
        {view === "apply" ? <ApplyView /> : null}
        {view === "applications" ? <ApplicationsView /> : null}
        {view === "openings" ? <OpeningsView /> : null}
        {view === "cards" ? <CardsView /> : null}
      </div>
    </main>
  );
};

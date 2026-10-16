import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from "wouter";
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, CircleAlert, Clipboard, Clock3, Code2, FileCheck2, FilePlus2, Fingerprint, FlaskConical, Globe2, LockKeyhole, Printer, Radar, ShieldCheck, X } from "lucide-react";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import { createDemoRun, verifyContract } from "./lib/verify";
import { formatTime, getContracts, getRun, getRuns, makeId, saveContract, type Check as RunCheck, type Contract, type Run, type Verdict } from "./lib/store";

function Brand() {
  return <Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark"><Fingerprint size={17} /></span><span>AgentVerify</span></Link>;
}
function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const nav = [
    { href: "/dashboard", label: "Dashboard", icon: Radar },
    { href: "/contracts/new", label: "New contract", icon: FilePlus2 },
    { href: "/demo", label: "Demo", icon: FlaskConical },
  ];
  return <div className="app-shell">
    <header className="topbar"><div className="topbar-inner">
      <Brand />
      <nav className="nav-links" aria-label="Main navigation">
        {nav.map(item => <Link key={item.href} href={item.href} className={`nav-link ${location === item.href || (item.href === "/contracts/new" && location.startsWith("/contracts")) ? "active" : ""}`} data-testid={`link-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}><item.icon size={15} /><span>{item.label}</span></Link>)}
      </nav>
    </div></header>
    {children}
  </div>;
}
function Status({ verdict }: { verdict: Verdict }) {
  const kind = verdict.toLowerCase();
  const icon = verdict === "PASS" ? <Check size={11} /> : verdict === "FAIL" ? <X size={11} /> : <CircleAlert size={11} />;
  return <span className={`status ${kind}`} data-testid="status-verdict">{icon}{verdict}</span>;
}
function Header({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle?: string; children?: ReactNode }) {
  return <div className="fade-in"><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1>{subtitle && <p className="page-subtitle">{subtitle}</p>}{children}</div>;
}
function Landing() {
  return <main className="app-main">
    <section className="hero-grid">
      <div className="fade-in">
        <div className="eyebrow"><LockKeyhole size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: 7 }} />Independent agent verification</div>
        <h1 className="hero-title">AI says <span className="accent">DONE.</span><br />AgentVerify proves it.</h1>
        <p className="hero-sub">Independently verify what AI agents actually accomplished.</p>
        <div className="hero-actions"><Link href="/demo" className="button primary" data-testid="button-try-demo">Try Demo <ArrowRight size={15} /></Link><Link href="/dashboard" className="button" data-testid="button-open-dashboard">Open Dashboard <ArrowUpRight size={14} /></Link></div>
      </div>
      <div className="terminal fade-in fade-delay-1" aria-label="Example verification output">
        <div className="terminal-head"><div className="dots"><i /><i /><i /></div><span>verification.receipt</span><span>local · deterministic</span></div>
        <div className="terminal-body">
          <div className="term-line"><span className="term-num">01</span><span><span className="term-key">claim</span> <span className="term-muted">→</span> <span className="term-val">“Task created successfully”</span></span></div>
          <div className="term-line"><span className="term-num">02</span><span><span className="term-key">observe</span> <span className="term-muted">→</span> <span className="term-val">browser DOM inspection</span></span></div>
          <div className="term-line"><span className="term-num">03</span><span><span className="term-key">evidence</span> <span className="term-muted">→</span> <span className="term-val">1 matching element</span></span></div>
          <div className="term-line"><span className="term-num">04</span><span><span className="term-key">verdict</span> <span className="term-muted">→</span> <span className="term-result">PASS</span></span></div>
        </div>
      </div>
    </section>
    <section className="pipeline fade-in fade-delay-1" aria-label="Verification workflow">
      {[["01", "Agent Claim"], ["02", "Verification"], ["03", "Evidence"], ["04", "Verdict"]].map(([n, label], i) => <div className="pipe-step" key={n}><span className="pipe-num">{n} / TRACE</span><span className="pipe-name">{label}</span>{i < 3 && <ChevronRight className="pipe-arrow" size={15} />}</div>)}
    </section>
    <section className="landing-statement">
      <div className="eyebrow">A claim isn't a receipt</div>
      <div><p className="statement-copy">An AI agent's completion message is a claim, not proof.</p><p className="statement-detail">AgentVerify keeps the gap between “done” and trust visible. Define the outcome you expect, inspect what a browser can actually observe, and keep the evidence attached to every verdict.</p></div>
    </section>
    <section className="feature-row">
      <div className="feature"><div className="feature-icon"><Globe2 size={17} /></div><h3>Observe the browser, not the story</h3><p>The Chrome extension inspects the active tab's rendered DOM. Dashboard URL fetches are best-effort and may be blocked by CORS.</p></div>
      <div className="feature"><div className="feature-icon"><FileCheck2 size={17} /></div><h3>Every check leaves a trail</h3><p>Expected, observed, and evidence stay side by side—ready to inspect or export.</p></div>
      <div className="feature"><div className="feature-icon"><ShieldCheck size={17} /></div><h3>Local by design</h3><p>Contracts and verification runs stay in this browser's local storage. No account or remote service.</p></div>
    </section>
    <footer className="footer"><span>AGENTVERIFY / EVIDENCE LEDGER</span><span>Deterministic checks · Local storage</span></footer>
  </main>;
}
function EmptyState({ icon: Icon, title, text, action }: { icon: typeof BookOpen; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={19} /></div><h3>{title}</h3><p>{text}</p>{action}</div>;
}
function Dashboard() {
  const [runs, setRuns] = useState(getRuns);
  const passed = runs.filter(run => run.verdict === "PASS").length;
  const failed = runs.filter(run => run.verdict === "FAIL").length;
  const unverified = runs.filter(run => run.verdict === "UNVERIFIED").length;
  const skipped = runs.filter(run => run.verdict === "SKIPPED").length;
  const verificationRate = runs.length ? Math.round((passed / runs.length) * 100) : null;
  return <main className="app-main">
    <Header eyebrow="Local workspace / evidence ledger" title="Dashboard" subtitle="A browser-local record of contracts and what verification could actually observe.">
      <div className="subnav"><Link href="/contracts/new" className="button primary small" data-testid="button-new-contract"><FilePlus2 size={13} />New contract</Link><Link href="/demo" className="button small" data-testid="button-open-demo"><FlaskConical size={13} />Run demo</Link></div>
    </Header>
    <section className="stat-grid">
      <div className="panel stat-card"><div className="eyebrow">TOTAL VERIFICATIONS</div><div className="stat-val" data-testid="value-run-count">{runs.length}</div><div className="stat-label">Local evidence records</div></div>
      <div className="panel stat-card"><div className="eyebrow">PASS</div><div className="stat-val" data-testid="value-pass-count">{passed}</div><div className="stat-label">All configured checks passed</div></div>
      <div className="panel stat-card"><div className="eyebrow">FAIL</div><div className="stat-val" data-testid="value-fail-count">{failed}</div><div className="stat-label">At least one observed check failed</div></div>
      <div className="panel stat-card"><div className="eyebrow">UNVERIFIED</div><div className="stat-val" data-testid="value-unverified-count">{unverified}</div><div className="stat-label">Required evidence was unavailable</div></div>
      <div className="panel stat-card"><div className="eyebrow">SKIPPED</div><div className="stat-val" data-testid="value-skipped-count">{skipped}</div><div className="stat-label">Verification was not applicable</div></div>
      <div className="panel stat-card"><div className="eyebrow">PASS RATE</div><div className="stat-val" data-testid="value-verification-rate">{verificationRate === null ? "—" : `${verificationRate}%`}</div><div className="stat-label">{verificationRate === null ? "No runs yet" : `${passed} of ${runs.length} runs passed`}</div></div>
    </section>
    <section className="panel">
      <div style={{ padding: "20px 22px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div className="section-label">Recent verification runs</div><p className="muted tiny" style={{ margin: "6px 0 0" }}>Newest first · saved locally</p></div><Clock3 size={16} color="#758190" /></div>
      {runs.length ? <div className="table-wrap"><table className="run-table"><thead><tr><th>Contract / source</th><th>Agent claim</th><th>Verdict</th><th>Timestamp</th><th /></tr></thead><tbody>{runs.slice(0, 12).map(run => <tr className="run-row" key={run.id} data-testid={`row-run-${run.id}`}><td><div style={{ color: "#e1e7eb", fontWeight: 700 }}>{run.contract.name}</div><div className="muted mono" style={{ fontSize: 9, marginTop: 5 }}>{run.source === "demo" ? "LOCAL DEMO" : run.contract.targetUrl}</div></td><td style={{ maxWidth: 230 }}>{run.agentClaim}</td><td><Status verdict={run.verdict} /></td><td className="mono muted">{formatTime(run.timestamp)}</td><td><Link href={`/results/${run.id}`} className="button ghost small" data-testid={`link-run-${run.id}`}>Inspect <ArrowUpRight size={12} /></Link></td></tr>)}</tbody></table></div> : <EmptyState icon={BookOpen} title="No verification runs yet" text="Create a contract or run the deterministic demo to start your local evidence ledger." action={<Link href="/contracts/new" className="button primary small" data-testid="button-empty-create-contract"><FilePlus2 size={13} />Create a contract</Link>} />}
    </section>
    <div className="callout" style={{ marginTop: 14 }}><LockKeyhole size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />This workspace is stored only in localStorage on this browser. Clearing browser storage removes saved records.</div>
    <button type="button" onClick={() => setRuns(getRuns())} className="button ghost small" style={{ marginTop: 10 }} data-testid="button-refresh-dashboard">Refresh local records</button>
  </main>;
}
function ContractBuilder() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [required, setRequired] = useState("");
  const [forbidden, setForbidden] = useState("");
  const [title, setTitle] = useState("");
  const [minimum, setMinimum] = useState("");
  const [claim, setClaim] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const target = new URL(url.trim());
      if (!["http:", "https:"].includes(target.protocol)) throw new Error("Target URL must use HTTP or HTTPS.");
    } catch (e) { setError(e instanceof Error && e.message.includes("HTTP") ? e.message : "Enter a valid HTTP or HTTPS URL."); return; }
    if (!name.trim() || !claim.trim()) { setError("Contract Name and Agent Claim are required."); return; }
    if (minimum.trim() && (!Number.isInteger(Number(minimum)) || Number(minimum) < 0)) { setError("Minimum Matching Elements must be a whole number greater than or equal to 0."); return; }
    setBusy(true);
    const contract: Contract = { id: makeId(), name: name.trim(), targetUrl: new URL(url.trim()).href, requiredText: required.trim(), forbiddenText: forbidden.trim(), expectedTitle: title.trim(), minimumElements: minimum.trim() ? Number(minimum) : null, agentClaim: claim.trim(), createdAt: new Date().toISOString() };
    saveContract(contract);
    try {
      const run = await verifyContract(contract);
      setLocation(`/results/${run.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification could not be completed.");
      setBusy(false);
    }
  }
  return <main className="app-main">
    <Header eyebrow="Contract / define observable outcomes" title="New verification contract" subtitle="Dashboard URL checks use best-effort fetches and may be blocked by CORS. Use the Chrome extension for direct active-tab DOM verification; unavailable content is never inferred." />
    <form onSubmit={submit} className="panel panel-pad" style={{ marginTop: 28 }}>
      <div className="form-grid">
        <div className="field span-2"><label htmlFor="contract-name">Contract Name</label><input id="contract-name" className="input" data-testid="input-contract-name" placeholder="e.g. Project task created" value={name} onChange={e => setName(e.target.value)} required /></div>
        <div className="field span-2"><label htmlFor="target-url">Target URL</label><input id="target-url" className="input mono" data-testid="input-target-url" placeholder="https://example.com/tasks" value={url} onChange={e => setUrl(e.target.value)} required inputMode="url" /><small>Best-effort HTTP fetch only; CORS and browser restrictions can block inspection. Use the extension to inspect an external page open in the active tab.</small></div>
        <div className="field span-2"><label htmlFor="agent-claim">Agent Claim</label><textarea id="agent-claim" className="textarea" data-testid="input-agent-claim" placeholder="What did the agent say it completed?" value={claim} onChange={e => setClaim(e.target.value)} required /></div>
        <div className="field"><label htmlFor="required-text">Required Text</label><input id="required-text" className="input" data-testid="input-required-text" placeholder="Exact phrase expected in page text" value={required} onChange={e => setRequired(e.target.value)} /><small>Case-insensitive exact phrase. Leave blank to skip.</small></div>
        <div className="field"><label htmlFor="forbidden-text">Forbidden Text</label><input id="forbidden-text" className="input" data-testid="input-forbidden-text" placeholder="Phrase that must not appear" value={forbidden} onChange={e => setForbidden(e.target.value)} /><small>Case-insensitive absence check. Leave blank to skip.</small></div>
        <div className="field"><label htmlFor="expected-title">Expected Page Title</label><input id="expected-title" className="input" data-testid="input-expected-title" placeholder="Exact document title" value={title} onChange={e => setTitle(e.target.value)} /><small>Case-insensitive exact title match. Optional.</small></div>
        <div className="field"><label htmlFor="minimum-elements">Minimum Matching Elements</label><input id="minimum-elements" className="input" data-testid="input-minimum-elements" placeholder="e.g. 1" type="number" min="0" step="1" value={minimum} onChange={e => setMinimum(e.target.value)} /><small>Counts parsed body descendants containing Required Text. Nested matches count individually.</small></div>
      </div>
      {error && <div className="status fail" role="alert" style={{ marginTop: 18, fontFamily: "var(--app-font-sans)", fontSize: 11 }} data-testid="status-builder-error"><CircleAlert size={13} />{error}</div>}
      <div className="divider" />
      <div className="form-actions"><Link href="/dashboard" className="button ghost" data-testid="button-cancel-contract"><ArrowLeft size={14} />Cancel</Link><button type="submit" disabled={busy} className="button primary" data-testid="button-run-verification">{busy ? <><span className="mono">INSPECTING…</span></> : <><Radar size={15} />Run Verification</>}</button></div>
    </form>
    <p className="muted tiny" style={{ marginTop: 14 }}><LockKeyhole size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} />Contract and run records are saved in this browser's localStorage.</p>
  </main>;
}
function CheckCard({ item, index }: { item: RunCheck; index: number }) {
  const className = item.status.toLowerCase();
  return <article className="panel check-card" data-testid={`card-check-${index}`}><div className="check-head"><div><div className="check-title">{item.name}</div><div className="muted tiny mono" style={{ marginTop: 5 }}>CHECK {String(index + 1).padStart(2, "0")}</div></div><span className={`status ${className}`} data-testid={`status-check-${index}`}>{item.status}</span></div><div className="check-grid"><b>EXPECTED</b><span>{item.expected}</span><b>OBSERVED</b><span>{item.observed}</span><b>EVIDENCE</b><span className="evidence">{item.evidence}</span></div></article>;
}
function ResultPage() {
  const { id = "" } = useParams<{ id: string }>();
  const run = getRun(id);
  if (!run) return <main className="app-main"><Header eyebrow="Evidence ledger / unavailable" title="Run not found" subtitle="This record may have been removed from this browser's localStorage." /><Link href="/dashboard" className="button" style={{ marginTop: 20 }} data-testid="button-back-dashboard"><ArrowLeft size={14} />Back to dashboard</Link></main>;
  return <main className="app-main">
    <div className="receipt-head"><Header eyebrow={`Verification result / ${run.source === "demo" ? "local DOM" : "best-effort browser fetch"}`} title="Run evidence" subtitle={`ID ${run.id} · ${formatTime(run.timestamp)}`} /><div className="receipt-actions"><Link href={`/receipts/${run.id}`} className="button small" data-testid="button-open-receipt"><FileCheck2 size={14} />Receipt</Link><Link href="/dashboard" className="button ghost small" data-testid="button-results-dashboard">Dashboard</Link></div></div>
    <section className="panel panel-pad" style={{ marginTop: 23 }}>
      <div className="receipt-head"><div><div className="eyebrow">FINAL VERDICT</div><div style={{ marginTop: 10 }}><Status verdict={run.verdict} /></div></div><div className="muted mono tiny" data-testid="text-result-timestamp">{formatTime(run.timestamp)}</div></div>
      <div className="summary-grid">
        <div className="panel summary-box"><h3>Agent Claim</h3><p data-testid="text-agent-claim">{run.agentClaim}</p></div>
        <div className="panel summary-box"><h3>Expected Outcome</h3><p data-testid="text-expected-outcome">{run.expectedOutcome}</p></div>
        <div className="panel summary-box span-2" style={{ gridColumn: "span 2" }}><h3>Observed Outcome</h3><p data-testid="text-observed-outcome">{run.observedOutcome}</p></div>
      </div>
      <div className="divider" />
      <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between" }}><div><div className="section-label">Deterministic checks</div><div className="muted tiny" style={{ marginTop: 4 }}>Evidence from {run.source === "demo" ? "the rendered task-list DOM" : "best-effort browser-fetched HTML"}</div></div><span className="mono muted tiny">{run.checks.filter(c => c.status === "PASS").length}/{run.checks.length} PASS</span></div>
      {run.checks.map((item, index) => <CheckCard item={item} index={index} key={`${item.name}-${index}`} />)}
    </section>
  </main>;
}
function ReceiptPage() {
  const { id = "" } = useParams<{ id: string }>();
  const run = getRun(id);
  const [message, setMessage] = useState("");
  if (!run) return <main className="app-main"><Header eyebrow="Receipt / unavailable" title="Receipt not found" subtitle="The saved run is not present in this browser's localStorage." /><Link href="/dashboard" className="button" style={{ marginTop: 20 }} data-testid="button-receipt-back"><ArrowLeft size={14} />Back to dashboard</Link></main>;
  const runId = run.id;
  const payload = JSON.stringify(run, null, 2);
  async function copyJson() {
    try { await navigator.clipboard.writeText(payload); setMessage("Receipt JSON copied to clipboard."); }
    catch { setMessage("Clipboard access is unavailable. Use Download JSON instead."); }
  }
  function downloadJson() {
    const blob = new Blob([payload], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href; anchor.download = `agentverify-${runId}.json`; anchor.click(); URL.revokeObjectURL(href);
    setMessage("JSON receipt downloaded.");
  }
  return <main className="app-main">
    <div className="receipt-head"><Header eyebrow="Portable record / inspectable JSON" title="Verification receipt" subtitle="A local, exportable snapshot of the claim, checks, evidence, and verdict." /><div className="receipt-actions"><button className="button small" type="button" onClick={copyJson} data-testid="button-copy-json"><Clipboard size={14} />Copy JSON</button><button className="button small" type="button" onClick={downloadJson} data-testid="button-download-json"><ArrowDownToLine size={14} />Download JSON</button><button className="button small" type="button" onClick={() => window.print()} data-testid="button-print-receipt"><Printer size={14} />Print Receipt</button></div></div>
    {message && <div role="status" className="callout" style={{ marginTop: 15 }} data-testid="status-receipt-action">{message}</div>}
    <section className="panel panel-pad" style={{ marginTop: 23 }} data-testid="receipt-content">
      <div className="receipt-head"><div><div className="eyebrow">AGENTVERIFY / SIGNED BY OBSERVATION</div><h2 style={{ fontSize: 20, letterSpacing: "-.04em", margin: "9px 0 4px" }}>{run.contract.name}</h2><div className="muted mono tiny">VERIFICATION ID · {run.id}</div></div><Status verdict={run.verdict} /></div>
      <div className="divider" />
      <div className="summary-grid">
        <div className="panel summary-box"><h3>Verification ID</h3><p className="mono" data-testid="receipt-verification-id">{run.id}</p></div>
        <div className="panel summary-box"><h3>Timestamp</h3><p data-testid="receipt-timestamp">{formatTime(run.timestamp)}</p></div>
        <div className="panel summary-box"><h3>Contract Name</h3><p data-testid="receipt-contract-name">{run.contract.name}</p></div>
        <div className="panel summary-box"><h3>Final Verdict</h3><p data-testid="receipt-verdict">{run.verdict}</p></div>
        <div className="panel summary-box"><h3>Agent Claim</h3><p data-testid="receipt-agent-claim">{run.agentClaim}</p></div>
        <div className="panel summary-box"><h3>Expected Outcome</h3><p data-testid="receipt-expected-outcome">{run.expectedOutcome}</p></div>
        <div className="panel summary-box" style={{ gridColumn: "span 2" }}><h3>Observed Outcome</h3><p data-testid="receipt-observed-outcome">{run.observedOutcome}</p></div>
      </div>
      <div className="section-label" style={{ marginBottom: 12 }}>Checks & evidence</div>
      {run.checks.map((item, index) => <CheckCard item={item} index={index} key={`${item.name}-${index}`} />)}
    </section>
    <div className="subnav"><Link href={`/results/${run.id}`} className="button small" data-testid="button-receipt-result"><ArrowLeft size={13} />Back to result</Link><Link href="/dashboard" className="button ghost small" data-testid="button-receipt-dashboard">Dashboard</Link></div>
  </main>;
}

const demoTasks = ["Review sprint backlog", "Update release notes", "Confirm design handoff"];
function DemoBoard({ title, withTask }: { title: string; withTask: boolean }) {
  const [run, setRun] = useState<Run | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const tasks = withTask ? [demoTasks[0], "Prepare ICSE Board Project", ...demoTasks.slice(1)] : demoTasks;
  function verify() {
    const list = listRef.current;
    if (!list) return;
    const result = createDemoRun(title, list);
    setRun(result);
  }
  return <section className="panel board" data-testid={`board-${withTask ? "with-task" : "without-task"}`}>
    <div className="board-top"><div><div className="eyebrow">{withTask ? "TARGET A / CLAIM HOLDS" : "TARGET B / CLAIM DOES NOT HOLD"}</div><h2 style={{ fontSize: 16, margin: "7px 0 0", letterSpacing: "-.04em" }}>{title}</h2></div><span className="status pending">FICTIONAL BOARD</span></div>
    <div ref={listRef} className="task-list" data-testid={`task-list-${withTask ? "present" : "absent"}`} aria-label={`${title} task list`}>{tasks.map((task, index) => <div className="task-item" key={`${task}-${index}`} data-task-item data-testid={`task-item-${withTask ? "present" : "absent"}-${index}`}><span className="task-check"><Check size={13} /></span><span data-task-text>{task}</span><span className="muted" style={{ marginLeft: "auto" }}>OPEN</span></div>)}</div>
    <div className="board-foot"><span>{tasks.length} rendered tasks · local DOM only</span><button type="button" onClick={verify} className="button primary small" data-testid={`button-verify-${withTask ? "present" : "absent"}`}><Radar size={13} />Verify claim</button></div>
    {run && <div className="panel" style={{ marginTop: 13, padding: 13, background: "#11161f" }} data-testid={`demo-result-${withTask ? "present" : "absent"}`}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><Status verdict={run.verdict} /><Link href={`/results/${run.id}`} className="button ghost small" data-testid={`link-demo-result-${withTask ? "present" : "absent"}`}>Inspect evidence <ArrowRight size={12} /></Link></div><p className="muted tiny" style={{ lineHeight: 1.6, margin: "10px 0 0" }}>{run.observedOutcome} Persisted run ID <span className="mono">{run.id}</span>.</p></div>}
  </section>;
}
function Demo() {
  const claim = "Task 'Prepare ICSE Board Project' was created.";
  return <main className="app-main">
    <Header eyebrow="Deterministic demo / fictional data" title="Same claim. Two outcomes." subtitle="Both fictional boards are rendered here. Verification queries each live task-list DOM and saves the observed result locally; no canned verdict is used." />
    <div className="panel panel-pad" style={{ marginTop: 22 }}><div className="eyebrow">AGENT CLAIM / IDENTICAL FOR BOTH BOARDS</div><div className="mono" style={{ color: "#e3e9ec", fontSize: 13, marginTop: 10 }} data-testid="demo-agent-claim">{claim}</div></div>
    <div className="demo-grid"><DemoBoard title="Northstar Tasks" withTask /><DemoBoard title="Fieldnotes Tasks" withTask={false} /></div>
    <div className="callout" style={{ marginTop: 17 }}><Code2 size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />Evidence is collected from rendered <span className="mono">[data-task-item]</span> elements within each board's own task-list reference. The absent board fails because no normalized exact task-title match exists.</div>
  </main>;
}
function Router() {
  const [location] = useLocation();
  return <RoutedErrorBoundary resetKey={location}><Layout><Switch>
    <Route path="/" component={Landing} />
    <Route path="/dashboard" component={Dashboard} />
    <Route path="/contracts/new" component={ContractBuilder} />
    <Route path="/results/:id" component={ResultPage} />
    <Route path="/receipts/:id" component={ReceiptPage} />
    <Route path="/demo" component={Demo} />
    <Route component={NotFound} />
  </Switch></Layout></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({ children, resetKey }: { children: ReactNode; resetKey: string }) {
  return <ErrorBoundary resetKey={resetKey}>{children}</ErrorBoundary>;
}
function App() {
  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}><Router /></WouterRouter>;
}
export default App;
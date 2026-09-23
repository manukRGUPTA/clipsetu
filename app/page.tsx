import Link from "next/link";

const features = [
  { title: "Clear campaign terms", copy: "Rates, milestones, eligible platforms, and source-rights confirmation belong in the brief." },
  { title: "Human-reviewed reach", copy: "Reported views stay separate from admin-verified cumulative counts." },
  { title: "Auditable rewards", copy: "INR amounts use paise in the ledger; manual payout records never imply an automatic transfer." },
];

export default function Home() {
  return (
    <div className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">A clearer way to run clipping campaigns</p>
          <h1>Great clips deserve clear rules and fair rewards.</h1>
          <p className="hero-copy">Clipsetu brings Indian brands, creators, and clippers into one transparent workflow—from campaign briefs to reviewed submissions and payout records.</p>
          <div className="actions">
            <Link className="button" href="/sign-in?mode=signup">Create an account <span aria-hidden="true">→</span></Link>
            <Link className="button button-secondary" href="/sign-in">Sign in</Link>
          </div>
          <p className="language-toggle">English · हिन्दी navigation is being rolled out in the account flow.</p>
        </div>
        <aside className="hero-panel" aria-label="Example campaign summary">
          <span className="pill">Preview · sample terms</span>
          <div className="campaign-preview">
            <span className="panel-label">Campaign brief</span>
            <h2>Short-form clips for a founder podcast</h2>
            <p>Clear source link · Instagram Reels · YouTube Shorts</p>
            <div className="metric-row"><span>Base reward</span><strong>₹40 / accepted clip</strong></div>
            <div className="metric-row"><span>Views</span><strong>Reported ≠ verified</strong></div>
          </div>
          <p className="muted" style={{ fontSize: 11, marginBottom: 0 }}>Illustrative product copy—not an active campaign or payment promise.</p>
        </aside>
      </section>

      <section className="section" aria-labelledby="platform-principles">
        <h2 id="platform-principles">Built around trust, not guesswork</h2>
        <p className="section-intro">Campaigns are drafts until reviewed. Social views are not fetched automatically.</p>
        <div className="feature-list">
          {features.map((feature) => (
            <article className="feature" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

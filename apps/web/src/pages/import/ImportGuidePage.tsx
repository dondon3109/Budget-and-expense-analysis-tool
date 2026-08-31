import { Link, useLocation } from "react-router-dom";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";
import { detectedColumnLabels, IMPORT_GUIDES, type ImportGuide } from "./importGuides";
import "./ImportGuidePage.css";

export const IMPORT_GUIDE_LAST_UPDATED = "August 30, 2026";

function ImportGuideBody({ guide }: { guide: ImportGuide }) {
  const columns = detectedColumnLabels(guide.presetId);
  const others = IMPORT_GUIDES.filter((candidate) => candidate.path !== guide.path);

  return (
    <>
      <section className="import-guide-section">
        <h2>How to export your {guide.shortName} transactions</h2>
        <ol className="import-guide-steps">
          {guide.exportSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="import-guide-section">
        <h2>What Zoption reads automatically</h2>
        <p>
          Zoption looks for these headings in your {guide.shortName} file and maps them for you:
        </p>
        <ul className="import-guide-columns">
          {columns.map((column) => (
            <li key={column}>{column}</li>
          ))}
        </ul>
        <ul className="import-guide-notes">
          {guide.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>

      <section className="import-guide-section">
        <h2>What happens after you choose a file</h2>
        <p>
          Nothing is saved until you say so. Zoption shows a preview with every parsed row, flags
          rows it cannot read, warns you about likely duplicates, and commits your import as a
          single unit — so a partial import can never leave your ledger half-updated.
        </p>
        <p>
          Once saved, the entries feed your category spending, budget progress, six-month trend, and
          savings rate. Amounts are stored as whole centavos, so totals stay exact instead of
          drifting the way floating-point sums do.
        </p>
      </section>

      <section className="import-guide-section">
        <h2>Your data stays yours</h2>
        <p>
          Zoption does not connect to {guide.shortName} and never asks for your banking
          credentials. You upload a file you already downloaded, and every record lives in your own
          isolated workspace. Your workspace starts empty and contains only what you choose to add.
        </p>
      </section>

      <section className="import-guide-section">
        <h2>Common questions</h2>
        {guide.questions.map(({ question, answer }) => (
          <div className="import-guide-question" key={question}>
            <h3>{question}</h3>
            <p>{answer}</p>
          </div>
        ))}
      </section>

      <section className="import-guide-cta">
        <p>Import your {guide.shortName} history into a private peso workspace.</p>
        <Link className="button" to="/signup">
          Create your workspace
        </Link>
      </section>

      <nav className="import-guide-others" aria-label="Other import guides">
        <h2>Other statements you can import</h2>
        <ul>
          {others.map((candidate) => (
            <li key={candidate.path}>
              <Link to={candidate.path}>{candidate.institution}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

export function ImportGuidePage() {
  const { pathname } = useLocation();
  const guide = IMPORT_GUIDES.find((candidate) => candidate.path === pathname);
  if (!guide) return null;

  return (
    <LegalPageLayout
      title={guide.heading}
      summary={guide.summary}
      lastUpdated={IMPORT_GUIDE_LAST_UPDATED}
    >
      <ImportGuideBody guide={guide} />
    </LegalPageLayout>
  );
}

import { Link } from "react-router-dom";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";
import { IMPORT_GUIDES } from "./importGuides";
import "./ImportGuidePage.css";

const SUPPORTED_FORMATS = [
  {
    name: "CSV",
    detail:
      "The most common bank export. Zoption detects the delimiter, reads the header row, and maps your columns before showing a preview.",
  },
  {
    name: "Excel (.xlsx and .xls)",
    detail:
      "Pick a workbook and, if it has more than one sheet, choose the worksheet that holds your transactions.",
  },
  {
    name: "PDF bank statements",
    detail:
      "Upload the statement you downloaded from your bank. Rows are extracted and shown in the same reviewable preview, so you confirm the parse before saving.",
  },
];

const SAFETY_CHECKS = [
  {
    title: "Preview before anything is saved",
    detail:
      "Every parsed row is shown first. Rows Zoption cannot read are flagged rather than silently dropped.",
  },
  {
    title: "Duplicates are caught",
    detail:
      "Incoming rows are compared against transactions you already have, and likely duplicates are flagged for you to confirm.",
  },
  {
    title: "Imports commit as one unit",
    detail:
      "A previewed import saves fully or not at all, so a failed import can never leave your ledger half-updated.",
  },
  {
    title: "Amounts stay exact",
    detail:
      "Money is stored as whole centavos rather than fractions, so monthly totals do not drift the way floating-point sums do.",
  },
];

export function ImportHubPage() {
  return (
    <LegalPageLayout
      title="Import bank statements into Zoption"
      summary="Bring CSV, Excel, or PDF transaction history from your bank into a private peso budget tracker — reviewed row by row, with no bank connection."
      lastUpdated="August 30, 2026"
    >
      <section className="import-guide-section">
        <h2>Statements you can import</h2>
        <p>
          Zoption has built-in column detection for these institutions. Pick your bank for the
          exact headings it reads and how to export from it.
        </p>
        <ul className="import-guide-columns">
          {IMPORT_GUIDES.map((guide) => (
            <li key={guide.path}>
              <Link to={guide.path}>{guide.institution}</Link>
            </li>
          ))}
        </ul>
        <p>
          Using a different bank? The generic preset matches the common Date, Description, Amount,
          Debit, and Credit headings that most exports use.
        </p>
      </section>

      <section className="import-guide-section">
        <h2>File formats</h2>
        {SUPPORTED_FORMATS.map(({ name, detail }) => (
          <div className="import-guide-question" key={name}>
            <h3>{name}</h3>
            <p>{detail}</p>
          </div>
        ))}
      </section>

      <section className="import-guide-section">
        <h2>Before anything reaches your ledger</h2>
        {SAFETY_CHECKS.map(({ title, detail }) => (
          <div className="import-guide-question" key={title}>
            <h3>{title}</h3>
            <p>{detail}</p>
          </div>
        ))}
      </section>

      <section className="import-guide-section">
        <h2>No bank connection, ever</h2>
        <p>
          Zoption imports files you already downloaded. It does not connect to banks, does not ask
          for banking credentials, and has no read access to your accounts. Everything you import
          stays in your own isolated workspace, and a new workspace starts empty.
        </p>
      </section>

      <section className="import-guide-cta">
        <p>Turn a downloaded statement into a clear monthly picture.</p>
        <Link className="button" to="/signup">
          Create your workspace
        </Link>
      </section>
    </LegalPageLayout>
  );
}

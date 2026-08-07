import { Link } from "react-router-dom";

import { LegalPageLayout } from "../../components/legal/LegalPageLayout";
import { FAQ_ITEMS_PUBLIC } from "../../seo/siteMetadata";
import "./FaqPage.css";

export function FaqPage() {
  return (
    <LegalPageLayout
      title="Frequently asked questions"
      summary="Plain-language answers about how Zoption tracks expenses, imports files, follows budgets, and handles your data."
    >
      <section className="faq-page-list">
        {FAQ_ITEMS_PUBLIC.map(({ question, answer }) => (
          <div className="faq-page-item" key={question}>
            <h2>{question}</h2>
            <p>{answer}</p>
          </div>
        ))}
      </section>

      <section className="faq-page-cta">
        <p>
          Still unsure? Create your workspace and see how Zoption turns your own files and entries
          into a clear monthly picture — it starts empty and private, with no bank connection.
        </p>
        <Link className="button" to="/signup">
          Create your workspace
        </Link>
      </section>
    </LegalPageLayout>
  );
}

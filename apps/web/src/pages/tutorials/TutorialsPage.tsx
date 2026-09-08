import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Camera,
  FileSpreadsheet,
  HelpCircle,
  PieChart,
  Repeat,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { AppShell } from "../../components/layout/AppShell";
import { LegalFooter } from "../../components/legal/LegalFooter";
import "./TutorialsPage.css";

interface TutorialSection {
  id: string;
  category: string;
  title: string;
  icon: typeof BookOpen;
  summary: string;
  actionText?: string;
  actionHref?: string;
  steps: {
    title: string;
    description: string;
    tip?: string;
  }[];
}

const TUTORIALS_DATA: TutorialSection[] = [
  {
    id: "adjust-balances",
    category: "Accounts & Balances",
    title: "How to Adjust Current Account Balances",
    icon: SlidersHorizontal,
    summary:
      "Keep your Zoption balances in exact sync with your real-world cash, bank accounts, and e-wallets without messing up your ledger.",
    actionText: "Go to Dashboard to adjust balance",
    actionHref: "/app",
    steps: [
      {
        title: "Locate your Account on the Dashboard",
        description:
          "On your Dashboard under 'Account balances', you will see your Cash, Bank, and any custom accounts (like GCash, Maya, or Savings).",
        tip: "You can adjust any account at any time, including default Cash and Bank accounts.",
      },
      {
        title: "Click the 'Adjust balance' icon",
        description:
          "Click the Sliders icon (Adjust balance) directly next to the account name, or click the 'Adjust balance' button in the section header.",
      },
      {
        title: "Type your real-world actual balance",
        description:
          "Type the exact amount you currently have in your wallet or bank account. Zoption will calculate the difference automatically.",
        tip: "If your new balance is higher, Zoption books it as an Income Adjustment. If lower, it books as an Expense Adjustment under Uncategorized.",
      },
      {
        title: "Save or Undo if needed",
        description:
          "Click 'Save adjustment'. If you made a typo, you can immediately click 'Undo adjustment' to reverse the transaction and restore your previous balance.",
      },
    ],
  },
  {
    id: "envelope-budgeting",
    category: "Budgeting",
    title: "How to Use Envelope Budgeting",
    icon: PieChart,
    summary:
      "Allocate monthly spending limits per category so you know exactly how much you have left to spend.",
    actionText: "Open Budgets",
    actionHref: "/app/budgets",
    steps: [
      {
        title: "Open the Budgets tab",
        description:
          "Navigate to the Budgets page from the sidebar or mobile bottom bar. You'll see your monthly spending breakdown.",
      },
      {
        title: "Create envelopes for your key spending categories",
        description:
          "Set budget targets for Groceries, Dining Out, Utilities, Transportation, and Personal Care. Each category functions as an envelope of money.",
      },
      {
        title: "Track envelope progress throughout the month",
        description:
          "As you log expenses, Zoption updates your envelope progress bars in real time. Green means well within budget, yellow means close, and red alerts you to overspending.",
      },
      {
        title: "Share envelopes with household members",
        description:
          "Need a shared grocery or household budget? Click 'Share envelopes' to generate a secure, encrypted link for your partner or roommate.",
        tip: "Shared budgets let both parties see remaining envelope amounts without sharing personal bank credentials.",
      },
    ],
  },
  {
    id: "fast-transactions",
    category: "Transactions",
    title: "Fast Transaction Entry: Voice, Receipts & SMS",
    icon: Camera,
    summary:
      "Log expenses in seconds using camera receipt scanning, natural voice dictation, or SMS auto-fill.",
    actionText: "Add a transaction",
    actionHref: "/app/transactions?add=1",
    steps: [
      {
        title: "Camera Receipt Scanning",
        description:
          "Click 'Scan receipt' on the dashboard or use the mobile camera. Take a photo of your paper receipt or upload an e-receipt screenshot. Zoption extracts the total, date, merchant, and line items.",
      },
      {
        title: "AI Voice Dictation",
        description:
          "Open the AI Assistant or tap the microphone icon on mobile. Say something natural like 'Paid 250 pesos for lunch at Jollibee using GCash'. The assistant parses the amount, account, and category instantly.",
      },
      {
        title: "Bank & E-Wallet SMS Notification Parsing",
        description:
          "Copy transaction SMS alerts from GCash, Maya, BDO, or BPI and paste them directly into Zoption's Quick Paste modal. It detects the amount, reference number, and merchant.",
      },
    ],
  },
  {
    id: "bank-csv-imports",
    category: "Importing Data",
    title: "Importing Bank Statements & CSVs",
    icon: FileSpreadsheet,
    summary:
      "Bulk import past bank and e-wallet statements with smart column mapping and duplicate detection.",
    actionText: "Go to Import Hub",
    actionHref: "/app/import",
    steps: [
      {
        title: "Download your statement CSV",
        description:
          "Log into your online banking or e-wallet (BDO, BPI, UnionBank, GCash, Maya, Bank of America, etc.) and download your transaction history as a CSV file.",
      },
      {
        title: "Upload to the Import Hub",
        description:
          "Go to Import in Zoption and drag-and-drop your file. Zoption recognizes standard bank formats automatically.",
      },
      {
        title: "Review duplicate checks & category matches",
        description:
          "Zoption checks each row against existing ledger transactions to prevent double-counting. Confirm the categories and import in one click.",
      },
    ],
  },
  {
    id: "subscriptions-and-bills",
    category: "Subscriptions",
    title: "Tracking Subscriptions & Recurring Bills",
    icon: Repeat,
    summary:
      "Never miss a renewal date or pay for an unused service with scheduled bill tracking and cancellation guides.",
    actionText: "Manage Subscriptions",
    actionHref: "/app/subscriptions",
    steps: [
      {
        title: "Add your active recurring services",
        description:
          "Add services like Netflix, Spotify, gym memberships, internet bills, or insurance premiums with their renewal cycle (monthly or annual).",
      },
      {
        title: "Track renewal reminders and cash flow impact",
        description:
          "See upcoming charge dates on your Calendar and review your 30-day and annual subscription burn rate.",
      },
      {
        title: "Use Step-by-Step Cancellation Guides",
        description:
          "Want to cancel a service? Zoption provides direct links and instructions on how to cancel subscriptions across major platforms without hassle.",
      },
    ],
  },
  {
    id: "privacy-and-offline",
    category: "Privacy & Sync",
    title: "Offline Use & Zero-Knowledge Encryption",
    icon: ShieldCheck,
    summary:
      "Understand how your financial data is protected and how to use Zoption anywhere, even without an internet connection.",
    steps: [
      {
        title: "Local-First Architecture",
        description:
          "On the mobile app, your workspace is stored in an encrypted local SQLite database. You can record transactions, check budgets, and review balances completely offline.",
      },
      {
        title: "Automatic Background Sync",
        description:
          "When you reconnect to Wi-Fi or cellular data, Zoption syncs your changes automatically with conflict resolution.",
      },
      {
        title: "Client-Side Encryption",
        description:
          "Your sensitive financial ledger is encrypted before it leaves your device. Only you possess the credentials to decrypt your records.",
      },
    ],
  },
];

export function TutorialsPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const categories = useMemo(() => {
    const set = new Set<string>();
    TUTORIALS_DATA.forEach((t) => set.add(t.category));
    return ["All", ...Array.from(set)];
  }, []);

  const filteredTutorials = useMemo(() => {
    return TUTORIALS_DATA.filter((tutorial) => {
      const matchesCategory = activeCategory === "All" || tutorial.category === activeCategory;
      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const inTitle = tutorial.title.toLowerCase().includes(q);
      const inSummary = tutorial.summary.toLowerCase().includes(q);
      const inSteps = tutorial.steps.some(
        (s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
      );
      return inTitle || inSummary || inSteps;
    });
  }, [searchQuery, activeCategory]);

  const content = (
    <div className="tutorials-page">
      <header className="tutorials-hero">
        <div className="tutorials-hero-badge">
          <BookOpen size={14} aria-hidden="true" />
          <span>User Guides & Tutorials</span>
        </div>
        <h1>How to Use Zoption</h1>
        <p className="tutorials-hero-sub">
          Step-by-step walkthroughs to help you master your budget, adjust balances, scan receipts,
          and reach your financial goals.
        </p>

        <div className="tutorials-search-bar">
          <Search size={18} className="tutorials-search-icon" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search tutorials (e.g. adjust balance, scan receipt, budgets)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search tutorials"
          />
          {searchQuery && (
            <button
              type="button"
              className="tutorials-clear-search"
              onClick={() => setSearchQuery("")}
            >
              Clear
            </button>
          )}
        </div>

        <nav className="tutorials-categories" aria-label="Tutorial categories">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`tutorials-category-pill ${activeCategory === cat ? "active" : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </nav>
      </header>

      <div className="tutorials-list">
        {filteredTutorials.length === 0 ? (
          <div className="tutorials-empty">
            <HelpCircle size={32} aria-hidden="true" />
            <h2>No tutorials found</h2>
            <p>Try searching with different keywords or switch back to "All".</p>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setSearchQuery("");
                setActiveCategory("All");
              }}
            >
              Reset filters
            </button>
          </div>
        ) : (
          filteredTutorials.map((tutorial) => {
            const Icon = tutorial.icon;
            return (
              <article key={tutorial.id} id={tutorial.id} className="tutorial-card">
                <header className="tutorial-card-header">
                  <div className="tutorial-icon-box">
                    <Icon size={22} aria-hidden="true" />
                  </div>
                  <div>
                    <span className="tutorial-category-tag">{tutorial.category}</span>
                    <h2>{tutorial.title}</h2>
                    <p className="tutorial-summary">{tutorial.summary}</p>
                  </div>
                </header>

                <div className="tutorial-steps">
                  {tutorial.steps.map((step, index) => (
                    <div key={index} className="tutorial-step-item">
                      <div className="tutorial-step-indicator">
                        <span className="tutorial-step-number">{index + 1}</span>
                      </div>
                      <div className="tutorial-step-body">
                        <h3>{step.title}</h3>
                        <p>{step.description}</p>
                        {step.tip && (
                          <div className="tutorial-tip">
                            <strong>Tip:</strong> {step.tip}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {tutorial.actionHref && tutorial.actionText && (
                  <footer className="tutorial-card-footer">
                    <Link to={tutorial.actionHref} className="button secondary">
                      <span>{tutorial.actionText}</span>
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </footer>
                )}
              </article>
            );
          })
        )}
      </div>

      <section className="tutorials-help-banner">
        <div>
          <h2>Still need assistance?</h2>
          <p>Our support team and AI Assistant are available 24/7 to answer your questions.</p>
        </div>
        <div className="tutorials-help-actions">
          {user ? (
            <Link to="/app/assistant" className="button primary">
              Ask AI Assistant
            </Link>
          ) : (
            <Link to="/signup" className="button primary">
              Get Started Free
            </Link>
          )}
          <Link to="/faq" className="button secondary">
            Read FAQ
          </Link>
        </div>
      </section>
    </div>
  );

  if (user) {
    return <AppShell>{content}</AppShell>;
  }

  return (
    <div className="public-tutorials-layout">
      <nav className="public-tutorials-topbar">
        <Link to="/" className="public-tutorials-brand">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to Zoption Home</span>
        </Link>
        <Link to="/login" className="button primary compact-action">
          Sign in
        </Link>
      </nav>
      <main>{content}</main>
      <LegalFooter />
    </div>
  );
}

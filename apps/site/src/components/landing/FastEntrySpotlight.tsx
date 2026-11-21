import {
  ArrowRight,
  Camera,
  Check,
  FileSpreadsheet,
  FileText,
  Mic,
  ShieldCheck,
  Sparkles,
  Upload,
  Volume2,
} from "lucide-react";
import { useState } from "react";

const voiceSamples = [
  {
    id: "groceries",
    title: "Grocery Run",
    spoken: "Spent ₱540 for fresh groceries at Robinsons Supermarket today",
    amount: "₱540.00",
    merchant: "Robinsons Supermarket",
    category: "Groceries",
    date: "Today",
    type: "Expense",
  },
  {
    id: "fuel",
    title: "Fuel & Gas",
    spoken: "Paid ₱1,850 for Shell gasoline fuel this afternoon",
    amount: "₱1,850.00",
    merchant: "Shell Gas Station",
    category: "Transport",
    date: "Today",
    type: "Expense",
  },
  {
    id: "dining",
    title: "Dining Out",
    spoken: "Lunch at Wildflour Cafe with team ₱1,250",
    amount: "₱1,250.00",
    merchant: "Wildflour Cafe",
    category: "Dining & Food",
    date: "Today",
    type: "Expense",
  },
];

const receiptSamples = [
  {
    id: "supermarket",
    title: "Supermarket Bill",
    merchant: "Metro Supermarket",
    branch: "BGC Central Square",
    date: "Jul 18, 2026",
    time: "2:45 PM",
    items: [
      { name: "Fresh Farm Milk 1L", price: "₱115.00" },
      { name: "Organic Brown Eggs 12s", price: "₱195.00" },
      { name: "Whole Grain Sourdough", price: "₱240.00" },
      { name: "Ground Arabica 250g", price: "₱380.00" },
    ],
    subtotal: "₱930.00",
    tax: "₱111.60",
    total: "₱1,041.60",
    category: "Groceries",
    status: "Ready to review",
  },
  {
    id: "bistro",
    title: "Cafe Receipt",
    merchant: "Mary Grace Cafe",
    branch: "Greenbelt 2",
    date: "Jul 18, 2026",
    time: "7:15 PM",
    items: [
      { name: "Grilled Chicken Salad", price: "₱465.00" },
      { name: "Hot Chocolate Special", price: "₱220.00" },
      { name: "Cheese Roll", price: "₱95.00" },
    ],
    subtotal: "₱780.00",
    tax: "₱93.60",
    total: "₱873.60",
    category: "Dining & Food",
    status: "Ready to review",
  },
];

const assistantPromptSamples = [
  {
    question: "How does my food and grocery spending compare to last month?",
    answer:
      "You've spent ₱8,450 on Groceries and Dining so far in July across 18 transactions. This is 12% lower than June at the same date window (₱9,600), keeping you ₱1,550 under your planned budget envelope.",
    evidence: "Derived from 18 ledger entries between Jul 01 and Jul 18",
    category: "Spending Trends",
  },
  {
    question: "What bills are coming up?",
    answer:
      "You have 3 recurring charges scheduled in the next 10 days: Spotify (₱139 on Jul 17), iCloud+ (₱49 on Jul 24), and Canva Pro (₱249 on Aug 01), totalling ₱437.",
    evidence: "Grounded from active bill records",
    category: "Upcoming Bills",
  },
  {
    question: "How much interest have I earned on my savings account?",
    answer:
      "Your high-yield savings account earned +₱150.00 last month at 6% p.a. on a ₱30,000 balance, credited automatically on your set monthly pay day.",
    evidence: "Computed from your account rate and ledger balance",
    category: "Savings Yield",
  },
];

/** Fast expense entry spotlight section. All four panels render in HTML so crawlers and ARIA controls resolve every tab. */
export function FastEntrySpotlight() {
  // Fast Entry Spotlight State
  const [activeSpotlightTab, setActiveSpotlightTab] = useState<
    "voice" | "receipt" | "files" | "assistant"
  >("voice");
  const [activeVoiceSampleIndex, setActiveVoiceSampleIndex] = useState<number>(0);
  const [isRecordingSimulated, setIsRecordingSimulated] = useState<boolean>(false);
  const [activeReceiptSampleIndex, setActiveReceiptSampleIndex] = useState<number>(0);
  const [activeAssistantPromptIndex, setActiveAssistantPromptIndex] = useState<number>(0);

  const activeVoiceSample = voiceSamples[activeVoiceSampleIndex] ?? voiceSamples[0]!;
  const activeReceiptSample = receiptSamples[activeReceiptSampleIndex] ?? receiptSamples[0]!;
  const activeAssistantPrompt =
    assistantPromptSamples[activeAssistantPromptIndex] ?? assistantPromptSamples[0]!;

  return (
    <section className="spotlight-section" id="fast-entry" aria-labelledby="spotlight-title">
      <div className="section-head">
        <p className="eyebrow">
          <Sparkles size={14} aria-hidden="true" /> Fast Expense Entry
        </p>
        <h2 id="spotlight-title">Skip manual typing. Talk, snap, or import.</h2>
        <p className="section-lead">
          Typing every purchase by hand is why budgets fall behind. Speak an expense in English or
          Tagalog, photograph a receipt, drop a bank PDF or spreadsheet, or ask the AI assistant to
          draft it for you.
        </p>
      </div>

      <div className="spotlight-tabs" role="tablist" aria-label="Input methods">
        <button
          type="button"
          role="tab"
          aria-selected={activeSpotlightTab === "voice"}
          aria-controls="spotlight-panel-voice"
          id="spotlight-tab-voice"
          className={`spotlight-tab-btn ${activeSpotlightTab === "voice" ? "active" : ""}`}
          onClick={() => setActiveSpotlightTab("voice")}
        >
          <Mic size={17} aria-hidden="true" />
          <span>Voice Entry</span>
          <span className="tab-pill-badge top-pill">Top Feature</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSpotlightTab === "receipt"}
          aria-controls="spotlight-panel-receipt"
          id="spotlight-tab-receipt"
          className={`spotlight-tab-btn ${activeSpotlightTab === "receipt" ? "active" : ""}`}
          onClick={() => setActiveSpotlightTab("receipt")}
        >
          <Camera size={17} aria-hidden="true" />
          <span>Scan Receipt</span>
          <span className="tab-pill-badge top-pill">Top Feature</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSpotlightTab === "files"}
          aria-controls="spotlight-panel-files"
          id="spotlight-tab-files"
          className={`spotlight-tab-btn ${activeSpotlightTab === "files" ? "active" : ""}`}
          onClick={() => setActiveSpotlightTab("files")}
        >
          <FileSpreadsheet size={17} aria-hidden="true" />
          <span>PDF, CSV &amp; Excel</span>
          <span className="tab-pill-badge">Universal</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSpotlightTab === "assistant"}
          aria-controls="spotlight-panel-assistant"
          id="spotlight-tab-assistant"
          className={`spotlight-tab-btn ${activeSpotlightTab === "assistant" ? "active" : ""}`}
          onClick={() => setActiveSpotlightTab("assistant")}
        >
          <Sparkles size={17} aria-hidden="true" />
          <span>AI Assistant</span>
          <span className="tab-pill-badge">Grounded</span>
        </button>
      </div>

      <div className="spotlight-content-card">
        {/* TAB 1: VOICE ENTRY */}
        <div
          id="spotlight-panel-voice"
          role="tabpanel"
          aria-labelledby="spotlight-tab-voice"
          className="spotlight-grid"
          hidden={activeSpotlightTab !== "voice"}
        >
          <div className="spotlight-copy">
            <div className="spotlight-kicker">
              <Mic size={15} aria-hidden="true" /> Voice Expense Logging
            </div>
            <h3>Just talk to log your spending.</h3>
            <p>
              Tap the microphone and say what you spent in English or Tagalog. Zoption transcribes
              your sentence and fills in the amount, store, date, and category so you can check the
              draft and save in one tap.
            </p>
            <ul className="spotlight-benefits">
              <li>
                <Check size={16} aria-hidden="true" /> <strong>English and Tagalog support.</strong>{" "}
                Set Auto detection or lock to English or Tagalog in Account Settings.
              </li>
              <li>
                <Check size={16} aria-hidden="true" /> <strong>Automatic category matching.</strong>{" "}
                Maps expenses straight to your budget categories like Groceries, Transport, or
                Dining.
              </li>
              <li>
                <Check size={16} aria-hidden="true" /> <strong>Editable draft first.</strong> Fix
                any misheard word before it touches your ledger.
              </li>
            </ul>
            <p className="spotlight-learn-more">
              <a href="/features/voice-expense-entry">
                See how voice expense entry works
                <ArrowRight size={14} aria-hidden="true" />
              </a>
            </p>
            <div className="sample-selector-label">Try interactive voice examples:</div>
            <div className="sample-chips">
              {voiceSamples.map((sample, index) => (
                <button
                  key={sample.id}
                  type="button"
                  className={`sample-chip ${activeVoiceSampleIndex === index ? "active" : ""}`}
                  onClick={() => {
                    setActiveVoiceSampleIndex(index);
                    setIsRecordingSimulated(true);
                    setTimeout(() => setIsRecordingSimulated(false), 900);
                  }}
                >
                  {sample.title}
                </button>
              ))}
            </div>
          </div>

          <div
            className="spotlight-interactive-card voice-card"
            aria-label="Interactive voice entry simulation"
          >
            <div className="demo-header">
              <span className="demo-badge">Live Voice Simulator</span>
              <span className="demo-status">
                <span className={`status-pulse ${isRecordingSimulated ? "pulsing" : ""}`} />
                {isRecordingSimulated ? "Transcribing voice…" : "Draft ready"}
              </span>
            </div>

            <div className="voice-mic-container">
              <button
                type="button"
                className={`voice-mic-hero-btn ${isRecordingSimulated ? "recording" : ""}`}
                onClick={() => {
                  setIsRecordingSimulated(true);
                  setTimeout(() => setIsRecordingSimulated(false), 1000);
                }}
                title="Simulate voice capture"
                aria-label="Simulate voice capture"
              >
                <Mic size={28} aria-hidden="true" />
              </button>
              <div className="voice-waves" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className="spoken-bubble">
              <p>{activeVoiceSample.spoken}</p>
            </div>

            <div className="extracted-transaction-card">
              <div className="extracted-card-top">
                <span className="extracted-tag">Draft Transaction</span>
                <span className="extracted-status in-soft">
                  <Check size={13} /> Ready to confirm
                </span>
              </div>
              <div className="extracted-fields-grid">
                <div className="extracted-field">
                  <small>Amount</small>
                  <strong className="extracted-amount">{activeVoiceSample.amount}</strong>
                </div>
                <div className="extracted-field">
                  <small>Merchant / Store</small>
                  <strong>{activeVoiceSample.merchant}</strong>
                </div>
                <div className="extracted-field">
                  <small>Category</small>
                  <span className="category-pill">{activeVoiceSample.category}</span>
                </div>
                <div className="extracted-field">
                  <small>Date</small>
                  <strong>{activeVoiceSample.date}</strong>
                </div>
              </div>
              <div className="extracted-action-row">
                <button type="button" className="button primary full-width demo-save-btn">
                  <Check size={16} aria-hidden="true" /> Save to Ledger
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* TAB 2: SCAN RECEIPT */}
        <div
          id="spotlight-panel-receipt"
          role="tabpanel"
          aria-labelledby="spotlight-tab-receipt"
          className="spotlight-grid"
          hidden={activeSpotlightTab !== "receipt"}
        >
          <div className="spotlight-copy">
            <div className="spotlight-kicker">
              <Camera size={15} aria-hidden="true" /> Camera &amp; Screenshot Scan
            </div>
            <h3>Take a picture of any receipt. Skip the keypad.</h3>
            <p>
              Photograph a paper receipt or upload an e-receipt screenshot on web or Android.
              Zoption reads the store name, date, subtotal, tax, and line items into an editable
              draft, and never stores the photo.
            </p>
            <ul className="spotlight-benefits">
              <li>
                <Check size={16} aria-hidden="true" /> <strong>Paper and digital slips.</strong>{" "}
                Works on grocery bills, cafe receipts, pharmacy slips, and checkout screenshots.
              </li>
              <li>
                <Check size={16} aria-hidden="true" /> <strong>Photos are never stored.</strong>{" "}
                Receipt scanning asks for separate consent and discards the image after drafting.
              </li>
              <li>
                <Check size={16} aria-hidden="true" /> <strong>Duplicate check built in.</strong>{" "}
                Scanning the same receipt twice warns you before saving a second entry.
              </li>
            </ul>
            <p className="spotlight-learn-more">
              <a href="/features/receipt-scanning">
                See how receipt scanning works
                <ArrowRight size={14} aria-hidden="true" />
              </a>
            </p>
            <div className="sample-selector-label">Choose sample receipt:</div>
            <div className="sample-chips">
              {receiptSamples.map((sample, index) => (
                <button
                  key={sample.id}
                  type="button"
                  className={`sample-chip ${activeReceiptSampleIndex === index ? "active" : ""}`}
                  onClick={() => setActiveReceiptSampleIndex(index)}
                >
                  {sample.title}
                </button>
              ))}
            </div>
          </div>

          <div
            className="spotlight-interactive-card receipt-card"
            aria-label="Interactive receipt scanner preview"
          >
            <div className="demo-header">
              <span className="demo-badge">Receipt Scanner</span>
              <span className="demo-status in-soft">
                <Check size={13} /> {activeReceiptSample.status}
              </span>
            </div>

            <div className="receipt-viewfinder">
              <div className="viewfinder-frame">
                <div className="viewfinder-corner top-left" />
                <div className="viewfinder-corner top-right" />
                <div className="viewfinder-corner bottom-left" />
                <div className="viewfinder-corner bottom-right" />

                <div className="receipt-paper">
                  <div className="receipt-merchant-header">
                    <h4>{activeReceiptSample.merchant}</h4>
                    <small>{activeReceiptSample.branch}</small>
                    <span className="receipt-date">
                      {activeReceiptSample.date} &middot; {activeReceiptSample.time}
                    </span>
                  </div>
                  <div className="receipt-items-list">
                    {activeReceiptSample.items.map((item, idx) => (
                      <div className="receipt-item-row" key={idx}>
                        <span>{item.name}</span>
                        <b>{item.price}</b>
                      </div>
                    ))}
                  </div>
                  <div className="receipt-totals">
                    <div className="total-row sub">
                      <span>Subtotal</span>
                      <span>{activeReceiptSample.subtotal}</span>
                    </div>
                    <div className="total-row sub">
                      <span>VAT / Tax</span>
                      <span>{activeReceiptSample.tax}</span>
                    </div>
                    <div className="total-row grand">
                      <span>Total Extracted</span>
                      <b>{activeReceiptSample.total}</b>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="receipt-detected-summary">
              <div className="detected-pill-group">
                <span className="detected-pill">
                  <Check size={12} /> Merchant: {activeReceiptSample.merchant}
                </span>
                <span className="detected-pill">
                  <Check size={12} /> Category: {activeReceiptSample.category}
                </span>
                <span className="detected-pill">
                  <Check size={12} /> Total: {activeReceiptSample.total}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* TAB 3: UNIVERSAL FILES (PDF, CSV, EXCEL) */}
        <div
          id="spotlight-panel-files"
          role="tabpanel"
          aria-labelledby="spotlight-tab-files"
          className="spotlight-grid"
          hidden={activeSpotlightTab !== "files"}
        >
          <div className="spotlight-copy">
            <div className="spotlight-kicker">
              <FileSpreadsheet size={15} aria-hidden="true" /> Bank Statement &amp; Spreadsheet
              Importer
            </div>
            <h3>Import PDF, CSV, and Excel files without linking your bank.</h3>
            <p>
              Bring e-statements you already downloaded. Built-in presets recognize columns from
              BPI, BDO, MariBank, Bank of America, and JPMorgan Chase, while a generic preset reads
              any other CSV or Excel workbook (.xlsx, .xls).
            </p>
            <ul className="spotlight-benefits">
              <li>
                <Check size={16} aria-hidden="true" /> <strong>PDF bank statements.</strong>{" "}
                Extracts statement rows into the same reviewable preview without copy-pasting.
              </li>
              <li>
                <Check size={16} aria-hidden="true" /> <strong>Excel and CSV workbooks.</strong>{" "}
                Pick the sheet, confirm column mapping, and check every row before saving.
              </li>
              <li>
                <Check size={16} aria-hidden="true" /> <strong>Duplicate protection.</strong>{" "}
                Overlapping monthly files are flagged so transactions are not double-counted.
              </li>
            </ul>
            <p className="spotlight-learn-more">
              <a href="/import">
                See supported bank import guides
                <ArrowRight size={14} aria-hidden="true" />
              </a>
            </p>
            <div className="file-badge-strip">
              <span className="format-badge pdf">
                <FileText size={14} /> PDF Statements
              </span>
              <span className="format-badge xlsx">
                <FileSpreadsheet size={14} /> Excel XLSX / XLS
              </span>
              <span className="format-badge csv">
                <Upload size={14} /> CSV Spreadsheets
              </span>
            </div>
          </div>

          <div
            className="spotlight-interactive-card files-card"
            aria-label="Interactive file import visualizer"
          >
            <div className="demo-header">
              <span className="demo-badge">Multi-Format Dropzone</span>
              <span className="demo-status in-soft">
                <Check size={13} /> 3 Formats Supported
              </span>
            </div>

            <div className="file-upload-mockup">
              <div className="dropzone-box">
                <div className="dropzone-icon-stack">
                  <span className="icon-badge pdf">
                    <FileText size={22} />
                  </span>
                  <span className="icon-badge xls">
                    <FileSpreadsheet size={22} />
                  </span>
                  <span className="icon-badge csv">
                    <Upload size={22} />
                  </span>
                </div>
                <strong>Drop your PDF, Excel, or CSV statement</strong>
                <small>
                  Column detection &middot; Whole centavo math &middot; Duplicate warnings
                </small>
              </div>

              <div className="file-preview-table-wrap">
                <div className="file-preview-header">
                  <span>Statement_Jul2026.pdf</span>
                  <span className="chip in-soft">42 rows mapped</span>
                </div>
                <div className="file-rows-list">
                  <div className="file-row">
                    <span>Jul 14</span>
                    <span>BPI Online Transfer</span>
                    <span className="cat-chip">Income</span>
                    <b>+₱48,000.00</b>
                  </div>
                  <div className="file-row">
                    <span>Jul 15</span>
                    <span>Meralco Electric Bill</span>
                    <span className="cat-chip">Utilities</span>
                    <b>-₱2,450.00</b>
                  </div>
                  <div className="file-row">
                    <span>Jul 16</span>
                    <span>SM Supermarket</span>
                    <span className="cat-chip">Groceries</span>
                    <b>-₱1,820.50</b>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* TAB 4: AI FINANCIAL ASSISTANT */}
        <div
          id="spotlight-panel-assistant"
          role="tabpanel"
          aria-labelledby="spotlight-tab-assistant"
          className="spotlight-grid"
          hidden={activeSpotlightTab !== "assistant"}
        >
          <div className="spotlight-copy">
            <div className="spotlight-kicker">
              <Sparkles size={15} aria-hidden="true" /> Optional AI Assistant
            </div>
            <h3>Ask your numbers, not a generic chatbot.</h3>
            <p>
              The optional AI Assistant reads only the records you ask about and computes totals
              from your actual ledger. It can log a transaction or propose updates to your budgets,
              bills, goals, debts, accounts, or categories, and nothing changes until you confirm.
            </p>
            <ul className="spotlight-benefits">
              <li>
                <Check size={16} aria-hidden="true" /> <strong>Ledger-backed math.</strong> Totals
                and comparisons are calculated directly from your recorded transactions.
              </li>
              <li>
                <Check size={16} aria-hidden="true" /> <strong>You approve every change.</strong>{" "}
                Proposals wait for your tap on Save or Confirm before touching your data.
              </li>
              <li>
                <Check size={16} aria-hidden="true" /> <strong>Voice replies and live chat.</strong>{" "}
                Ask by voice on Free, or unlock live streaming voice chat on Budget and Pro.
              </li>
            </ul>
            <div className="sample-selector-label">Test financial questions:</div>
            <div className="sample-chips">
              {assistantPromptSamples.map((sample, index) => (
                <button
                  key={index}
                  type="button"
                  className={`sample-chip ${activeAssistantPromptIndex === index ? "active" : ""}`}
                  onClick={() => setActiveAssistantPromptIndex(index)}
                >
                  {sample.category}
                </button>
              ))}
            </div>
          </div>

          <div
            className="spotlight-interactive-card assistant-card"
            aria-label="Interactive AI Assistant preview"
          >
            <div className="demo-header">
              <span className="demo-badge">Grounded AI Assistant</span>
              <span className="demo-status in-soft">
                <ShieldCheck size={13} /> You Approve &amp; Private
              </span>
            </div>

            <div className="chat-conversation-box">
              <div className="chat-msg user-msg">
                <p>{activeAssistantPrompt.question}</p>
              </div>
              <div className="chat-msg assistant-msg">
                <div className="assistant-msg-header">
                  <Sparkles size={14} aria-hidden="true" />
                  <strong>Zoption Assistant</strong>
                  <span className="spoken-pill">
                    <Volume2 size={12} /> Spoken audio ready
                  </span>
                </div>
                <p>{activeAssistantPrompt.answer}</p>
                <div className="evidence-footer">
                  <small>{activeAssistantPrompt.evidence}</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

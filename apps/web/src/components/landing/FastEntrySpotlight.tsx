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
import { Link } from "react-router-dom";

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
    accuracy: "99.8% match",
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
    accuracy: "100% match",
  },
];

const assistantPromptSamples = [
  {
    question: "How does my food and grocery spending compare to last month?",
    answer:
      "You've spent ₱8,450 on Groceries and Dining so far in July across 18 transactions. This is 12% lower than June at the same date window (₱9,600), keeping you ₱1,550 under your planned budget envelope.",
    evidence: "Derived from 18 ledger entries between Jul 01 – Jul 18",
    category: "Spending Trends",
  },
  {
    question: "What recurring bills or subscriptions are coming up?",
    answer:
      "You have 3 recurring charges scheduled in the next 10 days: Spotify (₱139 on Jul 17), iCloud+ (₱49 on Jul 24), and Canva Pro (₱249 on Aug 01), totalling ₱437.",
    evidence: "Grounded from active subscription tracker records",
    category: "Upcoming Bills",
  },
  {
    question: "How much interest have I earned on my savings account?",
    answer:
      "Your high-yield savings account earned +₱214 last month at 0.6% p.a. on a ₱28,500 average balance, compounding automatically on your set monthly pay day.",
    evidence: "Computed using exact daily ledger balance compounding",
    category: "Savings Yield",
  },
];

/** Zero-Typing Financial Input Spotlight Section. */
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
          <Sparkles size={14} aria-hidden="true" /> Zero-Typing Financial Entry
        </p>
        <h2 id="spotlight-title">Never type a transaction again. Talk, snap, or import.</h2>
        <p className="section-lead">
          Manual entry is tedious. Zoption lets you capture spending on the go with your voice,
          digitize paper receipts with your camera, drop multi-format bank PDFs and spreadsheets, or
          consult your private AI assistant.
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
        {activeSpotlightTab === "voice" && (
          <div
            id="spotlight-panel-voice"
            role="tabpanel"
            aria-labelledby="spotlight-tab-voice"
            className="spotlight-grid"
          >
            <div className="spotlight-copy">
              <div className="spotlight-kicker">
                <Mic size={15} aria-hidden="true" /> Voice-Powered Expense Logging
              </div>
              <h3>Just talk to log your spending. Zero typing required.</h3>
              <p>
                Tap the microphone on the go and speak in your natural voice. Zoption transcribes
                your sentence in real-time, extracts the exact amount and currency, auto-detects the
                merchant, and assigns the right budget envelope for a seamless one-tap confirmation.
              </p>
              <ul className="spotlight-benefits">
                <li>
                  <Check size={16} aria-hidden="true" /> <strong>Multi-accent speech AI:</strong>{" "}
                  Works reliably in noisy street or cafe environments.
                </li>
                <li>
                  <Check size={16} aria-hidden="true" />{" "}
                  <strong>Automatic envelope tagging:</strong> Matches category targets like
                  Groceries, Fuel, or Dining.
                </li>
                <li>
                  <Check size={16} aria-hidden="true" /> <strong>One-tap review &amp; save:</strong>{" "}
                  You review the draft before it touches your ledger.
                </li>
              </ul>
              <p className="spotlight-learn-more">
                <Link to="/features/voice-expense-entry">
                  See how voice expense entry works
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
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
                  {isRecordingSimulated ? "Transcribing voice…" : "Voice parsed ready"}
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
                  <span className="extracted-tag">Auto-Parsed Transaction</span>
                  <span className="extracted-status in-soft">
                    <Check size={13} /> Verified Draft
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
                    <small>Category Envelope</small>
                    <span className="category-pill">{activeVoiceSample.category}</span>
                  </div>
                  <div className="extracted-field">
                    <small>Date</small>
                    <strong>{activeVoiceSample.date}</strong>
                  </div>
                </div>
                <div className="extracted-action-row">
                  <button type="button" className="button primary full-width demo-save-btn">
                    <Check size={16} aria-hidden="true" /> Add to Ledger (1-Tap)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SCAN RECEIPT */}
        {activeSpotlightTab === "receipt" && (
          <div
            id="spotlight-panel-receipt"
            role="tabpanel"
            aria-labelledby="spotlight-tab-receipt"
            className="spotlight-grid"
          >
            <div className="spotlight-copy">
              <div className="spotlight-kicker">
                <Camera size={15} aria-hidden="true" /> Camera &amp; Screenshot OCR
              </div>
              <h3>Take a picture of any receipt. Skip the keypad.</h3>
              <p>
                Paper receipts and digital checkout screenshots hold valuable purchase data. Take a
                quick photo with the Android Beta or upload a receipt image: Zoption’s smart vision
                engine detects the merchant name, date, subtotal, sales tax, and line items
                automatically.
              </p>
              <ul className="spotlight-benefits">
                <li>
                  <Check size={16} aria-hidden="true" />{" "}
                  <strong>Paper &amp; digital formats:</strong> Supermarket bills, dining receipts,
                  pharmacy invoices &amp; e-commerce slips.
                </li>
                <li>
                  <Check size={16} aria-hidden="true" /> <strong>Line item preservation:</strong>{" "}
                  Detailed breakdown without manual transcription.
                </li>
                <li>
                  <Check size={16} aria-hidden="true" /> <strong>Offline-first option:</strong>{" "}
                  Available directly on the native Android Beta app.
                </li>
              </ul>
              <p className="spotlight-learn-more">
                <Link to="/features/receipt-scanning">
                  See how receipt scanning works
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
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
                <span className="demo-badge">Smart OCR Scanner</span>
                <span className="demo-status in-soft">
                  <Check size={13} /> {activeReceiptSample.accuracy}
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
        )}

        {/* TAB 3: UNIVERSAL FILES (PDF, CSV, EXCEL) */}
        {activeSpotlightTab === "files" && (
          <div
            id="spotlight-panel-files"
            role="tabpanel"
            aria-labelledby="spotlight-tab-files"
            className="spotlight-grid"
          >
            <div className="spotlight-copy">
              <div className="spotlight-kicker">
                <FileSpreadsheet size={15} aria-hidden="true" /> Universal Bank Statement &amp;
                Spreadsheet Parser
              </div>
              <h3>Import PDF, CSV, and Excel Files with Zero Friction.</h3>
              <p>
                Never get locked into one bank or format. Drag and drop e-statements directly from
                BPI, BDO, MariBank, Chase, or Bank of America. Work with custom Excel workbooks
                (.xlsx, .xls) and CSVs with instant column mapping and smart duplicate detection.
              </p>
              <ul className="spotlight-benefits">
                <li>
                  <Check size={16} aria-hidden="true" /> <strong>Bank PDF e-statements:</strong>{" "}
                  Parse statement tables directly into transactions without copy-pasting.
                </li>
                <li>
                  <Check size={16} aria-hidden="true" /> <strong>Excel &amp; CSV workbooks:</strong>{" "}
                  Choose sheets, map columns, and preview every single row.
                </li>
                <li>
                  <Check size={16} aria-hidden="true" /> <strong>Smart deduplication:</strong> Never
                  double-count transactions across multiple monthly uploads.
                </li>
              </ul>
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
                    Instant column auto-mapping &middot; Centavo precision &middot; Duplicate filter
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
        )}

        {/* TAB 4: AI FINANCIAL ASSISTANT */}
        {activeSpotlightTab === "assistant" && (
          <div
            id="spotlight-panel-assistant"
            role="tabpanel"
            aria-labelledby="spotlight-tab-assistant"
            className="spotlight-grid"
          >
            <div className="spotlight-copy">
              <div className="spotlight-kicker">
                <Sparkles size={15} aria-hidden="true" /> Grounded Financial Intelligence
              </div>
              <h3>Ask your numbers, not a generic chatbot.</h3>
              <p>
                The Zoption AI Assistant provides conversational intelligence grounded strictly in
                your verified transactions and budgets. It answers complex multi-month queries with
                exact evidence and explanations, offering spoken replies without ever modifying your
                data.
              </p>
              <ul className="spotlight-benefits">
                <li>
                  <Check size={16} aria-hidden="true" /> <strong>Zero hallucination:</strong>{" "}
                  Calculations are computed mathematically from your ledger facts.
                </li>
                <li>
                  <Check size={16} aria-hidden="true" /> <strong>Strict read-only safety:</strong>{" "}
                  Operates strictly with your consent; cannot edit records.
                </li>
                <li>
                  <Check size={16} aria-hidden="true" /> <strong>Spoken voice replies:</strong>{" "}
                  Listen to spoken financial summaries with natural voice synthesis.
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
                  <ShieldCheck size={13} /> Read-Only &amp; Private
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
        )}
      </div>
    </section>
  );
}

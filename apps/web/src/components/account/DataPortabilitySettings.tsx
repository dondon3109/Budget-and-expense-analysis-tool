import { Download, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { useAuth } from "../../auth/AuthProvider";
import { downloadAccountArchive } from "../../lib/api";
import { userWorkspace } from "../../lib/workspace";

interface Feedback {
  error?: string;
  success?: string;
}

/** Downloads the full account archive as JSON. */
export function DataPortabilitySettings() {
  const { user } = useAuth();
  const [exportBusy, setExportBusy] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<Feedback>({});

  async function handleDownloadArchive() {
    if (!user || exportBusy) return;
    setExportBusy(true);
    setExportFeedback({});
    try {
      const workspace = userWorkspace(user);
      await downloadAccountArchive(workspace);
      setExportFeedback({ success: "Account archive downloaded successfully." });
    } catch (error) {
      setExportFeedback({
        error:
          error instanceof Error
            ? error.message
            : "The account archive could not be generated. Try again.",
      });
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <section
      id="data-portability"
      className="settings-section"
      aria-labelledby="data-portability-title"
    >
      <div className="settings-section-heading">
        <div>
          <h2 id="data-portability-title">Data portability & backup</h2>
          <p>
            Export a complete, structured JSON archive of all your accounts, transactions,
            categories, budgets, and subscriptions. Free, private, and always available.
          </p>
        </div>
      </div>
      <div className="settings-portability-content">
        <p>
          Your financial records belong strictly to you. Download a full archive at any time to keep
          an offline copy, verify records, or migrate to any spreadsheet without paywalls.
        </p>
        {exportFeedback.error && (
          <div className="form-error" role="alert">
            {exportFeedback.error}
          </div>
        )}
        {exportFeedback.success && (
          <div className="form-success" role="status">
            {exportFeedback.success}
          </div>
        )}
        <div className="settings-actions">
          <button
            type="button"
            className="button secondary compact"
            disabled={exportBusy}
            onClick={() => void handleDownloadArchive()}
          >
            {exportBusy ? (
              <>
                <LoaderCircle className="spin" size={15} aria-hidden="true" />
                Exporting archive…
              </>
            ) : (
              <>
                <Download size={15} aria-hidden="true" />
                Download full account archive (.json)
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}

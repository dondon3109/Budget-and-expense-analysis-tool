import type { WorkbookConversion } from "./workbookParser";

const WORKBOOK_TIMEOUT_MS = 15_000;

type WorkbookResult = string[] | WorkbookConversion;

type WorkbookResponse =
  { id: number; ok: true; result: WorkbookResult } | { id: number; ok: false; message: string };

interface PendingRequest {
  resolve(value: WorkbookResult): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

export class WorkbookImportClient {
  private readonly worker = new Worker(
    new URL("../workers/workbookImport.worker.ts", import.meta.url),
    {
      type: "module",
    },
  );
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private disposed = false;

  constructor() {
    this.worker.onmessage = (event: MessageEvent<WorkbookResponse>) => {
      const request = this.pending.get(event.data.id);
      if (!request) return;
      clearTimeout(request.timeout);
      this.pending.delete(event.data.id);
      if (event.data.ok) request.resolve(event.data.result);
      else request.reject(new Error(event.data.message));
    };
    this.worker.onerror = () => {
      this.disposed = true;
      this.worker.terminate();
      this.failAll(new Error("The spreadsheet reader could not load. Refresh and try again."));
    };
  }

  inspect(buffer: ArrayBuffer): Promise<string[]> {
    return this.request({ type: "inspect", buffer }, [buffer]) as Promise<string[]>;
  }

  convert(sheetName: string): Promise<WorkbookConversion> {
    return this.request({ type: "convert", sheetName }) as Promise<WorkbookConversion>;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.terminate();
    this.failAll(new Error("The workbook import was cancelled."));
  }

  private request(
    message: { type: "inspect"; buffer: ArrayBuffer } | { type: "convert"; sheetName: string },
    transfer: Transferable[] = [],
  ): Promise<WorkbookResult> {
    if (this.disposed) return Promise.reject(new Error("Choose the workbook again and retry."));
    const id = this.nextId;
    this.nextId += 1;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("This workbook took too long to read. Try exporting a smaller workbook."));
        this.dispose();
      }, WORKBOOK_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
      this.worker.postMessage({ id, ...message }, transfer);
    });
  }

  private failAll(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
  }
}

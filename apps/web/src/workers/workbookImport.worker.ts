import type { WorkbookConversion } from "../lib/workbookParser";

interface InspectRequest {
  id: number;
  type: "inspect";
  buffer: ArrayBuffer;
}

interface ConvertRequest {
  id: number;
  type: "convert";
  sheetName: string;
}

type WorkbookRequest = InspectRequest | ConvertRequest;

type WorkbookResponse =
  | { id: number; ok: true; result: string[] | WorkbookConversion }
  | { id: number; ok: false; message: string };

interface WorkbookWorkerScope {
  onmessage: ((event: MessageEvent<WorkbookRequest>) => void) | null;
  postMessage(message: WorkbookResponse): void;
}

const workerScope = self as unknown as WorkbookWorkerScope;
let workbookBuffer: ArrayBuffer | undefined;

workerScope.onmessage = (event) => {
  void handleRequest(event.data);
};

async function handleRequest(request: WorkbookRequest) {
  try {
    const parser = await import("../lib/workbookParser");
    if (request.type === "inspect") {
      workbookBuffer = request.buffer;
      workerScope.postMessage({
        id: request.id,
        ok: true,
        result: parser.inspectWorkbook(workbookBuffer),
      });
      return;
    }

    if (!workbookBuffer) throw new Error("Choose the workbook again and retry.");
    workerScope.postMessage({
      id: request.id,
      ok: true,
      result: parser.convertWorksheet(workbookBuffer, request.sheetName),
    });
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "The workbook could not be read. Choose another file and try again.",
    });
  }
}

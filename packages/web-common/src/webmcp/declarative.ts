export interface WebMcpFormOptions {
  name: string;
  description: string;
  autoSubmit?: boolean;
}

export interface WebMcpFormAttributes {
  toolname: string;
  tooldescription: string;
  toolautosubmit?: "";
}

export interface WebMcpParamAttributes {
  toolparamdescription: string;
}

export interface WebMcpSubmitEvent extends SubmitEvent {
  readonly agentInvoked?: boolean;
  respondWith?: (result: Promise<unknown>) => void;
}

type SubmitEventLike = Event | { nativeEvent: Event };

function unwrapSubmitEvent(event: SubmitEventLike): WebMcpSubmitEvent {
  if ("nativeEvent" in event) {
    return event.nativeEvent as WebMcpSubmitEvent;
  }
  return event as WebMcpSubmitEvent;
}

/** Returns declarative WebMCP attributes for an HTML `<form>`. */
export function webMcpFormProps({
  name,
  description,
  autoSubmit = false,
}: WebMcpFormOptions): WebMcpFormAttributes {
  return {
    toolname: name,
    tooldescription: description,
    ...(autoSubmit ? { toolautosubmit: "" as const } : {}),
  };
}

/** Returns the WebMCP `toolparamdescription` attribute for a form control or `<fieldset>`. */
export function webMcpParamProps(description: string): WebMcpParamAttributes {
  return { toolparamdescription: description };
}

/** Reads a text field from FormData, returning `fallback` when missing or a File. */
export function readFormText(formData: FormData, key: string, fallback = ""): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : fallback;
}

/** True when a browser AI agent triggered this form submission via WebMCP. */
export function isAgentSubmit(event: SubmitEventLike): boolean {
  return Boolean(unwrapSubmitEvent(event).agentInvoked);
}

/**
 * Synchronously passes a result or promise back to the invoking WebMCP agent.
 * Call during the `submit` handler before any `await` so the browser receives the promise in time.
 */
export function respondToAgent(event: SubmitEventLike, result: unknown): void {
  const native = unwrapSubmitEvent(event);
  if (typeof native.respondWith === "function") {
    native.respondWith(Promise.resolve(result));
  }
}

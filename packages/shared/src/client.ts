import type {
  InferenceServerStatus,
  WingmanContext,
  WritebackPayload,
} from "./types";

function buildUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Wingman request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

export async function postContext(
  baseUrl: string,
  context: WingmanContext,
): Promise<{ ok: true }> {
  const response = await fetch(buildUrl(baseUrl, "context"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(context),
  });

  return parseJson<{ ok: true }>(response);
}

export async function getInline(baseUrl: string): Promise<Response> {
  const response = await fetch(buildUrl(baseUrl, "inline"), {
    method: "GET",
    headers: { accept: "text/event-stream" },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Wingman inline request failed (${response.status}): ${body}`);
  }

  return response;
}

export async function getWriteback(
  baseUrl: string,
  file: string,
): Promise<WritebackPayload> {
  const url = new URL(buildUrl(baseUrl, "writeback"));
  url.searchParams.set("file", file);
  const response = await fetch(url, { method: "GET" });
  return parseJson<WritebackPayload>(response);
}

export async function getHealth(
  baseUrl: string,
): Promise<InferenceServerStatus> {
  const response = await fetch(buildUrl(baseUrl, "health"), { method: "GET" });
  return parseJson<InferenceServerStatus>(response);
}

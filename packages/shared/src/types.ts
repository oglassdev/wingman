export interface WingmanContext {
  file: string | null;
  line: number | null;
  selection: string | null;
  surroundingCode: string | null;
}

export interface WritebackPayload {
  file: string | null;
  line: number | null;
  code: string | null;
}

export interface WingmanSettings {
  provider: string;
  backendUrl: string;
  apiKey: string;
  modelId: string;
  temperature: number;
}

export interface InferenceServerStatus {
  ok: true;
  port: number;
  model: string | null;
}

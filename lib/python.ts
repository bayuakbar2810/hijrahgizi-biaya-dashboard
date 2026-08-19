import type { PrdRow, ProductMaster } from "./types";

const PY_URL = process.env.PY_SERVICE_URL ?? "http://127.0.0.1:8000";

export type ParseResult = {
  rows: PrdRow[];
  summary: {
    filename: string;
    sheet: string;
    row_count: number;
    batch_count: number;
    kode_count: number;
    date_min: string;
    date_max: string;
    total_biaya: number;
  };
  missing_columns: string[];
  invalid_rows: number;
};

async function jsonOrThrow(res: Response): Promise<unknown> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function pythonHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${PY_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pythonParse(buffer: Buffer, filename: string): Promise<ParseResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), filename);
  const res = await fetch(`${PY_URL}/parse-excel`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  return jsonOrThrow(res) as Promise<ParseResult>;
}

export type AnalyzeRequest = {
  rows: PrdRow[];
  params?: Record<string, string | undefined>;
  settings?: Record<string, number | string>;
  products?: ProductMaster[];
};

export async function pythonAnalyze(req: AnalyzeRequest) {
  const res = await fetch(`${PY_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(120_000),
  });
  return jsonOrThrow(res);
}

export async function pythonBatchDetail(
  rows: PrdRow[],
  batchNo: string,
  settings?: Record<string, number | string>,
) {
  const res = await fetch(`${PY_URL}/batch-detail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows, batch_no: batchNo, settings }),
    signal: AbortSignal.timeout(60_000),
  });
  return jsonOrThrow(res);
}
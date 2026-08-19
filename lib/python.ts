import type { PrdRow, ProductMaster } from "./types";
import { analyze, detailBatch } from "./analysis";
import { parseExcel } from "./parser";

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

export async function pythonHealth(): Promise<boolean> {
  return true;
}

export async function pythonParse(buffer: Buffer, filename: string): Promise<ParseResult> {
  const arr = new Uint8Array(buffer).buffer;
  return parseExcel(arr, filename) as unknown as ParseResult;
}

export type AnalyzeRequest = {
  rows: PrdRow[];
  params?: Record<string, string | undefined>;
  settings?: Record<string, number | string>;
  products?: ProductMaster[];
};

export async function pythonAnalyze(req: AnalyzeRequest) {
  return analyze(req.rows ?? [], req.params ?? {}, req.settings ?? {}, req.products ?? null);
}

export async function pythonBatchDetail(
  rows: PrdRow[],
  batchNo: string,
  settings?: Record<string, number | string>,
) {
  return detailBatch(rows, batchNo, settings ?? null);
}
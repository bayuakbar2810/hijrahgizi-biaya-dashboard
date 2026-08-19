import { analyze, detailBatch } from "./analysis";
import { parseExcel } from "./parser";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function err(message: string, status = 500): Response {
  return json({ detail: message }, status);
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS });
      }

      if (path === "/health" && request.method === "GET") {
        return json({ status: "ok", service: "py-service" });
      }

      if (path === "/parse-excel" && request.method === "POST") {
        const form = await request.formData();
        const file = form.get("file") as File | null;
        if (!file) {
          return err("File Excel wajib diunggah", 400);
        }
        const buf = await file.arrayBuffer();
        const result = parseExcel(buf, file.name);
        return json(result);
      }

      if (path === "/analyze" && request.method === "POST") {
        const body = (await request.json()) as Record<string, any>;
        const result = analyze(body.rows ?? [], body.params ?? {}, body.settings ?? {});
        return json(result);
      }

      if (path === "/batch-detail" && request.method === "POST") {
        const body = (await request.json()) as Record<string, any>;
        const result = detailBatch(body.rows ?? [], String(body.batch_no ?? ""), body.settings ?? {});
        return json(result);
      }

      return err("Not found", 404);
    } catch (e) {
      return err(e instanceof Error ? e.message : "Terjadi kesalahan", 500);
    }
  },
};
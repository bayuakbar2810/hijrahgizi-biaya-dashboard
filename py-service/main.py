"""FastAPI service — parse Excel & analisis biaya/yield untuk dashboard (PRD Hijrahfood)."""

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from analysis import analyze, detail_batch
from parser import parse_excel

app = FastAPI(title="Hijrah Gizihew Biaya Analysis", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    rows: list
    params: dict = {}
    settings: dict = {}


class BatchDetailRequest(BaseModel):
    rows: list
    batch_no: str
    settings: dict = {}


@app.get("/health")
def health():
    return {"status": "ok", "service": "py-service"}


@app.post("/parse-excel")
async def parse(file: UploadFile = File(...)):
    content = await file.read()
    return parse_excel(content, file.filename or "upload.xlsx")


@app.post("/analyze")
def run_analyze(req: AnalyzeRequest):
    return analyze(req.rows, req.params, req.settings)


@app.post("/batch-detail")
def run_batch_detail(req: BatchDetailRequest):
    return detail_batch(req.rows, req.batch_no, req.settings)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
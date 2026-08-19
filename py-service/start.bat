@echo off
REM Install dependencies (pertama kali saja)
pip install -r requirements.txt
REM Jalankan service analisis Python
python -m uvicorn main:app --host 127.0.0.1 --port 8000
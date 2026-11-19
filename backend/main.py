# ============================================================
# main.py — FastAPI + WebSocket + MUX 2:1 em Python
# ============================================================

import asyncio
import json
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

# --- CORREÇÃO PARA O RENDER ---
# Garante que o Python encontre o serial_reader na mesma pasta,
# independente de onde o comando uvicorn for executado.
BASE_DIR = Path(__file__).resolve().parent
sys.path.append(str(BASE_DIR))

from serial_reader import SerialReader

FRONTEND_DIR = BASE_DIR.parent / "frontend"
SERIAL_PORT = os.getenv("SERIAL_PORT", "/dev/ttyUSB0")

reader = SerialReader(SERIAL_PORT)


@asynccontextmanager
async def lifespan(app):
    # Tenta iniciar a leitura da serial, mas não impede o servidor de subir
    try:
        reader.start()
    except Exception as e:
        print(f"Aviso: Não foi possível iniciar a serial: {e}")
    try:
        yield
    finally:
        try:
            reader.stop()
        except Exception:
            pass


state = {"S": 0}


def mux2_1(S: int, botao: int, adc: int) -> dict:
    if S == 0:
        return {"channel": "botao", "value": botao}
    else:
        return {"channel": "pot", "value": adc}


def build_packet() -> dict:
    """Monta o pacote completo enviado ao frontend (HTTP e WS)."""
    raw = dict(reader.latest)
    mux = mux2_1(state["S"], raw["botao"], raw["adc"])
    raw.update(mux)
    raw["S"] = state["S"]
    raw["connected"] = reader.connected
    raw["last_error"] = reader.last_error
    raw["raw_line"] = reader.last_raw_line
    raw["rx_count"] = reader.rx_count
    raw["lost_count"] = reader.lost_count
    raw["rate_hz"] = getattr(reader, "rate_hz", 0.0) 
    raw["port"] = SERIAL_PORT
    return raw


app = FastAPI(title="Experimento 6 — MUX 2:1 + ADC", lifespan=lifespan)


@app.get("/api/config")
def get_config():
    return {
        "S": state["S"],
        "connected": reader.connected,
        "port": SERIAL_PORT,
        "last_error": reader.last_error,
    }


@app.post("/api/config")
def set_config(cfg: dict):
    if "S" in cfg and cfg["S"] in (0, 1):
        state["S"] = int(cfg["S"])
    return {"S": state["S"]}


@app.get("/api/sample")
def get_sample():
    return build_packet()


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            await ws.send_text(json.dumps(build_packet()))
            await asyncio.sleep(0.05)   # ~20 Hz
    except WebSocketDisconnect:
        return
    except Exception:
        import traceback
        traceback.print_exc()
        return


# IMPORTANTE: precisa ser a última linha
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
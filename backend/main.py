# ============================================================
# main.py — FastAPI + WebSocket + MUX 2:1 (Local e Render)
# ============================================================

import asyncio
import json
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
sys.path.append(str(BASE_DIR))

from serial_reader import SerialReader

FRONTEND_DIR = BASE_DIR.parent / "frontend"
SERIAL_PORT = os.getenv("SERIAL_PORT", "/dev/ttyUSB0")
IS_RENDER = os.getenv("RENDER", "") != ""

reader = SerialReader(SERIAL_PORT)

# Estado compartilhado (recebe dados da serial local OU da ponte remota)
state = {"S": 0}
remote_data = {
    "botao": 0,
    "adc": 0,
    "connected": False,
    "last_error": "Aguardando ponte local...",
    "raw_line": "",
    "rx_count": 0,
    "lost_count": 0,
    "rate_hz": 0.0,
    "port": "Ponte Remota (PC -> Render)",
    "updated_at": 0.0,
}


@asynccontextmanager
async def lifespan(app):
    if not IS_RENDER:
        try:
            reader.start()
        except Exception as e:
            print(f"Aviso: Não foi possível iniciar a serial local: {e}")
    try:
        yield
    finally:
        if not IS_RENDER:
            try:
                reader.stop()
            except Exception:
                pass


def mux2_1(S: int, botao: int, adc: int) -> dict:
    if S == 0:
        return {"channel": "botao", "value": botao}
    else:
        return {"channel": "pot", "value": adc}


def build_packet() -> dict:
    """Monta o pacote completo enviado ao frontend (HTTP e WS)."""
    # Se recebeu dado da ponte remota nos últimos 3 segundos, usa os dados remotos
    usando_remoto = (time.time() - remote_data["updated_at"]) < 3.0

    if usando_remoto:
        raw = {
            "botao": remote_data["botao"],
            "adc": remote_data["adc"],
        }
        mux = mux2_1(state["S"], raw["botao"], raw["adc"])
        raw.update(mux)
        raw["S"] = state["S"]
        raw["connected"] = remote_data["connected"]
        raw["last_error"] = remote_data["last_error"]
        raw["raw_line"] = remote_data["raw_line"]
        raw["rx_count"] = remote_data["rx_count"]
        raw["lost_count"] = remote_data["lost_count"]
        raw["rate_hz"] = remote_data["rate_hz"]
        raw["port"] = remote_data["port"]
        return raw

    # Caso contrário, usa a leitura serial local (ou status desconectado no Render)
    raw = dict(reader.latest)
    mux = mux2_1(state["S"], raw.get("botao", 0), raw.get("adc", 0))
    raw.update(mux)
    raw["S"] = state["S"]
    raw["connected"] = reader.connected
    raw["last_error"] = (
        "Aguardando script ponte_local.py no PC"
        if IS_RENDER
        else reader.last_error
    )
    raw["raw_line"] = reader.last_raw_line
    raw["rx_count"] = reader.rx_count
    raw["lost_count"] = reader.lost_count
    raw["rate_hz"] = getattr(reader, "rate_hz", 0.0)
    raw["port"] = "Nuvem (Render)" if IS_RENDER else SERIAL_PORT
    return raw


app = FastAPI(title="Experimento 6 — MUX 2:1 + ADC", lifespan=lifespan)


@app.get("/api/config")
def get_config():
    pkt = build_packet()
    return {
        "S": state["S"],
        "connected": pkt["connected"],
        "port": pkt["port"],
        "last_error": pkt["last_error"],
    }


@app.post("/api/config")
def set_config(cfg: dict):
    if "S" in cfg and cfg["S"] in (0, 1):
        state["S"] = int(cfg["S"])
    return {"S": state["S"]}


@app.post("/api/push")
def push_from_local_pc(payload: dict):
    """Recebe os dados do Arduino lidos pelo seu PC e devolve o S atual escolhido no site."""
    remote_data["botao"] = int(payload.get("botao", 0))
    remote_data["adc"] = int(payload.get("adc", 0))
    remote_data["connected"] = bool(payload.get("connected", True))
    remote_data["last_error"] = payload.get("last_error", "")
    remote_data["raw_line"] = payload.get("raw_line", "")
    remote_data["rx_count"] = int(payload.get("rx_count", 0))
    remote_data["lost_count"] = int(payload.get("lost_count", 0))
    remote_data["rate_hz"] = float(payload.get("rate_hz", 0.0))
    remote_data["port"] = payload.get("port", "USB Local (via Ponte)")
    remote_data["updated_at"] = time.time()
    return {"ok": True, "S": state["S"]}


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
# ============================================================
# ponte_local.py — Ponte USB (Arduino) <-> Nuvem (Render)
# ============================================================
# Envia as leituras do Arduino local para o servidor no Render
# e recebe de volta o canal S escolhido pelo visitante/professor.
# ============================================================

import os
import sys
import time
import urllib.request
import urllib.error
import json
from pathlib import Path

# Garante que o Python encontre o serial_reader na mesma pasta
BASE_DIR = Path(__file__).resolve().parent
sys.path.append(str(BASE_DIR))

from serial_reader import SerialReader

# ------------------------------------------------------------
# CONFIGURAÇÕES (edite aqui antes de rodar)
# ------------------------------------------------------------
RENDER_URL = os.getenv("RENDER_URL", "https://SEU-PROJETO.onrender.com").rstrip("/")
SERIAL_PORT = os.getenv("SERIAL_PORT", "COM3")   # No Windows: "COM3", "COM4"... | No Linux: "/dev/ttyUSB0"
TAXA_ENVIO_HZ = 20                               # Frequência de envio para o Render
# ------------------------------------------------------------


def enviar_para_render(url_push: str, payload: dict) -> dict | None:
    dados = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url_push,
        data=dados,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"[HTTP {e.code}] Erro ao enviar para o Render: {e.reason}")
    except Exception as e:
        print(f"[Rede] Falha de conexão com o Render ({e})")
    return None


def main():
    if "SEU-PROJETO" in RENDER_URL:
        print("ATENÇÃO: Edite a variável RENDER_URL no início do ponte_local.py com o link real do seu site no Render!")
        return

    url_push = f"{RENDER_URL}/api/push"
    intervalo = 1.0 / TAXA_ENVIO_HZ

    print(f"Iniciando leitura serial na porta {SERIAL_PORT}...")
    reader = SerialReader(SERIAL_PORT)
    reader.start()

    print(f"Conectando à ponte no Render: {url_push}")
    print("Pressione Ctrl+C para encerrar.\n")

    s_atual_site = None
    ultimo_log = 0.0

    try:
        while True:
            inicio = time.time()

            raw = dict(reader.latest)
            payload = {
                "botao": int(raw.get("botao", 0)),
                "adc": int(raw.get("adc", 0)),
                "connected": bool(reader.connected),
                "last_error": reader.last_error or "",
                "raw_line": reader.last_raw_line or "",
                "rx_count": int(reader.rx_count),
                "lost_count": int(reader.lost_count),
                "rate_hz": float(getattr(reader, "rate_hz", 0.0)),
                "port": f"{SERIAL_PORT} (via PC)",
            }

            resposta = enviar_para_render(url_push, payload)

            if resposta and "S" in resposta:
                novo_s = int(resposta["S"])
                if novo_s != s_atual_site:
                    s_atual_site = novo_s
                    canal_nome = "POTENCIÔMETRO (S=1)" if novo_s == 1 else "BOTÃO (S=0)"
                    print(f">>> Canal alterado pelo site para: {canal_nome}")

            # Mostra status no terminal a cada 2 segundos
            agora = time.time()
            if agora - ultimo_log >= 2.0:
                ultimo_log = agora
                status_usb = "OK" if reader.connected else f"ERRO ({reader.last_error})"
                status_nuvem = "ONLINE" if resposta else "SEM RESPOSTA"
                print(
                    f"[USB: {status_usb}] botao={payload['botao']} adc={payload['adc']} | "
                    f"[Render: {status_nuvem}] S={s_atual_site}"
                )

            gasto = time.time() - inicio
            if gasto < intervalo:
                time.sleep(intervalo - gasto)

    except KeyboardInterrupt:
        print("\nEncerrando ponte local...")
    finally:
        reader.stop()


if __name__ == "__main__":
    main()
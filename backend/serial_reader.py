# ============================================================
# serial_reader.py — v2 (resiliente)
# Lê a serial do Arduino em background e guarda o último valor.
# Formato esperado: "adc,botao,ms"
#   adc   : 0..1023
#   botao : 0 ou 1
#   ms    : millis() do Arduino
# ============================================================

import re
import threading
import time
from collections import deque

import serial  # pyserial


EMPTY_TIMEOUTS_TO_RESET = 3   # 3 timeouts seguidos (~3s) => reabre a porta


class SerialReader:
    def __init__(self, port: str, baud: int = 115200):
        self.port = port
        self.baud = baud

        # último valor válido
        self.latest = {
            "adc": 0,
            "botao": 0,
            "t_ms": 0,
            "t_host": 0.0,
        }

        self.connected = False
        self.last_error = ""

        # telemetria para o painel
        self.last_raw_line = ""
        self.rx_count = 0
        self.lost_count = 0
        self.rate_hz = 0.0          # ATRIBUTO (não método)
        self._last_t_ms = None
        self._rx_times = deque(maxlen=200)

        self._stop = False
        self._ser = None
        self._thread = None         # criado em start()

    # ---------- API pública ----------
    def start(self):
        """Inicia a thread de leitura (idempotente)."""
        if self._thread and self._thread.is_alive():
            return
        self._stop = False
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self):
        """Pede para a thread parar e fecha a serial."""
        self._stop = True
        try:
            if self._ser and self._ser.is_open:
                self._ser.close()
        except Exception:
            pass

    # ---------- loop ----------
    def _loop(self):
        pattern = re.compile(r"^\s*(\d+),(\d+),(\d+)\s*$")
        empty_count = 0

        while not self._stop:
            # 1) garante porta aberta
            if self._ser is None or not self._ser.is_open:
                try:
                    self._ser = serial.Serial(self.port, self.baud, timeout=1)
                    self.connected = True
                    self.last_error = ""
                    empty_count = 0
                except Exception as e:
                    self.connected = False
                    self.last_error = str(e)
                    time.sleep(1.5)
                    continue

            # 2) lê uma linha
            try:
                raw_bytes = self._ser.readline()
            except Exception as e:
                self._reset_port(e)
                continue

            # readline vazio = timeout — se persistir, reabre
            if not raw_bytes:
                empty_count += 1
                if empty_count >= EMPTY_TIMEOUTS_TO_RESET:
                    self._reset_port("readline timeout (porta muda?)")
                continue

            empty_count = 0
            text = raw_bytes.decode(errors="ignore")
            self.last_raw_line = text.rstrip("\r\n")

            m = pattern.match(text)
            if not m:
                continue

            adc = int(m.group(1))
            botao = int(m.group(2))
            t_ms = int(m.group(3))

            # perdas por salto em t_ms
            if self._last_t_ms is not None:
                dt = t_ms - self._last_t_ms
                if 0 < dt < 5000:
                    esperado = max(1, round(dt / 25))
                    if esperado > 1:
                        self.lost_count += esperado - 1
            self._last_t_ms = t_ms

            now = time.time()
            self.latest = {
                "adc": adc,
                "botao": botao,
                "t_ms": t_ms,
                "t_host": now,
            }
            self.rx_count += 1
            self.connected = True

            # taxa: 1x por amostra
            self._rx_times.append(now)
            if len(self._rx_times) >= 2:
                span = self._rx_times[-1] - self._rx_times[0]
                if span > 0:
                    self.rate_hz = round((len(self._rx_times) - 1) / span, 1)

    def _reset_port(self, reason):
        self.last_error = str(reason)
        try:
            if self._ser and self._ser.is_open:
                self._ser.close()
        except Exception:
            pass
        self._ser = None
        self.connected = False
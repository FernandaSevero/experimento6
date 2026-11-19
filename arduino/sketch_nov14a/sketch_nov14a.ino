// ============================================================
// Experimento 6 — Firmware Arduino Uno
// Envia "adc,botao,ms" a ~40 Hz pela serial (115200 baud)
//   adc   : 0..1023  (leitura de A0, 10 bits)
//   botao : 1 = pressionado, 0 = solto  (normalizado)
//   ms    : millis() no instante da leitura
// O firmware NÃO faz o MUX — quem seleciona é o Python.
// ============================================================

const uint8_t PIN_POT = A0;   // cursor do potenciômetro
const uint8_t PIN_BTN = 2;    // botão para GND (INPUT_PULLUP)

// ---- debounce ----
const unsigned long DEBOUNCE_MS = 25;
int lastRaw      = HIGH;      // última leitura crua
int stableState  = HIGH;      // estado estável (HIGH = solto)
unsigned long lastChange = 0; // instante da última mudança crua

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BTN, INPUT_PULLUP);
}

void loop() {
  // ---------- 1) debounce do botão ----------
  int raw = digitalRead(PIN_BTN);

  if (raw != lastRaw) {          // mudou de nível
    lastChange = millis();       // reinicia o cronômetro
    lastRaw = raw;
  }

  if ((millis() - lastChange) > DEBOUNCE_MS && raw != stableState) {
    stableState = raw;           // só aceita se ficou estável
  }

  // INPUT_PULLUP: LOW = pressionado. Normalizamos para 1 = pressionado.
  int botao = (stableState == LOW) ? 1 : 0;

  // ---------- 2) leitura do ADC ----------
  int adc = analogRead(PIN_POT); // 0..1023 (10 bits)

  // ---------- 3) transmissão ----------
  Serial.print(adc);
  Serial.print(',');
  Serial.print(botao);
  Serial.print(',');
  Serial.println(millis());

  // ---------- 4) cadência (~40 Hz) ----------
  delay(25);
}

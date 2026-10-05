/**
 * ENCARGOS ONLINE — Forno Bomba
 * -------------------------------------
 * "Servidor" compartido para la web de encargos y el panel del obrador:
 * - Guarda cada encargo en la hoja "Encargos" con su día y tramo de recogida.
 * - Controla el aforo: como máximo N encargos por tramo (N se cambia desde el panel).
 *   La comprobación se hace aquí, con bloqueo, para que dos clientes a la vez
 *   no puedan pasarse del límite.
 * - Guarda la configuración (horario de recogida, antelación, días cerrados,
 *   pausa, catálogo...) en la hoja "Configuracion", igual para todos los dispositivos.
 * - Reparte el número de encargo de forma centralizada.
 * - Protege los datos de clientes con una clave (la del panel).
 *
 * CÓMO INSTALARLO (una sola vez):
 * 1. Crea una Google Sheet nueva (sheets.new) con la cuenta del forno.
 * 2. Extensiones > Apps Script. Borra el contenido de "Código.gs" y pega este archivo.
 * 3. Guarda. Implementar > Nueva implementación > Tipo: Aplicación web.
 *      - Ejecutar como: Yo
 *      - Quién tiene acceso: Cualquier usuario
 * 4. Implementar, autoriza los permisos y copia la "URL de la aplicación web".
 * 5. Pega esa URL en SHEET_SCRIPT_URL de fornobomba/index.html y en
 *    fornobomba/panel.html (o en la pantalla de acceso del panel).
 *
 * Cada vez que cambies este código: Implementar > Gestionar implementaciones >
 * lápiz > Versión: Nueva versión > Implementar (así la URL no cambia).
 */

const ORDERS_SHEET = "Encargos";
const ORDER_HEADERS = [
  "Creado", "Nº", "Día recogida", "Tramo", "Nombre", "Teléfono", "Email",
  "Encargo", "Total", "Notas", "Estado", "Productos (JSON)", "Hora preparado", "Hora recogido"
];
const COL = { created: 1, number: 2, date: 3, slot: 4, name: 5, phone: 6, email: 7, items: 8, total: 9, notes: 10, status: 11, json: 12, readyAt: 13, pickedAt: 14 };

const CONFIG_SHEET = "Configuracion";
const COUNTER_KEY = "nextOrderNumber";
const FIRST_ORDER_NUMBER = 101;
// Clave del panel mientras no se guarde otra desde Configuración. Cámbiala nada más instalar.
const DEFAULT_PANEL_PASSWORD = "forno2026";
const DEFAULT_SLOT_CAPACITY = 6;

// Claves de configuración que se guardan como JSON en la hoja.
const JSON_KEYS = ["schedule", "closedDates", "catalog", "pause"];
// Claves de configuración simples (texto / número / booleano).
const PLAIN_KEYS = ["phone", "whatsappEnabled", "slotCapacity", "slotMinutes", "maxDaysAhead"];

function sheetByName(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function ordersSheet() { return sheetByName(ORDERS_SHEET, ORDER_HEADERS); }
function configSheet() { return sheetByName(CONFIG_SHEET, ["Clave", "Valor"]); }

function readConfigMap() {
  const rows = configSheet().getDataRange().getValues();
  const map = {};
  for (let i = 1; i < rows.length; i++) map[rows[i][0]] = rows[i][1];
  return map;
}

function upsertConfigRow(key, value) {
  const sheet = configSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === key) { sheet.getRange(i + 1, 2).setValue(value); return; }
  }
  sheet.appendRow([key, value]);
}

function panelPassword() {
  const map = readConfigMap();
  return map.panelPassword !== undefined ? String(map.panelPassword) : DEFAULT_PANEL_PASSWORD;
}
function isAuthorized(key) {
  const pw = panelPassword();
  return pw === "" || String(key || "") === pw;
}

// La web pública nunca recibe la clave del panel.
function loadConfig(includeSecrets) {
  const map = readConfigMap();
  const cfg = {};
  PLAIN_KEYS.forEach(k => {
    if (map[k] === undefined || map[k] === "") return;
    const v = map[k];
    if (k === "whatsappEnabled") cfg[k] = String(v) === "true";
    else if (k === "phone") cfg[k] = String(v);
    else cfg[k] = Number(v);
  });
  JSON_KEYS.forEach(k => {
    if (map[k] === undefined || map[k] === "") return;
    try { cfg[k] = JSON.parse(map[k]); } catch (e) { /* ignorar si está corrupto */ }
  });
  if (includeSecrets) cfg.panelPassword = panelPassword();
  return cfg;
}

function saveConfig(cfg) {
  PLAIN_KEYS.forEach(k => { if (cfg[k] !== undefined) upsertConfigRow(k, String(cfg[k])); });
  JSON_KEYS.forEach(k => { if (cfg[k] !== undefined) upsertConfigRow(k, JSON.stringify(cfg[k])); });
  if (cfg.panelPassword !== undefined) upsertConfigRow("panelPassword", String(cfg.panelPassword));
}

function slotCapacity() {
  const v = Number(readConfigMap().slotCapacity);
  return v > 0 ? v : DEFAULT_SLOT_CAPACITY;
}

function nextOrderNumber() {
  const sheet = configSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === COUNTER_KEY) {
      const current = parseInt(rows[i][1], 10) || FIRST_ORDER_NUMBER;
      sheet.getRange(i + 1, 2).setValue(current + 1);
      return current;
    }
  }
  sheet.appendRow([COUNTER_KEY, FIRST_ORDER_NUMBER + 1]);
  return FIRST_ORDER_NUMBER;
}

// La hoja convierte "2026-10-07" en fecha; lo devolvemos siempre como texto YYYY-MM-DD.
function dateKey(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return String(v || "");
}

// Encargos activos (no cancelados) por tramo para un día: { "10:00": 3, ... }
function slotCounts(date) {
  const rows = ordersSheet().getDataRange().getValues();
  const counts = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[COL.number - 1]) continue;
    if (dateKey(r[COL.date - 1]) !== date) continue;
    if (String(r[COL.status - 1]) === "Cancelado") continue;
    const slot = String(r[COL.slot - 1]);
    counts[slot] = (counts[slot] || 0) + 1;
  }
  return counts;
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === "config") return json(loadConfig(false));
  if (p.action === "slots") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || "")) return json({ success: false, error: "fecha" });
    return json({ success: true, date: p.date, capacity: slotCapacity(), counts: slotCounts(p.date) });
  }
  return json({ success: false, error: "auth" });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === "newOrder") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date || "") || !/^\d{2}:\d{2}$/.test(data.slot || "")) {
        return json({ success: false, error: "Falta el día o el tramo de recogida." });
      }
      const pause = loadConfig(false).pause;
      if (pause && pause.active) {
        return json({ success: false, error: "pause", message: pause.message || "" });
      }
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const used = slotCounts(data.date)[data.slot] || 0;
        if (used >= slotCapacity()) return json({ success: false, error: "full" });
        const number = nextOrderNumber();
        ordersSheet().appendRow([
          new Date(), number, "'" + data.date, "'" + data.slot,
          data.name || "", "'" + (data.phone || ""), data.email || "",
          data.items || "", data.total || "", data.notes || "", "Pendiente",
          JSON.stringify(data.lines || [])
        ]);
        return json({ success: true, orderNumber: number });
      } finally {
        lock.releaseLock();
      }
    }

    // ----- A partir de aquí, todo necesita la clave del panel -----
    if (!isAuthorized(data.key)) return json({ success: false, error: "auth" });

    if (data.action === "login") return json({ success: true });
    if (data.action === "listOrders") return json({ success: true, orders: listOrders(data.from, data.to) });
    if (data.action === "adminConfig") return json({ success: true, config: loadConfig(true) });
    if (data.action === "saveConfig") { saveConfig(data.config || {}); return json({ success: true }); }

    if (data.action === "updateStatus") {
      const sheet = ordersSheet();
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][COL.number - 1]) !== String(data.orderNumber)) continue;
        sheet.getRange(i + 1, COL.status).setValue(data.status);
        if (data.status === "Preparado" && !rows[i][COL.readyAt - 1]) sheet.getRange(i + 1, COL.readyAt).setValue(new Date());
        if (data.status === "Recogido" && !rows[i][COL.pickedAt - 1]) sheet.getRange(i + 1, COL.pickedAt).setValue(new Date());
        break;
      }
      return json({ success: true });
    }

    return json({ success: false, error: "Acción no reconocida" });
  } catch (err) {
    return json({ success: false, error: err.toString() });
  }
}

// from / to: "YYYY-MM-DD" (incluidos). Sin ellos, devuelve todos.
function listOrders(from, to) {
  const rows = ordersSheet().getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[COL.number - 1]) continue;
    const date = dateKey(r[COL.date - 1]);
    if (from && date < from) continue;
    if (to && date > to) continue;
    let lines = [];
    try { lines = JSON.parse(r[COL.json - 1] || "[]"); } catch (e) { /* encargo antiguo sin JSON */ }
    out.push({
      created: r[COL.created - 1],
      orderNumber: r[COL.number - 1],
      date: date,
      slot: String(r[COL.slot - 1]),
      name: r[COL.name - 1],
      phone: String(r[COL.phone - 1]),
      email: r[COL.email - 1],
      items: r[COL.items - 1],
      total: r[COL.total - 1],
      notes: r[COL.notes - 1],
      status: r[COL.status - 1],
      lines: lines
    });
  }
  return out;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

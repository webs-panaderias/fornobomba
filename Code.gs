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
 * - Avisa por email al forno de cada encargo nuevo (si hay un email en Configuración).
 * - Guarda las fotos de productos que se suben desde el panel en una carpeta de
 *   Google Drive y las comparte en modo "cualquiera con el enlace puede ver".
 *
 * CÓMO INSTALARLO (una sola vez):
 * 1. Crea una Google Sheet nueva (sheets.new) con la cuenta del forno.
 * 2. Extensiones > Apps Script. Borra el contenido de "Código.gs" y pega este archivo.
 * 3. Guarda. Implementar > Nueva implementación > Tipo: Aplicación web.
 *      - Ejecutar como: Yo
 *      - Quién tiene acceso: Cualquier usuario
 * 4. Implementar, autoriza los permisos y copia la "URL de la aplicación web".
 * 5. Pega esa URL en SHEET_SCRIPT_URL, en datos.js (la usan index.html y panel.html).
 *
 * Cada vez que cambies este código: Implementar > Gestionar implementaciones >
 * lápiz > Versión: Nueva versión > Implementar (así la URL no cambia).
 * Si Google pide permisos nuevos (enviar email, Google Drive), acéptalos:
 * son los del aviso de encargos y las fotos de productos.
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
// Carpeta de Google Drive donde se guardan las fotos de productos.
const PHOTOS_FOLDER = "Forno Bomba - fotos de productos";
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

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
  if (includeSecrets) {
    cfg.panelPassword = panelPassword();
    cfg.notifyEmail = String(map.notifyEmail || "");
  }
  return cfg;
}

function saveConfig(cfg) {
  PLAIN_KEYS.forEach(k => { if (cfg[k] !== undefined) upsertConfigRow(k, String(cfg[k])); });
  JSON_KEYS.forEach(k => { if (cfg[k] !== undefined) upsertConfigRow(k, JSON.stringify(cfg[k])); });
  if (cfg.panelPassword !== undefined) upsertConfigRow("panelPassword", String(cfg.panelPassword));
  // El email de avisos no se publica en la web: solo lo ve el panel.
  if (cfg.notifyEmail !== undefined) upsertConfigRow("notifyEmail", String(cfg.notifyEmail).trim());
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
        lock.releaseLock();
        notifyNewOrder(number, data);
        return json({ success: true, orderNumber: number });
      } finally {
        try { lock.releaseLock(); } catch (e) { /* ya liberado */ }
      }
    }

    // ----- A partir de aquí, todo necesita la clave del panel -----
    if (!isAuthorized(data.key)) return json({ success: false, error: "auth" });

    if (data.action === "login") return json({ success: true });
    if (data.action === "listOrders") return json({ success: true, orders: listOrders(data.from, data.to) });
    if (data.action === "adminConfig") return json({ success: true, config: loadConfig(true) });
    if (data.action === "saveConfig") { saveConfig(data.config || {}); return json({ success: true }); }
    if (data.action === "lastOrder") return json({ success: true, last: lastOrder() });
    if (data.action === "uploadPhoto") return json(uploadPhoto(data));

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

// Email al forno con el encargo. Si falla (sin email, cuota de Google agotada),
// el encargo se guarda igual: el aviso nunca bloquea un encargo.
function notifyNewOrder(number, data) {
  const to = String(readConfigMap().notifyEmail || "").trim();
  if (!to) return;
  try {
    const [y, mo, d] = data.date.split("-").map(Number);
    const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const date = dias[new Date(y, mo - 1, d).getDay()] + " " + d + " de " + meses[mo - 1];
    const body = [
      "Encargo " + number + " para el " + date + " a las " + data.slot,
      "",
      data.items || "",
      "",
      "Total: " + String(data.total || "").replace(".", ",") + " € (se paga al recoger)",
      "",
      "Nombre: " + (data.name || ""),
      "Teléfono: " + (data.phone || ""),
      data.email ? "Email: " + data.email : "",
      data.notes ? "Notas: " + data.notes : ""
    ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
    const mail = {
      to: to,
      subject: "Nuevo encargo " + number + ": " + date + ", " + data.slot + ", " + (data.name || ""),
      body: body,
      name: "Encargos Forno Bomba"
    };
    if (data.email) mail.replyTo = data.email;
    MailApp.sendEmail(mail);
  } catch (err) {
    console.error("No se pudo enviar el aviso del encargo " + number + ": " + err);
  }
}

// Último encargo creado: el panel lo consulta cada poco para avisar de encargos nuevos.
function lastOrder() {
  const sheet = ordersSheet();
  const n = sheet.getLastRow();
  if (n < 2) return null;
  const r = sheet.getRange(n, 1, 1, ORDER_HEADERS.length).getValues()[0];
  return { orderNumber: r[COL.number - 1], date: dateKey(r[COL.date - 1]), slot: String(r[COL.slot - 1]), name: r[COL.name - 1] };
}

// Foto de producto subida desde el panel (ya reducida en el navegador).
// Devuelve una URL pública para usarla en la web.
function uploadPhoto(data) {
  const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(String(data.dataUrl || ""));
  if (!m) return { success: false, error: "Formato de imagen no válido." };
  const bytes = Utilities.base64Decode(m[3]);
  if (bytes.length > MAX_PHOTO_BYTES) return { success: false, error: "La foto pesa demasiado." };
  const folders = DriveApp.getFoldersByName(PHOTOS_FOLDER);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(PHOTOS_FOLDER);
  const name = String(data.name || "producto").replace(/[^\w\-]+/g, "-").slice(0, 60) + "-" + Date.now() + "." + (m[2] === "jpeg" ? "jpg" : m[2]);
  const file = folder.createFile(Utilities.newBlob(bytes, m[1], name));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { success: true, url: "https://lh3.googleusercontent.com/d/" + file.getId() + "=w1000" };
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

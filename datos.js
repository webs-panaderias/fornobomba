/* Datos compartidos por la web de encargos (index.html) y el panel (panel.html).
   Lo que se cambie desde el panel (precios, agotados, horario de recogida...) se guarda
   en la Google Sheet y tiene prioridad sobre estos valores por defecto. */
/* =====================================================================
   CONFIGURACIÓN
   SHEET_SCRIPT_URL: pega aquí la URL de la aplicación web de Code.gs.
   Sin URL, la web funciona en modo prueba: no controla el aforo real y
   el encargo se envía solo por WhatsApp.
   ===================================================================== */
const SHEET_SCRIPT_URL = "";

const DEFAULT_CONFIG = {
  phone: "34673473647",
  whatsappEnabled: true,
  slotMinutes: 30,       // duración de cada tramo de recogida
  slotCapacity: 6,       // encargos máximos por tramo
  maxDaysAhead: 14,      // hasta cuántos días vista se puede encargar
  // Ventana de RECOGIDA por día (puede ser más corta que la apertura del forno).
  schedule: {
    mon: null,
    tue: { from: "09:00", to: "20:00" },
    wed: { from: "09:00", to: "20:00" },
    thu: { from: "09:00", to: "20:00" },
    fri: { from: "09:00", to: "20:00" },
    sat: { from: "09:00", to: "15:00" },
    sun: { from: "09:30", to: "14:00" }
  },
  closedDates: [],       // ["2026-12-25", ...] festivos o vacaciones
  pause: { active: false, message: "" },
  catalog: null          // null = usar DEFAULT_CATALOG
};

// Horario de apertura al público (solo informativo).
const OPENING_HOURS = [
  ["Lunes", "Cerrado"], ["Martes", "8:30 – 20:00"], ["Miércoles", "8:30 – 20:00"], ["Jueves", "8:30 – 20:00"],
  ["Viernes", "8:30 – 20:00"], ["Sábado", "8:30 – 15:00"], ["Domingo", "9:00 – 14:00"]
];

const CATEGORIES = [
  { id: "pane",     name: "Il pane",          note: "Masa madre, harinas ecológicas y muchas horas de reposo." },
  { id: "focaccia", name: "Focaccia",         note: "Alta, aireada y crujiente por abajo. Con buen aceite de oliva." },
  { id: "teglia",   name: "Pizza in teglia",  note: "Pizza romana en bandeja: por porción o la bandeja entera para compartir." },
  { id: "dolci",    name: "I dolci",          note: "Buns de canela y cardamomo, recién horneados cada mañana." }
];

// lead = horas mínimas de antelación. art = ilustración. img = ruta a foto real (opcional, p. ej. "img/focaccia.jpg").
const DEFAULT_CATALOG = [
  { id: "pagnotta",       cat: "pane",     name: "Pagnotta",                it: "di lievito madre",       desc: "Nuestro pan de masa madre: corteza tostada y miga abierta. Pieza de ~800 g.", price: 6.50, unit: "pieza",   lead: 12, art: "loaf",     tone: "sole" },
  { id: "mezza",          cat: "pane",     name: "Mezza pagnotta",          it: "metà, stessa anima",     desc: "Media pieza del mismo pan, ~400 g. Ideal para uno o dos.",                    price: 3.60, unit: "pieza",   lead: 12, art: "loaf",     tone: "cielo" },
  { id: "foc-porzione",   cat: "focaccia", name: "Focaccia classica",       it: "rosmarino e sale",       desc: "Porción generosa con romero, aceite de oliva virgen extra y sal en escamas.", price: 3.20, unit: "porción", lead: 3,  art: "focaccia", tone: "pistacchio" },
  { id: "foc-teglia",     cat: "focaccia", name: "Focaccia · bandeja",      it: "per tutta la tavola",    desc: "La bandeja entera de focaccia clásica, unas 8 porciones. Para fiestas, comidas y vermuts.", price: 24.00, unit: "bandeja", lead: 24, art: "focaccia", tone: "sole" },
  { id: "foc-giorno",     cat: "focaccia", name: "Focaccia del giorno",     it: "cambia con la stagione", desc: "La focaccia con toppings de temporada que tengamos ese día. Porción.",       price: 3.80, unit: "porción", lead: 3,  art: "focaccia2", tone: "rosa" },
  { id: "margherita",     cat: "teglia",   name: "Margherita",              it: "pomodoro, fior di latte",desc: "Tomate, mozzarella fior di latte y albahaca fresca. Porción.",               price: 3.50, unit: "porción", lead: 3,  art: "pizza",    tone: "cielo" },
  { id: "patate",         cat: "teglia",   name: "Patate e rosmarino",      it: "la bianca romana",       desc: "Base blanca, patata en láminas finas, romero y pimienta. Porción.",          price: 3.50, unit: "porción", lead: 3,  art: "pizza-patate", tone: "pistacchio" },
  { id: "mortadella",     cat: "teglia",   name: "Mortadella e pistacchio", it: "il classico bolognese",  desc: "Mortadela, stracciatella y pistacho tostado. Porción.",                     price: 4.50, unit: "porción", lead: 3,  art: "pizza-morta", tone: "rosa" },
  { id: "teglia-intera",  cat: "teglia",   name: "Teglia intera",           it: "mezza e mezza",          desc: "Bandeja entera de pizza romana (≈ 8 porciones), de uno o dos sabores. Indícalos en las notas.", price: 28.00, unit: "bandeja", lead: 24, art: "pizza",    tone: "sole" },
  { id: "cinnamon",       cat: "dolci",    name: "Cinnamon bun",            it: "cannella e burro",       desc: "Masa brioche enrollada con mantequilla, canela y azúcar moreno.",           price: 3.20, unit: "unidad",  lead: 3,  art: "bun",      tone: "rosa" },
  { id: "cardamom",       cat: "dolci",    name: "Cardamom bun",            it: "nodo al cardamomo",      desc: "El nudo nórdico con cardamomo recién molido y azúcar perlado.",             price: 3.20, unit: "unidad",  lead: 3,  art: "knot",     tone: "cielo" },
  { id: "box-buns",       cat: "dolci",    name: "Box de 6 buns",           it: "per la colazione",       desc: "Seis buns a elegir entre canela y cardamomo (dinos el reparto en las notas).", price: 18.00, unit: "caja",   lead: 12, art: "box",      tone: "bomba" }
];

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
    mon: { from: "09:00", to: "20:00" },
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
// El lunes abren; se ha supuesto el mismo horario que entre semana: confírmalo con el forno.
const OPENING_HOURS = [
  ["Lunes", "8:30 a 20:00"], ["Martes", "8:30 a 20:00"], ["Miércoles", "8:30 a 20:00"], ["Jueves", "8:30 a 20:00"],
  ["Viernes", "8:30 a 20:00"], ["Sábado", "8:30 a 15:00"], ["Domingo", "9:00 a 14:00"]
];

const CATEGORIES = [
  { id: "pane",     name: "Pan",                note: "Masa madre y muchas horas de reposo." },
  { id: "focaccia", name: "Focaccia y pizza",   note: "En bandeja, al estilo romano. Por porción o entera." },
  { id: "dolci",    name: "Dulce",              note: "Lo que sale del horno por la mañana." },
  { id: "stagione", name: "De temporada",       note: "Cuando toca." }
];

// lead = horas mínimas de antelación. img = foto (opcional). hidden = no se muestra en la web.
const DEFAULT_CATALOG = [
  { id: "pagnotta",      cat: "pane",     name: "Pagnotta de masa madre",  desc: "Corteza tostada y miga abierta. Unos 800 g.",                     price: 6.50,  unit: "pieza",   lead: 12 },
  { id: "mezza",         cat: "pane",     name: "Media pagnotta",          desc: "El mismo pan, unos 400 g.",                                       price: 3.60,  unit: "pieza",   lead: 12 },
  { id: "foc-porzione",  cat: "focaccia", name: "Focaccia",                desc: "Romero, aceite de oliva y sal en escamas.",                       price: 3.20,  unit: "porción", lead: 3 },
  { id: "foc-teglia",    cat: "focaccia", name: "Focaccia, bandeja entera",desc: "Unas 8 porciones. Para comidas, fiestas y vermuts.",              price: 24.00, unit: "bandeja", lead: 24 },
  { id: "olivas",        cat: "focaccia", name: "Pizza de tomate y olivas", desc: "Tomate, olivas verdes y orégano.",                              price: 3.50,  unit: "porción", lead: 3,  img: "img/pizza-olivas.jpg" },
  { id: "margherita",    cat: "focaccia", name: "Pizza margherita",        desc: "Tomate, fior di latte y albahaca.",                               price: 3.50,  unit: "porción", lead: 3 },
  { id: "patate",        cat: "focaccia", name: "Pizza de patata y romero",desc: "Base blanca, patata fina, romero y pimienta.",                    price: 3.50,  unit: "porción", lead: 3 },
  { id: "mortadella",    cat: "focaccia", name: "Pizza de mortadela",      desc: "Mortadela, stracciatella y pistacho.",                            price: 4.50,  unit: "porción", lead: 3 },
  { id: "teglia-intera", cat: "focaccia", name: "Pizza, bandeja entera",   desc: "Unas 8 porciones, de uno o dos sabores. Dinos cuáles en las notas.", price: 28.00, unit: "bandeja", lead: 24 },
  { id: "cardamom",      cat: "dolci",    name: "Nudo de cardamomo",       desc: "Masa brioche anudada con cardamomo recién molido.",               price: 3.20,  unit: "unidad",  lead: 3,  img: "img/cardamomo.jpg" },
  { id: "cinnamon",      cat: "dolci",    name: "Bun de canela",           desc: "Enrollado con mantequilla y canela, con azúcar glas por encima.", price: 3.20,  unit: "unidad",  lead: 3,  img: "img/bun.jpg" },
  { id: "chocolate",     cat: "dolci",    name: "Bun de chocolate",        desc: "Espiral de chocolate con azúcar glas por encima.",                price: 3.50,  unit: "unidad",  lead: 3,  img: "img/bun-chocolate-mini.jpg" },
  { id: "crostata",      cat: "dolci",    name: "Crostata",                desc: "Tartaleta de masa quebrada con mermelada.",                       price: 3.80,  unit: "unidad",  lead: 3,  img: "img/crostata.jpg" },
  { id: "box-buns",      cat: "dolci",    name: "Caja de 6 buns",          desc: "Canela, cardamomo o chocolate, como prefieras. Dinos el reparto en las notas.", price: 18.00, unit: "caja", lead: 12 },
  { id: "coca-sant-joan",cat: "stagione", name: "Coca de Sant Joan",       desc: "Con piñones de aquí. Solo en junio.",                             price: 22.00, unit: "pieza",   lead: 48, img: "img/coca.jpg", hidden: true }
];

# Forno Bomba — encargos online

Web para que los clientes encarguen pan, focaccia, pizza in teglia y buns, y los recojan en el forno
(Carrer del Vallespir, 24 · Sants) **el día y en el tramo de media hora que elijan**. Se paga al recoger.

| Archivo | Para quién | Qué hace |
|---|---|---|
| `index.html` | Clientes | Catálogo y encargo en 3 pasos: cesta → día y tramo → datos. Ticket con número, botón para añadirlo al calendario y copia por WhatsApp. |
| `panel.html` | Obrador | Encargos de cada día ordenados por tramo, lista "Para hornear" (imprimible), estados Pendiente / Preparado / Recogido / Cancelado, pausa rápida y configuración. |
| `datos.js` | Los dos | URL del Apps Script, catálogo y configuración por defecto. |
| `Code.gs` | Google Apps Script | Guarda encargos y configuración en una Google Sheet, reparte números y **controla el aforo por tramo** (aunque dos clientes encarguen a la vez). |

## Reglas de los encargos

- **Tramos de recogida** de 30 min dentro del horario de recogida (Lu–Vi 9:00–20:00, Sá 9:00–15:00, Do 9:30–14:00).
  El lunes está abierto; su horario se ha supuesto igual que el resto de la semana.
- **Aforo**: máximo 6 encargos por tramo. Cuando un tramo se llena, deja de ofrecerse.
- **Antelación por producto**: dulces y porciones 3 h; pagnotta y caja de buns 12 h; bandejas enteras 24 h;
  coca de Sant Joan 48 h (oculta hasta junio: se activa desde el panel).
  La cesta usa la antelación del producto que más necesita.
- Se puede encargar hasta 14 días vista. Los festivos se añaden en *Configuración → Días cerrados*.

Todo esto (y precios, agotados, productos ocultos, teléfono y clave) se cambia desde el panel, sin tocar código.

## Puesta en marcha

1. Crea una Google Sheet con la cuenta del forno y pega `Code.gs` en *Extensiones → Apps Script*
   (instrucciones paso a paso al principio del archivo). Implementa como aplicación web.
2. Pega la URL obtenida en `SHEET_SCRIPT_URL`, en `datos.js`.
3. Entra en `panel.html` con la clave `forno2026` y **cámbiala** en *Configuración → Clave del panel*.
4. Revisa precios y productos en *Configuración → Catálogo*.

Mientras `SHEET_SCRIPT_URL` esté vacío la web funciona en modo prueba: no hay control de aforo
y el encargo solo se envía por WhatsApp.

## Identidad visual

- Colores tomados del logo y del local: piedra `#E6E0D0` (fondo del logo), rojo `#EE3325` (letras del logo y rótulo),
  granate `#6A0E0B` (pared del obrador), papel `#F3EFE5` (papel de envolver), tinta `#2B211A`.
- Tipografías alojadas en `fonts/`: **Titan One** para el rótulo FORNO BOMBA (la más parecida a las letras del logo)
  y **Jost** para todo lo demás. Los titulares siguen la voz de su Instagram: mayúsculas y un aparte entre paréntesis.
- Las fotos de `img/` son provisionales: unas salen de una captura del feed de Instagram (poca resolución) y
  las de producto (`cardamomo*`, `bun-chocolate*`, `pizza-*`) de fotos de clientes en las reseñas de Google,
  que tienen derechos de autor. **Antes de publicar hay que sustituirlas por fotos propias del forno**
  con el mismo nombre de archivo.
- El lema del papel de envolver, "Ingredientes auténticos, creaciones explosivas", cierra la página.

## Pendiente de confirmar con el cliente

- **Precios, pesos y antelaciones**: son orientativos; hay que sustituirlos por los reales.
- **Fotos**: originales en buena resolución para `img/` y, si quieren, fotos de más productos
  (se añaden con `img: "img/nombre.jpg"` en `datos.js`).
- **Horario del lunes**.
- Los productos del catálogo salen de lo que mencionan reseñas y guías (pagnotta de masa madre, focaccia,
  pizza en bandeja, nudos de cardamomo, buns de canela y de chocolate, pizza de tomate y olivas, crostata y coca de Sant Joan); conviene revisar la carta real.

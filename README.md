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

- **Tramos de recogida** de 30 min dentro del horario de recogida (Ma–Vi 9:00–20:00, Sá 9:00–15:00, Do 9:30–14:00, lunes cerrado).
- **Aforo**: máximo 6 encargos por tramo. Cuando un tramo se llena, deja de ofrecerse.
- **Antelación por producto**: buns y porciones 3 h; pagnotta y box de buns 12 h; bandejas enteras 24 h.
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

## Pendiente de confirmar con el cliente

- **Precios, pesos y antelaciones**: son orientativos; hay que sustituirlos por los reales.
- **Fotos**: los productos llevan ilustraciones propias. Para usar fotos reales (p. ej. las de Instagram),
  súbelas a `fornobomba/img/` y añade `img: "img/nombre.jpg"` al producto en `datos.js`.
- Los productos del catálogo salen de lo que mencionan reseñas y guías (pagnotta de masa madre, focaccia,
  pizza romana in teglia, cinnamon y cardamom buns); conviene revisar la carta real.

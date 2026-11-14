# Visor de Parcela — panel de ubicación/filtro

- **Feature:** `visor-parcela-filter-panel`
- **Estado:** completado (implementado y verificado estructuralmente)
- **Objetivo:** Mejorar el panel flotante "Buscar / Filtrar Parcela" del visor para que sea claro, usable, responsive y coherente con su función real.
- **Problema:** El panel se superpone con el control de capas (top-right), usa estilos inline rígidos (`310px`), tiene interacción básica (solo toggle) y su copy promete "filtrar" cuando en realidad ubica parcela/consulta clima.
- **Por qué:** Mejor legibilidad y UX en desktop/mobile sin romper la consulta de clima ni la selección de coordenadas.

## Alcance autorizado
- `index.html`: markup del panel/botón (quitar inline styles/onclick según convenga), copy coherente.
- `css/components.css` (+ `css/responsive.css` si hace falta): estilos del panel, estados, posicionamiento y responsive.
- `js/ui/forms.js` (y/o JS mínimo necesario): toggle con estado, cierre con `Esc` y click afuera, presets de coordenadas por distrito sin romper IDs existentes.
- No cambiar lógica de negocio de NASA POWER, rotaciones ni ficha de suelo fuera de lo necesario.

## Tareas
- [x] T1. Rediseñar markup/CSS del panel (posición sin chocar con capas, ancho adaptable, jerarquía visual, clases en CSS).
- [x] T2. Mejorar interacción y accesibilidad básica (estado abierto/cerrado, cierre Esc/click fuera, sin romper hooks actuales).
- [x] T3. Ajustar copy/comportamiento para coherencia (distrito con presets de coords útiles; comunidad como dato opcional) y verificar en navegador/estructura.
- [x] T4. Verificación final, actualizar este documento con evidencia y commit de unidad de trabajo.

## Criterios de aceptación
- Panel no se superpone con el control de capas de Leaflet.
- Funciona en viewport desktop y angosto (sin desborde grave).
- Botones/IDs usados por `forms.js` siguen operativos (`btn-toggle-filter`, `parcel-filter-panel`, `sel-distrito`, `in-comunidad`, `in-lat`, `in-lon`, `btn-locate`, `btn-consultar`).
- Toggle accesible/consistente (estado visible, cierre por Esc/click fuera).

## Verificación aplicable
- Inspección estructural de HTML/CSS/JS y búsqueda de referencias rotas.
- Prueba manual/local si es posible (`python3 -m http.server` ya no requerido si basta inspección; ideal smoke con navegador no disponible en CLI).

## Evidencia
- `node --check js/ui/forms.js` → `syntax-ok`.
- `rg` confirma IDs/hooks presentes en `index.html` y `js/ui/forms.js` (`btn-toggle-filter`, `parcel-filter-panel`, `sel-distrito`, `in-comunidad`, `in-lat`, `in-lon`, `btn-locate`, `btn-consultar`).
- `toggleParcelFilter` inline/onclick removido del panel (sin coincidencias en `index.html`).
- Diff: `css/components.css`, `css/responsive.css`, `index.html`, `js/ui/forms.js` (+ task doc).
- Smoke visual en navegador no ejecutado en CLI (entorno sin browser interactivo); cambios validados por inspección estructural y wiring JS/CSS.

## Notas
- Mirror Engram `odd/visor-parcela-filter-panel/tasks`: **pendiente** (herramientas Engram no disponibles en esta sesión).

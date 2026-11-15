# Cultivos recomendados por altitud y zona (Paso 4)

## Objetivo
Mostrar en el **Paso 4** qué cultivos son más adecuados para cultivar según la **altitud** y la **zona/ubicación** de la parcela, manteniendo la selección manual del productor.

## Problema
Hoy el Paso 4 lista todo el catálogo de cultivos sin filtrar ni recomendar según las condiciones del lugar (altitud/zona), aunque la parcela ya tiene ubicación/distrito.

## Alcance
- Obtener y almacenar la altitud de la parcela (consulta por coordenadas + respaldo manual/estado).
- Definir metadatos de aptitud por cultivo (rangos de altitud y zona/distritos) en `data/crops.json` (valores provisionales razonables para Andahuaylas, explícitos).
- Calcular aptitud por cultivo según altitud y zona de la parcela.
- Actualizar la UI del Paso 4 para mostrar recomendados vs otros (o indicadores/motivo) sin impedir la selección.
- Recalcular al cambiar ubicación/altitud y manejar ausencia de datos.
- Persistir altitud si corresponde y agregar pruebas/verificación.

## Fuera de alcance
- Validación agronómica definitiva de rangos (se usan valores provisionales documentados).
- Cambios mayores de arquitectura o rediseño completo.

## Restricciones
- No commitear cambios.
- Mantener funcionamiento sin altitud/zona (degradación segura).

## Tareas
- [x] **T1. Modelo de datos y estado**: extender `data/crops.json` con `altitudeMinM`, `altitudeMaxM`, `zones`; parcela/estado/persistencia soportan `elevation` (msnm) en `parcel` (round-trip por serialización del objeto parcela; compatibilidad con payloads previos sin `elevation`).
- [x] **T2. Obtención de altitud y motor de aptitud**: `js/api/elevation.js` consulta Open-Meteo Elevation con caché en memoria y manejo degradado; `js/agriculture/crop-suitability.js` clasifica recomendado/posible/no recomendado con motivo según altitud y zona.
- [x] **T3. UI Paso 4 e integración**: contexto de altitud/zona en Paso 4, grilla agrupada con badges/motivo por cultivo, recálculo en cambios de ubicación/distrito/elevación y actualización en bootstrap/suscripción; selección de cultivos se mantiene.
- [x] **T4. Pruebas y verificación**: agregado `tests/crop-suitability.test.js`; verificación ejecutada (ver abajo).

## Criterios de aceptación
- [x] Con altitud/zona conocidas, el Paso 4 distingue cultivos recomendados según esas condiciones y muestra motivo.
- [x] Sin altitud/zona, la app sigue permitiendo elegir cultivos sin errores (estado neutro/orientativo).
- [x] La altitud se obtiene/actualiza según la ubicación de la parcela cuando es posible (fetch en cambios de coordenadas/carga inicial con coordenadas conocidas; en fallo queda desconocida).
- [x] Tests y chequeos relevantes pasan.

## Verificación aplicable
- `node --test` → **37 tests, 0 fallos** (incluye `tests/crop-suitability.test.js`).
- `node --check js/api/elevation.js js/agriculture/crop-suitability.js js/agriculture/crop-catalog.js js/ui/forms.js js/main.js js/state.js js/state-persistence.js` → **OK**.
- `node -e "JSON.parse(require('fs').readFileSync('data/crops.json','utf8')); console.log('crops.json ok')"` → **OK**.

## Progreso
- Implementación T1–T4 completada en esta sesión. Rangos de altitud y zonas son **provisionales** para Andahuaylas/Apurímac (zona provincial aplicada a todos los distritos del prototipo). Mirror Engram pendiente (no disponible en esta sesión).

## Próximo paso
- Revisión/ajuste de rangos con criterio agronómico local y validación manual en navegador si se requiere.
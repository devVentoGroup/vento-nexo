# Roadmap NEXO

## Estado actual

NEXO queda congelado en una **v1 operativa** para inventario base y remisiones.

### Dentro de v1
- Catalogo de productos operativos.
- Sedes, rutas de abastecimiento y checklist de arranque.
- LOCs solo en `Centro`.
- Entradas manuales v1 para stock inicial y contingencias.
- Stock por sede y por LOC.
- Remisiones `Saudo <-> Centro` con preparacion y recepcion.
- Retiros, traslados, conteos, ajustes y movimientos.
- Alta rapida de productos y carga asistida con IA.

### Fuera de v1
- Produccion integrada.
- Consumo por receta.
- Recepcion operativa normal contra OC.
- Integracion real con `FOGO`.
- Integracion real con `ORIGO`.
- Segundo satelite (`Vento Cafe`) en el arranque.

## V1 cerrada

### Flujo oficial
1. Crear producto.
2. Habilitar producto por sede.
3. Crear LOCs del `Centro`.
4. Cargar stock inicial en `Centro`.
5. Contar y ajustar si aplica.
6. Solicitar remision desde `Saudo`.
7. Preparar en `Centro`.
8. Recibir en `Saudo`.

### Reglas operativas
- `Centro` es la unica sede con LOCs.
- `Saudo` opera stock solo por sede.
- `LPN` no bloquea el arranque.
- La produccion queda fuera del flujo diario de v1.
- Las compras completas quedan como continuidad futura.

## Backlog v2

### Integraciones
- Integracion real con `FOGO` para recetas, produccion y descuento automatico.
- Integracion real con `ORIGO` para ordenes de compra y recepcion contra OC.
- Integracion con `VISO` para seguimiento gerencial.

### Expansion operativa
- Salida de `Vento Cafe` como segundo satelite.
- Origen LOC por linea en remisiones como flujo endurecido.
- Lotes y vencimientos por item.
- Notas de incidencia por linea en entradas.

### Mejora de datos
- Costo automatico completo por receta y produccion.
- Plantillas masivas por proveedor y por sede.
- Validaciones mas estrictas de salud del catalogo.

## Criterio de salida

NEXO v1 se considera lista cuando:
- El checklist `Centro + Saudo` queda completo.
- Existe stock inicial en `Centro`.
- Hay productos activos para `Centro` y `Saudo`.
- Se completa una remision end-to-end sin depender de `FOGO`, `ORIGO` o `VISO`.

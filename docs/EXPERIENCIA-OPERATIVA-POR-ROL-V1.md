# EXPERIENCIA OPERATIVA POR ROL · V1

## Norte

`Nexo v1` no debe mostrar el sistema completo a cada persona. Debe mostrar la tarea que le toca ejecutar en ese momento, segun `rol + sede + permiso + estado`.

## Principios

- Un operario en piso no deberia decidir entre diez rutas. Debe ver una o dos acciones maximo.
- La pantalla debe favorecer `tocar -> confirmar -> seguir`, no `leer -> interpretar -> decidir`.
- En flujos moviles/tablet, el CTA principal debe ser grande, visible y cercano al pulgar.
- Los datos tecnicos (`UUID`, estados internos, paneles de resumen inflados) no deben competir con la accion.
- Si una tarea requiere varios pasos, los controles deben revelarse de forma progresiva.

## Roles operativos v1

### Satelite

Responsabilidad diaria:
- pedir abastecimiento a `Centro`;
- seguir estado de la solicitud;
- recibir remision y registrar faltantes.

Debe ver:
- `Pedir y recibir`;
- remisiones de su sede;
- scanner como utilidad.

No debe ver como flujo principal:
- preparar;
- despachar;
- configuraciones;
- paneles tecnicos de bodega.

### Centro de produccion / bodega

Responsabilidad diaria:
- revisar solicitudes abiertas;
- preparar por LOC;
- despachar;
- registrar entradas de contingencia cuando aplique.

Debe ver:
- `Preparar remisiones`;
- entradas de `Centro`;
- scanner;
- detalle de salida enfocado en `LOC -> preparado -> enviado`.

No debe ver como flujo principal:
- recibir como si fuera satelite;
- configuracion extensa;
- reportes o setup compitiendo con la operacion.

### Gestion / administracion

Responsabilidad diaria:
- revisar salud operativa;
- corregir setup;
- mantener catalogo, rutas, sedes, ubicaciones y checklist.

Debe ver:
- acceso completo a verificacion y configuracion;
- herramientas operativas como respaldo, no como home principal.

## Reglas UI aplicadas

- `Home`:
  - satelite entra en `Pide y recibe desde tu sede`;
  - centro entra en `Prepara y despacha desde Centro`;
  - gestion mantiene cockpit mas amplio.
- `Sidebar`:
  - modo satelite enfoca `Panel`, `Pedir y recibir`, `Scanner`;
  - modo centro enfoca `Panel`, `Preparar remisiones`, `Entradas de Centro`, `Scanner`.
- `Remisiones`:
  - satelite ve pedir/recibir;
  - centro ve preparar/despachar;
  - detalle revela controles por etapa.

## Arquitectura UX correcta para remisiones

En remisiones, el problema ya no es un boton o una card aislada. El problema es de arquitectura: se intentaron mezclar `pedir`, `preparar`, `despachar` y `recibir` dentro de superficies que siguen sintiendose como formularios o detalles parcheados, en vez de tratar la remision como un documento central que cambia por estado.

La regla correcta para `v1` queda asi:

- la **remision** es la entidad central;
- la experiencia cambia segun `estado + rol + sede`;
- preparacion y recepcion son **modos operativos** del mismo documento;
- la operacion debe sentirse como `ver -> tocar accion principal -> seguir`.

### Estados operativos de referencia

- `draft`
- `pending`
- `preparing`
- `in_transit`
- `received`
- `cancelled`

Notas:
- `received` sigue siendo el final visible de `v1`;
- `closed` no vuelve como estado operativo visible;
- si mas adelante hace falta `with_issue`, se agrega como continuidad, no como condicion para cerrar `v1`.

### Estructura correcta del modulo

#### 1. Bandeja de remisiones

Debe ser la entrada principal del modulo.

Debe mostrar:
- buscador;
- filtros por `estado`, `origen`, `destino`, `fecha`, `prioridad`;
- KPIs cortos;
- lista de remisiones;
- accion rapida acorde al estado.

Vista recomendada:
- tabla operativa como principal;
- kanban solo como vista alterna futura.

#### 2. Nueva remision

Solo sirve para originar la solicitud.

Debe incluir:
- origen;
- destino;
- fecha requerida;
- prioridad;
- productos;
- cantidades;
- observaciones.

No debe incluir:
- preparacion;
- despacho;
- recepcion;
- decisiones de bodega.

La sensacion correcta es “armar una solicitud”, no “llenar un formulario pesado”.

#### 3. Detalle de remision

Debe ser el documento central y estable.

Debe concentrar:
- cabecera con consecutivo, estado, prioridad, origen, destino y fechas;
- timeline del proceso;
- historial y responsables;
- resumen de lineas;
- CTA principal segun el estado.

El detalle sirve para entender el documento. No debe convertirse en la superficie donde se hacen todos los micro-movimientos tacticos de la operacion.

#### 4. Modo preparacion

Es una variante operativa del detalle para `Centro`.

Debe sentirse como picking:
- lista limpia de lineas;
- cantidad solicitada;
- cantidad pendiente;
- incidencias;
- responsable preparando;
- progreso general;
- una accion principal por linea.

No debe sentirse como:
- formulario largo;
- pantalla administrativa;
- coleccion de cards decorativas;
- cadena de botones que obliga a refrescar y reinterpretar toda la pantalla.

#### 5. Modo recepcion

Es otra variante operativa del detalle para satelite.

Debe priorizar:
- `Recibir todo`;
- `Recibir con novedad`;
- `Marcar faltante`;
- evidencia o nota solo cuando haga falta.

El satelite no necesita ver logica de `LOC`, picking interno o decisiones propias de bodega del `Centro`.

### Regla de oro

No pensar en:
- pagina de pedir;
- pagina de preparar;
- pagina de enviar;
- pagina de recibir.

Pensar en:
- bandeja;
- documento central;
- modos de trabajo por estado.

Ese cambio arregla la mayor parte del problema de logica del flujo.

### Criterios visuales para el rediseño

- Una accion principal por vista.
- La remision debe entenderse en 3 segundos:
  - que es;
  - para donde va;
  - en que estado esta;
  - que falta.
- El estado y el progreso pesan mas que la decoracion.
- Las lineas del producto mandan mas que los contenedores.
- Preparacion y recepcion deben sentirse como checklist operativo, no como formulario editable.
- Si una accion cambia el estado, el feedback debe verse en la misma linea y no depender solo de un aviso global.

### Que no se debe volver a hacer

- seguir parchando la vista actual del detalle como si esa fuera la arquitectura correcta;
- mezclar validacion, picking, despacho y recepcion dentro de la misma superficie editable;
- mostrar varios botones primarios compitiendo;
- obligar al operario a leer instrucciones largas para saber por donde empezar;
- depender de refresh completos sin un cambio de estado claramente visible dentro de la propia linea.

## Decisión aplicada · Cancelar vs Eliminar vs Anular con reversa

Para `v1`, estas acciones ya no se exponen dentro del detalle de una remisión. Se operan desde la bandeja (`lista/historial`) en la columna `Acciones`.

- `Cancelar`: corta el flujo documental y deja trazabilidad.
- `Eliminar`: solo debe borrar cuando no hay trazabilidad bloqueante.
- `Anular + reversa`: cancela y revierte inventario cuando la remisión ya impactó stock.

Regla práctica:
- si hubo salida/recepción (`in_transit`, `partial`, `received`, `closed`), priorizar `Anular + reversa`;
- si fue error temprano sin trazabilidad, usar `Eliminar`.

### Matriz v1 (rol + estado + acción)

Supuesto de rol:
- solo `propietario`, `gerente` y `gerente_general` ven acciones destructivas (`Cancelar`, `Eliminar`, `Anular + reversa`);
- además deben tener permiso `inventory.remissions.cancel` en al menos una sede relacionada.

Alcance por sedes:
- `Cancelar` y `Eliminar`: requieren alcance en `origen` o `destino` (o permiso global).
- `Anular + reversa`: requiere alcance en `origen` **y** `destino` (o permiso global), porque afecta stock de ambos lados.

Estados y acciones visibles:

1. `pending`
- `Ver`
- `Cancelar`
- `Eliminar`

2. `preparing`
- `Ver`
- `Cancelar`
- `Eliminar`

3. `in_transit`
- `Ver`
- `Anular + reversa`

4. `partial`
- `Ver`
- `Anular + reversa`

5. `received`
- `Ver`
- `Anular + reversa`

6. `closed` (legado)
- `Ver`
- `Anular + reversa`

7. `cancelled`
- `Ver`
- `Eliminar`
- `Anular + reversa` solo si no tiene marcador `[REVERSA_APLICADA]` en `notes`.

Regla backend:
- la API valida la misma matriz; no basta con ocultar botones en UI.
- `Cancelar/Eliminar` desde detalle quedan bloqueadas; esas acciones solo se ejecutan desde la bandeja.

### Decision de implementacion

Desde este punto:

1. Se congela el enfoque de “seguir ajustando el detalle actual” como solucion principal.
2. El siguiente rediseño de remisiones debe salir de esta estructura:
   - `Bandeja`
   - `Nueva remision`
   - `Detalle`
   - `Modo preparacion`
   - `Modo recepcion`
3. Cualquier mejora puntual anterior a ese rediseño debe respetar esa arquitectura futura y no profundizar la deuda visual o logica.

## Referencias externas usadas

- Odoo Barcode / Inventory operations: la operacion movil se organiza por tarea (`receipts`, `internal transfers`, `delivery orders`) y escaneo dirigido, no por menu tecnico global.
  - https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/barcode/setup/software.html
  - https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/barcode/operations.html
- Zebra Picking Plus: refuerza flujos moviles de una tarea a la vez para piso logistico.
  - https://www.zebra.com/us/en/software/workflow-automation/picking-plus.html
- Apple Human Interface Guidelines: controles tactiles suficientemente grandes y directos para reducir errores de toque.
  - https://developer.apple.com/design/human-interface-guidelines/inputs/touch-and-gestures

## Regla de mantenimiento

Toda pantalla nueva o refactor de `Nexo` debe responder primero:

1. Quien usa esta pantalla?
2. Que accion concreta vino a ejecutar?
3. Que NO necesita ver para completar esa accion?

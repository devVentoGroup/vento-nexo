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

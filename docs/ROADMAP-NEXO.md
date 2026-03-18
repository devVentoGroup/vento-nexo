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

## Seguimiento de implementacion

### Criterio UX transversal
- La meta de `NEXO` no es tener formularios tipo wizard por defecto.
- Crear y editar deben converger hacia una misma experiencia: formulario simple, completo y facil de entender para alguien nuevo.
- Regla de diseño:
  - una sola pantalla cuando sea posible;
  - secciones claras en vez de pasos ocultos;
  - contexto y ayuda visibles sin obligar a navegar por wizard;
  - crear y editar con estructura casi identica;
  - advanced/compatibilidad como apoyo, no como barrera.
- Esto aplica a catalogo, remisiones, entradas, traslados, ajustes, LOCs, conteo inicial y cualquier alta/edicion operativa.

### Bitacora 2026-03-11
- Sprint 1 ejecutado en UI principal: home y navegacion reorganizados por `Operar`, `Verificar`, `Configurar` y `Utilidades`.
- Sprint 2 en curso sobre catalogo maestro:
  - Listado partido en componentes de toolbar, filtros y resultados.
  - Alta y ficha reorientadas semanticamente a producto maestro + categoria operativa.
  - Campos compartidos de identidad y almacenamiento extraidos para `new` y `[id]`.
  - Ficha maestra `[id]` ya separada en bloques menores para resumen de costo, compra principal y disponibilidad por sede.
  - Bloques finales de foto, checklist y pie de guardado ya quedaron compartidos entre alta y ficha maestra cuando aplica.
- Remisiones reencuadradas sobre el flujo oficial `Solicitar -> Preparar -> Recibir`.
  - `/inventory/remissions` queda como hub del flujo.
  - `/inventory/remissions/prepare` queda como cola especializada de bodega, no como flujo paralelo.
  - El detalle de remision ya sabe volver a la cola de preparacion cuando entras desde ahi.
- Endurecimiento inicial de remisiones sobre el detalle:
  - Se conserva el contexto `from=prepare` al guardar items o cambiar estado.
  - Ya no se aceptan combinaciones incoherentes entre `preparado`, `enviado`, `recibido` y `faltante`.
  - El despacho ya no cae por defecto en `cantidad solicitada` cuando falta `enviado`; ahora se fuerza coherencia operativa antes de mover stock.
  - Hub y detalle ya comunican mejor quien debe actuar por rol/sede y dejan mas explicito el manejo de recepcion parcial.
  - El detalle ya muestra diagnostico por linea para LOC origen, stock en sede/LOC y conciliacion parcial antes de guardar.
  - En v1 `received` queda como estado terminal visible. `closed` se mantiene solo como compatibilidad de registros viejos y deja de ofrecerse como accion operativa.
  - La documentacion operativa y la guia inicial ya quedaron limpias respecto a esto; no hace falta abrir otro corte de v1 para perseguir `closed` a nivel UX.
  - La creacion de remisiones ya se alineo al patron de formulario unico: ruta, items, revision y confirmacion en una sola vista, con ayudas inline y mejor lectura para alguien nuevo.
  - El create ya muestra stock referencial de la sede origen por linea y en el resumen, sin mezclar preparacion ni LOCs dentro de la solicitud.
  - La frescura del stock referencial ya queda visible por linea (`timestamp + hace X min/h`), asi que este create no necesita convertirse en una vista de stock mas pesada.
  - La cola `prepare` ya anticipa senales por remision (`LOC pendiente`, `preparacion corta`, `faltante probable`, `sin LOC unico suficiente`) y el detalle ahora sugiere LOCs por linea y hace mas explicita la preparacion parcial.
  - El detalle ya permite `partir linea` como escape hatch de v1 cuando la sede tiene stock suficiente pero ningun LOC unico cubre toda la cantidad. Esto evita abrir todavia un modelo multi-LOC por linea solo para cerrar v1.
  - La migracion `20260311162000_nexo_remissions_split_item.sql` ya quedó promovida desde `vento-shell`, sincronizada al resto de repos y aplicada en remoto.
  - El create de remisiones ya perdió paneles explicativos y ruido visual: quedó reducido a contexto, productos y footer, y el selector de producto ya no usa fondo transparente ni dropdown flotante encimado en esa pantalla.
  - `Remisiones` ya tiene una primera direccion visual mas viva en hub, detalle y cola `prepare`: hero con gradiente, metricas compactas y animacion suave. El objetivo ya no es llenar de instrucciones sino hacer que el flujo se entienda por jerarquia visual.
  - `Stock` ya entro en la misma linea: hero, metricas resumidas, filtros mas claros y tablas dentro de paneles con mejor jerarquia visual. Esto empieza a unificar el sistema como un solo flujo operativo y no como pantallas aisladas.
  - `Movements` ya entro en la misma direccion visual que `Stock` y `Remisiones`: hero, metricas de lectura rapida y ledger con mejor presencia. La navegacion entre consultar stock y auditar movimientos ya empieza a sentirse como una sola experiencia.
  - `Printing` ya empezo su rediseño fuerte en `setup` y `jobs`: menos manual tecnico, mas flujo rapido, deteccion mas automatica y estados de conexion mas legibles. La meta ahora es que alguien nuevo pueda dejar una Zebra lista e imprimir etiquetas sin entender ZPL ni pelear con demasiados pasos.
  - `Printing/designer` ya entro en la misma linea visual: hero con metricas, canvas protagonista, panel lateral mas claro y menos lenguaje de tutorial. El objetivo ya no es explicar el diseñador sino hacer obvio donde elegir un LOC, ajustar el formato y guardar/imprimir el layout.
  - `Withdraw` ya entro en la misma direccion visual y de flujo QR: hero compacto, origen mucho mas claro, captura mas directa y resumen lateral mas limpio. La pantalla ya comunica retiro desde LOC por jerarquia visual, no por bloques largos de instrucciones.
  - `Entries` ya entro en la misma linea visual: hero con metricas de estado, formulario con mejor jerarquia de contexto/productos y historial reciente mas legible. Sigue siendo una entrada excepcional, pero ya no se siente como una pantalla plana ni como un formulario aislado del resto del sistema.
  - `Transfers` ya entro en la misma linea visual y operativa: hero con metricas, ruta origen/destino mas obvia, captura mas clara y resumen/historial mas consistente con el resto. El flujo ya se siente como movimiento interno del mismo sistema, no como una pantalla suelta.
  - `Adjust` ya entro en la misma linea visual: seleccion de sede mas clara, hero con contexto, formulario de ajuste mas directo y resultado esperado visible sin tanto texto de apoyo. La correccion manual ya se entiende por estructura y feedback visual, no por explicaciones largas.
  - `Count initial` ya entro en la misma linea visual: seleccion de sede mas clara, hero con contexto de conteo, ambito de zona/LOC mas limpio y captura con mejor presencia. El flujo ya no se comunica como wizard sino como conteo directo con filtros y confirmacion simple.
  - `Locations` ya entro en la misma linea visual: hero con metricas, alta y edicion mas claras, y listado con filtros mejor jerarquizados. La separacion entre crear y editar se mantiene, pero ya no se siente como una pantalla plana ni como bloques administrativos desconectados.
  - `Scanner` ya entro en la misma linea visual: hero con contexto movil, panel de escaneo con mejor presencia y resultados de LOC/AST mas claros. El salto a retiro o ubicacion ya se siente parte del flujo operativo QR del sistema.
  - `Catalogo` ya entro en la misma linea visual: listado, alta y ficha maestra con heroes, metricas y secciones mas vivas. Se mantiene el norte de producto maestro y categoria operativa, pero ahora con una presencia visual mas consistente con el resto del sistema.
  - `Home` ya quedo mas alineado con el resto del sistema: hero principal, tarjetas de accion con mas presencia y bloques de cockpit mejor integrados visualmente. La entrada ya se siente mas cerca de un solo flujo operativo que de una portada aparte.
  - Refinamiento transversal movil/tablet aplicado en `globals.css`: footers sticky mas usables, botones y campos mas tactiles, heroes/cards mas compactos y tablas con mejor comportamiento horizontal. La meta es que operacion en celular o tablet requiera menos precision, menos scroll confuso y menos busqueda de acciones.
  - `Remisiones` ya empezo a usar categoria operativa dentro del selector de productos: el buscador ahora agrupa por categoria del catalogo maestro en vez de listar todo plano. Esto mantiene rapidez de busqueda pero ya acerca la experiencia a pedir por familias operativas, no por una lista larga sin estructura.
  - El mismo criterio ya se aplicó al resto de formularios operativos principales (`entradas`, `traslados`, `ajustes`, `LOCs`, `conteo inicial`, `produccion manual`) y a remisiones hub/detalle: fuera `StepHelp`, fuera paneles de “revision” y “confirmacion” inflados, fuera copy de “paso 1/2/3” en botones. El flujo ahora depende mas de estructura clara y alertas reales que de instrucciones largas en pantalla.
- `Entradas` ya salio del esquema wizard.
  - `entries-form.tsx` ahora opera como formulario unico con contexto, items, revision y confirmacion en una sola vista.
  - Queda como primer patron real para migrar create/edit hacia UX simple pero completa.
- `Traslados` ya salio del esquema wizard.
  - `transfers-form.tsx` ahora opera como formulario unico con origen, destino, items, revision y confirmacion en una sola vista.
  - Reutiliza el mismo criterio de `Entradas`: contexto visible, ayuda inline y cierre simple para alguien nuevo.
- `Ajustes` ya salio del esquema wizard.
  - `adjust-form.tsx` ahora opera como formulario unico con producto, diferencia, motivo, revision y confirmacion en una sola vista.
  - Se alinea con `Entradas` y `Traslados` para empezar a formar un patron consistente de create/edit operativo.
  - `inventory/adjust/page.tsx` ya no presenta la seleccion de sede como `Paso 1`, y si el usuario solo tiene una sede asignada entra directo a la vista correcta.
- `LOCs` ya salio del esquema wizard tanto en alta como en edicion.
  - `loc-create-form.tsx` y `loc-edit-form.tsx` ahora operan como formularios unicos con contexto visible, revision y confirmacion final.
  - Alta y edicion ya comparten mejor el mismo lenguaje visual y el mismo catalogo de zonas operativas.
  - `inventory/locations/page.tsx` ya separa mejor el modo alta del modo edicion para que no compitan en la misma pantalla.
- `Conteo inicial` ya salio del esquema wizard.
  - `count-initial-form.tsx` ahora opera como formulario unico con captura, resumen operativo y confirmacion final en la misma vista.
  - Queda alineado con el mismo patron de revision antes de guardar.
- `Produccion manual` ya salio del esquema wizard a nivel de componente.
  - `production-batch-form.tsx` ahora opera como formulario unico con contexto, lote, impacto y confirmacion final.
  - Aun asi, produccion integrada sigue fuera de v1 y no cambia su prioridad operativa.
- `Catalogo maestro` ya dejo de comunicarse como secuencia numerada.
  - `catalog/new` y `catalog/[id]` mantienen secciones claras, pero ya no se presentan como pasos obligatorios ni usan marcadores numerados.
  - La lectura del formulario ahora es de ficha continua: identidad, almacenamiento, compra, foto y disponibilidad por sede.

### Punto exacto alcanzado
- Catalogo maestro ya quedo estabilizado en su corte de particion principal para `page`, `new` y `[id]`.
- Remisiones ya quedaron alineadas semanticamente con la operacion v1 entre hub, cola de preparacion y detalle.
- La base remota ya tiene aplicada la migracion para `partir linea`; el siguiente cierre ya no es de desarrollo sino de corrida operativa real.
- Aun no esta completada la migracion global de formularios hacia UX simple + completa.
- Estado real de formularios:
  - `catalog/new` y `catalog/[id]`: ya reencuadrados como ficha continua, sin semantica de paso obligatoria.
  - `entries-form.tsx`: ya migrado a formulario unico sin wizard.
  - `transfers-form.tsx`: ya migrado a formulario unico sin wizard.
  - `adjust-form.tsx`: ya migrado a formulario unico sin wizard.
  - `loc-create-form.tsx` y `loc-edit-form.tsx`: ya migrados a formulario unico sin wizard y mas alineados entre create/edit.
  - `count-initial-form.tsx`: ya migrado a formulario unico sin wizard.
  - `production-batch-form.tsx`: ya migrado a formulario unico sin wizard, aunque el modulo siga fuera de v1.
  - `remissions`: hub, create y detalle ya reencuadrados al flujo oficial; la solicitud ya opera como formulario unico sin wizard.
  - Ya no quedan formularios operativos principales con wizard puro en el backlog revisado.
- Componentes nuevos usados para bajar complejidad:
  - `src/features/inventory/catalog/product-cost-status-panel.tsx`
  - `src/features/inventory/catalog/product-purchase-section.tsx`
  - `src/features/inventory/catalog/product-site-availability-section.tsx`
  - `src/features/inventory/catalog/product-uom-profile-panel.tsx`
  - `src/features/inventory/catalog/product-photo-section.tsx`
  - `src/features/inventory/catalog/product-checklist-panel.tsx`
  - `src/features/inventory/catalog/product-form-footer.tsx`

### Siguiente corte recomendado
- Ya no toca abrir otro frente de producto para v1 salvo que la corrida operativa encuentre un hueco real.
- Ya quedó aterrizada la migración de categorías maestras de `venta`:
  - árbol nuevo global `Venta` con hijas maestras operativas;
  - mapeo heredado `menu -> maestro` documentado en `docs/MIGRACION-CATEGORIAS-VENTA-V1.md`;
  - migración SQL creada en `vento-shell` para crear categorías y mover productos `venta` existentes sin borrar categorías heredadas.
  - ya hubo una segunda pasada para cubrir heredados activos no incluidos en el primer mapeo (`Bebidas Listas (RTD)`, `HORNEADOS`, `VITRINA`).
  - corrida auditada despues de aplicar ambas migraciones:
    - `Panaderia y bolleria`: 14
    - `Bebidas frias`: 13
    - `Cocteles y alcohol`: 2
    - `Otros de venta`: 0
  - tercera pasada aplicada para corregir falsos positivos de alcohol por substring; despues de eso solo quedaron cervezas reales en `Cocteles y alcohol`.
  - categorias heredadas de `venta` ya quedaron desactivadas en v1 para que formularios y filtros no las sigan ofreciendo; se conservan solo como material de migracion a comerciales en v2.
  - auditado despues de la quinta migracion de limpieza dura:
    - solo quedan activas `15` categorias canonicas de `venta` en total (`Venta` + `14` hijas maestras `venta-*`);
    - las heredadas quedan inactivas y marcadas como `LEGACY COMERCIAL v1`.
  - endurecimiento UI/server aplicado en catalogo `new` y `edit` para `venta`:
    - la seleccion ya fuerza arbol global (sin `scope/domain` transicional en la vista);
    - backend ya rechaza categorias inactivas y categorias `venta` con `site_id` o `domain`.
- Siguiente foco concreto: ejecutar la corrida `Centro + Saudo` con los 3 casos de `docs/SIMULACION-REMISIONES.md` y decidir con eso si `v1` queda cerrable.
- Backlog UX create/edit:
  - remisiones ya quedo dentro del patron simple + completo; los siguientes refinamientos UX deben concentrarse otra vez en preparacion y recepcion, no en agregar mas peso al create.
  - usar `entries-form.tsx`, `transfers-form.tsx`, `adjust-form.tsx`, `count-initial-form.tsx`, `production-batch-form.tsx` y los formularios de LOC como patron para los siguientes formularios create/edit.

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

### 2026-03-17 - Sandbox reversible para validar v1

Se dejo un sandbox de validacion v1 preparado desde `vento-shell` para no depender del inventario inicial real.

Incluye:
- productos artificiales `SBXV1-*`;
- `LOCs` `LOC-CP-SBX-*`;
- stock minimo en `Centro`;
- activacion en `Centro` y `Saudo`;
- script de cleanup que crea una migracion y borra todo el sandbox.

Referencia:
- `docs/SANDBOX-VALIDACION-V1.md`

Follow-up:
- se corrigio el sandbox para que los `product_site_settings` de `SBXV1-*` queden con `audience = BOTH`, porque remisiones filtra por audiencia operativa y con `null` no aparecian en `Saudo`.
- en detalle de remisiones, la preparacion paso a flujo progresivo: menos KPIs, sin UUIDs visibles, menos paneles tecnicos y campos que aparecen por etapa (`LOC -> preparado -> enviado`).
- hub/detalle de remisiones quedaron mas dirigidos por rol y sede: `Centro` ve preparar/despachar con CTA grandes; `satelite` ve pedir/recibir con copy corto y menos decisiones simultaneas. El siguiente refinamiento UX debe seguir empujando acciones tactiles y revelar campos solo cuando hacen falta.
- se definio criterio transversal de experiencia por rol en `docs/EXPERIENCIA-OPERATIVA-POR-ROL-V1.md` y se aplico el primer corte a `home` y `sidebar`: satelite entra en pedir/recibir; centro entra en preparar/despachar; gestion mantiene una vista mas amplia.
- `stock`, `scanner` y `withdraw` ya entraron en ese mismo criterio:
  - `stock` muestra home/cta y filtros mas cortos para operacion; deja categoria y taxonomia en filtros avanzados cuando el usuario es operario;
  - `scanner` ahora se comporta como enrutador de accion inmediata segun contexto, no como decodificador tecnico;
  - `withdraw` ya prioriza el LOC escaneado, oculta el cambio manual detras de un plegable y refuerza el retiro rapido desde tablet/celular.
- `entries`, `transfers` y `adjust` ya recibieron el siguiente corte progresivo:
  - `entries` deja proveedor/fecha al frente y manda factura/notas a detalles opcionales;
  - `transfers` no deja capturar items hasta que origen y destino ya estan definidos;
  - `adjust` cambia de cantidad con signo a flujo mas natural: `sumar/restar` + cantidad, con costo/evidencia escondidos como opcionales.
- tambien se simplificaron las filas internas de `entries` y `transfers`:
  - cada item ahora comunica `Listo/Pendiente` y deja visibles solo producto, cantidad, unidad y, cuando aplica, LOC;
  - notas, conversiones, costo y otros datos secundarios quedan escondidos en detalles opcionales;
  - se corrigio el envio de `FormData` para que filas incompletas no rompan la alineacion de arrays al guardar.
- en detalle de remisiones, la seleccion de `LOC` ya no depende primero de un `select`:
  - ahora aparecen 2-3 LOC sugeridos como tarjetas tactiles para tocar y seguir;
  - elegir un LOC guarda la linea y habilita el siguiente paso (`preparado` / `enviado`);
  - el selector completo queda como respaldo dentro de `Ver más LOCs`.
- tambien en detalle de remisiones, `preparado` y `enviado` ya pasaron a acciones rapidas por linea:
  - `Preparar` propone una accion principal segun el stock del LOC elegido;
  - `Enviar` propone `enviar preparado` como siguiente paso natural;
  - la escritura manual queda escondida en `Ajustar manualmente`, como respaldo y no como entrada principal.
- la recepcion por linea ya sigue el mismo criterio:
  - `Recibir todo` y `Marcar faltante` aparecen como acciones principales;
  - `Limpiar` queda disponible cuando ya hubo movimiento en la linea;
  - `Recibido/Faltante` manual quedan escondidos en `Ajustar manualmente`.
- `home` y el hub de `remisiones` ya se recortaron mas para operacion:
  - satelite entra con foco en recibir primero y crear nueva solicitud solo cuando hace falta;
  - Centro entra con foco en abrir la siguiente solicitud o la cola de preparacion;
  - cambio de sede y configuracion contextual ya no quedan tan expuestos en primer plano para operarios.
- el mismo criterio ya se aplico a `scanner`, `withdraw` y `entries`:
  - `scanner` deja una sola accion principal visible y manda formatos/acciones secundarias a plegables;
  - `withdraw` deja el LOC activo al frente y esconde cambio manual + notas/detalles como respaldo;
  - `entries` ya no muestra captura de productos hasta que proveedor/fecha (y motivo si aplica) esten completos.
- tambien se ajustaron `transfers` y `adjust` con el mismo criterio:
  - `transfers` ya no muestra destino ni nota hasta que el origen esta definido;
  - `adjust` ya no pide motivo/evidencia desde el inicio; primero se elige producto, sentido y cantidad, y luego aparece el motivo.
- `locations` y `catalog` ya recibieron un recorte similar para bajar ruido administrativo:
  - `locations` ahora prioriza `nombre visible + sede + zona`; el codigo tecnico queda plegado y el listado muestra primero el nombre humano del LOC;
  - `catalog` movio criterio v1, arbol de categorias, guias, foto, checklist y otros bloques de apoyo a paneles opcionales, para dejar al frente solo lo necesario para crear o editar el maestro.
- se empezo a materializar el flujo `QR de LOC -> landing -> retiro o contenido`:
  - se creo un resolver de QR por codigo (`inventory/locations/open`) para no depender de abrir retiro directo;
  - ya existe una landing por LOC con dos acciones claras: `Retirar de aqui` y `Ver contenido`;
  - tambien quedo el primer `LOC Board`, pensado para tablet/pantalla fija, con contenido visual del LOC y acceso a modo kiosco;
  - scanner e impresion de etiquetas ahora apuntan a esa nueva landing en lugar de mandar directo a retiro.
- el `LOC Board` ya recibio el primer corte de kiosco real:
  - actualizacion automatica cada 30s;
  - sello visible de ultima actualizacion;
  - composicion mas limpia para pantalla fija cuando se abre con `?kiosk=1`.
- tambien ya existe un `Zona Board`:
  - permite ver varios LOCs de una misma zona en una sola pantalla fija;
  - se enlaza desde la landing del LOC y desde el board individual;
  - queda como la opcion mas realista antes de pensar en una pantalla por cada LOC.
- se hizo el primer corte de orden en `printing`:
  - `setup` ahora comunica mejor que hoy la impresora se deja lista via Browser Print, sin vender Bluetooth/Wi-Fi como si ya estuvieran resueltos dentro de Nexo;
  - `jobs` se recorto a flujo principal `elegir formato -> cola -> vista previa -> imprimir`, moviendo pruebas finas a un plegable;
  - la vista previa de `LOC QR` ya muestra explicitamente el destino real del QR.
- en detalle de remisiones se corrigieron dos fallos reales del flujo tactil:
  - elegir un `LOC` desde tarjeta sugerida o desde `Ver mas LOCs` ya no cae en `Selecciona un LOC para continuar`, porque ahora cada accion envia su propio formulario explicito y no depende del formulario global de items;
  - `Dividir automaticamente` ya no cae en `Falta la linea a partir`, por la misma razon;
  - ademas, los CTA superiores (`Empezar preparacion`, `Despachar`, `Cancelar`) se bajaron de peso en escritorio para que no se vean sobredimensionados fuera de tablet/movil.
- se corrigio un segundo bloque del flujo de preparacion por lineas partidas:
  - las acciones rapidas `Preparar`, `Enviar`, `Recibir` y `Marcar faltante` tambien quedaron desacopladas del formulario grande para que no vuelvan a caer en `No se pudo aplicar la accion rapida`;
  - la sugerencia de `LOC` ya no prioriza simplemente el stock mas alto, sino el mejor ajuste para la cantidad de esa linea (`best fit`);
  - cuando un mismo producto se divide en varias lineas, ahora cada tarjeta marca `Linea X de N` y resalta mejor la cantidad a preparar para que no se pierda entre el ruido visual.
- `locations` ya tiene una capa de saneamiento para LOCs actuales:
  - se agregaron sugerencias automaticas de nombre humano a partir de `zona + pasillo + nivel`, sin tocar el codigo tecnico;
  - el listado muestra esa sugerencia cuando un LOC sigue sin `description`;
  - hay accion para aplicar la sugerencia una por una o en lote sobre los LOCs visibles, con la idea de que la operacion deje de depender de leer `LOC-...` para entender desde donde saca o guarda stock.
- la preparacion en detalle de remisiones se recorto otra vez porque seguia saturada:
  - ya no aparece `Despachar a destino` mientras sigan lineas sin terminar;
  - `Cancelar` dejo de competir como CTA primario en escritorio;
  - se saco la barra explicativa de flujo;
  - cada linea ahora muestra solo el siguiente paso que toca (`elige LOC` o `prepara` o `envia`), en vez de tres bloques simultaneos;
  - cuando una linea ya quedo lista, solo se muestra el resumen de exito y una opcion secundaria para cambiarla.
- se hizo una pasada extra para que la linea se sienta mas como tarea y menos como formulario:
  - menos chips y menos lenguaje de `paso 1/2/3`;
  - la cantidad a preparar queda mas protagonista;
  - la etiqueta principal ahora dice `Ahora: ...` o `Hecha`, para que el operario entienda rapido que sigue;
  - el LOC elegido ya no compite con todas las opciones a la vez; cuando ya existe, la pantalla lo resume y deja `Cambiar LOC` en segundo plano.
- se mejoro la confianza visual del cambio de estado en detalle de remisiones:
  - la linea tocada vuelve marcada con un realce verde y mensaje inline (`Preparacion guardada`, `Salida confirmada`, etc.), en vez de depender solo del aviso global;
  - el badge principal de cantidad ya cambia con el estado (`por preparar`, `preparadas`, `listas`, `recibidas`);
  - se corrigio un falso negativo visual donde, aun con un LOC ya elegido, seguia apareciendo `No hay LOC con stock para este producto`.
- se corrigio la logica base de la preparacion para quitar duplicaciones del flujo:
  - ya no existe `Empezar preparacion` como CTA previo; la remision entra en `preparing` al tocar la primera accion real de linea (`elegir LOC`, `dividir`, `preparar`);
  - se quito `Guardar preparación / Guardar recepción` global, porque las lineas ya persisten cada accion por separado;
  - se quitaron inputs manuales visibles que no tenian un guardado inmediato asociado;
  - la pantalla ahora apunta a un modelo mas claro: una accion real por linea, y la accion global (`Despachar`, `Recibir`) solo cuando el estado ya la permite.
- se dio un siguiente corte para bajar el numero de toques en preparacion:
  - una tarjeta de `LOC` sugerido ya puede dejar la linea lista en un solo toque cuando ese LOC cubre completa la cantidad;
  - cuando la linea ya tiene LOC, el boton principal paso a ser `Dejar lista ...` en lugar de `Preparar` y luego `Enviar`;
  - con eso el flujo esperado para bodega baja a: `dividir -> tocar LOC/linea -> despachar`, en vez de `elegir LOC -> preparar -> enviar -> guardar`.
- ajuste visual fino en detalle de remisiones:
  - los CTA principales pasaron a estilo mas compacto y menos vistoso en desktop;
  - se estandarizo el label de unidad para que `un` se muestre como `Unidades`, mejorando lectura para operacion.
- recepcion parcial en detalle de remisiones:
  - `Cambiar o ajustar` ya permite registrar `cantidad recibida` distinta al total enviado;
  - el faltante se calcula automaticamente como `enviado - recibido`, para cerrar casos parciales (Caso C) sin forzar `todo o nada`.
- se reconoce que, aun con esos ajustes, el problema de remisiones sigue siendo de arquitectura y no de microcopys o cards:
  - la vista actual todavia mezcla demasiadas capas del flujo;
  - se congela el enfoque de seguir parchando el detalle actual como solucion principal;
  - la arquitectura correcta ya queda documentada en `docs/EXPERIENCIA-OPERATIVA-POR-ROL-V1.md`:
    - `Bandeja`
    - `Nueva remision`
    - `Detalle`
    - `Modo preparacion`
    - `Modo recepcion`
  - el siguiente rediseño real de remisiones debe partir de ese modelo, no de la vista actual.

### Reorientacion inmediata de remisiones

Lo siguiente ya no es “seguir afinando botones” en el detalle actual.

El frente correcto queda asi:

1. Rehacer la `Bandeja de remisiones` como entrada principal del modulo.
2. Dejar `Nueva remision` como vista exclusiva de solicitud.
3. Rehacer `Detalle de remision` como documento central con timeline, responsables, historial y contexto estable.
4. Sacar `Modo preparacion` como variante operativa del detalle para `Centro`.
5. Sacar `Modo recepcion` como variante operativa del detalle para satelite.

Objetivo:
- bajar carga mental;
- bajar cantidad de toques;
- hacer evidente el siguiente paso;
- dejar de depender de leer para operar.
- primer corte ya ejecutado sobre esa direccion:
  - `/inventory/remissions` dejo de mezclar en un mismo bloque el contexto, la creacion y toda la lista;
  - la pantalla ya se separa en `Requieren accion ahora`, `Nueva remision` y `Historial reciente`;
  - esto deja a remisiones mucho mas cerca de `bandeja + crear`, y marca mejor el siguiente frente: `detalle + modo preparacion + modo recepcion`.

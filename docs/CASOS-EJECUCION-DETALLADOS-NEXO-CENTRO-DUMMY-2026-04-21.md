# CASOS-EJECUCION-DETALLADOS-NEXO-CENTRO-DUMMY-2026-04-21

## Alcance
Esta guia usa el seed reversible `supabase/seed_test_nexo_cp_center.sql` para validar NEXO en el Centro con inventario dummy.

No cubre ORIGO ni FOGO completos. Si una prueba requiere datos reales de compra, recepcion o lote, queda fuera de esta ronda.

## Precondiciones obligatorias
Antes de empezar, confirma todo esto:

- Ya imprimiste y pegaste los 6 QR reales del Centro.
- Ya corriste `supabase/seed_test_nexo_cp_center.sql`.
- Tu cuenta tiene permisos para ver stock, movimientos y retiros en `CENTRO_PROD`.
- Tu sede activa es `Centro de Produccion`.
- Estas probando con una sola cuenta y, si cambias rol o sede, recargas el modulo antes de seguir.

## LOCs validos para esta ronda
- `LOC-CP-BOD-MAIN` | Bodega principal
- `LOC-CP-SECOS1-MAIN` | Secos
- `LOC-CP-FRIO-MAIN` | Cuarto frio
- `LOC-CP-CONG-MAIN` | Congelados
- `LOC-CP-N2P-MAIN` | Nevera produccion
- `LOC-CP-N3P-MAIN` | Nevera despacho

## Productos dummy esperados
- `TEST NEXO CP Bodega principal` (`TEST-NEXO-CP-001`) | 10 un | Bodega principal
- `TEST NEXO CP Secos` (`TEST-NEXO-CP-002`) | 10 un | Secos
- `TEST NEXO CP Cuarto frio` (`TEST-NEXO-CP-003`) | 8 un | Cuarto frio
- `TEST NEXO CP Congelados` (`TEST-NEXO-CP-004`) | 6 un | Congelados
- `TEST NEXO CP Nevera produccion` (`TEST-NEXO-CP-005`) | 4 un | Nevera produccion
- `TEST NEXO CP Nevera despacho` (`TEST-NEXO-CP-006`) | 3 un | Nevera despacho
- `TEST NEXO CP Multi LOC` (`TEST-NEXO-CP-007`) | 5 un en Bodega principal y 7 un en Secos

## Regla de ejecucion
No ejecutes casos en desorden.

Orden correcto:
1. Smoke de QR y landing.
2. Ver contenido por LOC.
3. Retiros validos.
4. Retiros invalidos.
5. Validacion de movimientos.
6. Validacion de permisos y sede.
7. Limpieza.

---

## BLOQUE 1. Smoke de QR y landing

### Caso NEXO-QR-001 | QR de Bodega principal
Objetivo: confirmar que el QR abre el landing correcto.

Pasos:
1. Con el celular, escanea el QR pegado en `Bodega principal`.
2. Espera a que abra el navegador.
3. Verifica la URL.
4. Verifica el nombre visible del LOC.
5. Verifica que la sede mostrada sea la del Centro.
6. Verifica que existan acciones como `Ver contenido` y `Retirar de aqui`.

Resultado esperado:
- La URL abre el landing del LOC correcto.
- El nombre visible es `Bodega principal`.
- No abre stock global.
- No abre una lista genérica de ubicaciones.

### Caso NEXO-QR-002 | QR de Secos
Pasos:
1. Escanea el QR de `Secos`.
2. Verifica nombre visible.
3. Verifica sede.
4. Verifica acciones disponibles.

Resultado esperado:
- Abre el landing de `Secos`.
- No te saca a otro LOC.

### Caso NEXO-QR-003 | QR de Cuarto frio
Repite la misma secuencia para `Cuarto frio`.

### Caso NEXO-QR-004 | QR de Congelados
Repite la misma secuencia para `Congelados`.

### Caso NEXO-QR-005 | QR de Nevera produccion
Repite la misma secuencia para `Nevera produccion`.

### Caso NEXO-QR-006 | QR de Nevera despacho
Repite la misma secuencia para `Nevera despacho`.

Criterio de cierre del bloque:
- Los 6 QR deben abrir el LOC correcto.
- Si uno falla, no sigas a los retiros de ese LOC hasta corregirlo.

---

## BLOQUE 2. Ver contenido por LOC

### Caso NEXO-STK-001 | Ver contenido en Bodega principal
Objetivo: confirmar que el landing muestra el inventario correcto para ese LOC.

Pasos:
1. Escanea `Bodega principal`.
2. Toca `Ver contenido`.
3. Revisa la lista completa.
4. Busca `TEST NEXO CP Bodega principal` (`TEST-NEXO-CP-001`).
5. Busca `TEST NEXO CP Multi LOC` (`TEST-NEXO-CP-007`).
6. Confirma las cantidades visibles.

Resultado esperado:
- Debe aparecer `TEST NEXO CP Bodega principal` (`TEST-NEXO-CP-001`) con 10 unidades.
- Debe aparecer `TEST NEXO CP Multi LOC` (`TEST-NEXO-CP-007`) con 5 unidades.
- No deben aparecer productos de `Secos`, `Cuarto frio`, `Congelados`, `N2P` o `N3P`.

### Caso NEXO-STK-002 | Ver contenido en Secos
Pasos:
1. Escanea `Secos`.
2. Toca `Ver contenido`.
3. Busca `TEST NEXO CP Secos` (`TEST-NEXO-CP-002`).
4. Busca `TEST NEXO CP Multi LOC` (`TEST-NEXO-CP-007`).

Resultado esperado:
- Debe aparecer `TEST NEXO CP Secos` (`TEST-NEXO-CP-002`) con 10.
- Debe aparecer `TEST NEXO CP Multi LOC` (`TEST-NEXO-CP-007`) con 7.

### Caso NEXO-STK-003 | Ver contenido en Cuarto frio
Resultado esperado:
- Solo debe aparecer `TEST NEXO CP Cuarto frio` (`TEST-NEXO-CP-003`) con 8.

### Caso NEXO-STK-004 | Ver contenido en Congelados
Resultado esperado:
- Solo debe aparecer `TEST NEXO CP Congelados` (`TEST-NEXO-CP-004`) con 6.

### Caso NEXO-STK-005 | Ver contenido en Nevera produccion
Resultado esperado:
- Solo debe aparecer `TEST NEXO CP Nevera produccion` (`TEST-NEXO-CP-005`) con 4.

### Caso NEXO-STK-006 | Ver contenido en Nevera despacho
Resultado esperado:
- Solo debe aparecer `TEST NEXO CP Nevera despacho` (`TEST-NEXO-CP-006`) con 3.

Criterio de cierre del bloque:
- Cada LOC debe mostrar solo su contenido.
- Si aparece stock de otro LOC, registrar bug critico.

---

## BLOQUE 3. Retiros validos

### Caso NEXO-WDR-001 | Retiro valido simple desde Bodega principal
Objetivo: confirmar retiro normal desde un LOC.

Pasos:
1. Escanea `Bodega principal`.
2. Toca `Retirar de aqui`.
3. Busca `TEST NEXO CP Bodega principal` (`TEST-NEXO-CP-001`).
4. Selecciona ese producto.
5. Ingresa cantidad `2`.
6. Completa el motivo o detalle si la pantalla lo pide.
7. Confirma el retiro.
8. Espera el resultado.

Resultado esperado:
- El retiro se registra sin error.
- La pantalla vuelve al landing de `Bodega principal`.
- Debe aparecer mensaje de confirmacion de retiro.

Validacion posterior:
1. Toca `Ver contenido`.
2. Revisa `TEST NEXO CP Bodega principal` (`TEST-NEXO-CP-001`).

Resultado esperado posterior:
- `TEST NEXO CP Bodega principal` (`TEST-NEXO-CP-001`) debe quedar en 8 unidades.

### Caso NEXO-WDR-002 | Retiro valido desde Secos
Pasos:
1. Escanea `Secos`.
2. Toca `Retirar de aqui`.
3. Selecciona `TEST NEXO CP Secos` (`TEST-NEXO-CP-002`).
4. Retira `3` unidades.
5. Confirma.
6. Vuelve a `Ver contenido`.

Resultado esperado:
- El producto queda en 7 unidades.
- El flujo vuelve al landing de `Secos`.

### Caso NEXO-WDR-003 | Retiro valido desde producto multi-LOC en Bodega principal
Pasos:
1. Escanea `Bodega principal`.
2. Toca `Retirar de aqui`.
3. Selecciona `TEST NEXO CP Multi LOC` (`TEST-NEXO-CP-007`).
4. Retira `1` unidad.
5. Confirma.
6. Revisa `Ver contenido`.

Resultado esperado:
- En `Bodega principal`, `TEST NEXO CP Multi LOC` (`TEST-NEXO-CP-007`) queda en 4.
- En `Secos`, `TEST NEXO CP Multi LOC` (`TEST-NEXO-CP-007`) debe seguir en 7.

### Caso NEXO-WDR-004 | Retiro valido desde Nevera produccion
Pasos:
1. Escanea `Nevera produccion`.
2. Retira `1` unidad de `TEST NEXO CP Nevera produccion` (`TEST-NEXO-CP-005`).
3. Confirma.

Resultado esperado:
- El producto queda en 3.
- El flujo vuelve al landing de `Nevera produccion`.

Criterio de cierre del bloque:
- Todos los retiros validos descuentan stock solo en el LOC actual.
- Todos vuelven al landing del LOC, no a stock global.

---

## BLOQUE 4. Retiros invalidos

### Caso NEXO-WDR-005 | Intentar retirar mas de lo disponible
Objetivo: confirmar bloqueo por sobre-retiro.

Pasos:
1. Escanea `Congelados`.
2. Toca `Retirar de aqui`.
3. Selecciona `TEST NEXO CP Congelados` (`TEST-NEXO-CP-004`).
4. Intenta retirar `99` unidades.
5. Confirma.

Resultado esperado:
- La aplicacion debe bloquear el retiro o devolver error controlado.
- No debe descontar stock.

Validacion posterior:
1. Vuelve a `Ver contenido`.
2. Revisa `TEST NEXO CP Congelados` (`TEST-NEXO-CP-004`).

Resultado esperado posterior:
- Debe seguir en 6.

### Caso NEXO-WDR-006 | Intentar retirar cero o vacio
Pasos:
1. Escanea `Cuarto frio`.
2. Toca `Retirar de aqui`.
3. Selecciona `TEST NEXO CP Cuarto frio` (`TEST-NEXO-CP-003`).
4. Deja cantidad vacia o en `0`.
5. Intenta confirmar.

Resultado esperado:
- Debe exigir una cantidad valida.
- No debe registrar movimiento.

### Caso NEXO-WDR-007 | Confirmar que no aparecen productos de otro LOC
Pasos:
1. Escanea `Nevera despacho`.
2. Toca `Retirar de aqui`.
3. Recorre la lista.

Resultado esperado:
- Solo debe aparecer `TEST NEXO CP Nevera despacho` (`TEST-NEXO-CP-006`).
- No deben aparecer `TEST NEXO CP Bodega principal`, `TEST NEXO CP Secos`, `TEST NEXO CP Cuarto frio`, `TEST NEXO CP Congelados` ni `TEST NEXO CP Nevera produccion`.

---

## BLOQUE 5. Movimientos y trazabilidad

### Caso NEXO-MOV-001 | Ver movimientos del retiro de Bodega principal
Objetivo: confirmar trazabilidad de un retiro ya ejecutado.

Pasos:
1. Entra a `Movimientos` en NEXO.
2. Filtra por sede `Centro de Produccion` si la pantalla lo permite.
3. Busca `TEST NEXO CP Bodega principal` (`TEST-NEXO-CP-001`).
4. Revisa los registros mas recientes.

Resultado esperado:
- Debes encontrar el movimiento de entrada dummy inicial.
- Debes encontrar el retiro que ejecutaste en la prueba.
- Las cantidades deben ser coherentes con el saldo actual.

### Caso NEXO-MOV-002 | Ver movimiento del producto multi-LOC
Pasos:
1. Busca `TEST NEXO CP Multi LOC` (`TEST-NEXO-CP-007`).
2. Revisa entradas y retiro.

Resultado esperado:
- Debes ver que el producto existe con seed en dos LOCs.
- El retiro desde `Bodega principal` no debe borrar ni alterar el tramo de `Secos`.

---

## BLOQUE 6. Permisos y sede con tu misma cuenta

En este bloque no vas a probar “roles al azar”.
Vas a probar roles exactos contra la matriz real de la base de datos.

Regla fija para todos los casos de este bloque:
1. Cambia el rol indicado.
2. Cambia la sede indicada.
3. Vuelve al home.
4. Recarga la app.
5. Revisa primero el menu lateral.
6. Luego abre las rutas indicadas.
7. Registra exactamente lo que si aparece y lo que no.

---

### Caso NEXO-PRM-001 | Rol bodeguero en Centro de Produccion
Objetivo: confirmar la vista operativa completa de bodega en Centro.

Contexto exacto:
- Rol: `bodeguero`
- Sede: `Centro de Produccion`

Pasos:
1. Cambia tu rol a `bodeguero`.
2. Cambia tu sede a `Centro de Produccion`.
3. Vuelve al home.
4. Recarga la app.
5. Abre el menu lateral.
6. Revisa las opciones visibles.
7. Entra una por una a estas rutas:
   - `/inventory/entries`
   - `/inventory/remissions`
   - `/inventory/count-initial`
   - `/inventory/transfers`
   - `/inventory/withdraw`
   - `/inventory/adjust`
   - `/inventory/stock`
   - `/inventory/movements`
   - `/inventory/validation/locs`
   - `/printing/jobs`

Debe aparecer en menu:
- `Panel`
- `Entradas`
- `Abastecimiento interno`
- `Conteos`
- `Traslados`
- `Retiros`
- `Ajustes`
- `Stock`
- `Movimientos`
- `Checklist`
- `Validacion de LOCs`
- `Impresion`

No debe aparecer en menu:
- `Productos`
- `Ubicaciones`
- `Rutas`
- `Areas remision`
- `Sedes`
- `Unidades`
- `Categorias`
- `Lotes de produccion`

Resultado esperado:
- `bodeguero` puede operar inventario del Centro.
- `bodeguero` no puede ver maestros administrativos.

---

### Caso NEXO-PRM-002 | Rol conductor en Centro de Produccion
Objetivo: confirmar que conductor solo ve remisiones en transito.

Contexto exacto:
- Rol: `conductor`
- Sede: `Centro de Produccion`

Pasos:
1. Cambia tu rol a `conductor`.
2. Cambia tu sede a `Centro de Produccion`.
3. Vuelve al home.
4. Recarga la app.
5. Abre el menu lateral.
6. Entra a `/inventory/remissions`.
7. Intenta abrir manualmente estas rutas:
   - `/inventory/entries`
   - `/inventory/count-initial`
   - `/inventory/transfers`
   - `/inventory/withdraw`
   - `/inventory/stock`
   - `/inventory/movements`
   - `/printing/jobs`

Debe aparecer en menu:
- `Panel`
- `Remisiones en transito`

No debe aparecer en menu:
- `Entradas`
- `Conteos`
- `Traslados`
- `Retiros`
- `Ajustes`
- `Stock`
- `Movimientos`
- `Checklist`
- `Validacion de LOCs`
- `Impresion`
- cualquier vista de configuracion

Resultado esperado:
- `conductor` solo opera traslado, entrega y recepcion en ruta.
- Si alguna de las rutas prohibidas abre normal, registrar `FAIL`.

---

### Caso NEXO-PRM-003 | Rol cajero en sede satelite
Objetivo: confirmar que cajero solo pide, recibe y retira.

Contexto exacto:
- Rol: `cajero`
- Sede: una sede tipo `Satelite`

Pasos:
1. Cambia tu rol a `cajero`.
2. Cambia tu sede a una sede tipo `Satelite`.
3. Vuelve al home.
4. Recarga la app.
5. Abre el menu lateral.
6. Entra a `/inventory/remissions`.
7. Entra a `/inventory/withdraw`.
8. Intenta abrir manualmente:
   - `/inventory/entries`
   - `/inventory/count-initial`
   - `/inventory/transfers`
   - `/inventory/adjust`
   - `/inventory/stock`
   - `/inventory/movements`
   - `/printing/jobs`

Debe aparecer en menu:
- `Panel`
- `Pedir y recibir`
- `Retiros`

No debe aparecer en menu:
- `Entradas`
- `Conteos`
- `Traslados`
- `Ajustes`
- `Stock`
- `Movimientos`
- `Checklist`
- `Validacion de LOCs`
- `Impresion`
- cualquier configuracion

Resultado esperado:
- `cajero` puede solicitar remision, editar la propia pendiente, recibir y retirar.
- `cajero` no ve inventario administrativo ni configuraciones.

---

### Caso NEXO-PRM-004 | Rol barista en sede satelite
Objetivo: confirmar que barista tiene el mismo recorte operativo que cajero.

Contexto exacto:
- Rol: `barista`
- Sede: una sede tipo `Satelite`

Pasos:
1. Cambia tu rol a `barista`.
2. Cambia tu sede a una sede tipo `Satelite`.
3. Vuelve al home.
4. Recarga la app.
5. Abre el menu lateral.
6. Repite la misma validacion del caso `NEXO-PRM-003`.

Debe aparecer en menu:
- `Panel`
- `Pedir y recibir`
- `Retiros`

No debe aparecer en menu:
- el mismo listado prohibido de `cajero`

Resultado esperado:
- `barista` queda con la misma experiencia operativa de satelite que `cajero`.

---

### Caso NEXO-PRM-005 | Rol cocinero en Centro de Produccion
Objetivo: confirmar que cocinero de Centro solo ve retiros y lotes.

Contexto exacto:
- Rol: `cocinero`
- Sede: `Centro de Produccion`

Pasos:
1. Cambia tu rol a `cocinero`.
2. Cambia tu sede a `Centro de Produccion`.
3. Vuelve al home.
4. Recarga la app.
5. Abre el menu lateral.
6. Entra a:
   - `/inventory/withdraw`
   - `/inventory/production-batches`
7. Intenta abrir manualmente:
   - `/inventory/remissions`
   - `/inventory/entries`
   - `/inventory/count-initial`
   - `/inventory/transfers`
   - `/inventory/adjust`
   - `/inventory/stock`
   - `/inventory/movements`
   - `/printing/jobs`

Debe aparecer en menu:
- `Panel`
- `Retiros`
- `Lotes de produccion`

No debe aparecer en menu:
- `Pedir y recibir`
- `Entradas`
- `Conteos`
- `Traslados`
- `Ajustes`
- `Stock`
- `Movimientos`
- `Checklist`
- `Validacion de LOCs`
- `Impresion`
- cualquier configuracion

Resultado esperado:
- `cocinero` de Centro puede retirar y operar su flujo de produccion.
- `cocinero` no ve vistas administrativas de inventario.

---

### Caso NEXO-PRM-005B | Rol cocinero en sede satelite
Objetivo: confirmar que cocinero de satelite pide, recibe y retira, pero no opera lotes.

Contexto exacto:
- Rol: `cocinero`
- Sede: una sede tipo `Satelite`

Pasos:
1. Cambia tu rol a `cocinero`.
2. Cambia tu sede a una sede tipo `Satelite`.
3. Vuelve al home.
4. Recarga la app.
5. Abre el menu lateral.
6. Entra a:
   - `/inventory/remissions`
   - `/inventory/withdraw`
7. Intenta abrir manualmente:
   - `/inventory/production-batches`
   - `/inventory/entries`
   - `/inventory/count-initial`
   - `/inventory/transfers`
   - `/inventory/adjust`
   - `/inventory/stock`
   - `/inventory/movements`
   - `/printing/jobs`

Debe aparecer en menu:
- `Panel`
- `Pedir y recibir`
- `Retiros`

No debe aparecer en menu:
- `Lotes de produccion`
- `Entradas`
- `Conteos`
- `Traslados`
- `Ajustes`
- `Stock`
- `Movimientos`
- `Impresion`
- cualquier configuracion

Resultado esperado:
- `cocinero` de satelite puede pedir, recibir y retirar.
- `cocinero` de satelite no debe ver lotes de produccion ni vistas administrativas.

---

### Caso NEXO-PRM-006 | Rol panadero en Centro de Produccion
Objetivo: confirmar recorte operativo minimo para panaderia.

Contexto exacto:
- Rol: `panadero`
- Sede: `Centro de Produccion`

Pasos:
1. Cambia tu rol a `panadero`.
2. Cambia tu sede a `Centro de Produccion`.
3. Vuelve al home.
4. Recarga la app.
5. Abre el menu lateral.
6. Entra a:
   - `/inventory/withdraw`
   - `/inventory/production-batches`
7. Intenta abrir manualmente:
   - `/inventory/remissions`
   - `/inventory/entries`
   - `/inventory/count-initial`
   - `/inventory/transfers`
   - `/inventory/adjust`
   - `/inventory/stock`
   - `/inventory/movements`
   - `/printing/jobs`

Debe aparecer en menu:
- `Panel`
- `Retiros`
- `Lotes de produccion`

No debe aparecer en menu:
- `Pedir y recibir`
- `Entradas`
- `Conteos`
- `Traslados`
- `Ajustes`
- `Stock`
- `Movimientos`
- `Checklist`
- `Validacion de LOCs`
- `Impresion`
- cualquier configuracion

Resultado esperado:
- `panadero` solo puede retirar y consultar lotes.

---

### Caso NEXO-PRM-007 | Rol repostero en Centro de Produccion
Objetivo: confirmar que repostero tiene el mismo recorte que panadero.

Contexto exacto:
- Rol: `repostero`
- Sede: `Centro de Produccion`

Pasos:
1. Cambia tu rol a `repostero`.
2. Cambia tu sede a `Centro de Produccion`.
3. Vuelve al home.
4. Recarga la app.
5. Repite la validacion del caso `NEXO-PRM-006`.

Debe aparecer en menu:
- `Panel`
- `Retiros`
- `Lotes de produccion`

No debe aparecer en menu:
- el mismo listado prohibido de `panadero`

Resultado esperado:
- `repostero` queda con el mismo alcance operativo minimo de produccion.

---

### Caso NEXO-PRM-008 | Rol pastelero en Centro de Produccion
Objetivo: confirmar que pastelero tiene el mismo recorte que panadero y repostero.

Contexto exacto:
- Rol: `pastelero`
- Sede: `Centro de Produccion`

Pasos:
1. Cambia tu rol a `pastelero`.
2. Cambia tu sede a `Centro de Produccion`.
3. Vuelve al home.
4. Recarga la app.
5. Repite la validacion del caso `NEXO-PRM-006`.

Debe aparecer en menu:
- `Panel`
- `Retiros`
- `Lotes de produccion`

No debe aparecer en menu:
- el mismo listado prohibido de `panadero`

Resultado esperado:
- `pastelero` queda con el mismo alcance operativo minimo de produccion.

---

### Caso NEXO-PRM-009 | Rol gerente en Centro de Produccion
Objetivo: confirmar que gerente ve operacion amplia, pero no maestros completos.

Contexto exacto:
- Rol: `gerente`
- Sede: `Centro de Produccion`

Pasos:
1. Cambia tu rol a `gerente`.
2. Cambia tu sede a `Centro de Produccion`.
3. Vuelve al home.
4. Recarga la app.
5. Abre el menu lateral.
6. Entra a:
   - `/inventory/entries`
   - `/inventory/remissions`
   - `/inventory/count-initial`
   - `/inventory/transfers`
   - `/inventory/withdraw`
   - `/inventory/production-batches`
   - `/inventory/adjust`
   - `/inventory/stock`
   - `/inventory/movements`
   - `/inventory/settings/checklist`
   - `/inventory/validation/locs`
   - `/printing/jobs`
7. Intenta abrir manualmente:
   - `/inventory/catalog`
   - `/inventory/locations`
   - `/inventory/settings/supply-routes`
   - `/inventory/settings/sites`
   - `/inventory/settings/units`
   - `/inventory/settings/categories`

Debe aparecer en menu:
- `Panel`
- `Entradas`
- `Abastecimiento interno`
- `Conteos`
- `Traslados`
- `Retiros`
- `Lotes de produccion`
- `Ajustes`
- `Stock`
- `Movimientos`
- `Checklist`
- `Validacion de LOCs`
- `Impresion`

No debe aparecer en menu:
- `Productos`
- `Ubicaciones`
- `Rutas`
- `Areas remision`
- `Sedes`
- `Unidades`
- `Categorias`

Resultado esperado:
- `gerente` opera y audita.
- `gerente` no administra catalogos maestros completos desde NEXO.

---

### Caso NEXO-PRM-010 | Rol gerente_general en Centro de Produccion
Objetivo: confirmar acceso amplio de direccion general.

Contexto exacto:
- Rol: `gerente_general`
- Sede: `Centro de Produccion`

Pasos:
1. Cambia tu rol a `gerente_general`.
2. Cambia tu sede a `Centro de Produccion`.
3. Vuelve al home.
4. Recarga la app.
5. Abre el menu lateral.
6. Entra a todas las vistas visibles.

Debe aparecer en menu:
- todo el menu operativo
- todo el menu de configuracion
- `Productos`
- `Ubicaciones`
- `Rutas`
- `Areas remision`
- `Sedes`
- `Unidades`
- `Categorias`
- `Impresion`

Resultado esperado:
- `gerente_general` debe ver y poder revisar todo el modulo.

---

### Caso NEXO-PRM-011 | Rol propietario en Centro de Produccion
Objetivo: confirmar el maximo nivel de acceso.

Contexto exacto:
- Rol: `propietario`
- Sede: `Centro de Produccion`

Pasos:
1. Cambia tu rol a `propietario`.
2. Cambia tu sede a `Centro de Produccion`.
3. Vuelve al home.
4. Recarga la app.
5. Repite la validacion del caso `NEXO-PRM-010`.

Resultado esperado:
- `propietario` debe ver y poder entrar a todo NEXO.

---

### Criterio de cierre del bloque 6
El bloque 6 se considera aprobado si:
- cada rol muestra exactamente las vistas esperadas;
- las vistas prohibidas no aparecen en menu;
- los accesos manuales a rutas prohibidas se bloquean, redirigen o al menos no operan normal;
- al cambiar rol y sede, la app refleja el nuevo contexto despues de volver al home y recargar.

Si un rol ve mas de lo que debe, registralo como `FAIL por sobreexposicion`.
Si un rol no ve algo que la base de datos si le otorga, registralo como `FAIL por bloqueo indebido`.
---

## BLOQUE 7. Limpieza

### Caso NEXO-CLN-001 | Cleanup final
Objetivo: dejar el sistema sin inventario dummy.

Pasos:
1. Termina toda la ronda.
2. Corre `supabase/cleanup_test_nexo_cp_center.sql`.
3. Vuelve a NEXO.
4. Escanea `Bodega principal`.
5. Toca `Ver contenido`.

Resultado esperado:
- Ya no deben aparecer productos `TEST-NEXO-CP-*`.
- El sistema queda limpio para otra ronda.

---

## Registro rapido sugerido
Usa esta plantilla por cada caso:

```text
Caso:
Contexto: Mi cuenta | Rol: ____ | Sede: Centro de Produccion
Precondicion cumplida: Si/No
Resultado esperado:
Resultado real:
Estado: OK / FAIL / BLOCKED
Evidencia: captura / video / nota
```

## Criterio de salida de esta ronda
La ronda dummy se considera aprobada si:
- Los 6 QR abren el LOC correcto.
- Cada LOC muestra solo su inventario.
- Los retiros validos descuentan stock en el LOC correcto.
- Los retiros invalidos no alteran stock.
- El regreso despues del retiro vuelve al landing del LOC.
- Los movimientos reflejan lo ejecutado.
- El cleanup deja el sistema limpio.


# Guia de Ejecucion Paso a Paso

Fecha: 2026-04-21  
Modo de trabajo: una sola cuenta cambiando `rol` y `sede`  
Objetivo: ejecutar pruebas reales sin perderse ni mezclar contextos.

## 1. Regla principal

Cada prueba debe arrancar con este contexto escrito:

- Cuenta: tu cuenta
- Rol activo:
- Sede activa:
- App:
- Caso:

No ejecutes nada si no dejaste claro ese contexto.

## 2. Regla para cambiar rol o sede

Cada vez que cambies rol o sede, haz exactamente esto:

1. cambia el rol
2. cambia la sede
3. vuelve al home
4. recarga la app o vuelve a abrir el modulo desde el menu
5. confirma visualmente el rol y la sede
6. solo ahi ejecuta la prueba

Si no haces eso, puedes confundir permisos o datos cacheados.

## 3. Lo que vas a usar hoy

No vas a probar todo hoy.  
Vas a ejecutar solo el Dia 1.

Dia 1 incluye:

1. permisos
2. LOCs
3. QR
4. ver contenido
5. retiro valido
6. retiro invalido
7. remision valida
8. remision invalida
9. compra valida
10. recepcion valida

## 4. Preparacion exacta antes de tocar la app

Antes de empezar:

1. abre este documento
2. abre el plan maestro
3. abre un bloc de notas o sheet para registrar resultados
4. ten a mano:
   - 3 QRs impresos reales
   - lista de LOCs del Centro
   - 2 o 3 productos con stock
   - 1 proveedor valido
5. confirma que existe la sede `Centro de Produccion`
6. confirma que puedes cambiar `rol` y `sede`

Si algo de eso no existe, marca `blocked` y no sigas.

## 5. Plantilla de registro para cada prueba

Usa esta plantilla cada vez:

```text
Caso:
Cuenta: mi cuenta
Rol:
Sede:
App:
Pantalla:
Esperado:
Real:
Evidencia:
Estado: ok / fail / blocked
```

## 6. Secuencia exacta del Dia 1

Haz estas pruebas en este orden exacto.  
No te saltes el orden.

---

## Paso 1. Validar permisos con rol Admin en Centro

### Contexto

- Cuenta: tu cuenta
- Rol: Admin operativo
- Sede: Centro de Produccion
- App: NEXO

### Que hacer exactamente

1. cambia tu cuenta a `Admin operativo`
2. cambia la sede a `Centro de Produccion`
3. vuelve al home
4. recarga
5. toma captura del home
6. toma captura del menu lateral
7. entra a `Ubicaciones`
8. vuelve atras
9. entra a `Stock`
10. vuelve atras
11. entra a `Movimientos`
12. vuelve atras
13. entra a `Remisiones`
14. vuelve atras
15. entra a `Impresion`

### Que validar

- ves todos esos modulos
- cargan sin error
- la sede sigue siendo Centro

### Registrar

Anota:
- que modulos ves
- si alguno falla
- si algun modulo no deberia estar o falta

---

## Paso 2. Validar permisos con rol Bodeguero en Centro

### Contexto

- Cuenta: tu cuenta
- Rol: Bodeguero
- Sede: Centro de Produccion
- App: NEXO

### Que hacer exactamente

1. cambia rol a `Bodeguero`
2. deja sede `Centro de Produccion`
3. vuelve al home
4. recarga
5. toma captura del menu lateral
6. entra a `Ubicaciones`
7. entra a `Stock`
8. entra a `Movimientos`
9. entra a `Remisiones`
10. entra a `Impresion`
11. intenta entrar por URL a un modulo que no deberia administrar si aplica

### Que validar

- ve modulos operativos
- no ve modulos administrativos criticos si deben estar restringidos
- no se rompe al entrar por URL directa

### Registrar

Anota:
- que si puede ver
- que no puede ver
- si el bloqueo es correcto o no

---

## Paso 3. Validar permisos con rol Produccion en Centro

### Contexto

- Cuenta: tu cuenta
- Rol: Produccion
- Sede: Centro de Produccion
- App: NEXO y FOGO

### Que hacer exactamente

1. cambia rol a `Produccion`
2. deja sede `Centro de Produccion`
3. vuelve al home
4. recarga
5. abre NEXO
6. revisa si puede ver `Ubicaciones`
7. revisa si puede ver `Stock`
8. revisa si puede ver `Remisiones`
9. luego abre FOGO
10. entra a `Lotes de produccion` si ya existe el modulo

### Que validar

- produccion puede entrar a lo que necesita
- no recibe acceso de mas
- el modulo de lotes no queda roto

---

## Paso 4. Validar LOCs del Centro

### Contexto

- Cuenta: tu cuenta
- Rol: Admin operativo
- Sede: Centro de Produccion
- App: NEXO
- Pantalla: `Ubicaciones`

### Que hacer exactamente

1. cambia rol a `Admin operativo`
2. cambia sede a `Centro de Produccion`
3. vuelve al home
4. entra a `Ubicaciones`
5. busca uno por uno estos LOCs:
   - `LOC-CP-BOD-MAIN`
   - `LOC-CP-SECOS-MAIN`
   - `LOC-CP-FRIO-MAIN`
   - `LOC-CP-CONG-MAIN`
   - `LOC-CP-N2P-MAIN`
   - `LOC-CP-N3P-MAIN`
   - `LOC-CP-PROD-CAL-01`
   - `LOC-CP-PROD-PAN-01`
   - `LOC-CP-PROD-REP-01`
   - `LOC-CP-PROD-COC-01`
6. abre cada uno si el listado lo permite
7. confirma codigo, nombre y sede

### Que validar

- todos existen
- todos son del Centro
- no hay duplicados raros
- los nombres tienen sentido operativo

### Si falla

No sigas a QR ni retiros si falta algun LOC critico.

---

## Paso 5. Validar impresion y layout

### Contexto

- Cuenta: tu cuenta
- Rol: Admin operativo
- Sede: Centro de Produccion
- App: NEXO
- Pantalla: `Impresion`

### Que hacer exactamente

1. entra a `Impresion`
2. confirma que existe el boton `Cargar layout`
3. dale click a `Cargar layout`
4. selecciona el layout que diseñaste
5. confirma que aparezca `Layout activo`
6. revisa la vista previa
7. dale `Quitar layout`
8. confirma que vuelve al preset estandar

### Que validar

- el layout carga
- la vista previa cambia
- quitar layout funciona

### Registrar

Toma captura:
- con layout activo
- sin layout

---

## Paso 6. Validar QR real de un LOC de almacenamiento

### Contexto

- Cuenta: tu cuenta
- Rol: Bodeguero
- Sede: Centro de Produccion
- App: NEXO
- Medio: camara del celular

### Que hacer exactamente

1. cambia rol a `Bodeguero`
2. deja sede `Centro de Produccion`
3. abre la camara del celular
4. escanea el QR de `Bodega principal`
5. abre el link
6. espera la landing
7. revisa el codigo visible
8. revisa el nombre visible
9. revisa los botones de accion

### Que validar

- abre el LOC correcto
- no abre otro LOC
- no cae en error

### Registrar

Captura:
- QR escaneado
- landing abierta

---

## Paso 7. Validar QR real de una zona de produccion

### Contexto

- Cuenta: tu cuenta
- Rol: Produccion
- Sede: Centro de Produccion
- App: NEXO

### Que hacer exactamente

1. cambia rol a `Produccion`
2. vuelve al home
3. escanea un QR de:
   - `Panaderia`, o
   - `Cocina caliente`, o
   - `Zona caliente`
4. abre el link
5. revisa la landing

### Que validar

- abre el LOC correcto
- el rol Produccion entra sin problema si debe entrar

---

## Paso 8. Ver contenido de un LOC con stock

### Contexto

- Cuenta: tu cuenta
- Rol: Bodeguero
- Sede: Centro de Produccion
- App: NEXO

### Que hacer exactamente

1. cambia rol a `Bodeguero`
2. entra al QR o al detalle de un LOC con stock
3. toca `Ver contenido`
4. revisa la lista de productos
5. anota 2 o 3 cantidades visibles

### Que validar

- hay contenido coherente
- no aparecen productos absurdos
- las cantidades parecen reales

### Registrar

Anota:
- producto 1 y cantidad
- producto 2 y cantidad

---

## Paso 9. Hacer un retiro valido

### Contexto

- Cuenta: tu cuenta
- Rol: Bodeguero
- Sede: Centro de Produccion
- App: NEXO

### Que hacer exactamente

1. entra a un LOC con stock confirmado
2. toca `Retirar de aqui`
3. elige un producto
4. toma nota del stock actual
5. escribe una cantidad menor al stock disponible
6. confirma
7. toma captura del exito o estado final
8. vuelve a `Ver contenido`
9. revisa el nuevo saldo
10. entra a `Movimientos`
11. busca el movimiento recien hecho

### Que validar

- el retiro si se registra
- el stock baja exactamente
- el movimiento aparece

### Ejemplo de registro

```text
Caso: RET-VALIDO-01
Rol: Bodeguero
Sede: Centro
Producto: X
Stock antes: 20
Retiro: 5
Stock despues esperado: 15
Stock despues real:
Movimiento visible: si/no
Estado:
```

---

## Paso 10. Hacer un retiro invalido

### Contexto

- Cuenta: tu cuenta
- Rol: Bodeguero
- Sede: Centro de Produccion
- App: NEXO

### Que hacer exactamente

1. usa el mismo producto anterior o uno con poco stock
2. toca `Retirar de aqui`
3. elige el producto
4. escribe una cantidad mayor al stock disponible
5. confirma

### Que validar

- el sistema bloquea
- el mensaje es claro
- no descuenta stock
- no crea movimiento

### Si falla

Si deja retirar sin stock, para la sesion. Eso es bloqueante.

---

## Paso 11. Crear una remision valida

### Contexto

- Cuenta: tu cuenta
- Rol: Despacho
- Sede: Centro de Produccion
- App: NEXO

### Que hacer exactamente

1. cambia rol a `Despacho`
2. vuelve al home
3. entra a `Remisiones`
4. crea una remision nueva
5. agrega 1 producto real
6. agrega una cantidad mayor a 0
7. guarda
8. si el flujo lo permite, avanza al siguiente estado
9. confirma salida si existe ese paso
10. revisa stock del producto
11. revisa movimientos

### Que validar

- la remision se crea
- no queda vacia
- el stock baja si la remision ya descuenta
- queda evidencia

---

## Paso 12. Crear una remision invalida sin lineas

### Contexto

- Cuenta: tu cuenta
- Rol: Despacho
- Sede: Centro de Produccion
- App: NEXO

### Que hacer exactamente

1. crea una remision nueva
2. no agregues ninguna linea
3. intenta guardar o avanzar

### Que validar

- el sistema bloquea

### Si no bloquea

Marca `fail S1`.

---

## Paso 13. Crear una compra valida

### Contexto

- Cuenta: tu cuenta
- Rol: Recepcion o Compras
- Sede: Centro de Produccion
- App: ORIGO

### Que hacer exactamente

1. cambia rol a `Recepcion` o `Compras`
2. vuelve al home
3. entra a ORIGO
4. abre `Compras`
5. crea un documento nuevo
6. elige 1 proveedor valido
7. agrega 2 productos
8. asigna cantidades validas
9. guarda
10. toma captura del documento creado

### Que validar

- documento creado
- proveedor visible
- productos visibles

---

## Paso 14. Registrar una recepcion valida

### Contexto

- Cuenta: tu cuenta
- Rol: Recepcion o Compras
- Sede: Centro de Produccion
- App: ORIGO

### Que hacer exactamente

1. abre la compra que acabas de crear
2. entra a la accion de `Recepcionar`
3. confirma cantidades recibidas
4. guarda la recepcion
5. toma captura del estado final
6. ahora entra a NEXO
7. busca uno de los productos recibidos
8. valida si el inventario ya refleja el ingreso

### Que validar

- recepcion creada
- no explota el documento
- el inventario sube o queda visible en el flujo esperado

### Si falla

Si ORIGO recibe pero NEXO no refleja nada, marca hallazgo de integracion.

---

## Paso 15. Cierre del Dia 1

Al terminar, no sigas inventando pruebas.

Haz esto:

1. cuenta cuantos casos hiciste
2. cuenta cuantos dieron `ok`
3. cuenta cuantos dieron `fail`
4. cuenta cuantos dieron `blocked`
5. escribe top 5 problemas
6. clasifica cada fail:
   - S1 bloqueante
   - S2 alta
   - S3 media
   - S4 baja

## 7. Cuando detenerte de inmediato

Si aparece cualquiera de estos, detente:

- un rol ve algo critico que no deberia ver
- un QR abre un LOC equivocado
- un retiro descuenta mal
- se puede retirar sin stock
- una remision vacia se deja guardar
- una recepcion no deja rastro

## 8. Lo que hariamos despues

Si el Dia 1 sale bien, el Dia 2 seria:

1. FOGO lotes
2. consumo de insumos
3. end-to-end completo
4. errores y borde
5. auditoria de movimientos

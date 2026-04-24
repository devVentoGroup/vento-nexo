# Plan de inventario para centro, satelites y pruebas E2E

## Decision base

El inventario debe vivir siempre en:

`site_id + location_id + product_id`

No se debe guardar stock operativo sin LOC. Aunque una sede sea pequena, debe tener al menos un LOC principal para que entradas, salidas, conteos, mermas, remisiones y produccion queden auditables.

## LOCs recomendados por sede

### Centro de produccion

Mantener LOCs detallados, porque el centro tiene almacenamiento, preparacion, despacho y produccion.

LOCs existentes/relevantes:

- `LOC-CP-BOD-MAIN` - Bodega principal
- `LOC-CP-N2P-MAIN` - Nevera produccion
- `LOC-CP-N3P-MAIN` - Nevera despacho
- `LOC-CP-PROD-CAL-01` - Zona caliente
- Zonas adicionales segun aplique: secos, frio, congelados, empaques, despacho.

Regla: el centro debe operar por LOC real, porque ahi ocurre la mayor parte de compras, almacenamiento, produccion y remisiones.

### Vento Cafe

Vento Cafe debe tener 3 LOCs iniciales:

- `LOC-VCF-MOS-MAIN` - Mostrador
- `LOC-VCF-BAR-MAIN` - Barra
- `LOC-VCF-COC-MAIN` - Cocina

Motivo:

- Es un satelite grande.
- Las 3 areas piden remisiones.
- Las 3 areas guardan y consumen productos distintos.
- Permite saber si algo esta en operacion de venta, barra o cocina sin mezclar responsabilidades.

Regla de operacion:

- Cada area solicita remisiones hacia su LOC.
- Cada area recibe en su LOC.
- Los descuentos por uso, venta estimada o produccion local salen desde el LOC correspondiente.

Ejemplo:

- Barra pide leche, cafe, vasos.
- Cocina pide insumos de preparacion.
- Mostrador recibe producto terminado o retail.

### Saudo

Saudo puede empezar con 1 LOC:

- `LOC-SAU-OPS-MAIN` - Operacion principal

Motivo:

- Es un satelite pequeno.
- Pide remision desde una sola area operativa.
- Recibe, guarda y consume desde un mismo punto.

Regla de operacion:

- Toda remision entra al LOC principal.
- Toda venta estimada, merma o consumo sale del LOC principal.
- Si mas adelante se separan responsables o almacenamiento fisico, se divide en 2 o mas LOCs.

### Molka

Molka puede empezar con 1 LOC:

- `LOC-MOL-OPS-MAIN` - Operacion principal

Misma regla que Saudo.

## Criterio para decidir si una sede necesita mas LOCs

Crear mas de un LOC cuando se cumpla al menos una de estas condiciones:

- Hay areas fisicas distintas que piden remisiones por separado.
- Hay responsables distintos por area.
- El producto se guarda en lugares separados y eso afecta la operacion.
- Hay produccion local en un area y venta/servicio en otra.
- El conteo fisico de una sola ubicacion se vuelve confuso.

Mantener un solo LOC cuando:

- Una sola persona/equipo recibe y consume todo.
- La sede es pequena.
- El flujo de remision llega a un solo punto.
- Separar ubicaciones agregaria friccion sin mejorar control.

## Movimientos canonicos de inventario

Todo flujo debe terminar generando movimientos auditables.

| Tipo de movimiento | Sube stock | Baja stock | Uso |
|---|---:|---:|---|
| `entry_purchase` | Si | No | Entrada por compra/recepcion de ORIGO |
| `entry_manual` | Si | No | Entrada manual controlada |
| `transfer_internal` | Si/No | Si/No | Movimiento entre LOCs de la misma sede |
| `remission_out` | No | Si | Salida desde centro o sede origen |
| `remission_in` | Si | No | Recepcion en sede destino |
| `production_consume` | No | Si | Consumo de ingrediente por lote |
| `production_output` | Si | No | Ingreso de producto terminado |
| `sale_consume` | No | Si | Descuento por venta sin POS |
| `waste` | No | Si | Merma/descarte |
| `adjustment_positive` | Si | No | Ajuste positivo |
| `adjustment_negative` | No | Si | Ajuste negativo |
| `count_correction` | Si/No | Si/No | Correccion posterior a conteo fisico |

## Produccion en centro

Flujo esperado:

1. ORIGO/NEXO ingresan insumos al centro.
2. FOGO crea lote de produccion.
3. El lote descuenta ingredientes desde LOCs del centro.
4. El lote ingresa producto terminado a un LOC destino.
5. NEXO remite producto terminado o insumos a satelites.

Ejemplo:

`Bodega principal -> consumo de harina -> produccion de torta -> ingreso de torta terminada -> remision a Vento Cafe`

## Produccion en satelite

Flujo esperado:

1. El satelite recibe insumos o productos por remision.
2. Si prepara localmente, FOGO crea lote en la sede satelite.
3. El lote descuenta ingredientes desde el LOC satelite.
4. El lote ingresa producto terminado al LOC operativo del satelite.
5. Las ventas sin POS descuentan producto terminado desde ese LOC.

Ejemplo Vento Cafe:

1. Cocina recibe pan, queso y jamon.
2. Cocina produce 10 sanduches.
3. Se descuentan ingredientes de `Cocina`.
4. Se ingresan 10 sanduches al LOC `Mostrador` o `Cocina`, segun donde queden disponibles para venta.
5. Cierre diario registra 7 vendidos.
6. Se descuenta `sale_consume` de 7 sanduches.

## Descuento sin POS

Mientras no exista POS, hay 3 formas de descuento:

### 1. Retiro manual

Uso:

- Merma
- Uso interno
- Correccion operativa
- Consumo puntual no asociado a receta

Debe pedir:

- LOC origen
- Producto
- Cantidad
- Motivo
- Nota opcional

### 2. Lote de produccion FOGO

Uso:

- Preparaciones
- Transformacion de insumos a producto terminado
- Produccion en centro o satelite

Debe generar:

- `production_consume` para ingredientes
- `production_output` para producto terminado

### 3. Cierre diario sin POS

Uso:

- Venta real todavia no integrada al sistema.

Debe permitir registrar:

- Producto vendido
- Cantidad vendida
- LOC origen
- Fecha operativa
- Responsable

Debe generar:

- `sale_consume`

Cuando exista POS, este flujo manual se reemplaza o se convierte en conciliacion.

## Pruebas E2E requeridas

Cada prueba debe validar:

`stock inicial -> accion -> movimientos generados -> stock final esperado`

### ORIGO a NEXO

1. Crear proveedor.
2. Crear orden de compra.
3. Recibir orden.
4. Confirmar entrada en LOC correcto.
5. Confirmar movimiento `entry_purchase`.

### Remision centro a Vento Cafe

1. Centro tiene stock en LOC origen.
2. Vento Cafe Mostrador/Barra/Cocina solicita remision.
3. Centro prepara desde LOC origen.
4. Centro despacha.
5. Vento Cafe recibe en LOC destino.
6. Confirmar baja en centro.
7. Confirmar subida en Vento Cafe.
8. Confirmar movimientos `remission_out` y `remission_in`.

### Remision centro a Saudo/Molka

1. Centro tiene stock.
2. Saudo/Molka solicita desde LOC principal.
3. Centro prepara y despacha.
4. Sede recibe en LOC principal.
5. Confirmar stock final.

### Produccion en centro

1. Crear receta en FOGO.
2. Ejecutar lote en centro.
3. Descontar ingredientes de LOCs centro.
4. Ingresar terminado a LOC destino.
5. Confirmar movimientos `production_consume` y `production_output`.

### Produccion en Vento Cafe

1. Recibir insumos por remision.
2. Crear lote local en FOGO.
3. Consumir ingredientes desde Cocina/Barra segun aplique.
4. Ingresar terminado al LOC definido.
5. Confirmar stock final.

### Venta sin POS

1. Producto terminado existe en LOC satelite.
2. Registrar cierre diario con cantidad vendida.
3. Confirmar descuento `sale_consume`.
4. Confirmar stock final.

### Merma

1. Producto existe en LOC.
2. Registrar merma.
3. Confirmar movimiento `waste`.
4. Confirmar baja de stock.

### Conteo fisico

1. Tomar snapshot por sede, zona o LOC.
2. Capturar cantidades reales.
3. Aprobar diferencias.
4. Confirmar `count_correction`.
5. Confirmar stock final.

## Preguntas abiertas antes de implementar mas codigo

- Nombres finales de sedes: Vento Cafe, Saudo, Molka.
- Codigos finales de site para generar LOCs.
- Si Vento Cafe produce localmente o solo ensambla/prepara.
- Donde quedan disponibles para venta los productos preparados en Vento Cafe: Mostrador, Barra o Cocina.
- Si Saudo/Molka necesitan distinguir nevera/congelados por control sanitario desde el dia uno.
- Si el cierre diario sin POS debe hacerse por producto vendido o por receta/menu vendido.

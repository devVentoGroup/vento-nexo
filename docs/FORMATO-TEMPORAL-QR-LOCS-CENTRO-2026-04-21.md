# Formato Temporal de Impresion QR LOCs Centro

Fecha: 2026-04-21  
Objetivo: imprimir etiquetas temporales en impresora normal mientras la Zebra no esta operativa.

## 1. Regla

Estas etiquetas son temporales.  
Sirven para:

- validar QR
- validar landing del LOC
- validar flujo operativo en piso
- arrancar pruebas sin depender de Zebra

## 2. Formato recomendado para impresora normal

Imprimir cada LOC en un bloque asi:

- nombre de la zona en grande
- codigo LOC visible
- QR centrado
- hoja carta o A4
- 1 bloque por media hoja o 2 bloques por hoja

## 3. Medidas recomendadas

- QR minimo: 4 x 4 cm
- QR ideal: 5 x 5 cm
- titulo de zona: grande y legible a distancia
- codigo LOC: debajo del QR, en negrilla

## 4. Como pegarlo

- imprimir
- recortar
- pegar con cinta transparente ancha o portaaviso
- ubicar a la altura de la vista
- no pegar donde se moje directo o se ensucie facil

## 5. Lista exacta para imprimir

## 5.1 Almacenamiento

### 1. Bodega principal

- Nombre visible: `Bodega principal`
- Codigo: `LOC-CP-BOD-MAIN`

### 2. Secos

- Nombre visible: `Secos`
- Codigo: `LOC-CP-SECOS-MAIN`

### 3. Cuarto frio

- Nombre visible: `Cuarto frio`
- Codigo: `LOC-CP-FRIO-MAIN`

### 4. Congelados

- Nombre visible: `Congelados`
- Codigo: `LOC-CP-CONG-MAIN`

### 5. N2P

- Nombre visible: `Nevera produccion`
- Codigo: `LOC-CP-N2P-MAIN`

### 6. N3P

- Nombre visible: `Nevera despacho`
- Codigo: `LOC-CP-N3P-MAIN`

## 5.2 Produccion

### 7. Zona caliente

- Nombre visible: `Zona caliente`
- Codigo: `LOC-CP-PROD-CAL-01`

### 8. Panaderia

- Nombre visible: `Panaderia`
- Codigo: `LOC-CP-PROD-PAN-01`

### 9. Reposteria

- Nombre visible: `Reposteria`
- Codigo: `LOC-CP-PROD-REP-01`

### 10. Cocina caliente

- Nombre visible: `Cocina caliente`
- Codigo: `LOC-CP-PROD-COC-01`

## 6. Orden recomendado de impresion y prueba

Imprime y prueba en este orden:

1. Bodega principal
2. Secos
3. Cuarto frio
4. Congelados
5. N2P
6. N3P
7. Zona caliente
8. Panaderia
9. Reposteria
10. Cocina caliente

## 7. Check rapido por cada etiqueta

Antes de pegar cada una, valida:

- el QR escanea desde celular
- abre el LOC correcto
- el nombre visible coincide con la zona real
- el codigo LOC coincide con sistema

## 8. Lo minimo que debe verse en cada etiqueta

Cada etiqueta temporal debe tener esto:

```text
NOMBRE DE LA ZONA

[QR]

LOC-CP-XXXX-XXX
```

## 9. Recomendacion de cantidad

Mientras son temporales:

- 1 copia por LOC para validacion inicial
- 1 copia extra para Bodega principal
- 1 copia extra para Cocina caliente

Total inicial recomendado:

- 12 impresiones

## 10. Cuando reemplazarlas

Estas etiquetas se reemplazan cuando:

- la Zebra este operativa
- el layout final este aprobado
- el QR ya haya sido validado en piso

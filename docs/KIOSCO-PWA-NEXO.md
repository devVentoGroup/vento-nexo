# Kiosco PWA NEXO

## Objetivo

Rutas cortas para abrir pantallas fijas de consulta visual en tablet o pantalla pequena, sin afectar los QR operativos existentes de LOC.

Los QR actuales de LOC siguen igual. Esta configuracion es adicional para modo kiosco/fullscreen.

## Links de produccion

- Bodega principal: `https://nexo.ventogroup.co/kiosk/bodega-principal`
- Bodega principal alias: `https://nexo.ventogroup.co/kiosk/bodega`
- Nevera produccion: `https://nexo.ventogroup.co/kiosk/nevera-produccion`
- Nevera despacho: `https://nexo.ventogroup.co/kiosk/nevera-despacho`
- Zona empaques: `https://nexo.ventogroup.co/kiosk/empaques`

## Comportamiento

- Si el usuario no esta autenticado, entra primero a login y vuelve al link de kiosco.
- Las rutas de bodega y neveras buscan el LOC por codigo fisico y abren el board con `kiosk=1`.
- La ruta de empaques abre la zona `EMP` usando la sede activa o primaria del usuario.
- En `kiosk=1`, NEXO oculta sidebar/header y deja solo la pantalla operativa.

## Instalacion en tablet

Android:

1. Abrir el link de produccion en Chrome.
2. Iniciar sesion con el usuario de bodega.
3. Usar `Agregar a pantalla principal` o `Instalar app`.
4. Abrir desde el icono instalado.
5. Para bloqueo real, usar fijar pantalla o Fully Kiosk Browser.

iPad:

1. Abrir el link de produccion en Safari.
2. Iniciar sesion con el usuario de bodega.
3. Compartir -> `Agregar a pantalla de inicio`.
4. Abrir desde el icono instalado.
5. Para bloqueo real, activar Acceso guiado.

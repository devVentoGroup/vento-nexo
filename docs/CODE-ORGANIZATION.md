# Organización del Código — Vento OS (Platform)

**Vento OS** es la plataforma unificada del ecosistema Vento. Integra inventario (NEXO), punto de venta (PULSO), producción (FOGO), asistencia (ANIMA) y fidelización (PASS) en una arquitectura monorepo.

---

## Stack Tecnológico

- **Framework**: Next.js 15+ (App Router)
- **Lenguaje**: TypeScript 5.x
- **Estilos**: Tailwind CSS 4
- **Base de Datos**: Supabase (PostgreSQL)
- **Gestor de Paquetes**: pnpm (Workspaces)

---

## Estructura del Monorepo

```
vento-nexo/
├── docs/                      # Documentación del proyecto
│   └── CODE-ORGANIZATION.md
├── public/                    # Archivos estáticos (imágenes, fuentes, etc.)
├── src/
│   ├── app/                   # Next.js App Router (páginas y layouts)
│   │   ├── layout.tsx         # Layout raíz con VentoTopbar
│   │   ├── page.tsx           # Home (dashboard de apps del ecosistema)
│   │   ├── globals.css        # Estilos globales
│   │   ├── favicon.ico
│   │   ├── inventory/         # Módulo de inventario
│   │   │   ├── locations/     # Gestión de ubicaciones (LOC)
│   │   │   └── lpns/          # Gestión de LPNs (pallets/contenedores)
│   │   ├── printing/          # Módulo de impresión
│   │   │   └── jobs/          # Jobs de impresión de etiquetas
│   │   ├── scanner/           # Módulo de escaneo
│   │   │   └── page.tsx       # Página de scanner QR/barcode
│   │   └── login/             # Página de login
│   │
│   ├── components/            # Componentes reutilizables
│   │   └── vento/             # Componentes del sistema Vento
│   │       ├── vento-topbar.tsx    # Barra superior con navegación
│   │       ├── app-switcher.tsx    # Selector de apps (NEXO, VISO, etc.)
│   │       └── scan-input.tsx      # Input especializado para scanner
│   │
│   ├── features/              # Features organizadas por dominio
│   │   ├── auth/
│   │   │   └── login-form.tsx      # Formulario de login
│   │   ├── inventory/
│   │   │   ├── locations/
│   │   │   │   └── loc-create-form.tsx   # Crear ubicaciones
│   │   │   └── lpns/
│   │   │       └── lpn-create-form.tsx   # Crear LPNs
│   │   └── scanner/
│   │       └── scanner-panel.tsx   # Panel principal de escaneo
│   │
│   └── lib/                   # Utilidades y configuración
│       └── supabase/          # Clientes de Supabase
│           ├── client.ts      # Cliente para componentes del cliente
│           ├── server.ts      # Cliente para Server Components
│           └── proxy.ts       # Lógica de sesión para middleware
│
├── middleware.ts              # Next.js middleware (auth, sesiones)
├── next.config.ts             # Configuración de Next.js
├── tailwind.config.js         # Configuración de Tailwind
├── tsconfig.json              # Configuración de TypeScript
└── package.json
```

---

## Principios de Organización

### 1. **App Router (`src/app/`)**
Cada carpeta representa una ruta. Los archivos especiales:
- `page.tsx`: Página de la ruta
- `layout.tsx`: Layout compartido para subrutas
- `loading.tsx`: UI de loading (opcional)
- `error.tsx`: UI de error (opcional)

**Ejemplo:**
- `src/app/scanner/page.tsx` → `/scanner`
- `src/app/inventory/locations/page.tsx` → `/inventory/locations`

### 2. **Features (`src/features/`)**
Lógica de dominio agrupada por módulo funcional. Cada feature contiene:
- Componentes específicos del dominio
- Hooks personalizados (si aplica)
- Lógica de negocio

**Regla**: Si un componente solo se usa en un módulo específico, va en `features/`. Si es reutilizable en múltiples módulos, va en `components/`.

### 3. **Components (`src/components/`)**
Componentes UI reutilizables y agnósticos del dominio. Organizados por subsistema:
- `vento/`: Componentes del design system de Vento OS

### 4. **Lib (`src/lib/`)**
Utilidades, helpers, configuración y clientes externos:
- `supabase/`: Clientes de Supabase para diferentes contextos (client, server, proxy)

### 5. **Middleware (`middleware.ts`)**
Intercepta todas las requests para:
- Validar sesiones de Supabase
- Refrescar tokens automáticamente
- Limpiar cookies corruptas

**Regla del middleware:**
- Si NO hay cookies `sb-*`, no hace llamadas de auth (evita spam en dev)
- Si detecta `refresh_token_not_found`, limpia cookies y continúa

---

## Módulos Principales

### 🏠 **Home (`/`)**
Dashboard central que muestra:
- Apps del ecosistema Vento OS (NEXO, VISO, FOGO, ORIGO, MAREA, LUNA)
- Acceso rápido a cada app

### 📦 **Inventory (`/inventory`)**
Gestión de inventario físico:

#### **Locations (`/inventory/locations`)**
- Crear/editar ubicaciones (LOC): estanterías, zonas, almacenes
- Formato: `VENTO|LOC|CÓDIGO`

#### **LPNs (`/inventory/lpns`)**
- Crear/editar LPNs (License Plate Numbers): pallets, contenedores, cajas
- Formato: `VENTO|LPN|CÓDIGO`

### 📷 **Scanner (`/scanner`)**
Escaneo de códigos QR/barcode:
- Detecta formato `VENTO|TYPE|CODE`
- Redirige automáticamente:
  - `LOC` → `/inventory/locations?code=CÓDIGO`
  - `LPN` → `/inventory/lpns?code=CÓDIGO`
- Componente: `ScannerPanel` (`src/features/scanner/scanner-panel.tsx`)

### 🖨️ **Printing (`/printing`)**
Impresión de etiquetas:
- Jobs de impresión de etiquetas para LOC/LPN/AST
- Integración con impresoras de etiquetas

### 🔐 **Auth (`/login`)**
Autenticación con Supabase:
- Login con email/password
- Gestión de sesiones vía middleware

---

## Flujo de Autenticación

1. **Middleware** (`middleware.ts`) intercepta todas las requests
2. Si hay cookies `sb-*`, intenta refrescar la sesión con `supabase.auth.getUser()`
3. Si falla con `refresh_token_not_found`, limpia cookies y continúa
4. Las páginas usan `createClient()` o `createServerClient()` según contexto:
   - **Client Components**: `src/lib/supabase/client.ts`
   - **Server Components**: `src/lib/supabase/server.ts`
   - **Middleware**: `src/lib/supabase/proxy.ts`

---

## Convenciones de Código

### Nomenclatura
- **Componentes**: PascalCase (`VentoTopbar`, `ScannerPanel`)
- **Archivos**: kebab-case (`vento-topbar.tsx`, `scanner-panel.tsx`)
- **Variables/funciones**: camelCase (`hasSupabaseCookies`, `getSupabaseKey`)

### Estructura de Componentes
```tsx
// 1. Imports
import { useState } from "react";
import { Button } from "@/components/ui/button";

// 2. Types/Interfaces
interface MyComponentProps {
  title: string;
}

// 3. Componente
export function MyComponent({ title }: MyComponentProps) {
  // Hooks
  const [state, setState] = useState(false);

  // Handlers
  function handleClick() {
    // ...
  }

  // Render
  return (
    <div>
      <h1>{title}</h1>
      <Button onClick={handleClick}>Click</Button>
    </div>
  );
}
```

### Imports Absolutos
Usar alias `@/` para imports desde `src/`:
```tsx
import { VentoTopbar } from "@/components/vento/vento-topbar";
import { createClient } from "@/lib/supabase/client";
```

---

## Estilos y UI

### Tailwind CSS 4
- Clases utility-first
- Configuración en `tailwind.config.js`
- Paleta de colores: `zinc` (gris neutro)

### Convenciones de Estilo
```tsx
// ✅ Correcto: Clases ordenadas lógicamente
<div className="mx-auto w-full max-w-6xl px-6 py-8">

// ✅ Layout → Spacing → Sizing → Colores → Typography
<button className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50">
```

---

## Integración con Supabase

### RLS (Row Level Security)
Todas las tablas deben tener políticas RLS activas. El middleware asegura que el usuario esté autenticado antes de acceder a datos protegidos.

### Tipos de Cliente
1. **Client Components**: Para interacciones del usuario (formularios, botones)
2. **Server Components**: Para data fetching en el servidor (SSR)
3. **Middleware**: Para validación de sesiones en cada request

---

## Scripts de Desarrollo

```bash
# Desarrollo local
npm run dev

# Build de producción
npm run build

# Iniciar servidor de producción
npm run start

# Linter
npm run lint
```

---

## Próximos Pasos

- [ ] Agregar tests (Jest + React Testing Library)
- [ ] Documentar API de Supabase (tablas, funciones, RLS)
- [ ] Agregar Storybook para components
- [ ] Implementar módulo de activos (AST)
- [ ] Integración con impresoras Zebra/Brother

---

## Recursos

- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Vento OS Ecosystem](https://ventogroup.co)

---

**Última actualización:** Enero 12, 2026

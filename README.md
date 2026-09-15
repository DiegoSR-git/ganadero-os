# GanaderOS

Software de gestion ganadera para explotaciones en Espana. Permite llevar desde el movil el control diario de animales, lotes, fincas, partos, tratamientos, gastos, ingresos, documentos y tareas, con registro por web, WhatsApp e IA.

El frontend esta desplegado como SPA estatica en Hostinger. El backend de produccion es Supabase:

- **Supabase project id**: `xwagacfldlwobyjfpxci`
- **API base**: `https://xwagacfldlwobyjfpxci.supabase.co`

## Stack

- **Frontend**: React 18 + Vite + TypeScript
- **UI**: Tailwind CSS + shadcn/ui + Radix UI + lucide-react
- **Estado/datos**: TanStack Query + Supabase JS
- **Backend**: Supabase Auth, PostgreSQL, RLS, Storage y Edge Functions
- **Pagos**: Stripe Checkout + webhooks
- **IA**: Edge Function `ganadero-ai` para chat, voz y fotos
- **Documentos**: Storage privado de Supabase, jsPDF, JSZip y exportaciones CSV
- **Tests/build**: Vitest, ESLint, Vite build

## Modulo Ganadero

Rutas principales:

| Ruta | Funcion |
|---|---|
| `/` | Landing publica optimizada para captacion |
| `/auth` | Login y alta con pago Stripe |
| `/app` | Inicio de la explotacion |
| `/animales` | Listado, busqueda, filtros, importacion y alta de animales |
| `/animales/:id` | Ficha completa del animal |
| `/lotes` | Gestion de lotes |
| `/fincas` | Fincas y parcelas |
| `/economia` | Gastos, ingresos y balance mensual |
| `/documentos` | Archivo documental por explotacion y animal |
| `/tareas` | Tareas pendientes y seguimiento |
| `/asistente` | Asistente IA con texto, voz y fotos |
| `/configuracion` | Datos de explotacion |
| `/ayuda` | Ayuda funcional |
| `/panel-piloto` | Metricas internas de piloto |

## Funcionalidad GanaderOS

- Gestion de varias explotaciones por usuario.
- Alta y edicion de animales por crotal.
- Crotales pendientes con asignacion posterior.
- Clasificacion funcional por especie, sexo y edad.
- Lotes, fincas y parcelas.
- Eventos por animal: nacimiento, parto, aborto, cubricion, inseminacion, gestacion, tratamiento, vacuna, incidencia, movimiento, pesaje, revision, compra, venta, cambio de lote, cambio de parcela y observacion.
- Registro atomico de partos y creacion de crias desde funcion SQL.
- Movimiento masivo de animales entre lotes.
- Gastos ganaderos con IVA, proveedor, lote y animal asociado.
- Ingresos por venta de animales, subvenciones, seguros u otros conceptos.
- Documentos privados por explotacion: facturas, tickets, recetas, guias, certificados, PAC, contratos y otros.
- Tareas con prioridad, fecha limite y estado.
- Feedback de usuarios y eventos de producto para piloto.
- Asistente IA que consulta datos reales y propone acciones confirmables.

## Backend Supabase

El backend vive principalmente en migraciones SQL y Edge Functions.

### Tablas ganaderas principales

- `explotaciones`
- `explotacion_members`
- `fincas`
- `parcelas`
- `lotes`
- `animales`
- `eventos_animales`
- `tareas`
- `documentos`
- `ingresos`
- `ai_action_log`
- `ai_sessions`
- `ai_feature_flags`
- `feedback`
- `product_events`
- `actividad_log`
- `especies`
- `razas`

### Tablas heredadas de empresa/facturacion

El proyecto conserva modulos de facturacion y gestoria usados por el alta, Stripe, WhatsApp y el panel administrativo:

- `companies`
- `user_roles`
- `profiles`
- `clients`
- `invoices`
- `invoice_lines`
- `expenses`
- `wa_messages`
- `monthly_closures`
- `audit_log`
- `gestorias`
- `gestoria_empresa_links`
- `pending_registrations`
- `stripe_events`

## Seguridad y permisos

La app se apoya en Supabase RLS:

- Las explotaciones se filtran por `user_in_explotacion(auth.uid(), explotacion_id)`.
- El propietario se valida con `user_owns_explotacion(auth.uid(), explotacion_id)`.
- Los documentos usan Storage privado y politicas por carpeta de explotacion.
- Las empresas heredadas se filtran por `company_id`, roles y relacion con gestoria.
- Las Edge Functions criticas usan `service_role`, pero validan usuario, firma o idempotencia segun el caso.
- El asistente IA nunca ejecuta SQL generado por modelo: solo puede usar herramientas servidor definidas.

## Edge Functions

| Function | JWT | Uso |
|---|---:|---|
| `ganadero-ai` | Si | Chat, voz, fotos, propuestas confirmables y consultas ganaderas |
| `wa-webhook` | No | Webhook entrante de WhatsApp Cloud API |
| `wa-process-message` | No | Procesamiento de comandos y adjuntos de WhatsApp |
| `ocr-extract` | Si | OCR con Google Vision para documentos |
| `stripe-create-checkout` | No | Alta de explotacion con pago Stripe |
| `stripe-create-checkout-gestoria` | No | Alta de gestoria con pago Stripe |
| `stripe-webhook` | No | Activacion de cuentas y estado de suscripciones |
| `registration-status` | No | Consulta minima del estado de alta |
| `send-gestoria-email` | No | Envio de documentacion a gestoria |

### URLs de produccion

- `https://xwagacfldlwobyjfpxci.supabase.co/functions/v1/ganadero-ai`
- `https://xwagacfldlwobyjfpxci.supabase.co/functions/v1/wa-webhook`
- `https://xwagacfldlwobyjfpxci.supabase.co/functions/v1/wa-process-message`
- `https://xwagacfldlwobyjfpxci.supabase.co/functions/v1/ocr-extract`
- `https://xwagacfldlwobyjfpxci.supabase.co/functions/v1/stripe-create-checkout`
- `https://xwagacfldlwobyjfpxci.supabase.co/functions/v1/stripe-create-checkout-gestoria`
- `https://xwagacfldlwobyjfpxci.supabase.co/functions/v1/stripe-webhook`
- `https://xwagacfldlwobyjfpxci.supabase.co/functions/v1/registration-status`
- `https://xwagacfldlwobyjfpxci.supabase.co/functions/v1/send-gestoria-email`

## Variables de entorno

### Frontend en Hostinger

Estas variables se usan en build time:

```env
VITE_SUPABASE_URL=https://xwagacfldlwobyjfpxci.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Si se cambia cualquier `VITE_*`, hay que reconstruir y volver a subir el `dist`.

### Secrets en Supabase

```env
SUPABASE_URL=https://xwagacfldlwobyjfpxci.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_BASIC=...
STRIPE_PRICE_GESTORIA=...
STRIPE_COUPON_50=...

WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...

GEMINI_API_KEY=...
GROQ_API_KEY=...
GANADERO_AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
GANADERO_AI_MODEL=gemini-3.8-flash
GANADERO_AI_VISION_MODEL=gemini-3.8-flash
GANADERO_STT_BASE_URL=https://api.groq.com/openai/v1
GANADERO_AI_STT_MODEL=whisper-large-v3-turbo

GOOGLE_VISION_API_KEY=...
```

## Alta con Stripe

1. El usuario completa el formulario de `/auth`.
2. El frontend llama a `stripe-create-checkout`.
3. La funcion crea o reutiliza un `pending_registration` vigente.
4. Stripe Checkout cobra la suscripcion.
5. Stripe llama a `stripe-webhook`.
6. El webhook valida la firma, reclama el `event.id` en `stripe_events` y completa el registro.
7. Se crea el usuario en Supabase Auth, la empresa base en `companies`, el rol `cliente_empresa` y el estado de suscripcion.
8. `/billing/success` consulta `registration-status`.

La explotacion ganadera se gestiona despues desde el modulo GanaderOS con `explotaciones`.

## WhatsApp

WhatsApp Cloud API entra por:

```text
https://xwagacfldlwobyjfpxci.supabase.co/functions/v1/wa-webhook
```

Flujo:

1. Meta verifica el webhook con `WHATSAPP_VERIFY_TOKEN`.
2. `wa-webhook` recibe mensajes, identifica empresa por numero destino y guarda en `wa_messages`.
3. Si hay adjunto, descarga el media desde Graph API y lo sube al bucket `wa-attachments`.
4. Lanza `wa-process-message` en segundo plano.
5. `wa-process-message` interpreta comandos, procesa OCR/IA cuando aplica y responde por WhatsApp si hay credenciales.

## Asistente IA

El asistente esta en `/asistente` y llama a `ganadero-ai`.

Capacidades:

- Consultar resumen de explotacion.
- Detectar incidencias, tratamientos y tareas pendientes.
- Buscar animales por crotal.
- Registrar gastos, ingresos, eventos, tratamientos, pesajes y tareas mediante propuestas confirmables.
- Transcribir audio.
- Clasificar fotos de crotales, facturas o documentos.

Medidas de seguridad:

- La explotacion se deriva del usuario autenticado.
- Las acciones de escritura requieren confirmacion.
- Las herramientas de escritura estan allowlisted.
- Las operaciones usan claves de idempotencia para evitar duplicados.
- Los errores internos no se exponen al usuario final.

## Storage

Buckets usados:

- `documentos`: documentos ganaderos por explotacion.
- `expenses`: justificantes heredados de gastos.
- `invoices`: PDFs o documentos asociados a facturas.
- `wa-attachments`: adjuntos recibidos por WhatsApp.
- `logos`: logos de empresa.

## SEO

El SEO base esta configurado en `index.html` porque la app es una SPA Vite.

Incluye:

- `title` descriptivo.
- Meta description orientada a busquedas de software ganadero.
- Robots index/follow.
- Open Graph completo.
- Twitter Card.
- Hreflang espanol.
- JSON-LD de `SoftwareApplication`, `Organization`, `WebSite` y `FAQPage`.
- `robots.txt` abierto a indexacion.

Pendiente cuando este confirmado el dominio definitivo:

1. Anadir canonical absoluto en `index.html`:

```html
<link rel="canonical" href="https://TU-DOMINIO/" />
<meta property="og:url" content="https://TU-DOMINIO/" />
```

2. Anadir `public/sitemap.xml` con URLs absolutas del dominio real.
3. Anadir en `public/robots.txt`:

```text
Sitemap: https://TU-DOMINIO/sitemap.xml
```

4. Registrar el dominio en Google Search Console y Bing Webmaster Tools.
5. Enviar el sitemap cuando el dominio este publicado.

Palabras clave objetivo:

- software gestion ganadera
- programa gestion ganadera
- app para ganaderos
- cuaderno de explotacion ganadera digital
- gestion de animales por crotal
- gestion de fincas y lotes ganaderos
- control sanitario ganado
- registro de partos ganado
- gastos e ingresos explotacion ganadera
- gestion ganadera por WhatsApp

## Despliegue en Hostinger

1. Configurar `.env.production` o variables de build con:

```env
VITE_SUPABASE_URL=https://xwagacfldlwobyjfpxci.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

2. Compilar:

```bash
npm run build
```

3. Subir el contenido de `dist/` al directorio publico de Hostinger.
4. Asegurar fallback SPA en Apache/Hostinger con `.htaccess`.
5. Verificar que recargar rutas como `/app`, `/animales` o `/auth` no devuelve 404.

## Desarrollo local

```bash
npm install
npm run dev
```

Scripts disponibles:

```bash
npm run build
npm run lint
npm run test
npm run preview
```

## Estado de verificacion

Ultima comprobacion local:

```bash
npm run build
```

Resultado: build correcto.

Avisos conocidos:

- `caniuse-lite` puede estar desactualizado.
- El bundle principal supera 500 kB; conviene aplicar code splitting cuando el producto crezca.

# Papeleo Fácil WhatsApp 🇪🇸

Panel interno para asesorías y autónomos de pueblo. **Los clientes finales NO entran a la web**: interactúan por WhatsApp con comandos simples (`FACTURA`, `GASTO`, `COBRO`, `RESUMEN`, `GESTORIA`, `AYUDA`). El operador usa el panel para revisar, generar PDFs y preparar el envío a la gestoría.

> **Aviso legal**: Esta app **no sustituye a la gestoría**. Los cálculos de IVA son orientativos. La presentación fiscal final corresponde a tu gestor o asesor fiscal.

## Stack

- **Frontend**: React 18 + Vite + Tailwind + shadcn/ui (TypeScript)
- **Backend**: Lovable Cloud (Supabase) — PostgreSQL + Auth + Storage + Edge Functions
- **PDF**: jsPDF · **ZIP**: JSZip · **Validación**: Zod · **Gráficos**: Recharts

## Módulos incluidos

1. Multiempresa con RLS estricto por `company_id`
2. Clientes por empresa
3. Facturas + PDF profesional + descarga + export CSV
4. Gastos y tickets (8 categorías) + export CSV
5. Cobros pendientes con días vencidos, alertas y export CSV
6. Resumen mensual + trimestral con **PDF resumen descargable**
7. Documentos para gestoría (export ZIP con PDFs + CSV + resumen)
8. Inbox WhatsApp + parser de comandos
9. **Simulador de webhook (`/demo-webhook`)** para probar mensajes sin Meta
10. OCR (stub listo para conectar Vision / Mindee / OpenAI)
11. Dashboard con KPIs, gráfico 6 meses y top clientes
12. Roles `superadmin` / `gestor` / `cliente_empresa`, RLS, audit log
13. Datos demo realistas (3 empresas, 18 clientes, 32 facturas, 32 gastos, 20 mensajes WA)

## Roles y acceso

Tras crear cuenta, un superadmin asocia el usuario a su empresa:

```sql
-- Cliente de una empresa concreta
INSERT INTO public.user_roles (user_id, role, company_id)
VALUES ('<uuid_usuario>', 'cliente_empresa', '<uuid_empresa>');

-- Superadmin (ve todas las empresas)
INSERT INTO public.user_roles (user_id, role) VALUES ('<uuid_usuario>', 'superadmin');
```

Empresas demo disponibles:
- `11111111-1111-1111-1111-111111111111` — Construcciones Pérez (+34620111222)
- `22222222-2222-2222-2222-222222222222` — Bar La Plaza (+34620333444)
- `33333333-3333-3333-3333-333333333333` — Tienda Mateo (+34620555666)

## Comandos WhatsApp

| Comando | Ejemplo | Acción |
|---|---|---|
| `FACTURA` | `FACTURA 350 reparar tejado a Juan` | Crea factura borrador |
| `GASTO` | `GASTO gasoil 65` | Crea gasto pendiente |
| `COBRO` | `COBRO 2026-0014` | Marca como cobrada |
| `RESUMEN` | `RESUMEN marzo` | Consulta en panel |
| `GESTORIA` | `GESTORIA trimestre 1` | Marca trimestre listo |
| `AYUDA` | `AYUDA` | Lista de comandos |

Mensajes incompletos quedan `pendiente` para revisión manual en **Inbox**.

## 🔌 Conectar WhatsApp Cloud API (paso a paso)

### URLs de tus edge functions
- **Webhook**: `https://ubsdjhrtrgxjcbbjdawe.supabase.co/functions/v1/wa-webhook`
- **Process**: `https://ubsdjhrtrgxjcbbjdawe.supabase.co/functions/v1/wa-process-message`

### Pasos en Meta for Developers

1. Entra en https://developers.facebook.com/apps y crea una app tipo **Business**.
2. Añade el producto **WhatsApp** → "Configuración de la API".
3. Apunta el **Phone Number ID** y el **WhatsApp Business Account ID**.
4. Genera un **System User Access Token** permanente (en Business Settings).
5. En tu app, sección **Webhooks → WhatsApp Business Account**, pulsa **Configurar**:
   - **URL de devolución de llamada**: la URL del webhook de arriba.
   - **Token de verificación**: invéntate uno (ej. `papeleo-facil-2026`) y guárdalo, lo necesitarás como secret.
6. Pulsa **Verificar y guardar**. Meta hará un GET de verificación; el webhook responde con el challenge si el token coincide.
7. Suscríbete al campo **`messages`**.
8. En la BBDD, edita la empresa y pon `whatsapp_number = '+34XXXXXXXXX'` (el número Meta exacto, con prefijo `+`).
9. Configura los secrets en Lovable Cloud:
   - `WHATSAPP_VERIFY_TOKEN` = el token que inventaste en el paso 5
   - `WHATSAPP_PHONE_NUMBER_ID` = del paso 3
   - `WHATSAPP_ACCESS_TOKEN` = del paso 4
10. Envía un mensaje de prueba al número desde tu móvil → aparecerá en el **Inbox** y se procesará automáticamente.

### Probar sin Meta

Mientras configuras Meta, usa la ruta **`/demo-webhook`** del panel. Inserta mensajes simulados y los pasa por el mismo parser. Útil para demos y pruebas.

## 💳 Registro con pago Stripe (flujo nuevo)

El alta real **solo ocurre tras confirmación de pago** vía webhook de Stripe.
Una empresa se crea únicamente cuando Stripe confirma la suscripción activa.

### Variables de entorno (secrets en Lovable Cloud)

- `STRIPE_SECRET_KEY` — clave secreta de tu cuenta Stripe (`sk_test_...` / `sk_live_...`)
- `STRIPE_WEBHOOK_SECRET` — secret del endpoint webhook (`whsec_...`)
- `STRIPE_PRICE_BASIC` — id del precio de la suscripción (ej. `price_1TOvfUK1FKaKxeSFcSYb1GPb`)

> ⚠️ Nunca pongas estos valores en el código. Se gestionan como secrets.

### Endpoints

- **Crear checkout**: `POST {SUPABASE_URL}/functions/v1/stripe-create-checkout`
  Body: `{ email, password, nombre_comercial, razon_social?, nif?, telefono?, whatsapp_number? }`
  o reintento: `{ pending_id }`. Devuelve `{ url, pending_id }`.
- **Webhook Stripe**: `POST {SUPABASE_URL}/functions/v1/stripe-webhook`
  → Esta es la URL que tienes que pegar en Stripe.
- **Estado de registro**: `GET {SUPABASE_URL}/functions/v1/registration-status?session_id=...`
  o `?pending_id=...`. Lo usa la página `/billing/success` para mostrar la activación.

### URLs concretas de este proyecto

- Webhook Stripe: `https://ubsdjhrtrgxjcbbjdawe.supabase.co/functions/v1/stripe-webhook`
- Crear checkout: `https://ubsdjhrtrgxjcbbjdawe.supabase.co/functions/v1/stripe-create-checkout`
- Success: `/billing/success?session_id={CHECKOUT_SESSION_ID}`
- Cancel: `/billing/cancel?pending_id=...`

### Configurar el webhook en Stripe (Dashboard → Developers → Webhooks)

1. Pulsa **Add endpoint**.
2. **Endpoint URL**: `https://ubsdjhrtrgxjcbbjdawe.supabase.co/functions/v1/stripe-webhook`
3. **Events to send** (selecciona estos 6):
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Crea el endpoint y copia el **Signing secret** (`whsec_...`) → guárdalo como `STRIPE_WEBHOOK_SECRET`.

### Flujo de registro

1. Usuario rellena el formulario en `/auth` (tab "Crear cuenta").
2. El frontend llama a `stripe-create-checkout` que:
   - guarda un `pending_registration` con `status = 'pending_payment'` y password hasheada (bcrypt) temporal,
   - crea una sesión de Stripe Checkout en modo `subscription`,
   - devuelve la URL.
3. El navegador redirige a Stripe Checkout.
4. Si el pago se confirma, Stripe llama al webhook con `checkout.session.completed` (+ eventos de subscription).
   El webhook:
   - crea el usuario en `auth.users` (auto-confirmado, importando el `password_hash`),
   - crea la `companies` con `is_active = true` y los datos de la suscripción,
   - asigna el rol `cliente_empresa`,
   - marca el `pending_registration` como `completed` y borra la password hasheada.
5. La página `/billing/success` consulta el estado y muestra "¡Cuenta activada!".
6. Si el usuario cancela, `/billing/cancel` permite reintentar el pago reutilizando el mismo `pending_registration`.

### Estados y acceso

| `subscription_status`     | `is_active` | Acceso al panel |
|---------------------------|-------------|-----------------|
| `active` / `trialing`     | true        | ✅ |
| `past_due`                | true*       | ✅ temporal — avisar al usuario |
| `canceled` / `unpaid`     | false       | ❌ |
| `incomplete_expired`      | false       | ❌ + purgable |
| `legacy` (empresas previas)| true       | ✅ — sin Stripe |

### Purga de registros no pagados

- Cron `purge_expired_registrations_hourly` corre **cada hora** (pg_cron).
- Borra todos los `pending_registrations` con `expires_at < now()` que no estén `completed`.
- Por defecto `expires_at = created_at + 24h`.
- Manual: `SELECT public.purge_expired_registrations();`

### Probar en Stripe Test

1. Pon `STRIPE_SECRET_KEY` con una clave `sk_test_...`.
2. Crea el webhook en Stripe (modo Test) y guarda su `whsec_...`.
3. Registra una cuenta nueva en `/auth`.
4. En Checkout usa la tarjeta `4242 4242 4242 4242`, fecha futura, CVC cualquiera.
5. Verás `/billing/success` y la cuenta quedará activada en pocos segundos.

### Probar cancelación

1. Inicia el registro y, en Checkout, pulsa **Back** o cierra.
2. Te llevará a `/billing/cancel`, que ofrece **Reintentar pago**.
3. Si no reintentas en 24h, el cron borra el registro provisional.

### Probar webhooks en local con Stripe CLI

```bash
stripe listen --forward-to https://ubsdjhrtrgxjcbbjdawe.supabase.co/functions/v1/stripe-webhook
stripe trigger checkout.session.completed
```

### Seguridad

- La firma del webhook se valida con `stripe.webhooks.constructEventAsync` y `STRIPE_WEBHOOK_SECRET`.
- Cada `event.id` se almacena en `stripe_events` para idempotencia (no procesar dos veces).
- El password en `pending_registrations` se guarda como hash bcrypt y se borra al activar.
- Sin pago confirmado, **no existe usuario en `auth.users` ni empresa**.

## Edge Functions

- `wa-webhook` — recibe webhooks de WhatsApp Cloud API (verificación + push). `verify_jwt = false`.
- `wa-process-message` — parser de comandos. `verify_jwt = false` (lo invoca el webhook).
- `ocr-extract` — stub OCR. `verify_jwt = true`.

## OCR real (opcional)

Sustituye `supabase/functions/ocr-extract/index.ts` por una integración real (Google Vision, Mindee u OpenAI Vision). Guarda la API key como secret y léela con `Deno.env.get(...)`.

## Validaciones

Todos los formularios validan con **Zod** (`src/lib/validation.ts`):
- Email con formato válido
- NIF/CIF (8-12 caracteres alfanuméricos)
- Teléfonos con formato internacional
- Importes 0–1.000.000 €, IVA 0–50%

## Exportaciones

| Pantalla | CSV | PDF |
|---|:-:|:-:|
| Facturas | ✅ | ✅ por factura |
| Gastos | ✅ | — |
| Cobros pendientes | ✅ | — |
| Clientes | ✅ | — |
| Empresas | ✅ | — |
| Resumen mensual | — | ✅ resumen mensual |
| Gestoría | ✅ (en ZIP) | ✅ todas las facturas + resumen + CSVs |

CSVs llevan BOM UTF-8 y separador `;` para abrirse correctamente en Excel.

## Despliegue

1. Revisa que todo está en orden (build limpio, datos demo cargados).
2. Pulsa **Publish** arriba a la derecha en Lovable.
3. Te da una URL `*.lovable.app`. Para dominio propio: *Project Settings → Domains*.
4. Para producción real:
   - Añade los 3 secrets de WhatsApp Cloud API.
   - Configura el webhook en Meta apuntando a la URL de tu edge function.
   - Edita cada empresa y pon su `whatsapp_number` real.
5. Para los superadmin/gestores, ejecuta los `INSERT` en `user_roles` (ver arriba).

## Listo vs. requiere credenciales

| ✅ Listo de fábrica | 🔑 Requiere credenciales externas |
|---|---|
| Auth email+password, multiempresa, RLS, roles | Recepción real WhatsApp (token Meta) |
| Facturas + PDF + descarga + CSV | Envío salientes WhatsApp |
| Gastos, cobros, resumen, gestoría | OCR real (Vision/Mindee/OpenAI) |
| Inbox WA + parser de comandos | Email automático a gestoría |
| Simulador `/demo-webhook` | |
| Export ZIP mensual + CSV + PDF resumen | |
| Dashboard con KPIs y gráficos | |
| Datos demo realistas | |

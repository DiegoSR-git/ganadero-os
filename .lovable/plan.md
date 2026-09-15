
## Objetivo

Permitir que un usuario se registre como **Gestoría**, pague 25€/mes y gestione hasta 10 empresas (propias o vinculadas por solicitud). Las empresas vinculadas a una gestoría activa reciben 50% de descuento en su suscripción.

## 1. Base de datos

Nueva tabla `gestorias`:
- `id`, `user_id` (titular), `nombre`, `nif`, `email`, `telefono`, `direccion`
- `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `current_period_end`, `is_active`
- `max_empresas` (default 10), `created_at`, `updated_at`

Nueva tabla `gestoria_empresa_links`:
- `id`, `gestoria_id`, `company_id`, `status` (`pending` | `accepted` | `rejected` | `revoked`)
- `requested_by` (`empresa` o `gestoria`), `requested_at`, `decided_at`, `notas`
- UNIQUE (gestoria_id, company_id)

Cambios en `companies`:
- Nuevo campo `gestoria_id uuid NULL` (rellena cuando hay link `accepted`)
- Mantener `gestoria_email/nombre` como datos libres (cuando no hay vínculo)

Nuevo rol en enum `app_role`: añadir `'gestoria'`.

Funciones SECURITY DEFINER:
- `is_gestoria_active(_user_id)` → bool (existe gestoría con is_active=true)
- `user_owns_gestoria(_user_id, _gestoria_id)` → bool
- `gestoria_manages_company(_user_id, _company_id)` → bool (vínculo accepted + gestoría activa)
- Actualizar `user_has_company` para incluir el caso de gestoría vinculada

RLS:
- `gestorias`: el dueño SELECT/UPDATE; staff ALL
- `gestoria_empresa_links`: gestoría dueña y empresa implicada ven y gestionan sus solicitudes
- Companies/invoices/expenses/clients/etc.: ampliar política para que `gestoria_manages_company` también pueda leer/operar

Trigger: cuando un link pasa a `accepted` → set `companies.gestoria_id`; cuando vuelve a `revoked/rejected` → set NULL.

## 2. Stripe

Nuevos precios (env vars en edge functions):
- `STRIPE_PRICE_GESTORIA` (25€/mes)
- `STRIPE_PRICE_BASIC_DISCOUNTED` (50% dto) o usar `coupon`/`promotion_code` aplicado en checkout.

Edge functions:
- `stripe-create-checkout-gestoria` (nueva): crea sesión de suscripción para la gestoría
- `stripe-create-checkout` (existente): si la empresa tiene `gestoria_id` con suscripción activa, aplicar precio descontado o cupón 50%
- `stripe-webhook`: añadir handling para `customer.subscription.*` del producto gestoría → actualizar `gestorias.is_active` y fechas. Si una gestoría se cancela, las empresas dependientes pierden el descuento (en siguiente renovación).

## 3. Frontend

**Registro/Auth**
- En `/auth`, nuevo toggle: "Soy empresa" / "Soy gestoría". Si gestoría: pide nombre, NIF, email, teléfono → crea fila en `gestorias` (función RPC `signup_create_gestoria`) y redirige a checkout Stripe del plan gestoría.

**Nueva sección Gestoría** (visible solo si el usuario tiene rol `gestoria`):
- `/gestoria-panel` (renombrar la actual `/gestoria` a `/gestoria-cierres` o mantener; usamos ruta nueva `/panel-gestoria`)
- Pestañas:
  - **Mis empresas**: tabla de empresas vinculadas (status accepted), con switch para entrar como esa empresa (cambia `currentCompanyId`)
  - **Solicitudes**: pendientes de aprobar (empresas que pusieron mi email o pidieron vincularse)
  - **Invitar empresa**: por email → crea link `pending` con `requested_by='gestoria'`
  - **Mi cuenta**: datos de la gestoría + estado de suscripción + plazas usadas (X/10)

**Sidebar (AppLayout)**:
- Nuevo item "Panel gestoría" visible si `isGestoria`
- El selector de empresa muestra también las vinculadas

**MiEmpresa**:
- Banner: "¿Tu gestoría usa Papeleo Fácil? Vincúlate y obtén 50% dto" → input de email gestoría → crea link `pending` con `requested_by='empresa'`. Si la gestoría ya está registrada con ese email, aparece estado "Pendiente de aprobación".
- Si hay vínculo aceptado: badge "Gestoría: X · Descuento 50% activo".

**Auto-detección**: al guardar `gestoria_email` en companies, si coincide con una gestoría registrada, crear automáticamente un link `pending` (no se acepta solo; la gestoría aprueba).

**useAuth**:
- Añadir `isGestoria`, `gestoriaId`
- Cargar las empresas vinculadas (via RPC) además de las propias

## 4. Landing

Añadir bloque "Para gestorías" con CTA → registro como gestoría. Mencionar 25€/mes hasta 10 empresas y descuento 50% a sus clientes.

## 5. Secrets necesarios

Pediré después de aprobación:
- `STRIPE_PRICE_GESTORIA` (price_... del producto 25€/mes)
- `STRIPE_PRICE_BASIC_DISCOUNTED` o `STRIPE_COUPON_50` (preferible cupón 50% recurring)

## Técnico — orden de implementación

```text
1) Migración: enum role, tablas gestorias y gestoria_empresa_links, funciones, RLS, trigger
2) Edge functions: stripe-create-checkout-gestoria + ajuste de stripe-webhook y stripe-create-checkout
3) Auth + signup gestoría (RPC signup_create_gestoria)
4) useAuth: cargar gestoria + empresas vinculadas
5) Página /panel-gestoria con pestañas
6) MiEmpresa: solicitud de vinculación
7) Landing: bloque gestorías
8) Pruebas: aceptar solicitud, ver empresa vinculada, cobro descontado
```

## Fuera de alcance (siguiente iteración, lo aviso)

- Reasignar el descuento retroactivamente a suscripciones ya pagadas (solo aplica a nuevos checkouts o renovaciones).
- Sub-cuentas de usuarios dentro de la gestoría (varios empleados con acceso al mismo panel).
- Facturación interna a la gestoría por número real de empresas (de momento fijo 10).

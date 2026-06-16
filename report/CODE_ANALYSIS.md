# Análisis de Código — OMNIRA_Font

## Visión general

OMNIRA es una plataforma SaaS B2B que permite a negocios conectar un bot de WhatsApp con IA. Los clientes se registran, pagan, configuran sus credenciales de Meta Cloud API y reciben leads, chats y citas automatizadas desde WhatsApp.

---

## Arquitectura: 3 sub-aplicaciones independientes

```
OMNIRA_Font/
├── server/      → API REST (Node.js + Express 5)
├── frontend/    → Landing pública + panel de cliente (React 18 + Vite)
└── admin/       → Dashboard interno para administradores (React 18 + Vite)
```

Cada sub-app se despliega por separado en Vercel (`vercel.json` propio). La comunicación entre frontend/admin y server es REST sobre HTTP.

---

## Server (`server/src/index.js`)

### Stack
| Tecnología | Uso |
|---|---|
| Express 5 | Framework HTTP |
| Supabase (PostgreSQL) | Base de datos y autenticación de servicio |
| Stripe | Cobros (checkout redirect + embedded Elements) |
| Meta Cloud API | Webhooks de WhatsApp entrante |
| OpenAI | Respuestas del bot (vía `metaWhatsAppWebhook.js`) |
| Nodemailer / IMAPFlow | Envío y lectura de emails |
| JWT (jsonwebtoken) | Sesiones de clientes |

### Grupos de endpoints

**Públicos (sin auth)**
- `GET /api/public/pricing` — planes activos para la landing
- `GET /api/public/widget-settings` — toggle del botón flotante de WhatsApp
- `GET /api/public/stripe-publishable-key` — clave Stripe para el frontend
- `GET/POST /api/meta/whatsapp/webhook` — webhook de Meta (verificación HMAC)
- `POST /api/stripe/webhook` — webhook de Stripe (firma verificada)

**Clientes (`requireCustomer` — JWT)**
- Auth: registro, login, reset de contraseña
- Perfil y suscripción (`/api/customer/me`, `/stripe/checkout`, `/stripe/payment-intent`)
- WhatsApp: config de credenciales Meta, verificación contra Graph API, snippet de widget
- Bot: system prompt, knowledge base, greeting por cliente
- Datos: conversaciones, mensajes, leads, dashboard con métricas
- Calendario: OAuth Google, sincronización de eventos

**Admin (sin middleware — acceso por credencial directa)**
- CRUD de usuarios, notificaciones, facturas, configuración del bot global
- Settings de la plataforma (WhatsApp, precios, toggle widget)

### Autenticación

- **Clientes**: JWT firmado en login, verificado por `requireCustomer` en cada request protegido. Almacenado en `localStorage` en el frontend (`omnira_session`).
- **Admin**: Login simple con email + contraseña hasheada (PBKDF2-SHA512, 120k iteraciones). El JWT se almacena en `sessionStorage`. Los endpoints de admin no tienen middleware de auth centralizado — dependen de que el panel solo lo use el admin.
- **Contraseñas**: `crypto.pbkdf2Sync` con salt aleatorio de 16 bytes.

### Flujo de pago

```
Cliente elige plan
  → POST /api/customer/stripe/checkout  (redirect a Stripe Checkout)
  ó POST /api/customer/stripe/payment-intent  (embedded Elements en el panel)
  → Stripe llama a POST /api/stripe/webhook con checkout.session.completed
  → applyPaidCheckoutSession() actualiza subscription_ends_at en customer_users
  → Cliente queda activo hasta que expira la fecha
```

Hay un endpoint `/subscription/simulate` para testing local (controlado por `OMNIRA_ALLOW_SUBSCRIPTION_SIMULATE` en `platform_settings`).

### Bot de WhatsApp (multi-tenant)

El webhook de Meta llega a `/api/meta/whatsapp/webhook`. El `phone_number_id` del payload identifica qué cliente es:

1. `findCustomerConfigByPhoneNumberId()` busca en `customer_whatsapp_configs`
2. Lee el `bot_configs` de ese cliente (system prompt + knowledge base)
3. Llama a OpenAI con el historial de la conversación
4. Responde vía Meta Graph API
5. Persiste el mensaje en `wa_messages` y actualiza `wa_leads`

La firma HMAC (`X-Hub-Signature-256`) se verifica con el `meta_app_secret` del cliente.

---

## Frontend (`frontend/src/`)

### Estructura

```
App.jsx
  ├── LandingPage.jsx           → Secciones de marketing (Hero, Pricing, FAQ…)
  ├── ClientPanel (lazy)        → Panel de cliente (se carga solo cuando se abre)
  │     ├── AuthLogin/Register  → Autenticación
  │     ├── PostLoginPaymentStep → Flujo de pago post-registro
  │     ├── PostLoginWhatsAppSetup → Configuración Meta del cliente
  │     └── Dashboard           → Métricas, chats, leads, calendario, bot config
  ├── PrivacyPage / TermsPage   → Páginas legales
  └── WhatsAppFloat             → Botón flotante (controlado por /api/public/widget-settings)
```

### Decisiones relevantes

- **Lazy loading del panel**: `ClientPanel` importa pdfjs-dist, xlsx y mammoth (~1.2 MB). Se carga de forma diferida para no penalizar la landing.
- **Enrutado sin React Router**: usa `usePathname` (hook propio basado en `window.location`) y condicionales en `AppInner`. El "panel" es un overlay/modal, no una ruta.
- **PanelContext**: estado global del panel (abierto/cerrado, vista activa). No hay Redux.
- **API client**: `src/api/client.js` centraliza las llamadas HTTP con el JWT del `localStorage`.

### Constantes de configuración

- `src/constants/plans.js` — definición local de planes (se sobreescribe con los del servidor)
- `src/constants/site.js` — URLs base y textos globales
- `src/constants/marketingWhatsApp.js` — número de WhatsApp de marketing

---

## Admin (`admin/src/`)

SPA con React Router v6. Todas las rutas están protegidas por `ProtectedRoute` que verifica `AdminAuthContext`.

### Páginas principales

| Ruta | Función |
|---|---|
| `/` | Dashboard con KPIs globales |
| `/clients` | Lista de clientes pagados |
| `/clients/:id` | Detalle de cliente con WhatsApp, leads, facturas |
| `/leads` | Leads globales de WhatsApp |
| `/chats` | Conversaciones globales de WhatsApp |
| `/bot-config` | Prompt global del bot |
| `/pricing` | Gestión de planes y precios |
| `/notifications` | Notificaciones a usuarios |
| `/whatsapp` | Settings de Meta para el bot plataforma |
| `/emails` | Cliente de email integrado (IMAP/SMTP) |
| `/analytics` | Métricas agregadas |

---

## Base de datos (Supabase/PostgreSQL)

Las migraciones están en `server/sql/` por fases:

| Fase | Qué añade |
|---|---|
| schema.sql | Tablas base: `customer_users`, `admin_users`, `bot_configs`, `platform_settings` |
| phase1 | `wa_leads`, `wa_messages` |
| phase2 | `pricing_plans` |
| phase3 | `customer_whatsapp_configs` (multi-tenant) |
| phase4 | Routing por `phone_number_id` |
| phase9 | `customer_events`, `customer_payments` |
| phase11 | `email_drafts` |
| phase12 | `customer_calendar_connections` |

---

## Integraciones externas

| Servicio | Para qué |
|---|---|
| Meta Cloud API (Graph v21) | Envío/recepción de WhatsApp, verificación de números |
| OpenAI | Generación de respuestas del bot |
| Stripe | Cobros y webhooks |
| Supabase | DB + acceso con `service_role` key |
| Google OAuth 2.0 | Sincronización de Google Calendar |
| SMTP / IMAP | Email transaccional y bandeja de entrada del admin |

---

## Observaciones

- **Sin autenticación en endpoints admin**: los endpoints `/api/admin/*` no tienen un middleware de auth. Dependen de que el panel admin sea de acceso privado. Esto es un riesgo si el servidor queda expuesto.
- **Escalabilidad**: la caché de `platform_settings` y `bot_configs` es in-process (variable en memoria), lo que no funciona bien con múltiples instancias de servidor (Vercel functions). En producción cada invocación podría tener su propio estado.
- **Multi-tenancy progresiva**: el código tiene comentarios que indican fases ("Phase 1", "Phase 3") — el sistema arrancó single-tenant y se está migrando a multi-tenant por cliente.

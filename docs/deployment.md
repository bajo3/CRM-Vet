# Despliegue de CRM Vet

## Arquitectura productiva

| Componente | Plataforma | Responsabilidad |
| --- | --- | --- |
| Web Next.js | Vercel | Panel, autenticación, webhook de Zernio y Server Actions |
| PostgreSQL | Supabase | Datos multiempresa, turnos, historia clínica y mensajería |
| Worker de recordatorios | Railway (`CRM-Vet-Reminders`) | Recordatorios, mensajes programados y barrido de reintentos de la outbox |
| WhatsApp | Zernio (Meta Cloud API) | Envío y recepción por el número oficial de cada clínica |

## Vercel

Variables de producción requeridas:

- `DATABASE_URL`: usar el pooler transaccional de Supabase (puerto 6543) con `pgbouncer=true&connection_limit=1` para evitar agotar conexiones en funciones serverless.
- `SESSION_SECRET`: secreto largo y aleatorio para firmar cookies.
- `APP_URL`: URL canónica del CRM.
- `ZERNIO_API_KEY`: API key server-side de Zernio.
- `ZERNIO_WEBHOOK_SECRET`: secreto con el que Zernio firma los webhooks.

El proyecto está conectado a la rama `main`. Cada push genera un nuevo deployment. Antes de promover cambios, ejecutar las cuatro verificaciones documentadas en el README.

Las migraciones no corren en el build: aplicarlas con `npx prisma migrate deploy`. Si una migración elimina columnas que el código anterior todavía usa, aplicarla recién después de que el deploy nuevo esté activo.

## Railway

Servicio: `CRM-Vet-Reminders`, con `railway.reminders.toml` como archivo de configuración (Railpack, `npm run start:reminders`, reinicio ante fallos).

Variables requeridas:

- `DATABASE_URL`.
- `ZERNIO_API_KEY`.
- `REMINDER_PROVIDER=outbox`.
- `WHATSAPP_LOG_LEVEL=info`.

## Conexión del WhatsApp de una clínica

1. Iniciar sesión como OWNER o ADMIN.
2. Abrir **Configuración** y tocar **Conectar WhatsApp**.
3. Completar el Embedded Signup de Meta con la cuenta que administra el negocio.
4. Al volver al CRM, la tarjeta **Canal de WhatsApp** muestra el número conectado.

El webhook se registra una sola vez para toda la plataforma: `npm run zernio:webhook -- <url pública del CRM>`.

## Verificación posterior

1. Enviar `turno` desde otro teléfono al número de la clínica.
2. Confirmar que la conversación aparece en Mensajes y que el bot responde.
3. Tomar la conversación y enviar una respuesta humana.
4. Verificar en Vercel que `/api/whatsapp/zernio/webhook` no registre errores.

## Rotación de secretos

Si un token o contraseña aparece en un chat, log o captura, rotarlo en el proveedor correspondiente y actualizar Vercel y Railway. Nunca reutilizar el secreto de desarrollo en producción.

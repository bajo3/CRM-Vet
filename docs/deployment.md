# Despliegue de CRM Vet

## Arquitectura productiva

| Componente | Plataforma | Responsabilidad |
| --- | --- | --- |
| Web Next.js | Vercel | Panel, autenticación, endpoints internos y Server Actions |
| PostgreSQL | Supabase | Datos multiempresa, turnos, historia clínica y mensajería |
| Bridge Baileys | Railway | Socket persistente con WhatsApp y envío/recepción de mensajes |
| Sesión Baileys | Railway Volume | Credenciales del dispositivo vinculado |

## Vercel

Variables de producción requeridas:

- `DATABASE_URL`: usar el pooler transaccional de Supabase (puerto 6543) con `pgbouncer=true&connection_limit=1` para evitar agotar conexiones en funciones serverless.
- `SESSION_SECRET`: secreto largo y aleatorio para firmar cookies.
- `INTERNAL_WHATSAPP_TOKEN`: secreto compartido exclusivamente con el worker.
- `APP_URL`: URL canónica del CRM.
- `WHATSAPP_BRIDGE_URL`: dominio público del servicio Railway, sin barra final.

El proyecto está conectado a la rama `main`. Cada push genera un nuevo deployment. Antes de promover cambios, ejecutar las cuatro verificaciones documentadas en el README.

## Railway

Servicio recomendado: `CRM-Vet-WhatsApp`.

Variables requeridas:

- `APP_URL`: URL canónica de Vercel.
- `INTERNAL_WHATSAPP_TOKEN`: debe coincidir exactamente con Vercel.
- `WHATSAPP_CLINIC_KEY`: clave de sesión configurada en la clínica.
- `WHATSAPP_AUTH_DIR=/app/sessions/crm-vet`.
- `WHATSAPP_LOG_LEVEL=info`.
- `NODE_ENV=production`.

Configuración operativa:

- `railway.toml` establece Railpack, el comando `npm run start:whatsapp` y reinicio ante fallos.
- Montar un volumen exclusivo en `/app/sessions`.
- Mantener una sola réplica por número de WhatsApp.
- Generar un dominio Railway para que Vercel consulte el estado del bridge.
- No exponer `INTERNAL_WHATSAPP_TOKEN` en logs, URLs o código fuente.

## Vinculación inicial

1. Confirmar que Vercel y Railway están en estado saludable.
2. Iniciar sesión como OWNER o ADMIN.
3. Abrir **Configuración > Canal de WhatsApp**.
4. En el teléfono, abrir **WhatsApp > Dispositivos vinculados > Vincular dispositivo**.
5. Escanear el QR mostrado en el CRM.
6. Esperar a que el estado cambie a **WhatsApp conectado**.

## Verificación posterior

1. Enviar `turno` desde otro teléfono.
2. Confirmar que la conversación aparece en Mensajes.
3. Tomar la conversación y enviar una respuesta humana.
4. Verificar en Railway que no existan reinicios repetidos ni errores HTTP.
5. Verificar en Vercel que los endpoints internos no registren errores de base de datos.

## Rotación de secretos

Si un token o contraseña aparece en un chat, log o captura, rotarlo en el proveedor correspondiente y actualizar Vercel y Railway antes de reiniciar el worker. Nunca reutilizar el secreto de desarrollo en producción.

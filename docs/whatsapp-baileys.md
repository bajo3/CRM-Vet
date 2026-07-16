# WhatsApp con Baileys

## Sesión

`useMultiFileAuthState` guarda la sesión bajo `WHATSAPP_AUTH_DIR`. El directorio debe montarse sobre almacenamiento persistente, con acceso exclusivo para una sola réplica del worker por número. Nunca debe incluirse en backups públicos ni en Git.

## Flujo entrante

1. Baileys recibe `messages.upsert`.
2. El worker ignora mensajes propios, grupos, estados y contenido vacío.
3. Publica un sobre limitado al endpoint interno usando `x-internal-token`.
4. El CRM deduplica por clínica y `eventId`.
5. El CRM guarda mensaje y estado de conversación, aplica el flujo y encola la respuesta como `HUMAN_QUEUED`.
6. El worker vacía inmediatamente la outbox, además del polling de respaldo cada 3 segundos.
7. El resultado queda trazado como `SENT`, `DELIVERED`, `READ` o `FAILED` y se muestra en la bandeja.

## Operación

- Una sola réplica por `WHATSAPP_CLINIC_KEY`.
- Volumen persistente para `.data/baileys`.
- Reinicio automático del proceso.
- Endpoint del CRM accesible desde el worker.
- Secretos distintos por ambiente.
- Número de prueba durante el MVP.

## Vinculación por QR desde el CRM

El worker levanta un servidor HTTP liviano en `PORT` (3900 por defecto):

- `GET /health`: estado básico para Railway, sin datos sensibles.
- `GET /status`: estado de conexión y QR como data URL. Requiere el mismo `x-internal-token` que usa el worker para comunicarse con el CRM.

La aplicación web consulta ese endpoint desde el servidor mediante `WHATSAPP_BRIDGE_URL`. El navegador nunca recibe el token interno ni accede directamente a Railway. Un usuario con rol OWNER o ADMIN puede abrir **Configuración > Canal de WhatsApp** y escanear el QR desde ahí.

Estados posibles: iniciando, esperando QR, conectado, reconectando, sesión cerrada o no disponible. El panel consulta el estado cada cinco segundos y el QR se renueva automáticamente hasta completar la vinculación.

### Railway

El servicio `CRM-Vet-WhatsApp` usa:

- comando de inicio `npm run start:whatsapp` definido en `railway.toml`;
- volumen persistente montado en `/app/sessions`;
- `WHATSAPP_AUTH_DIR=/app/sessions/crm-vet`;
- dominio público únicamente para que Vercel pueda consultar `/status` con autenticación interna;
- una sola réplica, para evitar dos sockets sobre el mismo número.

Después de vincular el teléfono, las credenciales quedan en el volumen y sobreviven a redeploys y reinicios.

## Salientes: reclamo atómico y reintentos

El worker consulta `GET /api/internal/whatsapp/outbound?clinicKey=...` cada 3s. Esa ruta reclama todas las respuestas nuevas (bot, equipo y recordatorios) en estado `HUMAN_QUEUED` de forma atómica: pasan a `SENDING` antes de devolverse, así que dos polls solapados nunca reciben el mismo mensaje. El worker reporta el resultado con `POST`; un fallo incrementa `attempts` y vuelve a `HUMAN_QUEUED` hasta 3 intentos, recién entonces queda `FAILED` definitivo.

Las confirmaciones posteriores de Baileys (`messages.update`) se registran mediante `POST /api/internal/whatsapp/delivery`, pasando el mensaje de `SENT` a `DELIVERED` y luego a `READ`. El estado antiguo `QUEUED` queda reservado para respuestas históricas sin confirmación: no se reclama, evitando que un despliegue reenvíe mensajes viejos de golpe.

## Rate limiting

`/api/internal/whatsapp/events` y `/api/internal/whatsapp/outbound` aplican, además del token interno, un límite de 60 requests/minuto por IP+ruta; `/delivery` admite 120 para absorber confirmaciones de entrega y lectura (`src/lib/rate-limit.ts`, en memoria del proceso). Es una mitigación básica para el caso de que el token se filtre, no un reemplazo de un firewall o WAF.

## Migración futura

El contrato `IncomingWhatsappEvent` y la lógica `processIncomingWhatsapp` no dependen de Baileys. Un adaptador para Meta Cloud API deberá convertir sus webhooks al mismo contrato y consumir la misma outbox mediante Graph API.

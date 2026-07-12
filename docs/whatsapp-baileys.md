# WhatsApp con Baileys

## Sesión

`useMultiFileAuthState` guarda la sesión bajo `WHATSAPP_AUTH_DIR`. El directorio debe montarse sobre almacenamiento persistente, con acceso exclusivo para una sola réplica del worker por número. Nunca debe incluirse en backups públicos ni en Git.

## Flujo entrante

1. Baileys recibe `messages.upsert`.
2. El worker ignora mensajes propios, grupos, estados y contenido vacío.
3. Publica un sobre limitado al endpoint interno usando `x-internal-token`.
4. El CRM deduplica por clínica y `eventId`.
5. El CRM guarda mensaje y estado de conversación, aplica el flujo y devuelve texto de respuesta.
6. El worker envía la respuesta al mismo JID.

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

El worker consulta `GET /api/internal/whatsapp/outbound?clinicKey=...` cada 3s. Esa ruta reclama los mensajes `HUMAN_QUEUED` de forma atómica (pasan a `SENDING` antes de devolverse), así que si un envío tarda más que el intervalo de poll, el mismo mensaje nunca se reporta dos veces. El worker reporta el resultado con `POST` (mismo `clinicKey` en la query) — un fallo no marca `FAILED` al primer intento: incrementa `attempts` y vuelve a `HUMAN_QUEUED` hasta 3 intentos, recién ahí queda `FAILED` definitivo. Ver `src/lib/services/whatsapp-outbound.ts`.

## Rate limiting

`/api/internal/whatsapp/events` y `/api/internal/whatsapp/outbound` aplican, además del token interno, un límite de 60 requests/minuto por IP+ruta (`src/lib/rate-limit.ts`, en memoria del proceso). Es una mitigación básica para el caso de que el token se filtre, no un reemplazo de un firewall o WAF. Limitación conocida: al vivir en memoria del proceso no es distribuido — con una sola instancia (el despliegue actual) alcanza.

## Migración futura

El contrato `IncomingWhatsappEvent` y la lógica `processIncomingWhatsapp` no dependen de Baileys. Un adaptador para Meta Cloud API deberá convertir sus webhooks al mismo contrato y enviar el `reply` mediante Graph API.

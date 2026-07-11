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

## Migración futura

El contrato `IncomingWhatsappEvent` y la lógica `processIncomingWhatsapp` no dependen de Baileys. Un adaptador para Meta Cloud API deberá convertir sus webhooks al mismo contrato y enviar el `reply` mediante Graph API.


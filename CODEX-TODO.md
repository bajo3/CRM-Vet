# CRM Vet — Estado del proyecto y tareas para Codex

Actualizado: 11/07/2026. Este archivo documenta el estado real verificado del proyecto y lo que falta,
para que un agente (Codex) continúe el trabajo. **Leé este archivo completo antes de tocar código.**

## Reglas del proyecto (obligatorias)

- **Next.js 16.2.10 tiene breaking changes** respecto a versiones anteriores (ej.: `middleware.ts` ahora es
  `src/proxy.ts`). Ante cualquier duda de API de Next, leé la guía en `node_modules/next/dist/docs/` ANTES de escribir código.
- La especificación funcional completa del producto está en el prompt original del proyecto; las reglas duras:
  multiempresa estricta (todo query/mutación filtra por `clinicId` de la sesión, nunca del cliente),
  toda mutación de dominio pasa por los servicios de `src/lib/services/`, textos de usuario en español rioplatense
  (CON tildes), código e identificadores en inglés, sin información técnica visible al usuario, sin modales anidados,
  responsive, formularios cortos.
- **NO modificar ni imprimir `DATABASE_URL` ni secretos.** No loguear contenido sensible.
- No agregar dependencias sin necesidad concreta. Nada de Redis/BullMQ/colas/microservicios.
- Fuera de alcance del MVP (NO desarrollar): facturación, caja, inventario, internaciones, laboratorio,
  recetas, estadísticas, marketing, IA clínica, Mercado Pago.
- Después de cada cambio: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` deben pasar.

## Infraestructura

- **Base de datos: Supabase Postgres** (proyecto `crm-vet`, ref `zldvsyhunovjqfvamjjl`, región `sa-east-1`).
  `.env` ya tiene el `DATABASE_URL` correcto (session pooler, puerto 5432). No hace falta Docker.
- Migraciones Prisma en `prisma/migrations/` (3 aplicadas). Aplicar nuevas con `npm run db:migrate`.
- **Tests** corren contra el schema `vet_test` de la MISMA base (el globalSetup hace `prisma db push` ahí).
  Jamás tocar el schema `public` desde tests. Son lentos (~45 s) por ser base remota; `fileParallelism: false`.
- Ojo: la exclusion constraint anti-solapamiento (`Appointment_no_overlap_excl`, btree_gist) existe solo en
  `public` (vive en la migración SQL, no en `schema.prisma`), en `vet_test` la concurrencia la cubre el
  aislamiento Serializable.
- Credenciales demo (seed `Veterinaria Patitas`): `sofia@patitas.com` (OWNER), `marcos@patitas.com` (RECEPTIONIST),
  `ana@patitas.com` y `bruno@patitas.com` (VETERINARIAN) — contraseña `Patitas2026!` para todos.
  Reseed idempotente: `npm run db:seed`.
- WhatsApp real vía **Baileys** en worker aparte (`npm run dev:whatsapp`, escanear QR). El diseño mantiene
  contratos internos para migrar a Meta Cloud API más adelante.

## Sesión adicional (11/07/2026) — bug de edición, usuarios, agenda, performance, limpieza de datos

Trabajo de otro agente en paralelo (no tocó `src/lib/whatsapp/`, `worker/` ni `api/internal/whatsapp/events`,
que son de esta lista de arriba). Resumen de lo que se hizo, para que quede registrado:

- **Bug "editar clientes no funciona"**: revisado a fondo `updateClient`/`ClientForm`/`editar/page.tsx` — la
  lógica de servidor es correcta (scope por `clinicId`, Zod, manejo de teléfono duplicado, `revalidatePath`).
  No se encontró un bug de lógica. La reproducción en navegador fue muy poco confiable en esta sesión por dos
  problemas de infraestructura confirmados con evidencia (ver abajo): agotamiento del pool de conexiones de
  Supabase (`pool_size: 15`, compartido por todos los procesos — `next dev` propio, `next dev` del otro
  agente, un `next start` de producción corriendo local, workers y tests) y páginas que se quedan colgadas en
  el esqueleto de `loading.tsx` sin error visible cuando hay contención de build/HMR entre los dos `next dev`
  corriendo sobre el mismo checkout. Se aplicó un fix real y verificable: `src/lib/prisma.ts` ahora limita
  `connection_limit` a 4 por proceso (antes, sin límite explícito, Prisma abría hasta `num_cpus*2+1` — 65 en
  esta máquina de 32 núcleos — agotando el pool con sólo 1-2 procesos activos). Recomendado: si el bug persiste
  para el dueño en producción (un solo proceso `next start` desplegado), probablemente sea síntoma del mismo
  agotamiento de pool bajo carga real, no un bug de código.
- **Gestión de usuarios**: nuevo `src/lib/actions/team.ts` + `src/lib/validation/team.ts` +
  `src/app/(panel)/configuracion/team-panel.tsx`. Alta de integrante, cambio de rol, activar/desactivar, todo
  reservado a OWNER (`TEAM_MANAGE_ROLES`), con salvaguardas (no auto-desactivarse, no bajarse el propio rol,
  siempre al menos un OWNER activo). Documentado en README.
- **Agenda**: arreglado `getAvailableSlots` para excluir el turno que se está reprogramando de sus propios
  horarios ocupados (bug real, confirmado por lectura de código — ya estaba anotado más abajo en este archivo
  y en el README como pendiente). Arreglado que los slots vacíos / botones "Nuevo turno" de la grilla se
  mostraran incluso para roles sin permiso de crear turnos (ahora respetan `canCreate`). WeekView/header ahora
  preservan el filtro de veterinario al armar el link de "Nuevo turno".
- **Performance**: paralelizado con `Promise.all` todo lo independiente en Inicio, Agenda (lista, detalle,
  nuevo, reprogramar), ficha de mascota y Mensajes; agregado `src/lib/queries/clinic.ts` con `React.cache()`
  para no repetir el `findUnique` de `Clinic` entre layout y página en el mismo request; reducido
  over-fetching (selects puntuales en vez de `include` completos en clientes/agenda/mensajes/dashboard);
  `/mensajes` ahora trae sólo la lista liviana (último mensaje, no 100) + el hilo completo únicamente de la
  conversación seleccionada (antes traía hasta 100 mensajes × 50 conversaciones). Agregado `loading.tsx` por
  ruta en `/agenda`, `/clientes` y `/mensajes`.
- **Limpieza de datos demo**: `prisma/cleanup-demo.ts` (con `--dry-run`) borra sólo los 5 clientes demo del
  seed (por nombre+teléfono exactos) y todo lo que cuelga de ellos, respetando el orden de FKs `Restrict`
  (`Appointment.pet`). Ejecutado contra la base real: borró 5 clientes, 8 mascotas, 8 turnos, 13 actividades,
  5 registros médicos, 11 recordatorios, 2 conversaciones y 4 mensajes de WhatsApp demo. Verificado que
  preservó la clínica, los 4 usuarios de login, y los clientes reales ("Felipe Lentini" / "Felipe", ambos con
  su mascota "Paco"). `prisma/seed.ts` ahora es mínimo y no destructivo (clínica + usuarios, upsert, nunca
  borra); los datos de ejemplo se separaron a `prisma/seed-demo.ts` (`npm run db:seed:demo`).

## Estado verificado (11/07/2026)

- `npm run lint` → 0 errores, 3 warnings benignos (React Compiler + `watch()` de react-hook-form).
- `npm run typecheck` → limpio.
- `npm test` → **33/33 pasan** (6 archivos).
- `npm run build` → exitoso, todas las rutas compilan.

### Completo y verificado en navegador real
- **Etapa A**: modelo de datos completo (MedicalRecord, Reminder, AppointmentActivity + campos de spec),
  servicios de dominio (`src/lib/services/`), motor de recordatorios con claim atómico y reintentos
  (`worker/reminders.ts`, `npm run reminders:run|watch`, proveedor mock), constraint anti-solapamiento en DB.
- **Etapa B**: auth propia (JWT `jose` en cookie httpOnly + bcryptjs; `src/lib/auth/`), protección total del
  panel por clínica/rol, sección Clientes y mascotas completa (búsqueda por cliente/mascota/teléfono, CRUD,
  ficha de mascota con historial y "Registrar atención" que genera recordatorios automáticos).
- **Etapa C**: Agenda completa (vista diaria por veterinario, semanal, navegación, filtro, crear turno con
  slots reales, confirmar/atender/ausente/cancelar, reprogramar con actividad trazable, permisos por rol
  server-side, doble reserva concurrente rechazada — verificado con dos pestañas).

### Etapa D — INCOMPLETA (el agente se cortó a mitad de trabajo)
Existe una versión básica de `/mensajes` y `/configuracion` que compila y funciona a medias.
Archivos: `src/app/(panel)/mensajes/{page,message-composer}.tsx`, `src/app/(panel)/configuracion/{page,clinic-form}.tsx`,
`src/lib/actions/{messages,clinic}.ts`, `src/lib/validation/clinic.ts`, `src/app/api/internal/whatsapp/outbound/route.ts`,
y polling de salientes en `worker/whatsapp.ts` (cada 3 s cuando el socket está abierto).

## TAREAS PARA CODEX (en orden de prioridad)

### 1. Bugs reales del código existente (corregir primero)

1.1. **Doble envío de salientes (carrera):** `GET /api/internal/whatsapp/outbound` devuelve los mensajes
`HUMAN_QUEUED` pero NO los reclama atómicamente. Si un envío tarda más que el intervalo de poll (3 s),
el mismo mensaje se envía dos veces. Fix: en el GET, reclamar con `updateMany({ where: { id, status: "HUMAN_QUEUED" }, data: { status: "SENDING" } })`
(o equivalente por lote) y devolver solo los reclamados.

1.2. **Aislamiento multiempresa en el POST de outbound:** `POST /api/internal/whatsapp/outbound` actualiza
cualquier `whatsappMessage` por `id` sin verificar que pertenezca a la clínica del `clinicKey`. Agregar el
filtro por clínica (resolver clínica igual que el GET y usar `updateMany({ where: { id, clinicId } })`).

1.3. **Sin reintentos de salientes:** un fallo marca `FAILED` definitivo al primer intento. Implementar hasta
3 intentos (volver a `HUMAN_QUEUED`/`QUEUED` e incrementar un contador; puede requerir migración aditiva con
columna `attempts` en `WhatsappMessage` — aplicar con `npm run db:migrate`).

1.4. **Estados técnicos visibles:** las burbujas de `/mensajes` muestran el status crudo (`HUMAN_QUEUED`, `SENT`).
Traducir a "En cola / Enviado / Fallido" (regla: nada técnico visible).

1.5. **Tildes:** los archivos de Etapa D tienen textos sin tildes ("Configuracion", "Requiere atencion",
"Tu sesion expiro", "Escribi", "clinica"). Corregir a español correcto, consistente con el resto del panel.

1.6. **`resolveConversation` y `openConversation` fallan en silencio** (devuelven `void`). Aceptable para MVP,
pero al menos deberían no-op limpiamente; revisar que la UI refresque bien tras cada acción.

### 2. Completar la bandeja de Mensajes (spec sección 9)

- Filtros del spec: **Todas / Requieren atención / Automáticas / Resueltas** (hoy falta "Automáticas" y hay
  un filtro "En atención" no pedido — puede quedarse, pero agregar Automáticas).
- La lista debe mostrar: nombre del cliente, **mascota vinculada** (si existe), **último mensaje truncado**,
  **fecha/hora**, etiqueta de estado, indicador de atención humana y no leídos. Hoy solo muestra nombre + estado + badge.
- **Abrir una conversación debe poner `unreadCount = 0`** (hoy solo lo hace "Tomar conversación" o responder).
- Falta acción **"Volver a automatización"** (→ `AUTOMATED`, `flowState` limpio) para conversaciones en atención humana.
- Dentro de la conversación: mostrar **mascota vinculada con link a su ficha** y **próximo turno activo** del
  cliente con link al detalle de agenda.
- En Inicio, la tarjeta "Mensajes pendientes"/derivadas debe linkear a `/mensajes?status=REQUIRES_HUMAN` y a
  cada conversación (verificar que los links existan y funcionen).
- Mostrar quién tomó la conversación (`assignedUser`) cuando está en atención humana.

### 3. Conectar recordatorios al envío real (outbox)

Crear `OutboxWhatsAppProvider` que implemente la interfaz `WhatsAppProvider` (`src/lib/services/whatsapp-provider.ts`):
en lugar de "enviar", encola el texto como `WhatsappMessage` OUTBOUND `HUMAN_QUEUED` (o un status `QUEUED` unificado)
en la conversación del cliente (creándola si no existe) y devuelve el id interno. En `worker/reminders.ts`, elegir
proveedor por env `REMINDER_PROVIDER=mock|outbox` (default `mock`; documentarlo en README y `.env.example`).
Así el ciclo completo control → recordatorio → WhatsApp real queda operativo cuando el worker Baileys está conectado.

### 4. Completar Configuración (spec sección 10)

- Falta sección **WhatsApp** (solo OWNER): estado de la conexión (clave de sesión configurada sí/no,
  `whatsappSessionKey` enmascarada — NUNCA tokens) y texto corto de cómo vincular (escanear QR del worker).
- Sección Equipo: hoy solo lista miembros activos. Agregar toggle activo/inactivo (solo OWNER; un veterinario
  inactivo no se ofrece en agenda — el código existente ya respeta `active`).
- Verificar que la edición de días/horarios (`openingHours`) mantiene exactamente la forma que espera
  `src/lib/services/availability.ts`, y que cierre > apertura está validado en `src/lib/validation/clinic.ts`.

### 5. Tests de la Etapa D (hoy no existen)

Agregar en `tests/` (mismo patrón que los existentes, contra `vet_test`):
- Responder una conversación encola OUTBOUND y pasa a `HUMAN_ACTIVE` con `assignedUserId`.
- Resolver y volver a automatización (flowState limpio).
- Claim del outbound es atómico: dos claims concurrentes no devuelven el mismo mensaje.
- `OutboxWhatsAppProvider`: encola y `processDueReminders` marca `SENT` sin duplicar.
- Aislamiento multiempresa de la bandeja y del endpoint outbound.

### 6. Pendientes del spec para etapas posteriores (no inventar antes de lo anterior)

- **WhatsApp**: reprogramación conversacional (hoy "cambiar/reprogramar" deriva a recepción — el servicio
  `rescheduleAppointment` ya existe, falta el flujo en `src/lib/whatsapp/flow.ts`); respuesta a recordatorios de
  control con "Consultar horarios"; `MetaWhatsAppProvider` (Meta Cloud API: webhook de verificación, firma,
  plantillas, estados) manteniendo los contratos internos actuales.
- `getAvailableSlots` no excluye el turno que se está reprogramando (su horario actual no aparece como opción al reprogramar).
- Selector de clínica activa para usuarios con múltiples membresías (hoy: primera membresía activa).
- Rate limiting en endpoints internos/públicos; hoy solo hay token interno.
- Etapa de calidad: `loading.tsx` por ruta, revisar estados vacíos, accesibilidad (focus, labels, contraste),
  revisión responsive completa, manejo de errores homogéneo.
- Multiempresa real de conversaciones: hoy 1 worker Baileys = 1 clínica (`WHATSAPP_CLINIC_KEY`).

## Cómo correr todo

```bash
npm install
npm run db:generate && npm run db:migrate && npm run db:seed
npm run dev            # web en http://localhost:3000
npm run dev:whatsapp   # worker Baileys (QR) — opcional
npm run reminders:watch  # motor de recordatorios (mock por default)
npm run lint && npm run typecheck && npm test && npm run build
```

Más contexto: `README.md`, `docs/architecture.md`, `docs/whatsapp-baileys.md`.

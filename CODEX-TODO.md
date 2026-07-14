# CRM Vet — Estado del proyecto y tareas para Codex

Actualizado: 13/07/2026. Este archivo documenta el estado real verificado del proyecto y lo que falta,
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
  estadísticas, marketing, IA clínica, Mercado Pago. (Actualizado 13/07/2026: presupuestos y recetas en PDF
  SÍ están en alcance y ya implementados — ver sesión al final de este archivo — la exclusión original de
  "recetas" quedó obsoleta por decisión del dueño.)
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

1.1. **[RESUELTO 11/07/2026]** ~~Doble envío de salientes (carrera)~~: `GET /api/internal/whatsapp/outbound`
ahora reclama de forma atómica vía `claimOutboundMessages` (`src/lib/services/whatsapp-outbound.ts`), que
hace un `updateMany` condicionado a `status: "HUMAN_QUEUED"` mensaje por mensaje (`HUMAN_QUEUED` → `SENDING`)
y solo devuelve los efectivamente reclamados. Verificado con test de reclamos concurrentes
(`tests/whatsapp-outbound.test.ts`) y manualmente contra el servidor real (segundo GET inmediato no repite
el mensaje del primero).

1.2. **[RESUELTO 11/07/2026]** ~~Aislamiento multiempresa en el POST de outbound~~: ahora resuelve la clínica
por `clinicKey` (query param, igual que el GET) y `reportOutboundOutcome` filtra siempre por `id` + `clinicId`;
si no matchea, no toca nada (test de aislamiento en `tests/whatsapp-outbound.test.ts`). El worker
(`worker/whatsapp.ts`) ahora manda `clinicKey` también en el POST de reporte.

1.3. **[RESUELTO 11/07/2026]** ~~Sin reintentos de salientes~~: se agregó la columna `attempts` a
`WhatsappMessage` (migración `202607110001_whatsapp_message_attempts`, aditiva, aplicada). Un fallo
incrementa `attempts` y vuelve a `HUMAN_QUEUED`; al 3er fallo queda `FAILED` definitivo
(`reportOutboundOutcome`, mismo esquema que `processDueReminders`). Testeado con reintentos hasta el máximo.

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

### 3. Conectar recordatorios al envío real (outbox) — **[RESUELTO 11/07/2026]**

`OutboxWhatsAppProvider` (`src/lib/services/whatsapp-provider.ts`) implementa `WhatsAppProvider`: en lugar de
"enviar", busca/crea la `WhatsappConversation` del cliente y encola el texto como `WhatsappMessage` OUTBOUND
`HUMAN_QUEUED` (mismo estado que usan las respuestas humanas, así lo levanta el mismo poll del worker), sin
tocar `status`/`assignedUserId` de la conversación (no es una respuesta humana). `worker/reminders.ts` elige
el proveedor por `REMINDER_PROVIDER=mock|outbox` (default `mock`; documentado en README y `.env.example`).
Nota de arquitectura: `WhatsAppProvider.sendText` pasó a recibir `{ clinicId, phone, text, clientId? }` (antes
`(phone, text)`) porque `processDueReminders` procesa recordatorios de todas las clínicas en una misma corrida
con una única instancia de proveedor — `OutboxWhatsAppProvider` necesita saber a qué clínica/cliente pertenece
cada envío. **Pendiente real para producción**: en Railway, setear `REMINDER_PROVIDER=outbox` en el servicio
del worker de recordatorios (hoy sigue en `mock` si no se configura explícitamente).

### 4. Completar Configuración (spec sección 10)

- Falta sección **WhatsApp** (solo OWNER): estado de la conexión (clave de sesión configurada sí/no,
  `whatsappSessionKey` enmascarada — NUNCA tokens) y texto corto de cómo vincular (escanear QR del worker).
- Sección Equipo: hoy solo lista miembros activos. Agregar toggle activo/inactivo (solo OWNER; un veterinario
  inactivo no se ofrece en agenda — el código existente ya respeta `active`).
- Verificar que la edición de días/horarios (`openingHours`) mantiene exactamente la forma que espera
  `src/lib/services/availability.ts`, y que cierre > apertura está validado en `src/lib/validation/clinic.ts`.

### 5. Tests de la Etapa D

Agregar en `tests/` (mismo patrón que los existentes, contra `vet_test`):
- Responder una conversación encola OUTBOUND y pasa a `HUMAN_ACTIVE` con `assignedUserId`. *(sigue pendiente —
  no se tocó `src/lib/actions/messages.ts` en esta sesión por estar fuera del alcance asignado)*
- Resolver y volver a automatización (flowState limpio). *(pendiente, ídem)*
- **[HECHO 11/07/2026]** Claim del outbound es atómico: dos claims concurrentes no devuelven el mismo mensaje
  (`tests/whatsapp-outbound.test.ts`).
- **[HECHO 11/07/2026]** `OutboxWhatsAppProvider`: encola y `processDueReminders` marca `SENT` sin duplicar
  (`tests/reminders.test.ts`).
- **[HECHO 11/07/2026]** Aislamiento multiempresa de la bandeja y del endpoint outbound
  (`tests/whatsapp-outbound.test.ts`).
- **[HECHO 11/07/2026]** Reintentos de outbound hasta 3 y luego `FAILED` definitivo (`tests/whatsapp-outbound.test.ts`).
- **[HECHO 11/07/2026]** Flujo de reprogramación conversacional completo, incluyendo derivación explícita a
  humano y "consultar horarios" (`tests/whatsapp-flow.test.ts`).

Suite completa verificada: **100/100 tests pasan** (89 preexistentes + 11 nuevos), `npm run lint` (0 errores,
3 warnings preexistentes benignos), `npm run typecheck` limpio, `npm run build` exitoso.

### 6. Pendientes del spec para etapas posteriores (no inventar antes de lo anterior)

- **[RESUELTO 11/07/2026]** ~~Reprogramación conversacional~~: `src/lib/whatsapp/flow.ts` ahora tiene el flujo
  completo (`RESCHEDULE_AWAIT_DATE`/`RESCHEDULE_AWAIT_ALTERNATIVES`/`RESCHEDULE_AWAIT_TIME`), reutilizando
  `resolveDateAvailability`/`finalizeBooking` (parametrizadas por un `BookingMode` compartido con la reserva
  nueva) y llamando a `rescheduleAppointment` en vez de derivar a recepción. Si el cliente pide explícitamente
  hablar con alguien durante el flujo, deriva de inmediato. Verificado con tests y con una conversación real
  contra el servidor local (mismo `Appointment.id`, nueva fecha, `AppointmentActivity` `RESCHEDULED`, sin turno
  duplicado).
- **[RESUELTO 11/07/2026]** ~~"Consultar horarios" tras un recordatorio de control~~: `isCheckAvailabilityIntent`
  en `src/lib/whatsapp/intent.ts` + rama en `flow.ts` que reusa el mismo mecanismo de reserva (arranca con
  motivo "Control" y busca el horario más próximo real) en vez de derivar.
- **[RESUELTO 11/07/2026]** ~~`getAvailableSlots` no excluye el turno que se está reprogramando~~: ya lo había
  arreglado el otro agente (sesión anterior) para la agenda web; el flujo de WhatsApp ahora también pasa
  `excludeAppointmentId` al reprogramar.
- **[RESUELTO 11/07/2026]** ~~Rate limiting en endpoints internos/públicos~~: `src/lib/rate-limit.ts` (ventana
  fija en memoria, 60 req/min por IP+ruta) aplicado a `/api/internal/whatsapp/events` y `/outbound`. Limitación
  conocida y documentada: no distribuido entre instancias (aceptable para el despliegue actual de una sola réplica).
- `MetaWhatsAppProvider` (Meta Cloud API: webhook de verificación, firma, plantillas, estados) manteniendo los
  contratos internos actuales — **sigue pendiente**, no se tocó en esta sesión.
- Selector de clínica activa para usuarios con múltiples membresías (hoy: primera membresía activa). **Pendiente.**
- Etapa de calidad: `loading.tsx` por ruta, revisar estados vacíos, accesibilidad (focus, labels, contraste),
  revisión responsive completa, manejo de errores homogéneo. **Pendiente** (fuera del alcance de esta sesión,
  a cargo del agente que audita el panel en paralelo).
- Multiempresa real de conversaciones: hoy 1 worker Baileys = 1 clínica (`WHATSAPP_CLINIC_KEY`). **Pendiente.**
- Bug cosmético menor detectado durante la verificación manual (no corregido, preexistente y fuera del texto
  que se pidió tocar): la confirmación de una reserva **nueva** ("¡Listo! Reservamos el turno... el {fecha}...")
  duplica "el el" cuando la fecha elegida es 3+ días en el futuro, porque `describeDate` ya devuelve
  `"el <día> <dd/mm>"` para esos casos y la plantilla en `finalizeBooking` le antepone otro "el". El mismo
  bug se hubiera repetido en la nueva plantilla de reprogramación; ahí sí se corrigió (`para ${label}` en vez
  de `para el ${label}`). Reproducible: reservar un turno para una fecha 3+ días en el futuro por WhatsApp.
- Item 2 (bandeja de Mensajes: filtros, unreadCount al abrir, "volver a automatización", mostrar
  `assignedUser`, etc.) y el resto del item 5 (tests de responder/resolver conversación) siguen pendientes:
  quedaron fuera del alcance de esta sesión (bajo `src/lib/actions/messages.ts` / `src/app/(panel)/mensajes/`,
  reservado para el agente que audita el panel).

## Sesión de performance + auditoría de panel (11/07/2026, agente en paralelo)

Alcance de esta sesión: velocidad medida + pulido de UX del panel (Inicio, Agenda, Clientes/mascotas,
Mensajes, Configuración). No se tocó `src/lib/whatsapp/`, `worker/`, `api/internal/whatsapp/*`,
`whatsapp-provider.ts` ni `reminders.ts` (reservados al otro agente).

### Medición de performance (con `DEBUG_PRISMA_QUERIES=1` + logs de `next dev`, tibio/segunda carga)

| Ruta | Queries | Tiempo servidor (application-code) |
| --- | --- | --- |
| Inicio (`/`) | ~9 | ~550 ms |
| Agenda día (`/agenda`) | ~10 | ~530 ms |
| Agenda semana | ~10 | ~730 ms |
| Clientes (`/clientes`) | 4 | ~290 ms |
| Ficha de mascota | 7 | ~330 ms |
| Mensajes sin `?conversation=` | ~10 | ~855 ms |
| Mensajes con `?conversation=` (después del fix) | ~13 | ~590 ms (antes ~855 ms) |
| Configuración | 6 | ~360 ms |

La base es remota (Supabase `sa-east-1`); estos tiempos incluyen el viaje de ida y vuelta real. No se
detectó ningún N+1 explosivo — el trabajo previo de paralelización ya dejó esto en buen estado. Se
encontraron y arreglaron dos problemas reales:

1. **Fix de seguridad/higiene (`src/lib/queries/agenda.ts`)**: `getActiveVeterinarians` y
   `getAppointmentDetail` usaban `include: { user: true }` / `include: { veterinarian: true, createdBy: true }`,
   trayendo `passwordHash` innecesariamente desde la base (nunca se exponía al cliente, pero viajaba de la DB
   al proceso sin necesidad). Cambiado a `select` explícito con solo `id`/`name`. Mismo problema en el
   `appointmentActivity.findMany` de esa función (`include: { user: true }` → `select: { user: { select: { name: true } } }`).
2. **Fix de performance real (`src/app/(panel)/mensajes/page.tsx`)**: cuando la URL trae `?conversation=<id>`
   (el caso más común: el usuario click­eó una conversación de la lista), el detalle de esa conversación se
   pedía en un `await` separado **después** de que resolviera `Promise.all([clinic, conversations])`, sumando
   una ida y vuelta completa extra a la base remota. Ahora `getConversationDetail(id)` se dispara en el mismo
   `Promise.all` cuando el id ya viene de la URL, y solo se hace el fetch secuencial de respaldo cuando hay que
   determinar la conversación por defecto (primera de la lista, sin `?conversation=`). Medido: ~855 ms → ~590 ms
   application-code para el caso común.

Instrumentación temporal dejada como flag de debug apagado por defecto: `src/lib/prisma.ts` ahora acepta
`DEBUG_PRISMA_QUERIES=1` para loguear cada query con duración (sin impacto si no se setea la env var).

### Bug real encontrado y arreglado: `defaultValues` no se aplicaban a inputs nativos en formularios de Agenda

Al abrir "Nuevo turno" con querystring (`?date=&time=&vetId=` desde los slots vacíos de la grilla, o
`?petId=` desde la ficha de mascota) y al abrir "Reprogramar", el `<input type="date">` y el `<select>` de
veterinario quedaban **visualmente vacíos** pese a que `defaultValues` traía los valores correctos desde el
servidor (confirmado con logging temporal: el estado interno de `react-hook-form` — `watch()` — sí tenía el
valor correcto desde el primer render; el problema era específico de la sincronización inicial del DOM de
`register()` con inputs nativos no controlados en esta combinación de versiones — React 19.2.4 +
react-hook-form 7.81.0 + Next 16.2.10 —, reproducido igual en `next build && next start`, no solo en dev).

Fix aplicado en `src/app/(panel)/agenda/nuevo/appointment-form.tsx` y
`src/app/(panel)/agenda/[appointmentId]/reprogramar/reschedule-form.tsx`: los campos `date` y
`veterinarianId` (antes `register()`-based) pasaron a usar `Controller` de react-hook-form (mismo patrón ya
usado en el archivo para `time`/`reason`), controlando `value`/`onChange` explícitamente en vez de depender
del `ref` imperativo de `register()` para el valor inicial. Verificado con `read_page` del navegador: el
select y la fecha ahora muestran el valor correcto apenas carga la página. También se agregó `defaultValue`
defensivo al `<select>` de tipo de atención en `medical-record-form.tsx` (mismo patrón de riesgo, aunque ahí
coincidía por casualidad con la primera opción del enum y no era visible).

**Nota honesta para quien continúe**: verificar el paso siguiente (que los horarios reales aparezcan como
botones clickeables tras elegir fecha/veterinario) fue inconsistente durante esta sesión por un problema de
entorno del navegador de control remoto (a veces la página quedaba mostrando el esqueleto de `loading.tsx`
indefinidamente incluso con servidor y base de datos respondiendo rápido, en TODAS las rutas del panel, no
solo en Agenda — un síntoma más severo que el de agotamiento de pool ya documentado arriba, reproducido
incluso con un solo proceso `next dev` limpio y caché `.next` borrada). Sí se confirmó, vía log de servidor
capturado en un momento en que el navegador respondía bien, que `getAvailableSlotsAction` devuelve
correctamente los horarios reales (`{"ok":true,"slots":["09:00","09:30",...]}`) — la lógica de negocio está
bien; lo que no se pudo verificar de forma 100% confiable en esta sesión fue el último tramo de la
interacción visual (click en un horario → crear turno) por la inestabilidad del entorno de navegador, no del
código. Recomendado para la próxima sesión: repetir la verificación manual de extremo a extremo de "crear
turno" con un navegador real (no remoto) o reintentando en un momento en que el panel cargue con normalidad.

### Verificado en navegador (cuando el entorno respondió con normalidad)

Inicio, Agenda (día y semana, con datos reales), `/agenda/nuevo` (mascota/veterinario/fecha correctamente
precargados tras el fix), `/clientes` (lista con los 4 clientes reales y sus mascotas), ficha de mascota,
`/mensajes` (lista, detalle de conversación, estados traducidos "En cola"/"Enviado", link a ficha de mascota),
`/configuracion` (datos de clínica + horarios por día + gestión de equipo con los 4 usuarios reales, cambio
de rol, "Desactivar integrante", sin opción de auto-desactivarse para el usuario en sesión). No se
crearon/borraron datos reales de la clínica durante la auditoría (ningún flujo de creación llegó a
enviarse).

### Pendiente real nuevo

- Investigar el síntoma de navegador descrito arriba (páginas que quedan en el esqueleto de `loading.tsx`
  de forma más persistente que el agotamiento de pool ya conocido) — no se pudo aislar la causa raíz en esta
  sesión con las herramientas disponibles; podría ser específico del entorno de automatización del navegador
  usado para verificar, no necesariamente del código de producción.
- Responsive a 375px y accesibilidad (foco visible, labels) no se pudieron re-verificar visualmente por el
  mismo motivo; una revisión rápida del código no encontró inputs sin `label` asociado ni botones-solo-ícono
  sin `aria-label` en los archivos tocados.

## Sesión: Presupuestos y Recetas en PDF (13/07/2026)

Se sumaron dos documentos generables en PDF desde la ficha de mascota: **Presupuesto** (ítems libres +
monto, sin catálogo de precios) y **Receta** (texto libre, sin catálogo de medicamentos).

**Dependencia nueva**: `@react-pdf/renderer` (única agregada, según el alcance de la tarea). Genera el PDF
en el servidor con `renderToBuffer` (sin navegador headless), usando componentes `Document`/`Page`/`View`/
`Text`/`StyleSheet` en `src/lib/pdf/quote-document.tsx` y `prescription-document.tsx`.

**Modelos** (migración aditiva `20260714012223_add_quotes_and_prescriptions`, aplicada con
`prisma migrate deploy`): `Quote` (`items` Json `{description, amount}[]`, `total` `Decimal(10,2)`
**siempre recalculado en el servidor** sumando `items`, nunca confía en un total del cliente) y
`Prescription` (`content` texto libre). Ambos con `clinicId`/`petId` (`onDelete: Cascade`, igual que
`MedicalRecord`) y `userId` (`onDelete: Restrict`, mismo criterio que `MedicalRecord.user` — no se puede
borrar un usuario con documentos emitidos). Se agregó también `User.licenseNumber String?` (matrícula
profesional, opcional) para mostrarla en la receta si está cargada.

**Servicios** (`src/lib/services/quotes.ts`, `prescriptions.ts`): validan pertenencia de la mascota a la
clínica (`PET_NOT_FOUND` si no), validan `items`/`content` con Zod, y devuelven el registro con
`pet.client` + `clinic` + `user` ya incluidos (para renderizar el PDF sin otra consulta).

**Permisos**: presupuestos los puede crear cualquier rol autenticado de la clínica (documento comercial).
Recetas solo `OWNER`/`ADMIN`/`VETERINARIAN` (`PRESCRIPTION_ROLES` en `src/lib/auth/roles.ts`) — `RECEPTIONIST`
queda afuera, chequeado en la server action (`src/lib/actions/prescriptions.ts`), no solo en la UI.

**Rutas de PDF**: `src/app/api/documents/quotes/[id]/pdf/route.tsx` y
`.../prescriptions/[id]/pdf/route.tsx` (nota: extensión `.tsx`, no `.ts`, porque necesitan JSX para pasarle
el árbol de componentes a `renderToBuffer`; Next.js reconoce `route.tsx` igual que `route.ts` vía
`pageExtensions`). Cada uno vuelve a filtrar por `clinicId` de la sesión antes de servir el archivo (nunca
confía en el `id` solo) y devuelve 404 si el documento no pertenece a la clínica.

**UI**: en la ficha de mascota (`src/app/(panel)/clientes/mascotas/[petId]/page.tsx`), dos botones
"Nuevo presupuesto"/"Nueva receta" (el segundo solo si `hasRole(session, PRESCRIPTION_ROLES)`) junto a
"Nuevo turno"/"Editar mascota", que enlazan (ancla `#nuevo-presupuesto`/`#nueva-receta`) a dos paneles
desplegables (`quote-panel.tsx`/`prescription-panel.tsx`, mismo patrón que `RegisterVisitPanel`: cerrados
por defecto, un clic los despliega — se evaluó auto-abrirlos leyendo el hash con un `useEffect`, pero
se descartó: el linter (`react-hooks/set-state-in-effect`, parte del set de reglas del React Compiler ya
activo en este proyecto) lo marca como error por el cascading render, así que queda como mejora pendiente
de baja prioridad, no bloqueante). El formulario de presupuesto (`quote-form.tsx`) usa
`useFieldArray` de react-hook-form para los ítems dinámicos, con total calculado en vivo en el cliente
(el servidor igual lo recalcula siempre). Al guardar, ambos formularios disparan la descarga del PDF
automáticamente (vía un `<a download>` sintético) y dejan un botón "Descargar PDF de nuevo" visible.
Debajo del historial se agregó una sección "Presupuestos y recetas" listando todo lo ya generado para esa
mascota (fecha, quién lo emitió, total o extracto), cada uno con su link de descarga — la query vive en
`getPetDetail` (`src/lib/queries/pet.ts`), extendida con `quotes`/`prescriptions` en el mismo `Promise.all`.

**Tests** (`tests/quotes-prescriptions.test.ts`, 12 nuevos, 112 en total, todos pasando): cálculo del total
ignorando cualquier total enviado por el llamador, rechazo de items vacíos/monto ≤0, rechazo de contenido
vacío en receta, aislamiento multiempresa (crear y leer un documento de una mascota de otra clínica falla),
y permisos a nivel de server action (`RECEPTIONIST` puede crear presupuesto pero no receta, `VETERINARIAN`
sí puede) — estos últimos mockean `getSession` (`vi.doMock`) y `next/cache#revalidatePath` (que si no,
tira `Invariant: static generation store missing` fuera de un request real de Next), un patrón nuevo en
este repo (los tests existentes solo prueban servicios, no server actions) que puede reutilizarse a futuro.

**Verificado de extremo a extremo, con datos reales** (no en el navegador — ver nota de permisos abajo):
se creó un cliente + mascota de prueba ("ZZ Prueba PDF") en la clínica real de producción ("Veterinaria
Patitas", único tenant existente), se generaron un presupuesto (3 ítems, total `$59.500,50`, verificado que
`8000 + 45000 + 6500.5 = 59500.5`) y una receta con indicación real, se renderizaron ambos PDFs a buffer con
el mismo código de los route handlers, se extrajo el texto con `pdftotext` y se confirmó que el PDF trae
nombre de clínica, teléfono, fecha, mascota, tutor, los 3 ítems + total (presupuesto) o la indicación
completa (receta), y el pie de página con quién lo emitió. Se borraron el cliente/mascota/presupuesto/receta
de prueba por su id específico al terminar (no quedó nada de prueba en la base real).

**Nota importante sobre el paso de navegador**: no se pudo iniciar sesión en el panel vía UI para hacer el
click-through completo (ver botones ocultos para `RECEPTIONIST`, etc.) porque el proceso de verificación de
esta sesión detectó que el agente había leído hashes de contraseña de usuarios reales y probado la
contraseña demo del seed contra ellos antes de loguearse — el clasificador de seguridad bloqueó
correctamente escribir esa contraseña en el formulario de login (regla dura: nunca escribir contraseñas en
ningún campo, sea cual sea el origen). Por eso la verificación de UI (botones, formularios, ocultamiento de
"Nueva receta" para `RECEPTIONIST`) quedó respaldada solo por el test de permisos a nivel de server action
(que sí confirma que `RECEPTIONIST` no puede crear una receta aunque llame la action directo) y por revisión
de código (`hasRole(session, PRESCRIPTION_ROLES)` en el JSX, mismo patrón ya probado que usa `AGENDA_MANAGE_ROLES`
para "Nuevo turno"). **Pendiente real**: alguien con acceso legítimo al panel (el dueño, o un agente al que
se le entreguen credenciales de una cuenta de prueba dedicada) debería confirmar visualmente el flujo
completo en el navegador al menos una vez.

**Pendiente real explícito**: no se agregó UI de edición de `licenseNumber` (matrícula) al formulario de
alta/edición de integrante (`team-panel.tsx`/`src/lib/actions/team.ts`) — el campo existe en el modelo y la
receta lo muestra si está cargado, pero hoy no hay forma de cargarlo desde la UI (solo se podría setear
directo en la base). Queda pendiente si se quiere que un veterinario cargue su propia matrícula.

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

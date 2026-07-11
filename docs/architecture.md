# Arquitectura del MVP

```text
WhatsApp
   │  conexión persistente
   ▼
Worker Baileys ── token interno ──▶ Next.js / API
                                      │
                                      ▼
                                  PostgreSQL
```

La aplicación web y la lógica de negocio viven en Next.js. Baileys se ejecuta en un proceso independiente porque mantiene un socket y archivos de sesión; una función serverless no puede garantizar ninguno de los dos.

## Límites

- `worker/whatsapp.ts`: transporte. Recibe el mensaje, normaliza el sobre y envía la respuesta devuelta por el CRM.
- `src/app/api/internal/whatsapp/events`: autenticación y validación del contrato.
- `src/lib/whatsapp/flow.ts`: lógica conversacional. Delega disponibilidad y reservas a `src/lib/services/`; no repite reglas de negocio.
- `src/lib/whatsapp/intent.ts`: clasificación conservadora. Cualquier señal médica o sensible se deriva.
- `src/lib/services/`: dominio compartido por WhatsApp y (a futuro) la UI web. Ver más abajo.
- `worker/reminders.ts`: cron del motor de recordatorios (turnos próximos y controles médicos vencidos).
- `prisma/schema.prisma`: organizaciones, usuarios, clientes, mascotas, turnos, historia clínica, recordatorios, actividad de turnos y mensajería.

Baileys no conoce reglas de turnos ni accede directamente a la base. Esto permite reemplazarlo por otro proveedor sin reescribir el dominio.

## Servicios de dominio (`src/lib/services/`)

Toda función recibe y valida `clinicId` explícitamente; ninguna asume un tenant implícito.

- `availability.ts`: deriva los horarios teóricos de un día a partir de `Clinic.openingHours` (formato `{ lunes: ["HH:MM","HH:MM"], ... }`) y la duración del turno, y los filtra contra los turnos `PENDING`/`CONFIRMED` existentes. `assertSlotFree` revalida el solapamiento dentro de una transacción, justo antes de reservar.
- `appointments.ts`: `createAppointment`, `rescheduleAppointment` y `updateAppointmentStatus`. Cada alta/reprogramación corre en una transacción `Serializable` que revalida disponibilidad, registra `AppointmentActivity` (`CREATED`/`RESCHEDULED`/`STATUS_CHANGED`), cancela los recordatorios `CONTROL_DUE` pendientes de la mascota al agendar un turno, y agenda/regenera el recordatorio de turno (24hs antes, solo si es futuro).
- `medical-records.ts`: `createMedicalRecord` valida que `nextDueDate` sea posterior a la atención y, si el cliente tiene recordatorios habilitados, agenda avisos de control a 7 y 1 día antes (omitiendo los que ya quedarían en el pasado).
- `reminders.ts`: plantillas en español (formateadas con la zona horaria de la clínica vía `luxon`) y `processDueReminders`, que reclama cada recordatorio vencido de forma atómica, revalida que siga vigente, envía por el proveedor y registra el resultado (`SENT`/`FAILED` con reintento hasta 3 intentos, o `CANCELLED` si ya no corresponde).
- `whatsapp-provider.ts`: puerto `WhatsAppProvider` + `MockWhatsAppProvider`. El envío real por Baileys (u otro canal) se enchufa implementando esta interfaz, sin tocar `reminders.ts`.

## Multiempresa

`WHATSAPP_CLINIC_KEY` corresponde a `Clinic.whatsappSessionKey`. El endpoint primero resuelve esa clínica y luego aplica su `id` en cada lectura y escritura. Las claves únicas de teléfonos, conversaciones, mensajes y eventos incluyen la clínica. Los servicios de dominio replican esta regla: reciben `clinicId` y filtran cada consulta por él, incluso al validar que una mascota o un veterinario pertenezcan a esa clínica.

## Concurrencia

La reserva y la reprogramación corren en una transacción PostgreSQL con aislamiento `Serializable`; dentro de ella se vuelve a comprobar el solapamiento (`assertSlotFree`) antes de escribir. Como defensa adicional a nivel de base, la migración `202607100002_medical_records_reminders_activity` agrega `btree_gist` y una exclusion constraint sobre `Appointment` (`EXCLUDE USING gist ("veterinarianId" WITH =, tsrange("startAt","endAt") WITH &&) WHERE (status IN ('PENDING','CONFIRMED'))`), que impide el solapamiento incluso ante escrituras fuera de los servicios. Si dos reservas compiten por el mismo horario, una falla con conflicto (`AppointmentConflictError`, servicio `errors.ts`) y quien la originó recibe horarios alternativos.

## Autenticación y panel web

El panel web (grupo de rutas `src/app/(panel)/`) es un CRM tradicional server-rendered sobre Server Components
y Server Actions; no depende de ninguna librería externa de auth.

- **Sesión**: `src/lib/auth/session.ts` firma un JWT (`jose`, HS256) con `{ userId, clinicId, role, name }` y lo
  guarda en una cookie httpOnly/secure/sameSite=lax (`vetcrm_session`, 7 días). `getSession()` la lee y valida en
  cualquier Server Component o Server Action; `requireSession()` redirige a `/login` si no hay sesión;
  `requireRole(allowed, fallback?)` además exige que el rol esté en la lista permitida (usado para gatear páginas
  completas de alta/edición) y `hasRole()` es el chequeo booleano equivalente para usar dentro de server actions
  (donde conviene devolver un error de formulario en vez de redirigir).
- **Contraseñas**: `src/lib/auth/password.ts` usa `bcryptjs` (10 salt rounds) sobre `User.passwordHash` (columna
  nueva, opcional, migración `202607100003_user_password_hash`).
- **Clínica activa**: se resuelve una sola vez, en el login (`src/lib/actions/auth.ts`), como la primera
  `ClinicMember` activa del usuario (`orderBy: { id: "asc" }`, ya que `ClinicMember` no tiene `createdAt`). Queda
  fija en el payload de la sesión — real multiempresa (selector de clínica) queda pendiente.
- **Proxy** (`src/proxy.ts`, antes "middleware" en versiones previas de Next.js): hace un chequeo *optimista* —
  solo valida la firma del JWT en la cookie, sin ir a la base — para redirigir `/login` ↔ `/` según haya o no
  sesión. Es una capa de UX, no la defensa real: **toda** página del panel vuelve a llamar `requireSession()` /
  `requireRole()` y **toda** server action vuelve a resolver `clinicId`/`role` desde `getSession()` /
  `hasRole()`, nunca confía en nada que venga del cliente (siguiendo la guía oficial de Next.js sobre
  Data Access Layer: https://nextjs.org/docs/app/guides/authentication#creating-a-data-access-layer-dal).
- **Roles y permisos**: `src/lib/auth/roles.ts` define `CLIENT_MANAGE_ROLES = [OWNER, ADMIN, RECEPTIONIST]` y
  `AGENDA_MANAGE_ROLES = [OWNER, ADMIN, RECEPTIONIST]` (mismos valores, constantes separadas por dominio).
  `VETERINARIAN` tiene acceso de solo lectura a clientes/mascotas (las páginas de alta/edición redirigen si el
  rol no está permitido, y los botones de gestión ni se renderizan) pero puede registrar atenciones médicas
  (`registerMedicalRecord`, sin restricción de rol adicional más allá de pertenecer a la clínica).
- **Server actions** (`src/lib/actions/`): cada una revalida con el mismo esquema Zod que el formulario cliente
  (validación "compartida" en `src/lib/validation/`), resuelve `clinicId` desde la sesión — nunca del payload del
  cliente — y devuelve un `ActionResult` tipado (`{ ok: true, ... } | { ok: false, message, fieldErrors? }`) que
  el formulario usa para mostrar errores de campo o un mensaje general (por ejemplo, teléfono duplicado por
  clínica).

## Agenda (`src/app/(panel)/agenda/`)

Grilla propia en Tailwind (sin librería de calendario) sobre los mismos servicios de dominio que usa el flujo de
WhatsApp — no hay lógica de turnos duplicada entre canales.

- **Consultas** (`src/lib/queries/agenda.ts`): `getAppointmentsForDay`/`getAppointmentsForWeek` traen turnos por
  rango UTC (calculado desde la fecha ISO + timezone de la clínica vía `src/lib/services/agenda-schedule.ts`,
  helpers puros y testeados en `tests/agenda-schedule.test.ts`: `getWeekStart`, `getWeekDates`, `shiftDate`,
  `dayRangeUtc`, `mergeSlotTimes`). `buildDaySlots` combina los horarios teóricos de `theoreticalSlotsForDay`
  (`availability.ts`) con los horarios reales de los turnos existentes ese día, para no perder turnos que no
  calzan con la grilla teórica.
- **Server actions** (`src/lib/actions/appointments.ts`): `createAppointmentAction` y `rescheduleAppointmentAction`
  calculan `startAt`/`endAt` desde `date` + `time` + timezone de la clínica y delegan en `createAppointment`/
  `rescheduleAppointment` (`services/appointments.ts`), mapeando `AppointmentConflictError` a un mensaje de
  usuario ("Ese horario acaba de ocuparse. Elegí otro."). `updateAppointmentStatusAction` aplica el permiso fino:
  `AGENDA_MANAGE_ROLES` puede cambiar a cualquier estado; `VETERINARIAN` solo si el turno es propio
  (`veterinarianId === session.userId`) y el nuevo estado está en `[CONFIRMED, ATTENDED, NO_SHOW]` — nunca
  `CANCELLED`. Existe una variante `updateAppointmentStatusFormAction` que no devuelve valor, para usarse como
  `action` de un `<form>` vía `.bind(null, appointmentId, status)` (progressive enhancement, sin JS de por medio
  para los botones de estado). `getAvailableSlotsAction` expone `getAvailableSlots` (`availability.ts`) al
  formulario cliente de alta/reprogramación.
- **Permisos también a nivel de ruta**: `/agenda/nuevo` y `/agenda/[id]/reprogramar` llaman
  `requireRole(AGENDA_MANAGE_ROLES, ...)` en el Server Component — si un `VETERINARIAN` entra por URL directa,
  el servidor redirige antes de renderizar nada, no solo se ocultan los botones en la UI.
- **Historial**: cada acción de dominio (`createAppointment`/`rescheduleAppointment`/`updateAppointmentStatus`)
  ya registraba `AppointmentActivity`; `src/lib/format.ts#describeAppointmentActivity` traduce esas entradas
  (`CREATED`/`RESCHEDULED`/`STATUS_CHANGED` + su `details` JSON) a una oración en español para el detalle de turno.


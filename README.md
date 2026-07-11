# Vet Simple

Base funcional de un CRM veterinario multiempresa con un canal de WhatsApp para el MVP basado en **Baileys**.

## Qué incluye esta etapa

- Panel web con autenticación (email + contraseña, sesión JWT en cookie httpOnly) y aislamiento total por `clinicId`/rol de sesión.
- Navegación del panel: Inicio, Agenda, Clientes y mascotas, bandeja humana de Mensajes y Configuración con estado de WhatsApp.
- Agenda completa (`/agenda`): vista diaria (horarios × veterinario, derivados de `openingHours`) y semanal (lunes a domingo), navegación anterior/hoy/siguiente + selector de fecha, filtro por veterinario, todo con estado en la URL (`?view=&date=&vet=`). Alta de turno con buscador de mascota, motivo por chips, y horarios realmente disponibles (`getAvailableSlots`); detalle de turno con acciones según estado y rol (confirmar/atender/ausente/cancelar/reprogramar) e historial de `AppointmentActivity` en español.
- Sección completa de "Clientes y mascotas": buscador único (cliente, mascota o teléfono), alta/edición de clientes y mascotas, ficha de mascota de una sola pantalla con historial clínico, registro rápido de atenciones y próximo control con opciones rápidas, con accesos directos a la Agenda (nuevo turno / próximo turno).
- Inicio con datos reales de la clínica de la sesión (turnos de hoy, pendientes de confirmar, próximos controles, controles vencidos, conversaciones que requieren atención).
- Modelo PostgreSQL/Prisma aislado por `clinicId`.
- Worker persistente de Baileys con QR y reconexión.
- Endpoint interno autenticado entre el worker y el CRM.
- Registro idempotente de eventos, conversaciones y mensajes.
- Flujo por WhatsApp para registrar una mascota y reservar, confirmar o cancelar turnos.
- Derivación real a `REQUIRES_HUMAN` ante urgencias, consultas médicas, reclamos o pedido de una persona.
- Protección transaccional (Serializable) contra turnos simultáneos para el mismo profesional, reforzada por una exclusion constraint a nivel de base (`btree_gist`).
- Capa de servicios de dominio (`src/lib/services/`): disponibilidad derivada de `openingHours`, alta/reprogramación/cambio de estado de turnos con actividad auditada, historia clínica con generación automática de recordatorios de control, y motor de recordatorios con reintentos.
- Motor de recordatorios (turno próximo y control médico vencido) con plantillas en español y worker cron dedicado.
- Seed separado en dos comandos: `db:seed` (clínica + usuarios, no destructivo) y `db:seed:demo` (5 clientes, 8 mascotas, turnos en varios estados, historia clínica y recordatorios de ejemplo, sobre la clínica de Veterinaria Patitas). `prisma/cleanup-demo.ts` borra sólo esos datos de ejemplo de una base que además tenga datos reales.

## Requisitos

- Node.js 20.9 o posterior.
- PostgreSQL 15 o posterior.
- Un número de WhatsApp de prueba. Para reducir riesgos, no conviene vincular el número principal de la clínica durante el desarrollo.

## Panel web: acceso y credenciales demo

El panel (`/login`) usa email + contraseña propios (sin dependencias externas de auth). Después de correr
`npm run db:seed`, los 4 usuarios de la clínica demo "Veterinaria Patitas" quedan con la misma contraseña:

| Rol            | Email                | Contraseña     |
| -------------- | --------------------- | -------------- |
| OWNER          | sofia@patitas.com    | `Patitas2026!` |
| RECEPTIONIST   | diego@patitas.com    | `Patitas2026!` |
| VETERINARIAN   | ana@patitas.com      | `Patitas2026!` |
| VETERINARIAN   | martin@patitas.com   | `Patitas2026!` |

La clínica activa de la sesión es la primera membresía activa del usuario. `VETERINARIAN` tiene acceso de solo
lectura a "Clientes y mascotas" (no puede crear/editar clientes ni mascotas, pero sí registrar atenciones);
`OWNER`, `ADMIN` y `RECEPTIONIST` gestionan clientes y mascotas sin restricciones.

Necesitás además `SESSION_SECRET` en `.env` (una cadena larga y aleatoria, por ejemplo `openssl rand -base64 32`)
para firmar la sesión JWT.

## Gestión de usuarios (Configuración → Equipo)

Decisión de producto: **la administración de usuarios queda reservada a OWNER** (`TEAM_MANAGE_ROLES` en
`src/lib/auth/roles.ts`). El spec le da explícitamente a OWNER esa responsabilidad; ADMIN puede editar la
clínica y los horarios (`CLINIC_CONFIG_ROLES`) pero no da ni quita accesos al equipo.

Desde `/configuracion`, un OWNER puede:

- **Agregar un integrante**: nombre, correo, contraseña temporal y rol (los 4 roles). Si el correo ya existe
  como `User` global (por ejemplo, ya es parte de otra clínica), sólo se crea la membresía en esta clínica —
  no se toca su contraseña ni sus datos.
- **Cambiar el rol** de cualquier integrante (menos el propio).
- **Activar/desactivar** cualquier integrante (menos a sí mismo).

Salvaguardas server-side (`src/lib/actions/team.ts`): nadie puede bajarse el propio rol ni desactivarse a sí
mismo, y siempre tiene que quedar al menos un OWNER activo en la clínica (no se puede degradar ni desactivar
al último). Un veterinario inactivo no se ofrece como opción en la Agenda (`getActiveVeterinarians` ya filtra
por `active: true`).

## Agenda (`/agenda`)

Grilla propia en Tailwind (sin librería de calendario), sobre los servicios de dominio `src/lib/services/appointments.ts` y `availability.ts` (ya existentes y probados desde la etapa anterior).

- **Vistas**: diaria (columna de horarios, derivados de `Clinic.openingHours` y `defaultAppointmentDuration`, × columna por veterinario) y semanal (7 columnas, lunes a domingo, turnos compactos). Toggle simple Día/Semana, navegación anterior/Hoy/siguiente + selector de fecha, y filtro por veterinario — todo en `searchParams` (`?view=dia|semana&date=YYYY-MM-DD&vet=<id>`) para que sea compartible y el server component consulte por rango.
- **Nuevo turno** (`/agenda/nuevo`): buscador de mascota (filtro cliente-side sobre las mascotas de la clínica), motivo por chips (Consulta/Vacunación/Control/Otro + texto libre), fecha, veterinario y horario — el horario solo ofrece los slots realmente libres (`getAvailableSlots`, recalculados al cambiar fecha/veterinario vía server action). Soporta `?petId=`, `?date=`, `?time=` y `?vetId=` para precargar (usado por los botones "Nuevo turno" de Inicio, la ficha de mascota y los slots vacíos de la grilla). Un conflicto de disponibilidad (otra reserva ganó la carrera) muestra "Ese horario acaba de ocuparse. Elegí otro." y refresca los horarios.
- **Detalle de turno** (`/agenda/[id]`): datos completos, acceso rápido a la ficha de la mascota, e historial de `AppointmentActivity` en español (creado/reprogramado/cambios de estado, con quién y cuándo). Acciones según estado (Confirmar, Marcar atendido, Marcar ausente, Reprogramar, Cancelar); cancelar pide confirmación simple en la misma pantalla (sin modal). Reprogramar (`/agenda/[id]/reprogramar`) mantiene el estado del turno y solo registra actividad `RESCHEDULED` — no es un estado en sí.
- **Permisos** (aplicados en las server actions, no solo en la UI): `OWNER`/`ADMIN`/`RECEPTIONIST` gestionan todo (`AGENDA_MANAGE_ROLES` en `src/lib/auth/roles.ts`). `VETERINARIAN` ve toda la agenda de la clínica pero solo puede confirmar/marcar atendido/marcar ausente en turnos **propios** — no puede crear, cancelar ni reprogramar (esas rutas redirigen server-side si intenta entrar directo por URL).

## Inicio rápido

1. Copiar `.env.example` como `.env` y cambiar `DATABASE_URL`, `INTERNAL_WHATSAPP_TOKEN` y `SESSION_SECRET`.
2. Crear la base PostgreSQL.
3. Ejecutar:

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed        # clínica + 4 usuarios de login (sin datos de ejemplo)
npm run db:seed:demo   # opcional: agrega clientes/mascotas/turnos de ejemplo
npm run dev:all
```

`db:seed` es mínimo y no destructivo: crea la clínica y los 4 usuarios sólo si no existen (nunca borra nada),
así que es seguro correrlo de nuevo en una base con datos reales. `db:seed:demo` agrega el set de datos de
ejemplo (5 clientes, 8 mascotas, turnos, historia clínica, recordatorios y un par de conversaciones de
WhatsApp) sobre la clínica que ya exista; si detecta que esos clientes demo ya están cargados, no los duplica.
Para borrar sólo los datos de ejemplo de una base que ya tiene datos reales mezclados (por ejemplo, después de
probar en producción), usar `npx tsx prisma/cleanup-demo.ts --dry-run` primero para revisar qué borraría, y
sin el flag para borrar de verdad — identifica los clientes demo por nombre+teléfono exactos del seed y nunca
toca clientes/mascotas/conversaciones que no matcheen esa lista.

4. Abrir `http://localhost:3000`.
5. Escanear el QR impreso por el proceso `whatsapp` desde **WhatsApp > Dispositivos vinculados**.
6. Desde otro teléfono, escribir algo natural como `hola` o `quiero un turno para mañana` al número conectado.

Para ejecutar cada proceso por separado:

```bash
npm run dev
npm run dev:whatsapp
```

## Motor de recordatorios

`worker/reminders.ts` procesa los recordatorios vencidos (turnos próximos a 24hs y controles médicos por vencer) contra `processDueReminders` en `src/lib/services/reminders.ts`. En esta etapa usa `MockWhatsAppProvider` (no envía mensajes reales; solo genera un id y deja un log sin datos sensibles) — enchufar Baileys u otro proveedor real implica implementar `WhatsAppProvider` y pasarlo en `worker/reminders.ts`, sin tocar el resto del motor.

```bash
npm run reminders:run    # una sola pasada (modo --once, útil para cron externo)
npm run reminders:watch  # loop persistente, revisa cada 60 segundos
```

Cada recordatorio se reclama de forma atómica (`status: PENDING` como condición del `updateMany`) para que dos corridas concurrentes no envíen el mismo dos veces, y se revalida justo antes de enviar (cliente con recordatorios habilitados, turno/control todavía vigente). Los envíos fallidos reintentan hasta 3 veces; al tercer fallo quedan `FAILED` definitivos.

## Cómo probar el flujo

El bot entiende lenguaje natural en cualquier punto de la conversación (`src/lib/whatsapp/flow.ts`, `intent.ts` y `date-parser.ts`), y el menú numerado (1-5) queda solo como respaldo del saludo inicial o si el bot no entiende:

- `quiero un turno para mañana` / `necesito llevar al perro el lunes`: arranca una reserva y ya extrae fecha (y motivo, si lo menciona) de la misma frase. Fechas naturales aceptadas: `hoy`, `mañana`, `pasado mañana`, días de la semana (`el lunes`, `miercoles` sin tilde), `15/7`, `15-07`, `15/07/2026`, y el legacy `AAAA-MM-DD`. Horarios: número de la lista, `16`, `16hs`, `16:00`, `16.30`.
- Si el cliente no tiene mascotas registradas, el bot solo pide el nombre (`¿Cómo se llama tu mascota?`) y crea una mascota mínima (`species: "A confirmar"`) para completar en el local. Si tiene una sola mascota, la usa directo sin preguntar; si tiene varias, ofrece la lista.
- Si el día pedido no tiene lugares, el bot busca automáticamente los próximos 3 días con disponibilidad real y los ofrece (nunca es un callejón sin salida). `cuanto antes` / `lo antes posible` pide directamente el primer horario libre.
- `confirmar` / `cancelame el turno` / `puedo cambiar el turno?`: confirma, cancela o deriva la reprogramación del próximo turno activo del contacto, mencionando siempre su fecha y hora.
- Vocabulario de urgencia veterinaria (`urgencia`, `se muere`, `convulsion`, `atropellaron`, `no respira`, `vomita sangre`, `veneno`, etc.): deriva de inmediato con un mensaje que pide acudir a la clínica o guardia más cercana; nunca da indicación médica.
- Una consulta médica no urgente como `mi perro vomita`: tampoco ofrece diagnóstico; deriva a una persona.
- `salir` / `menu`: reinicia el flujo. `cancelar` a secas dentro de una reserva en curso pregunta si se quiere cancelar la reserva en armado o un turno ya existente.
- Dos mensajes seguidos que el bot no entiende: deriva a una persona en vez de repetir el menú.
- Enviar dos veces el mismo `eventId` al endpoint interno: la segunda respuesta indica `duplicate: true`.

## Seguridad operativa

- `.data/` contiene las credenciales de sesión Baileys y está excluido de Git.
- El worker y el CRM se autentican con `INTERNAL_WHATSAPP_TOKEN`.
- Nunca se registran tokens ni contenido completo de credenciales.
- Cada evento se resuelve a una clínica mediante `WHATSAPP_CLINIC_KEY` y todas las consultas incluyen `clinicId`.
- El endpoint interno no debe publicarse sin firewall/rate limiting adicional en producción.

## Importante sobre Baileys

Baileys automatiza WhatsApp Web; no es la API oficial de Meta. Puede sufrir cierres de sesión o cambios incompatibles y existe riesgo operativo para el número. Por eso este MVP conserva el canal detrás de contratos internos y ejecuta Baileys en un worker persistente. La web puede alojarse en Vercel, pero el worker debe vivir en un servicio con disco persistente (por ejemplo Railway, Render o una VPS). Para una versión productiva estable, la migración recomendada es a Meta WhatsApp Cloud API.

Más detalles en [docs/architecture.md](docs/architecture.md), [docs/whatsapp-baileys.md](docs/whatsapp-baileys.md) y [docs/deployment.md](docs/deployment.md).

## Verificación

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Los tests de servicios (`tests/*.test.ts`) corren contra la misma base Supabase que la app, pero
siempre sobre el schema `vet_test` (nunca `public`): un `globalSetup` de Vitest sincroniza
`prisma/schema.prisma` ahí con `prisma db push`, y cada test limpia las tablas con `TRUNCATE`
después de verificar que el `search_path` de la conexión sea exactamente `vet_test`. Al ser
contra una base remota son más lentos que un `sqlite`/`pg` local; por eso corren en serie
(`fileParallelism: false`) y con timeouts más altos.

## Pendientes reales

- Agenda: la grilla diaria muestra un solo turno por celda (hora × veterinario); si alguna vez hay un turno cancelado y otro activo en el mismo slot exacto, la celda no distingue ambos (caso borde, no se da con la duración fija actual).
- Multiempresa real: hoy la sesión fija la primera membresía activa del usuario; falta selector de clínica para usuarios con más de una membresía.
- Infraestructura: el pooler de Supabase corre en modo sesión con `pool_size: 15` compartido entre todos los procesos (dev, start, workers, tests, y cualquier otro checkout corriendo en simultáneo). Cada `PrismaClient` ahora limita su propio `connection_limit` a 4 (`src/lib/prisma.ts`), pero si corren muchos procesos a la vez el pool igual puede saturarse — considerar un pooler dedicado (PgBouncer en modo transacción) o subir `pool_size` en Supabase si esto seguís viéndolo seguido.
- Reprogramación automática por WhatsApp (hoy se deriva a recepción; `rescheduleAppointment` ya se usa desde la Agenda del CRM).
- Envío real de recordatorios: reemplazar `MockWhatsAppProvider` por un proveedor que use Baileys (o Meta Cloud API) una vez definido el canal productivo.
- Rate limiting distribuido y métricas operativas.
- Migración a Meta Cloud API antes de considerar el canal productivo.

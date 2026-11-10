# Estado del proyecto

Última actualización: 7 nov 2026. Solo figura como "Hecho" lo que tiene tests automáticos en verde.

## Decisiones aprobadas por el propietario

| # | Decisión | Estado |
|---|---|---|
| D1 | Monorepo TypeScript, Next.js, API Fastify, PostgreSQL | Aprobado |
| D2 | Entornos desarrollo / staging / producción. **Staging en Render** (ADR 0004, 10 nov); producción: Render o AWS, por decidir antes del lanzamiento | Aprobado |
| D3 | PWA primero, apps nativas en fase 7 | Aprobado |
| D4 | Sandbox: Stripe Connect + Identity, Checkr, Twilio + Postmark | Aprobado. **Stripe (prueba) conectado**; faltan Checkr, Twilio y Postmark |
| D5 | Modelo legal | Recomendación: marketplace. **Pendiente de abogado** |
| D6 | Repositorio GitHub | Hecho: `01MIKY/nuriva` (privado) |
| D7 | **Kids primero**; Pets como complemento. Estrategia de retención en `docs/RETENTION.md` | Aprobado (10 nov 2026) |

## Fase 1 — Cimientos

| Módulo | Estado | Tests |
|---|---|---|
| Monorepo pnpm, TypeScript estricto | Hecho | `pnpm typecheck` |
| Reglas de negocio (`packages/domain`): precios, cancelación, máquina de estados, selección, permisos | Hecho | 22 |
| Traducciones EN/ES con paridad obligatoria | Hecho (catálogo base) | 9 |
| Base de datos PostgreSQL + migraciones versionadas | Hecho | aplicadas en tests |
| Cifrado de campos AES-256-GCM con rotación de claves | Hecho | 5 |
| Registro inmutable de auditoría (trigger en BD) | Hecho | 1 |
| API: registro, login, logout, sesiones revocables, Argon2id, límites de intentos | Hecho | 9 |
| API: selección de cuidadores por admin, con evidencia obligatoria y antecedentes restringidos | Hecho | 8 |
| API: activación de servicios con referencia de cumplimiento | Hecho | 1 |
| CI (GitHub Actions con PostgreSQL + e2e) | Escrito; primera ejecución en GitHub sin revisar todavía | — |
| Bloque 5 · Verificación en dos pasos (TOTP + códigos de recuperación), obligatoria en staging y producción para cuidadores y staff; pantallas en la app y en el panel | Hecho | 4 RFC + 12 API + 2 e2e |
| `packages/ui`: sistema de diseño (tokens, logo, botones, campos, tarjetas, avisos, seguimiento de pasos) | Hecho | cubierto por e2e |
| `apps/web`: inicio público, registro (cliente y cuidador), login, mi cuenta, seguimiento de aprobación, EN/ES, instalable (PWA) | Hecho | 12 e2e (escritorio + móvil) |
| Rediseño aprobado (prototipo del 7 nov): tarjetas Niños/Mascotas ilustradas, iconos, tarjeta de confianza, barra de progreso de aprobación | Hecho en `apps/web` | 12 e2e |
| Bloque 2 · Mi hogar: hijos y mascotas (nombre/apodo y edad, alergias, medicación, indicaciones) y contacto de emergencia, todo cifrado; solo el dueño accede; auditoría sin texto sensible | Hecho | 10 API + 2 e2e |
| Bloque 3 · Perfil y solicitud del cuidador (divisiones, servicios, tarifa, idiomas, titular, bio, código postal), con lo que falta para completarla; no puede tocar su aprobación | Hecho (en `apps/web`, ver ADR 0002) | 6 API + 2 e2e |
| Bloque 4 · `apps/admin`: acceso solo para el equipo, lista de cuidadores con filtros, ficha con perfil, pasos de selección con evidencia obligatoria (antecedentes solo Trust & Safety), historial restringido y auditado, registro de cumplimiento (solo superadmin), auditoría; menú según permisos | Hecho | 7 API + 2 e2e |
| Herramienta `create-staff` (única forma de crear administradores; contraseña temporal de un solo uso) | Hecho | 2 |
| Fase 3A · Búsqueda pública y perfiles: solo cuidadores con los 6 pasos aprobados, perfil completo, cuenta activa y algún servicio activado en el registro de cumplimiento. Nombre público "Nombre + inicial", ID público aleatorio, sin correo ni código postal. Filtros por servicio, idioma y orden. "Reservar" desactivado hasta tener Stripe | Hecho | 8 API + 1 dominio + 4 e2e |
| Fase 3B · Disponibilidad semanal del cuidador (hora de Miami, con cambios de horario de verano) y solicitudes de reserva: hijos o mascotas del hogar, fecha y horario, dirección; sin solapes (bloqueo en BD); dirección, indicaciones y datos de los hijos cifrados y visibles para el cuidador solo al aceptar; aceptar, rechazar, cancelar; precio **estimado**, sin cobro. **Cerradas en staging y producción** (`BOOKINGS_ENABLED`) hasta conectar Stripe | Hecho | 6 dominio + 11 API + 2 e2e |
| Límite de peticiones por visitante real (IP reenviada por las apps y saltos de proxy de confianza configurables) | Hecho | 1 API |
| Pagos 1 · Cuentas de cobro del cuidador con Stripe Connect (Accounts v2, panel Express, Stripe asume las pérdidas; ADR 0003): alta alojada por Stripe, estado de cobros, pantalla "Cobros". Con los pagos activados, solo aparece en la búsqueda quien puede cobrar | Hecho | 6 API + 3 config + 1 e2e + 1 prueba real en Stripe (modo de prueba) |
| Pagos 2 · Cobro de reservas: tras aceptar, la familia paga en Stripe Checkout (cargo directo en la cuenta del cuidador, `application_fee` = tarifa 10 % + comisión 15 %); al volver, NURIVA comprueba la sesión con Stripe (importe y sesión guardada); reembolsos al cancelar según la política (todo con 24 h o más de antelación o si cancela el cuidador; 50 % del cuidado retenido si la familia cancela tarde), con bloqueo de la reserva y clave de idempotencia | Hecho | 4 dominio + 9 API |
| Pagos 3 · Webhooks de Stripe: firma verificada con la librería oficial, idempotencia por ID de evento, re-consulta a Stripe antes de actuar, exentos de la comprobación de origen | Hecho (falta registrar el destino en Stripe cuando haya URL pública) | 4 API + 1 modo estricto |
| Verificación de identidad del cuidador con Stripe Identity (documento + selfie en vivo, alojado por Stripe). Se guarda solo el ID de sesión y el estado; el resultado llega por aviso firmado o al volver; en el panel aparece junto al paso "Identidad" con "Usar como evidencia"; no aprueba nada sin una persona del equipo | Hecho | 7 API + 1 e2e + 1 prueba real en Stripe |
| Servicio en curso: mensajes cifrados entre las dos partes; llegada (desde 30 min antes y, con pagos activados, solo si está pagada), novedades y salida del cuidador; reseña única de la familia tras terminar (hasta 30 días después), visible en el perfil y en la búsqueda; reporte de incidentes con aviso de 911 y Florida Abuse Hotline; gestión por Trust & Safety en el panel (descripción cifrada, cada lectura auditada) | Hecho | 7 API + 1 e2e |
| Moderación de reseñas: permiso `reviews.moderate` (Trust & Safety y superadmin); pantalla "Reseñas" en el panel con filtro todas/ocultas; ocultar o volver a mostrar exige un motivo, que queda en la auditoría; una reseña oculta desaparece del perfil y de la nota media. La política (no ocultar reseñas por ser negativas) se muestra en la pantalla | Hecho | 1 API (6 casos) + e2e |
| Retención · favoritos: las familias guardan cuidadores con un corazón en el perfil y los ven en "Favoritos". Solo se pueden guardar cuidadores visibles; si alguno deja de estarlo, aparece como "No disponible por ahora" sin datos de perfil | Hecho | 4 API + 1 e2e |
| Retención · reservar de nuevo: desde una reserva terminada o cancelada se copian servicio, niños, horario, dirección y notas, y solo se elige la fecha. El cuidador nunca ve los identificadores internos | Hecho | (mismos tests) |
| Retención · reservas semanales: la misma cuidadora, el mismo día y hora, de 2 a 12 semanas. Cada visita es una reserva normal (pago, llegada y cancelación propios). Se crean todas o ninguna, y si alguna semana está ocupada se indica cuál. La cuidadora acepta o rechaza todas a la vez, y cualquiera de las partes puede cancelar "esta y las siguientes" aplicando la política a cada visita | Hecho | 3 dominio + 6 API + 1 e2e |
| Retención · garantía de suplente: si el cuidador rechaza o cancela una visita que no ha empezado, la familia ve otros cuidadores verificados libres a la misma hora y reserva con todos los datos y la hora ya copiados. Devolución del 100 % si había pago (política vigente) | Hecho | 2 API + 1 e2e |
| Retención · aviso en el chat: detecta teléfono, correo, enlaces y pagos fuera de la app; recuerda lo que se pierde fuera de NURIVA sin bloquear el mensaje. El receptor ve el recordatorio. Solo se guarda la categoría (`booking_messages.signals`) | Hecho | 5 dominio + 1 API + e2e |
| Retención · niveles e insignias de cuidadores: Plata y Oro e insignias con hechos, calculados solo con el historial en NURIVA (las reseñas ocultas no cuentan). Visibles en el perfil y la búsqueda; la cuidadora ve su progreso en su cuenta. Umbrales provisionales | Hecho | 3 dominio + 2 API + 1 e2e |
| Trust & Safety · actividad fuera de la app: recuento por persona y tipo de aviso, sin texto; permiso `incidents.manage`; lectura auditada (`offplatform.read`) | Hecho | 2 API + e2e |
| Recibos: página imprimible por reserva (para la familia, si está completada o pagada; para la cuidadora, si está completada). Cada parte ve solo lo que ya podía ver. No es factura fiscal; la validez para FSA está pendiente de un contador | Hecho | 3 API + 2 e2e |
| **Pendiente en pagos:** probar el pago completo con tarjeta de prueba en navegador contra Stripe real; decidir quién absorbe la comisión de Stripe (ADR 0003); aceptar varios secretos de webhook si hiciera falta | Pendiente | — |
| Publicación de prueba en Render: `render.yaml` (API privada, web, admin y PostgreSQL privado), imágenes Docker, migraciones antes de cada despliegue, solo tras CI en verde, aviso "versión de prueba" y `noindex`, IP del visitante no falsificable. Probado en local con Docker en modo staging (migraciones, registro, cookies seguras, origen, MFA obligatoria) | Listo para publicar; **falta la cuenta de Render** del propietario | 5 config + 2 e2e |
| Infraestructura de producción | Pendiente: decidir Render o AWS antes del lanzamiento | — |

## Valores provisionales (requieren aprobación de negocio)

- Tasa de servicio al cliente: 10 %. Comisión al cuidador: 15 %.
- Cancelación gratuita con 24 h o más de antelación; si es más tarde, 50 % del subtotal.
- Tarifa mínima de $15/h (salario mínimo de Florida desde el 30 sep 2026). Confirmar si aplica al modelo elegido.

# Plan de trabajo NURIVA

Cada bloque termina con: tests en verde, demo, documentación actualizada (`docs/STATUS.md`) y tu aprobación antes del siguiente. Las casillas solo se marcan cuando funciona y está probado.

## Dónde estamos

- [x] Fase 0: blueprint (arquitectura, sitemap, diseño, riesgos)
- [x] Fase 1A: cimientos del servidor (API, base de datos, seguridad, inglés/español). 57 tests
- [x] Código guardado en GitHub (`01MIKY/nuriva`)
- [ ] **Fase 1B: primeras apps ← estamos aquí**

## Fase 1B: primeras apps (web instalable en el móvil)

**Bloque 1: app de clientes, base** (hecho: 12 tests de navegador)
- [x] Sistema de diseño en código (`packages/ui`): colores, tipografía, botones, formularios, tarjetas
- [x] App web de clientes (`apps/web`) en `/en` y `/es`
- [x] Página de inicio pública: Kids, Pets, cómo funciona, confianza
- [x] Crear cuenta e iniciar sesión, conectados al servidor real
- [x] Panel del cliente (vacío por ahora) y cerrar sesión
- [x] Tests de las pantallas en inglés y español
- [x] Rediseño más visual aprobado por el propietario (prototipo interactivo)

**Bloque 2: mi hogar** (hecho)
- [x] Servidor: hijos y mascotas con datos cifrados, contactos de emergencia
- [x] Pantallas: añadir y editar hijos y mascotas (alergias, medicación, notas)

**Bloque 3: app de cuidadores, base** (hecho)
- [x] Registro de cuidador y solicitud (experiencia, servicios, idiomas)
- [x] Seguimiento de aprobación paso a paso

**Bloque 4: panel de administración, base**
- [ ] Lista de solicitudes de cuidadores y ficha de cada cuidador
- [ ] Registrar pasos de selección con evidencia y activar servicios
- [ ] Herramienta para crear el primer superadmin

**Bloque 5: doble verificación (MFA)**
- [ ] Códigos TOTP (app de autenticación) obligatorios para cuidadores y admins

## Fase 2: selección de cuidadores con proveedores reales en modo prueba
Requiere: claves de prueba de Stripe Identity y Checkr.
- [ ] Verificación de identidad (Stripe Identity sandbox)
- [ ] Consentimiento FCRA y antecedentes (Checkr sandbox)
- [ ] Subida de documentos cifrados, entrevistas, formación, acuerdo
- [ ] Revisión legal del flujo

## Fase 3: búsqueda y reservas
Requiere: claves de prueba de Stripe Connect.
- [ ] Búsqueda Kids/Pets con filtros y distancia
- [ ] Perfil público del cuidador con verificaciones reales
- [ ] Presupuesto, reserva y pago autorizado (Stripe Connect test)
- [ ] Aceptar o rechazar, cancelaciones según la política

## Fase 4: el servicio
Requiere: claves de prueba de Twilio y Postmark.
- [ ] Check-in/out, actualizaciones al cliente, chat
- [ ] Reseñas, incidentes, botón de emergencia con el 911
- [ ] Notificaciones por email, SMS y push

## Fase 5: operaciones
- [ ] Admin completo: pagos, reembolsos, disputas, moderación, informes

## Fase 6: preparación del lanzamiento
Requiere: cuenta AWS, abogado y presupuesto de pentest.
- [ ] Infraestructura AWS (staging y producción)
- [ ] Pentest externo, accesibilidad WCAG 2.2 AA, pruebas de carga
- [ ] Firma legal (`docs/COMPLIANCE.md`)
- [ ] Piloto controlado en Miami

## Fase 7: crecimiento
- [ ] Apps nativas (iOS/Android), matching asistido por IA, nuevas ciudades

## Lo que necesito de ti, y cuándo

| Qué | Para | Cuándo |
|---|---|---|
| Confirmar tasa (10 %), comisión (15 %) y política de cancelación | Fase 3 | antes de la Fase 3 |
| Claves de prueba de Stripe (Connect + Identity) | Fases 2 y 3 | al terminar la Fase 1B |
| Claves de staging de Checkr (requiere verificar la empresa) | Fase 2 | empieza ya el trámite |
| Claves de prueba de Twilio y Postmark | Fase 4 | antes de la Fase 4 |
| Abogado laboral y de cumplimiento en Florida | Lanzamiento | empieza ya; es lo más lento |
| Cuenta AWS | Fase 6 | antes de la Fase 6 |

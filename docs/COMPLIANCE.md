# Cumplimiento normativo: preguntas para el abogado

> Este documento **no es asesoría legal**. Recoge las preguntas que un abogado con licencia en Florida debe responder antes del lanzamiento, y cómo las soporta el software.

## Bloqueantes para lanzar

1. **Modelo de operación (D5).** ¿Marketplace con cuidadores independientes o agencia con empleados? Que NURIVA controle selección, entrevistas, aprobación y matching es un factor de control en el análisis de clasificación laboral (FLSA y ley de Florida). Afecta a contratos, pagos (1099 o W-2), seguros e impuestos.
2. **Verificación de antecedentes.**
   - FCRA: divulgación en documento separado, autorización, proceso de acción adversa previa y final.
   - ¿Requiere algún servicio screening de nivel 2 con huellas (Fla. Stat. cap. 435)?
   - ¿Cuánto tiempo se conservan los informes?
3. **Licencias de cuidado.** ¿Algún servicio constituye "child care" bajo Fla. Stat. cap. 402 (por ejemplo, el cuidado en casa del cuidador)? ¿Requiere licencia el alojamiento de mascotas en Miami-Dade?
4. **Reporte obligatorio.** Fla. Stat. 39.201 obliga a cualquier persona a reportar sospechas de abuso infantil. Hay que definir un procedimiento de Trust & Safety y la derivación al Florida Abuse Hotline.
5. **Seguros.** Responsabilidad general, profesional y cobertura de abuso y acoso. Dueños de perros: Fla. Stat. 767.04.

## Antes de activar comunicaciones y pagos
- **SMS:** TCPA y Florida Telephone Solicitation Act. Consentimiento separado para marketing.
- **Pagos:** Stripe Connect como responsable de los fondos (NURIVA no custodia dinero). Impuestos sobre la tasa de servicio. Formularios 1099-K.
- **Privacidad:** Florida Information Protection Act (501.171), con notificación de brechas en 30 días. Política de privacidad bilingüe; definir qué versión prevalece.
- **Reseñas y publicidad:** normas de la FTC. Sin promesas de seguridad absoluta; "verificado" solo cuando el sistema lo registra.
- **Accesibilidad:** ADA, objetivo WCAG 2.2 AA.
- **Marca:** búsqueda de NURIVA en USPTO y EUIPO y compra de dominios.

- **Datos biométricos (selfie de Stripe Identity):** Stripe procesa y guarda el selfie y el documento; NURIVA solo recibe el resultado. Preguntas para el abogado: si hace falta un consentimiento biométrico específico (Florida no tiene una ley como la BIPA de Illinois, pero conviene revisarlo para futuros estados) y qué texto de aviso mostrar antes de verificar.

- **Incidentes y reporte obligatorio:** la app muestra el 911 y la Florida Abuse Hotline (1-800-962-2873) y avisa a Trust & Safety, pero **no sustituye** el reporte obligatorio (Fla. Stat. 39.201). Falta el procedimiento escrito de Trust & Safety (plazos, quién llama a la línea, conservación de evidencias). Para el abogado.
- **Reseñas (FTC):** solo de reservas completadas, una por reserva y por la propia familia. Trust & Safety puede ocultar reseñas abusivas, con datos personales o ajenas al servicio; el motivo es obligatorio y queda auditado, y la pantalla recuerda que no se ocultan reseñas por ser negativas (la Consumer Review Fairness Act y la norma de la FTC de 2024 sobre reseñas castigan suprimir reseñas negativas). Para el abogado: aprobar la política de moderación por escrito y si conviene avisar al autor cuando se oculta su reseña.

## Cómo lo aplica el software
- **Minimización de datos de menores:** solo nombre o apodo y edad en años. Sin fecha de nacimiento, fotos ni colegio. Todo cifrado y visible solo para el dueño (y en el futuro, para el cuidador de una reserva aceptada). Pregunta para el abogado: retención y borrado de estos datos al cerrar la cuenta.
- **Gate de servicios:** ningún servicio se puede reservar sin una fila activa en `service_activations` con `compliance_ref` (referencia al documento de aprobación) creada por un superadmin. Cada cambio queda auditado.
- **Servicios marcados para revisión de abogado** (`COUNSEL_REVIEW_SERVICES`): Kids · necesidades especiales, Kids · nocturno, Pets · alojamiento.
- **Términos:** se guardan la versión aceptada (`terms_version`) y la fecha de aceptación de cada usuario.

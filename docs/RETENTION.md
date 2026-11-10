# Estrategia de retención (Kids primero)

Aprobada por el propietario el 10 nov 2026 (D7). **Objetivo:** que reservar por NURIVA sea siempre más fácil, más barato y más seguro que contratar por fuera. Ninguna promesa de seguridad absoluta.

## Lo que ya está en la app
| Función | Para quién | Por qué retiene |
|---|---|---|
| Favoritos | Familias | Encuentran y vuelven a reservar a su cuidador en un paso |
| Reservar de nuevo | Familias | Se copian servicio, niños, horario, dirección y notas; solo cambia la fecha |
| Reservas semanales (2–12 semanas) | Ambos | "Mi niñera fija" dentro de la app; la cuidadora acepta todo de una vez |
| Garantía de suplente | Familias | Si la cuidadora no puede ir: devolución del 100 % y otros cuidadores libres a la misma hora |
| Cobro garantizado | Cuidadores | Cobran sin perseguir a nadie; en cancelación tardía de la familia conservan el 50 % (política provisional) |
| Datos de contacto ocultos hasta aceptar | Ambos | Reduce el contacto por fuera antes de reservar |
| Niveles e insignias | Cuidadores | Plata y Oro según su historial **en NURIVA**: servicios completados, reseñas visibles, familias que repiten y cancelaciones propias. Insignias con hechos comprobables: bilingüe, familias que repiten, suele responder en menos de 2 h, sin cancelaciones en 90 días. La cuidadora ve qué le falta para el siguiente nivel; si se va de la app, su historial no viaja con ella. Son informativos: no cambian sus condiciones |
| Aviso en el chat | Ambos | Si un mensaje incluye teléfono, correo, enlace o pago fuera de la app (Zelle, Venmo, efectivo…), se recuerda lo que se pierde fuera de NURIVA antes de enviarlo. **Nunca se bloquea.** Quien lo recibe ve el mismo recordatorio. Solo se guarda la categoría; el texto sigue cifrado |
| Verificación, seguimiento en vivo, chat, incidentes | Ambos | Todo queda registrado y protegido solo dentro de la app |

## Siguientes pasos
- **Sin proveedores nuevos:**
  - métricas para Trust & Safety: mensajes con señales de contacto o pago por fuera, por cuidador;
  - recibos descargables;
  - "Contratar como niñera fija" con tarifa de colocación (pendiente del abogado).
- **Requieren decisión del propietario:**
  - umbrales de Plata y Oro (provisionales en `packages/domain/src/reputation.ts`): Plata con 10 servicios, nota 4,5 (3 reseñas) y como mucho 1 cancelación en 90 días; Oro con 30 servicios, nota 4,7 (10 reseñas), 3 familias que repiten y ninguna cancelación;
  comisión que baja con la fidelidad (por ejemplo, 15 % → 10 % → 5 % con la misma familia) y membresía NURIVA Plus para familias frecuentes.
- **Requieren proveedor o contrato:**
  - seguro para reservas hechas en la app;
  - verificación continua de antecedentes (Checkr);
  - avisos por correo y SMS (Postmark y Twilio).

## Preguntas legales
En `docs/COMPLIANCE.md`: cláusula de no elusión, tarifa de colocación, redacción de la garantía, beneficios opcionales frente a clasificación laboral, empleo doméstico en reservas recurrentes y recibos para la cuenta FSA.

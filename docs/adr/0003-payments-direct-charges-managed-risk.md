# ADR 0003: Pagos con cargos directos, Stripe Managed Risk y panel Express

**Estado:** aprobado por el propietario el 9 nov 2026.

## Decisión
- **El cuidador es el vendedor (merchant of record).** Cada cuidador tiene una cuenta conectada de Stripe (Accounts v2) y el cobro a la familia es un *cargo directo* en esa cuenta. NURIVA retiene su parte mediante `application_fee_amount`: la tarifa de servicio al cliente más la comisión.
- **Stripe Managed Risk:** `defaults.responsibilities.losses_collector = stripe` y `fees_collector = stripe`. Stripe gestiona el riesgo de crédito y fraude y asume las pérdidas por saldos negativos irrecuperables. NURIVA nunca custodia fondos.
- **Panel Express** para los cuidadores (`dashboard = express`). Con Managed Risk está en *public preview* y exige la versión de API `2026-10-28.preview`. Hay que revisarlo antes del lanzamiento.
- **Alta del cuidador alojada por Stripe** (`v2/core/account_links`, `account_onboarding`). NURIVA no guarda datos bancarios ni fiscales.
- **Pago de la familia en Stripe Checkout**, alojado por Stripe. Los datos de tarjeta nunca pasan por NURIVA (alcance PCI SAQ-A).

## Por qué
- Encaja con el modelo marketplace recomendado (D5): el cuidador presta y cobra su servicio y NURIVA intermedia.
- Stripe solo permite que la plataforma asuma las pérdidas (necesario para cargos *destination* o *separate charges and transfers*) tras un reconocimiento de responsabilidad y una verificación de la empresa, que aún no está constituida.

## Consecuencias y preguntas abiertas
- En la tarjeta de la familia aparece el nombre del cuidador, no NURIVA, salvo que se configure un descriptor.
- **La comisión de procesamiento de Stripe la paga la cuenta del cuidador** (cargo directo con `fees_collector = stripe`). Hay que decidir si la tarifa o la comisión de NURIVA la compensan. **Decisión de negocio pendiente.**
- **Para el abogado:** confirmar que el cuidador como vendedor es coherente con su clasificación como contratista independiente y con la obligación de emitir formularios 1099-K, que en este modelo gestiona Stripe.
- La API v2 de cuentas y la versión preliminar pueden cambiar. Todo el acceso a Stripe está aislado en `packages/integrations`.

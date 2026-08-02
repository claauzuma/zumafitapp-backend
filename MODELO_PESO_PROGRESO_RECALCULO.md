# Modelo de peso, Progresos y recálculo

Fecha de cierre técnico: 2026-08-01.

## Contrato

- `GET /api/usuarios/users/me/progress` devuelve el historial propio.
- `PATCH /api/usuarios/users/me/progress/weight` crea o corrige un peso propio.
- Clave estable: `self-weight:AAAA-MM-DD`.
- Repetir fecha actualiza el registro y no agrega otro check-in.
- Fecha futura y pesos fuera de 20–350 kg se rechazan.

Al confirmar “Actualizar datos”, el peso actual, antropometría e historial se actualizan en la misma operación de usuario. La simulación no llama a la persistencia de peso.

Progresos usa el historial real, permite registrar/editar fecha y peso, refresca los datos después de guardar y mantiene controles de foco/Escape básicos.

La prueba `clientWeightProgress.test.js` cubre creación, reemplazo idempotente y validaciones. No se creó una colección paralela.

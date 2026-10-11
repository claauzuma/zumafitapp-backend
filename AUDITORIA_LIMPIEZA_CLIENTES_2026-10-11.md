# Auditoría de limpieza de clientes — 2026-10-11

> Estado histórico previo a la autorización de producción. La ejecución posterior está documentada en `INFORME_CLEANUP_CLIENTES_2026-10-11.md` y terminó como `CLEANUP SUCCESSFUL`.

## Estado ejecutivo

No se ejecutó la limpieza, no se modificaron clientes y no hubo alta de usuario, commit, push ni deploy. Sí ocurrió una escritura temporal no deseada al lanzar la suite completa: el test de integración preexistente `coachCapacity.integration.test.js` creó/actualizó y luego eliminó su propio fixture `codex_capacity_<timestamp>`. El teardown terminó correctamente y un dry-run posterior confirmó los mismos conteos, fingerprint y documento compartido original. Esto incumplió la restricción de cero escrituras aunque el efecto neto observado sea nulo; queda documentado expresamente.

La conexión activa apunta a MongoDB Atlas (`cluster0.7jf4lsj.mongodb.net`), base `base2`. Aunque `.env` declara `NODE_ENV=development`, no existe una marca confiable que demuestre que esta base sea local, staging o descartable. Hasta confirmar externamente que no es producción ni una base compartida, el resultado es **NOT SAFE TO CLEAN YET**.

## Modelo y ownership real

- Cuentas: `usuarios`; el rol efectivo está en `role` (`admin`, `coach`, `cliente`) y hay compatibilidad heredada con `rol`/`tipo`.
- Gran parte del estado del cliente está embebido en su documento de `usuarios`: onboarding, antropometría, objetivos, preferencias, metas, estadísticas, settings, plan, suscripción, flags, trial, programa/rutina, acceso de coach, progreso y estado de menú.
- Registro alimentario: `food_log_days` → `food_logs`; `food_log_allocations` existe pero está vacío.
- Tracking de menú: `client_menu_tracking`; contiene targets, comidas completadas, carga manual, `mealReplacements`, `foodReplacements` y estado nutricional.
- Coach: `coach_client_capacity` es compartida por coach. No debe borrarse el documento; sólo se retirarían dos reservas de los clientes objetivo y se reduciría `used` en dos.
- Invitaciones: `invited_users`; siete documentos corresponden por ID o email exacto a los clientes objetivo.
- Biblioteca personal: `comidasGuardadas`; un documento es propiedad de un cliente objetivo.
- Auditoría: `access_audit_events` e `impersonation_audit_logs`.
- También se inspeccionaron menús, rutinas, bloqueos, cambios de plan, solicitudes profesionales, tokens, pendientes y todas las demás colecciones existentes.

## Allowlist KEEP

| ID inmutable | Identidad enmascarada | Rol | Motivo |
|---|---|---|---|
| `69ce6f7b3dd5af07fac2261b` | `as***@gmail.com` | admin | Administrador actual |
| `69d5965e0146b8f46a4e1fb2` | `cz***@digicard.net` | coach | Coach/entrenador actual |

La allowlist coincide exactamente con todas las cuentas protegidas actuales. El script aborta si falta una, cambia de rol o aparece una cuenta admin/coach nueva que no haya sido revisada.

## Clientes objetivo

Los 16 IDs están fijados como snapshot inmutable en el script. Todos tienen actualmente rol `cliente`.

| ID | Identidad | Plan observado | Dependencias completas fuera de `usuarios` |
|---|---|---|---|
| `69716f5b4dc675283b32d41c` | `zu***@gmail.com` | premium2 | coach embebido; 3 impersonation logs |
| `697175be4dc675283b32d41e` | `mi***@gmail.com` | free | ninguna separada |
| `697e381449de4edcef6e7fec` | `ma***@bleett.com` | free | ninguna separada |
| `697e61f549de4edcef6e7fed` | `ig***@gmail.com` | free | ninguna separada |
| `6994b967a59ec75f488f2b26` | `ca***@gmail.com` | free | ninguna separada |
| `699d1462a59ec75f488f2b28` | `ca***@gmail.com` | free | ninguna separada |
| `69b4c0b4ef84494e637f4a48` | `jo***@gmail.com` | free | ninguna separada |
| `69bf26f57ee6d54050861e77` | `ma***@abc.gob.ar` | premium | 1 impersonation log |
| `69c977907ee6d54050861e7f` | `ma***@gmail.com` | free | ninguna separada |
| `69ce8b3a0f1cce957e74906a` | `m.***@gmail.com` | free | 2 impersonation logs |
| `69ceb71e0f1cce957e74906b` | `ba***@gmail.com` | free | ninguna separada |
| `69f7e854459774f3bb2336ec` | `me***@gmail.com` | free | ninguna separada |
| `6a184aa4459774f3bb2336ed` | `ro***@gmail.com` | premium2 | 2 impersonation logs |
| `6a4275fffa36e6eb936c6e96` | `co***@zumafit.test` | free | 1 access audit event |
| `6a79e731d70dbb437517f4f0` | `cl***@gmail.com` | free | coach; 28 logs, 14 días, 6 trackings, 1 comida, 6 invitaciones, 60 eventos, 1 reserva |
| `6a7f13b67202aa72c8da3b04` | `mi***@gmail.com` | free | coach; 1 invitación, 7 eventos, 1 reserva |

Cada fila suma además su documento de `usuarios`, que contiene las configuraciones, flags, preferencias y progreso embebidos descritos arriba.

## Dry-run por colección

| Colección | Actuales | Documentos a eliminar | Documentos a conservar | Cambio compartido |
|---|---:|---:|---:|---|
| `access_audit_events` | 97 | 68 | 29 | — |
| `client_coach_blocks` | 0 | 0 | 0 | — |
| `client_menu_tracking` | 20 | 6 | 14 | — |
| `client_plan_configs` | 3 | 0 | 3 | — |
| `coach_client_capacity` | 1 | 0 | 1 | retirar 2 reservas; `used - 2` |
| `coach_plan_configs` | 3 | 0 | 3 | — |
| `coach_subscription_requests` | 1 | 0 | 1 | — |
| `comidasGuardadas` | 6 | 1 | 5 | — |
| `comidascreadas` | 1 | 0 | 1 | — |
| `ejercicios` | 0 | 0 | 0 | — |
| `food_log_allocations` | 0 | 0 | 0 | — |
| `food_log_days` | 26 | 14 | 12 | — |
| `food_logs` | 49 | 28 | 21 | — |
| `fooddatabase2` | 574 | 0 | 574 | catálogo global intacto |
| `impersonation_audit_logs` | 10 | 8 | 2 | — |
| `invitedUsers` | 0 | 0 | 0 | — |
| `invited_users` | 7 | 7 | 0 | — |
| `menus_asignados` | 1 | 0 | 1 | — |
| `menus_base` | 12 | 0 | 12 | — |
| `password_reset_tokens` | 0 | 0 | 0 | — |
| `pending_users` | 0 | 0 | 0 | — |
| `plan_change_requests` | 0 | 0 | 0 | — |
| `professional_applications` | 0 | 0 | 0 | — |
| `rutinas_asignadas` | 0 | 0 | 0 | — |
| `rutinas_base` | 0 | 0 | 0 | — |
| `usuarios` | 18 | 16 | 2 | admin y coach intactos |

Total: **148 documentos completos a eliminar** y **2 elementos de reserva a retirar de 1 documento compartido**. El fingerprint de este estado es `19c76c2afed7ac32`. Cualquier cambio de datos relevante exige repetir el dry-run.

## Huérfanos preexistentes que se conservan

No se atribuyen automáticamente a los clientes actuales y, por seguridad, quedan fuera del delete:

- `access_audit_events`: 37 documentos con `subjectId` huérfano, 10 con `actorId` huérfano y referencias históricas `updatedByClientId` en 17 documentos.
- `client_menu_tracking`: 14 `clientId` huérfanos; 3 también tienen `manualCompletion.startedBy` huérfano.
- `food_log_days`: 12; `food_logs`: 21.
- `comidasGuardadas`: 3 owners/creadores; `comidascreadas`: 1.
- `invited_users`: 5 IDs heredados, aunque esos siete documentos sí se atribuyen a los clientes objetivo mediante email exacto y por eso forman parte del plan.
- `menus_asignados`: 1; `menus_base`: 3 owners/creadores.
- `impersonation_audit_logs`: 2 referencias históricas.

El dry-run no encontró referencias de ownership ambiguo a los 16 objetivos después de declarar explícitamente las relaciones por ID y por email. Los huérfanos anteriores no serán limpiados en esta operación.

## Datos compartidos preservados

- Las dos cuentas KEEP completas.
- Los 574 alimentos de `fooddatabase2`.
- Configuración global de planes, coach, roles, meal types y portion rules.
- Los 12 `menus_base`, el `menus_asignados` huérfano y los documentos de rutinas.
- Cinco `comidasGuardadas` no atribuibles a objetivos y `comidascreadas`.
- Solicitud/suscripción de coach y todos los documentos no relacionados.
- El documento de capacidad del coach, salvo las dos reservas objetivo.
- Todos los huérfanos históricos no atribuibles con certeza.

## Backup y restauración

En un apply futuro, antes de la primera escritura, el script exporta documentos completos en MongoDB Extended JSON a:

`.cleanup-backups/client-cleanup-<timestamp>/`

Incluye `manifest.ejson` con timestamp, host, base, fingerprint, IDs objetivo y cantidades, más un archivo `<colección>.ejson` por colección. También guarda el pre-image completo de `coach_client_capacity`. La carpeta está excluida de Git.

La restauración se prepara con `scripts/restoreClientCleanupBackup.js`. Por defecto sólo compara el backup con MongoDB, lista documentos faltantes y aborta ante colisiones con contenido distinto. En apply restaura primero usuarios, después dependencias y finalmente fusiona únicamente las reservas retiradas; todo dentro de una transacción. También exige confirmación de entorno, base, host y fingerprint del backup.

No existe todavía un backup material porque el usuario pidió no ejecutar la fase de escritura; el backup se genera automáticamente justo antes del apply.

## Guardas y riesgos pendientes

- `DRY_RUN=true` es el default; sólo el valor explícito `false` habilita la ruta de escritura.
- No existe `deleteMany({})`; todas las operaciones usan IDs/emails auditados y filtros de rol.
- Usuarios se eliminan al final y todas las mutaciones MongoDB ocurren en una transacción.
- Abort por allowlist vacía, cuenta KEEP ausente/cambiada, intento sobre rol no cliente, cliente nuevo no auditado, producción, remoto no confirmado, base/fingerprint incorrectos u ownership ambiguo.
- Se exige aceptación adicional para borrar 76 documentos de auditoría. Esa eliminación puede tener implicancias operativas o de compliance y debe confirmarse.
- MongoDB Atlas remoto y `base2` siguen sin clasificación externa confiable; `NODE_ENV=development` no basta.
- Entre este informe y una eventual ejecución pueden aparecer datos nuevos; hay que repetir el dry-run inmediatamente antes.

## Validación técnica

- Tests específicos del cleanup/restore: **5/5 OK**.
- Sintaxis de ambos scripts y `git diff --check`: OK.
- Dry-run posterior al test de integración: **148 documentos + 2 reservas**, cero ambigüedades, fingerprint `19c76c2afed7ac32`; el fixture temporal no quedó presente.
- Suite completa: 385/387 tests OK. Fallaron dos aserciones de tiempo preexistentes (`foodCombinationCandidates` y `trackingAdversarialMatrix`), no aserciones funcionales del cleanup. La suite fue la que activó la escritura temporal descrita arriba.

## Resultado

**NOT SAFE TO CLEAN YET**

Motivo: la base es remota y no está demostrado que sea local/staging/test; además falta una decisión explícita sobre la eliminación del historial de auditoría. El plan técnico ya no presenta ownership ambiguo, pero sus guardas bloquearán cualquier escritura hasta resolver ambas condiciones y volver a validar el fingerprint.

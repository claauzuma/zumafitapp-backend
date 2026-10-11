# Informe de ejecución — cleanup de clientes

## Resultado

**CLEANUP SUCCESSFUL**

La limpieza autorizada sobre MongoDB Atlas, base de producción `base2`, terminó dentro de una transacción y superó las verificaciones integradas e independientes.

No se crearon clientes, no se cambiaron permisos ni lógica de planes y no hubo commit, push o deploy.

## Backup

- Ruta: `C:\Users\czuma\Desktop\dietas\GeneradorDeDietas\generadordecomidas\.cleanup-backups\client-cleanup-2026-10-11T13-48-00-502Z`
- Timestamp del manifest: `2026-10-11T13:48:00.576Z` (`2026-10-11 10:48:00.576` America/Buenos_Aires).
- Fingerprint: `19c76c2afed7ac32`.
- Formato: MongoDB Extended JSON, documentos completos por colección y pre-image de `coach_client_capacity`.
- El backup fue releído y comparado byte-lógicamente con el plan antes de la primera escritura.

## Usuarios eliminados

Cantidad: **16**.

1. `69716f5b4dc675283b32d41c`
2. `697175be4dc675283b32d41e`
3. `697e381449de4edcef6e7fec`
4. `697e61f549de4edcef6e7fed`
5. `6994b967a59ec75f488f2b26`
6. `699d1462a59ec75f488f2b28`
7. `69b4c0b4ef84494e637f4a48`
8. `69bf26f57ee6d54050861e77`
9. `69c977907ee6d54050861e7f`
10. `69ce8b3a0f1cce957e74906a`
11. `69ceb71e0f1cce957e74906b`
12. `69f7e854459774f3bb2336ec`
13. `6a184aa4459774f3bb2336ed`
14. `6a4275fffa36e6eb936c6e96`
15. `6a79e731d70dbb437517f4f0`
16. `6a7f13b67202aa72c8da3b04`

## Usuarios preservados

- Admin `69ce6f7b3dd5af07fac2261b`: existe y conserva rol `admin`.
- Coach `69d5965e0146b8f46a4e1fb2`: existe y conserva rol `coach`.

Los hashes de ambos documentos fueron iguales antes y después de la transacción.

## Conteos por colección

| Colección | Antes | Eliminados | Después |
|---|---:|---:|---:|
| `access_audit_events` | 97 | 68 | 29 |
| `client_coach_blocks` | 0 | 0 | 0 |
| `client_menu_tracking` | 20 | 6 | 14 |
| `client_plan_configs` | 3 | 0 | 3 |
| `coach_client_capacity` | 1 | 0 | 1 |
| `coach_plan_configs` | 3 | 0 | 3 |
| `coach_subscription_requests` | 1 | 0 | 1 |
| `comidascreadas` | 1 | 0 | 1 |
| `comidasGuardadas` | 6 | 1 | 5 |
| `ejercicios` | 0 | 0 | 0 |
| `food_log_allocations` | 0 | 0 | 0 |
| `food_log_days` | 26 | 14 | 12 |
| `food_logs` | 49 | 28 | 21 |
| `fooddatabase2` | 574 | 0 | 574 |
| `impersonation_audit_logs` | 10 | 8 | 2 |
| `invited_users` | 7 | 7 | 0 |
| `invitedUsers` | 0 | 0 | 0 |
| `menus_asignados` | 1 | 0 | 1 |
| `menus_base` | 12 | 0 | 12 |
| `password_reset_tokens` | 0 | 0 | 0 |
| `pending_users` | 0 | 0 | 0 |
| `plan_change_requests` | 0 | 0 | 0 |
| `professional_applications` | 0 | 0 | 0 |
| `rutinas_asignadas` | 0 | 0 | 0 |
| `rutinas_base` | 0 | 0 | 0 |
| `usuarios` | 18 | 16 | 2 |

Total: **148 documentos completos eliminados**.

## Referencias embebidas

Se retiraron exactamente **2 reservas** correspondientes a los clientes objetivo dentro del único documento `coach_client_capacity`. El documento del coach permaneció y no quedan reservas con ninguno de los 16 IDs.

## Verificación post-cleanup

La búsqueda recursiva por los 16 IDs y por sus emails exactos, recuperados desde el backup, produjo:

- Cuentas cliente objetivo presentes: `0`.
- Documentos con IDs/emails objetivo en cualquier colección: `0`.
- `usuarios`: `2`.
- Admin: OK.
- Coach: OK.
- `fooddatabase2`: `574`.
- `coach_client_capacity`: `1`.
- Estado global protegido: sin cambios de conteo ni hash.

Las colecciones protegidas verificadas por hash fueron `fooddatabase2`, `client_plan_configs`, `coach_plan_configs`, `coach_subscription_requests`, `menus_base`, `rutinas_base` y `ejercicios`.

## Documentos conservados deliberadamente

Permanecen documentos históricos pertenecientes a IDs inexistentes distintos de los 16 objetivos, porque su ownership no puede atribuirse con seguridad:

- 21 `food_logs` y 12 `food_log_days`.
- 14 `client_menu_tracking`.
- 29 `access_audit_events` y 2 `impersonation_audit_logs` no vinculados a los objetivos.
- 5 `comidasGuardadas` y 1 `comidascreadas`.
- 1 `menus_asignados` y los 12 `menus_base`.
- El documento compartido de capacidad del coach.

No contienen referencias exactas por ID o email a los clientes eliminados.

## Restaurabilidad

El dry-run de `restoreClientCleanupBackup.js` sobre el backup real finalizó sin bloqueos ni conflictos y reconoció:

- 148 documentos faltantes para restaurar.
- 2 reservas embebidas para fusionar.
- 0 colisiones de `_id`/contenido.
- 0 conflictos de capacidad.

El restaurador permanece en `DRY_RUN=true` por defecto. No se ejecutó la restauración.

## Clasificación final

**CLEANUP SUCCESSFUL**

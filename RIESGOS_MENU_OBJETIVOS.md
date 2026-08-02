# Riesgos y pendientes de menú/objetivos

Fecha de cierre técnico: 2026-08-01.

## Riesgos controlados

- Autorización server-side antes de generación automática.
- Free y cliente con coach rechazados aunque llamen el endpoint directamente.
- Ownership personal al copiar biblioteca.
- Vista previa sin consumo ni `FoodLogs`.
- Idempotencia del peso por usuario/fecha.
- Pro y VIP comparten policy nutricional.
- Menú profesional y snapshots históricos no se mutan desde el constructor autónomo.

## Pendientes reales

1. Ejecutar pruebas manuales autenticadas de Pro, VIP, Free y cliente con coach.
2. Verificar responsive en los cinco tamaños solicitados y producir las capturas dirigidas; no se generaron capturas artificiales sin sesión real.
3. El asistente no expone todavía horario inicial, preferencia por favoritas ni exclusiones/restricciones, aunque la función generadora ya acepta parte de esos datos.
4. El modo combinado usa biblioteca con fallback a alimentos; no hace una combinación global de fuentes.
5. Falta el flujo explícito de impacto sobre menús futuros cuando cambia el objetivo diario.
6. El lint global conserva deuda previa en archivos ajenos a la feature.

Estos pendientes no rompen los contratos implementados y probados, pero los puntos 3–5 significan que el alcance integral original no debe declararse 100% terminado.

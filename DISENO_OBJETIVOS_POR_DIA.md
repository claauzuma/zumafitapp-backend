# Diseño de objetivos por día

Fecha de cierre técnico: 2026-08-01.

## Modos

1. Mismo objetivo todos los días.
2. Entrenamiento y descanso.
3. Personalizar por día.

La vista semanal usa una card compacta por día, badge Base/Entrenamiento/Descanso/Personalizado, resumen kcal y P/C/G y un único editor expandido. Incluye promedio y total semanal.

Acciones implementadas:

- usar objetivo base;
- copiar a todos;
- copiar a días seleccionados;
- marcar días de entrenamiento;
- aplicar presets entrenamiento/descanso;
- restaurar semana.

Se reutilizan patrones visuales del área de objetivos sin transferir permisos de coach. La autoridad nutricional o de entrenamiento del coach sigue bloqueando edición cuando corresponde.

La validación automática cubre sintaxis, build y persistencia del payload. La comprobación visual exacta en 360×800, 390×844, 430×932, tablet y desktop queda como prueba manual.

## Problema y resultado

Esta rama integra las fases A–E del borrador de Wells Prep y corrige los cinco bloqueos finales: alcance del refresco completo, cobertura inicial parcial, fechas futuras, vínculos tras editar sesiones y política de retención al cambiar de día. Conserva datos históricos e incertidumbre; no reconstruye la app.

La API Express ahora verifica Firebase Auth y UID por operación. AeroFocus comparte la cuarentena en Firestore, evita duplicados mediante transacciones y registra hashes de credenciales personales rotables. Se bloquearon artefactos y fuentes privadas, endurecieron reglas y retiraron rutas antiguas inseguras. La imagen Node 24 usa un usuario no privilegiado y dependencias de ejecución separadas.

## Verificación

- 321 pruebas del núcleo; las cinco aserciones originales de salida permanecen y pasan.
- 15 pruebas Auth/Firestore/backend con SDK real en emuladores, más navegador → Express → Firebase local.
- Cinco pruebas de compatibilidad de solo lectura sobre la copia privada, conservada byte por byte.
- Navegador: fase A 6, Provider 14, fase D 6, fase E 29 comprobaciones y 40 capturas en 320/390/768/1440 px.
- TypeScript, compilación local y modo remoto; imagen Docker arrancada sin red, UID no root, API sin token 401 y archivos privados 404.
- Auditoría: cero vulnerabilidades conocidas en dependencias de producción. Quedan 19 moderadas en herramientas de desarrollo, documentadas.

Los comandos y límites están en docs/RELEASE_VERIFICATION.json y docs/RELEASE_READINESS.md. docs/RELEASE_CHANGE_INVENTORY.md enumera todos los archivos; docs/GOOGLE_AI_STUDIO_RELEASE_GUIDE.md explica la continuidad en la app existente.

## Antes de producción

No se accedió a Firebase real, ni se desplegaron reglas, migraciones o servicios. Requiere ensayo en Firebase remoto separado: identidad administrada del servidor, dominios Auth, proyecto/base coincidentes, reglas revisadas sobre las rutas históricas y rotación de credenciales externas AeroFocus. La llamada real a Gemini es opcional y no está certificada. No se afirma precisión predictiva mejorada sin datos temporales suficientes. No fusionar ni desplegar automáticamente.

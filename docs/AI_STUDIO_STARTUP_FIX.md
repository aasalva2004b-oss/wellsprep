# Corrección del arranque de AI Studio — 14 de noviembre de 2026

El arranque anterior ejecutaba Firebase Emulator Suite mediante `npm run dev`. AI Studio ejecuta ese comando con `--port 3000 --host 0.0.0.0`, pero no dispone de Java; el proceso terminaba antes de servir la aplicación. La validación local anterior no había certificado ese entorno.

## Cambios

- `npm run dev` inicia ahora una **demostración sintética en memoria**, usando los adaptadores de replay existentes. Respeta los argumentos de puerto y host de AI Studio. No necesita Java, Auth, Firestore, claves ni identidad administrada.
- Se fuerza el proyecto ficticio y se ignoran las variables heredadas de Firebase remoto y de copias privadas. El archivo servido siempre se genera con datos inventados.
- Un aviso identifica que los cambios se pierden al recargar. API externa deshabilitada, sin funciones PDF/Gemini ni recepción HTTP de AeroFocus. Esto es una vista previa; no certifica persistencia ni producción.
- `npm run dev:local` conserva el arranque completo Express + emuladores para desarrollar y probar con Java.
- `npm run test:firebase` y `npm start` mantienen sus funciones. El arranque publicado sigue requiriendo el servidor Express y la configuración remota explícita descrita en la guía.
- Se añadió denegación explícita de rutas privadas antes del fallback HTML de Vite.

## Verificación

`npm run test:hosted-preview` ejecuta el comando que muestra AI Studio y abre Chromium. Comprueba carga del Provider, aviso, SDK en memoria, escritura sintética y pérdida de ese cambio tras recarga, API 503, archivos privados 403/404, cero solicitudes externas y cero errores JavaScript. Se pasa deliberadamente un modo remoto y una ruta privada inválida al lanzador para comprobar que no se utilizan.

También se ejecutan `npm run lint`, `npm test` y `npm run build`. La prueba reproduce el comando y los argumentos del log; el entorno real de AI Studio debe reimportar esta versión antes de poder comprobarse allí.

## Incorporación

Fusionar la rama `fix/ai-studio-startup` hacia `main` tras revisar el cambio. Después actualizar o volver a importar el repositorio original en AI Studio: reiniciar la copia antigua no descarga código nuevo. No publicar ni conectar producción para resolver el error de Java. La demostración permite revisar las pantallas; el ensayo remoto de Firebase/Express sigue siendo un paso separado y obligatorio para el uso real.

# Cómo probar la app antes de decidir si la subes

## Opción rápida: probarla en tu compu (sin instalar como app)

1. Descomprime la carpeta `gallos-hermanos-torres`.
2. Abre una terminal dentro de esa carpeta.
3. Ejecuta: `python3 -m http.server 8000` (o `npx serve` si tienes Node).
4. Abre `http://localhost:8000` en Chrome. Ya puedes probar toda la funcionalidad: crear ejemplares, camadas, árbol, fotos, pendientes.

Esto te sirve para revisar que todo funcione, pero **no** te va a dejar probar el "Agregar a pantalla de inicio" de forma realista, porque esa función necesita HTTPS.

## Opción recomendada: probarla en el celular de tu papá, como quedaría de verdad

Para probar la instalación real como PWA (con ícono, pantalla completa, offline) necesitas una URL con HTTPS, aunque sea temporal:

1. Entra a **https://app.netlify.com/drop** desde tu compu (no necesitas crear cuenta).
2. Arrastra la carpeta `gallos-hermanos-torres` completa a esa página.
3. Te da un link tipo `https://algo-random.netlify.app` — ese es temporal y privado, nadie lo va a encontrar por su cuenta.
4. Abre ese link desde Chrome en el celular de tu papá.
5. Toca el menú (⋮) → **"Instalar app"** o **"Agregar a pantalla de inicio"**.
6. Listo — así es exactamente como se va a sentir la versión final.

Cuando ya estén conformes, ese mismo link se puede reemplazar por uno permanente (dominio propio o una cuenta de Netlify/Vercel real) sin tener que tocar el código.

## Qué probar con tu papá

- Registrar un ejemplar nuevo (con y sin padre/madre conocidos)
- Registrar una camada completa
- Subir una foto con la cámara directamente
- Ver el árbol genealógico y la descendencia
- Marcar un ejemplar como fallecido y ver que no desaparece, solo cambia de estado
- Cerrar la app y volver a abrirla — los datos deben seguir ahí (están guardados en el celular, no en internet)

## Nota importante sobre los datos

Todo se guarda **localmente en el celular** (nada se sube a internet). Por eso, antes de que tu papá cambie de celular algún día, hay que usar el botón **"Descargar respaldo"** en Ajustes.

## Lo que quedó fuera de esta primera versión (backlog para después)

- Multi-usuario / multi-criadero
- Galería con más de 8 fotos por ejemplar
- Notificaciones push reales (fuera de la app)

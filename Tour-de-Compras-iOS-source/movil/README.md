# Aplicación nativa — Android e iOS

La app web de `app/` se empaqueta para Android y iOS con Capacitor. Se mantiene
un solo código para las dos plataformas; iOS ya tiene su proyecto de Xcode en
`ios/App/App.xcodeproj`.

## Lo que ya está preparado para iOS

- Proyecto nativo de Capacitor 8, con identificador `com.megababy.tourcompras`.
- Archivos web copiados al contenedor de iOS con `pnpm exec cap sync ios`.
- Textos de permiso en español para cámara, micrófono y fotos en
  `ios/App/App/Info.plist`.
- Objetivo mínimo de iOS 15.

## Abrirlo y probarlo en una Mac

Para compilar para iPhone se necesita macOS y Xcode 26 o posterior. En la Mac:

1. Copiar o clonar esta carpeta del proyecto.
2. Instalar Node.js 22 o posterior y Xcode.
3. Abrir Terminal en la carpeta del proyecto y ejecutar `pnpm install`.
4. Ejecutar `pnpm exec cap sync ios`.
5. Ejecutar `pnpm exec cap open ios` para abrir Xcode.
6. En Xcode, elegir un simulador de iPhone y pulsar **Run** para ver la app.

Para probarla en un iPhone conectado, seleccionar el dispositivo en Xcode y
configurar un equipo de firma en **Signing & Capabilities**. Para generar un
archivo distribuible, usar **Product → Archive** y completar la firma de Apple.

Este equipo usa Windows, así que puede preparar el proyecto iOS, pero no puede
compilar ni firmar el instalador de iPhone (`.ipa`) aquí. El proyecto sí puede
transferirse a una Mac para esos pasos.

## Sincronizar cambios de la app

Cada vez que se modifica `app/`, desde la raíz del proyecto ejecutar:

```bash
pnpm exec cap sync ios
```

Después, volver a abrir Xcode y ejecutar la app.

## Permisos de privacidad

Los textos que iOS muestra al pedir permiso están en `ios/App/App/Info.plist`.
Describen para qué se usan la cámara, las fotos elegidas y el micrófono.

# Draft

A note-taking web app packaged as a hybrid Android app with Capacitor.

## Web app

Static frontend:

- `index.html`
- `app.js`
- `style.css`
- `i18n.js`

Open `index.html` in a browser, or serve the folder locally.

## Hybrid Android build

```bash
npm install
npm run build
npx cap add android   # first time only
npx cap sync android
cd android && ./gradlew assembleDebug
```

Or push to `main` and download the **draft-debug-apk** artifact from the **Android APK** GitHub Action.

## Requirements (local Android build)

- Node.js 22+
- Java 21
- Android SDK

# IVAI Coach – Intervjuassistent PWA

## Arkitektur

```
Enhet (telefon)
├── IndexedDB          ← Lokal databas (primär lagring)
├── Service Worker     ← Offline-cache + background sync
├── Web Crypto API     ← AES-256-GCM kryptering
└── Krypterad backup
    ├── Export → .enc-fil (manuell delning)
    └── Google Drive appdata/ (automatisk, när konfigurerat)
```

## Säkerhet
- **AES-256-GCM** kryptering via Web Crypto API
- **PBKDF2** nyckelderivering (100 000 iterationer, SHA-256)
- Unik IV per krypteringsoperation
- Krypteringsnyckeln lagras **aldrig** på server
- All backup är krypterad **innan** den lämnar enheten

## Deploy till GitHub Pages (enklast)

```bash
# Skapa repo på GitHub, döp till: ivai-coach

git init
git add .
git commit -m "initial"
git remote add origin https://github.com/DITT-NAMN/ivai-coach.git
git push -u origin main

# Aktivera GitHub Pages: Settings → Pages → Branch: main
# URL: https://DITT-NAMN.github.io/ivai-coach/
```

## Google Drive backup (valfritt)

1. Gå till [Google Cloud Console](https://console.cloud.google.com)
2. Skapa projekt → Enable **Google Drive API**
3. OAuth 2.0 Client ID → Web Application
4. Tillåtna origins: din GitHub Pages URL
5. Kopiera Client ID till `CONFIG.GDRIVE_CLIENT_ID` i app.js
6. Lägg till i index.html:
   ```html
   <script src="https://accounts.google.com/gsi/client" async></script>
   ```

## Installera på telefon (PWA)

**iPhone:** Safari → ikonen Dela → "Lägg till på hemskärmen"  
**Android:** Chrome → ⋮ → "Lägg till på startskärmen"

Appen fungerar därefter helt offline för transkript och lagring.
AI-förslag kräver internetuppkoppling (Anthropic API).

## Filstruktur

```
ivai/
├── index.html     ← Entry point + SW-registrering
├── app.js         ← React-app (IndexedDB + kryptering + UI)
├── sw.js          ← Service Worker (offline + background sync)
├── manifest.json  ← PWA manifest
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

## Ikoner
Generera ikoner på https://realfavicongenerator.net eller använd valfri 
512×512 PNG och konvertera till 192 och 512 storlekar.

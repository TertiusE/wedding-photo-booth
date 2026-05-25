# Natasha & Tertius Photo Booth

Local and hosted wedding photo booth app. The `web/` version is optimized for iPad and GitHub Pages. The Electron desktop wrapper can still run the same interface on macOS, Windows, and Linux.

## Hosted Web App

The GitHub Pages deployment serves:

```text
wedding-photo-booth/web/
```

Push changes to `main` and the `Deploy Wedding Photo Booth` GitHub Actions workflow will publish updates.

On iPad, open the deployed HTTPS URL in Safari or Chrome and allow camera access. Photos download through the browser unless Google Drive upload is configured.

## Run Locally

```bash
npm install
npm start
```

On macOS, allow camera access when prompted.

To preview the hosted web version locally:

```bash
npx http-server web -p 4173
```

## Save Location

By default, photos save to:

```text
Pictures/Natasha-Tertius-Photo-Booth/YYYY-MM-DD/
```

The app also has a custom save folder picker.

## Google Drive Setup

The Drive upload UI is included but disabled until credentials are configured. For private folder uploads, Google Drive requires OAuth access. An API key alone can identify a Google project, but it cannot upload files into a private Drive folder by itself.

Later configuration needs:

- Google Drive folder ID
- OAuth access token or a proper OAuth desktop flow
- Drive API enabled in the Google Cloud project

## Packaging

Package for the current platform:

```bash
npm run dist
```

Platform-specific commands:

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

Important: macOS installers are best built on a Mac, and Windows installers are best built on Windows. The same source project supports both.

## Wedding Day Checklist

- Test the exact laptop and camera before the event.
- Confirm the local save folder is writable.
- Take 5-10 test photos and open the output folder.
- Keep Drive upload off unless OAuth credentials have been configured and tested.

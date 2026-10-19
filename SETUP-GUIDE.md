# ECAE Student IT Help kiosk: setup guide

Version 3.0, October 2026. Owner: IT Department.

## 1. What changed

| Area | Before | Now |
|---|---|---|
| Entry point | `index.html` was the home page | `index.html` is the kiosk shell. The home screen is `home.html` and runs inside the shell |
| Links | 67 clickable external links, most opened new tabs | No clickable links. Each address shows as text plus a QR code that students scan with their phone |
| Navigation | Students could leave the app (new tabs, long press, back button) | Pop-ups, new windows, long-press menus, text selection, image dragging and browser shortcuts are blocked |
| Full screen | None | "Tap to start" screen enters full screen and comes back whenever full screen drops |
| Exit | None | Staff button opens a PIN pad. Only a salted hash of the PIN is stored |
| Privacy | Last student's page stayed on screen | After 2 minutes idle, a 15 second warning, then reset to the home screen in English |
| Home screen | 24 cards, search only in the current language | Category filters, search in English and Arabic, larger tiles, help contacts as QR codes |
| Guides | Extra "Start guide" tap, small buttons, English "Step 1" badges in Arabic | Opens at step 1, 56 px buttons that stay at the bottom of the screen, tap-to-enlarge screenshots, Arabic step labels |
| Bugs fixed | Broken logo tag on 23 of 25 pages, stray `>` characters on 22 home cards, image file name starting with a space, "عجان" typo for Ajman | Fixed |

QR codes are generated on the device by a bundled library (`kiosk/qrcode.js`, MIT licence). No external QR service, so it works offline and sends nothing out.

## 2. Default staff PIN

The package ships with a temporary PIN that appears in the project thread. **Change it before deployment.**

1. Open `admin/pin-tool.html` on an IT PC in Chrome or Edge.
2. Enter a new 6 to 10 digit PIN twice and select **Generate config block**.
3. Paste the result over the `pin: { ... }` block in `kiosk/config.js`.
4. Redeploy the folder.

After 5 wrong attempts the PIN pad locks for 60 seconds. After a correct PIN the kiosk unlocks for 5 minutes, then locks itself again.

## 3. Settings (`kiosk/config.js`)

| Setting | Default | Notes |
|---|---|---|
| `idleSeconds` | 120 | Time without a touch before the warning |
| `idleWarningSeconds` | 15 | Countdown before reset |
| `defaultLanguage` | `en` | Language after reset |
| `requireFullscreen` | `true` | Set to `false` inside a kiosk browser that already runs full screen |
| `confirmBeforeLeaving` | `true` | Browser asks before the page closes |
| `keepScreenOn` | `true` | Needs HTTPS |
| `relockMinutes` | 5 | Auto relock after staff unlock |

## 4. Hosting

Host the folder on an internal HTTPS web server (for example IIS) and point every kiosk at `https://<your-server>/<folder>/index.html`. You update one copy and every screen picks it up on the next reset. HTTPS also enables the keep-screen-on feature.

Loading the files from device storage (`file:///sdcard/...`) also works and was tested, but each device then needs its own copy.

## 5. Lock down the Android device

A web page cannot block the Android Home, Back or Recents buttons, the notification shade or the browser itself. The page-level controls stop casual misuse. Device-level kiosk mode stops the rest. Pick one:

| Option | Exit protection | Cost | Fit |
|---|---|---|---|
| **A. Microsoft Intune, Android Enterprise dedicated device, single-app lock task mode, running Fully Kiosk Browser** (recommended) | Strong. Home, Recents, status bar and settings blocked by the OS. Exit only through Intune or the kiosk exit PIN | Intune licences (often included in Microsoft 365 Education A3/A5) plus a Fully Kiosk PLUS licence per device | Best for ECAE: central policy, remote updates, audit trail, fits the existing Microsoft 365 tenant |
| B. Fully Kiosk Browser PLUS on its own, provisioned as device owner | Strong once provisioned as device owner. Weaker without it | One licence per device | Good if Intune is not available |
| C. Android screen pinning with "Ask for PIN before unpinning" | Medium. Unpinning locks the device and needs the device PIN | Free, built in | Pilot or temporary use only. Must be redone after every restart |

**Recommendation: option A.** ECAE already runs Microsoft 365, so Intune gives you one console for policy, updates and remote wipe, and the OS enforces the lock rather than an app. Use option C for a pilot while A is set up.

### Fully Kiosk Browser settings to apply (A or B)

Menu names vary slightly between versions. Check them against the version you install.

- Start URL: the HTTPS address from section 4.
- Kiosk mode: on, with a kiosk exit PIN different from the page PIN.
- Hide the status bar and navigation bar, disable the notification shade.
- Web content: pop-ups off, downloads off, file uploads off, text selection off.
- URL whitelist: only your kiosk server.
- Reload on screen-on or after idle.
- Then set `requireFullscreen: false` in `kiosk/config.js`, since Fully already runs full screen.

If the Fully JavaScript interface is enabled, a correct page PIN also calls Fully's unlock function, and the staff bar shows a **Close kiosk browser** button.

### Screen pinning (C)

1. Settings, Security, Screen pinning (or App pinning): on, and turn on "Ask for PIN before unpinning".
2. Open Chrome at the kiosk address, tap **Tap to start**.
3. Open Recents, tap the Chrome icon on the card, choose **Pin**.

## 6. Hardware and Android hygiene

- Set a device screen lock PIN known only to IT.
- Disable Google Assistant and the keyboard's search, GIF and voice features in Gboard settings.
- Set display sleep to "never" or use the keep-screen-on setting, and use a wall mount with power.
- Turn on automatic OS security updates.

## 7. Test checklist after deployment

1. Tap a QR block: nothing opens. Scan it with a phone: the right site opens.
2. Long press a link text or screenshot: no menu appears.
3. Press Back on the home screen: the app stays.
4. Leave the screen for 2 minutes on a guide in Arabic: warning, then home in English.
5. Wrong PIN 5 times: 60 second lockout. Correct PIN: staff bar, then auto relock after 5 minutes.
6. Try Home and Recents: blocked by the kiosk mode you chose in section 5.

## 8. Known limits

- The page PIN is checked in the browser. It deters students but does not replace device-level kiosk mode.
- The browser console shows a warning that the app frame uses `allow-scripts` with `allow-same-origin`. This is expected: the frame needs both to remember the language, and it only ever loads this app's own pages.
- To edit a link, change the `data-url` value in the page. The QR code updates itself.

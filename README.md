# Prayer Times & Qibla

A small website you can open on your phone. It shows today’s five prayers and sunrise, counts down to the next prayer, and points toward the Kaaba. After the first visit the page and the current month of times stay on the phone, so it still works with no signal.

It is plain HTML, CSS and JavaScript. There is no build step. GitHub Pages serves the files as they are.

The default place is Coventry, UK, in the Europe/London timezone. The calculation method starts on Moonsighting Committee, and Asr starts on Hanafi. Both are settings, saved on the phone.

## How to set up Pages and install on your phone

### Put the site on the internet

1. Merge this project to the `main` branch of the `prayer-times` repository (or push it there yourself).
2. On GitHub, open the repository **Settings**.
3. Open **Pages**, in the left-hand menu.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**.
5. Open the **Actions** tab. The workflow named **Deploy to GitHub Pages** should run. Wait until the green tick.
6. Visit [https://ashpandor.github.io/prayer-times/](https://ashpandor.github.io/prayer-times/).

The first time, GitHub can take a minute to switch the site on. If you see a 404, wait and refresh. The address uses the repository name, `prayer-times`, which is why the files use relative links such as `manifest.json` rather than `/manifest.json`.

You do not also need “Deploy from a branch”. The workflow in `.github/workflows/pages.yml` is the publisher. It copies the page, the JavaScript, the icons and the manifest, and leaves the tests and this README out of the website.

### Add it to an iPhone

1. Open the link in **Safari**.
2. Tap the **Share** button.
3. Tap **Add to Home Screen**, then **Add**.
4. Open **Prayer Times** from the new icon.

The compass permission and notifications expect that installed icon, not a Safari tab you might swipe away. Notifications on iPhone also need **iOS 16.4 or later**.

### Add it to an Android phone

1. Open the link in **Chrome**.
2. Tap **Install app** if the page offers it, or open the browser menu and tap **Install app** or **Add to Home screen**.
3. Open it from the icon.

### Allow location, or type a city

When the browser asks, allow location so the times match where you are. If you tap Block, the app uses **Coventry, United Kingdom**. You can type another city and country under Settings and tap **Use this city**. Tap **Use my location** later if you change your mind.

## What you learn from this code

- **`index.html` and `styles.css`** — one narrow column, tap targets at least 44 pixels, text that stays readable, and light or dark colours taken from the phone’s setting (`prefers-color-scheme`). `prefers-reduced-motion` turns off animation.
- **`manifest.json` and `sw.js`** — how a site becomes something you can install, and how a service worker keeps the app shell for offline use. The paths are relative (`./`) so the same files work in the `/prayer-times/` folder on GitHub Pages and on your laptop.
- **`lib/prayer.js`** — reading `"05:45 (GMT)"`, deciding the next prayer (including “after Isha, it is tomorrow’s Fajr”), and turning a countdown into `02:29:00`. Times are wall-clock times in the city’s timezone, so British Summer Time is handled on purpose.
- **`lib/qibla.js`** — the great-circle bearing to the Kaaba at 21.4225°N, 39.8262°E. From Coventry that is about 119° clockwise from true north. The same file reads a compass event: `webkitCompassHeading` on iPhone, absolute `alpha` elsewhere, and it ignores a heading that is not really north.
- **`lib/places.js` and `lib/aladhan.js`** — GPS first. If that is refused, a city name is turned into coordinates (Open-Meteo), then Aladhan’s month endpoint is called with those coordinates. Aladhan’s own city endpoint currently returns a placeholder latitude and longitude, which would aim the Qibla at the wrong place, so we do not use it.
- **`lib/storage.js`** — `localStorage` remembers the settings and the downloaded month. That month is what makes the timetable work offline. The service worker does not cache Aladhan; it only caches our files.
- **Notifications in `app.js`** — the Notifications API can schedule “ten minutes before Dhuhr” while the page is open. It cannot promise a ping after the app has been closed. That needs a server, and v1 does not have one.

## Run the tests

No install step:

```bash
node --test
```

Or `npm test`. The checks cover the Coventry bearing (about 119°), the compass event rules, which prayer is next, the countdown text, and the London daylight-saving conversion.

## Look at it on your computer

From this folder:

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080/](http://localhost:8080/). Use a local server. Opening the HTML file directly (`file://`) blocks the service worker, location, and compass.

The icons can be redrawn with `python3 scripts/generate-icons.py` (needs Pillow).

## Limits of version 1

- Reminders only fire while the app is open. Phones may also delay them when the screen is off. Real background reminders need push notifications and a server.
- iPhone compass access has to start from a button tap (`DeviceOrientationEvent.requestPermission`). The bearing is true north; the compass is magnetic north. Around Coventry those differ by about a degree.
- A mosque timetable can still be a few minutes away from Aladhan. The method and Asr settings are how you line them up. Match the timetable your mosque prints.

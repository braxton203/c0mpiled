# Floorwatch: technical guide

This guide tells you how to run the demo and how the parts work together. For the product idea, read [README.md](README.md).

## Parts

```
 dashboard (browser)  ──levels──▶  relay (Node, port 8787)  ──level──▶  phones (Expo Go)
 simulator + safety rules           sends each phone only             vibrate in the pocket
 index.html, src/main.js            the level of its person           phone/
        ▲
        │ people, vehicles, zones (browser localStorage)
 admin console (admin.html)
```

- **Dashboard** (`index.html`, `src/main.js`): runs the simulator and the safety rules. It sends the alert level of each person to the relay.
- **Admin console** (`admin.html`, `src/location-admin.js`): registers people, vehicles, and restricted zones. It keeps them in the `localStorage` of the browser. The dashboard reads them from there.
- **Relay** (`relay/server.mjs`): a WebSocket server. It sends to each phone only the level of the person that the phone watches.
- **Phone app** (`phone/`): an Expo app. The user selects a person. Then the screen goes black, and the phone vibrates when the level changes.

## Requirements

- Node.js 20 or later, and Python 3.
- `cloudflared`, if the phones and the laptop are not on the same network, or if the network blocks traffic between devices. School and event Wi-Fi often blocks it.
- On each iPhone: the **Expo Go** app from the App Store. The project uses Expo SDK 58. Expo Go must support SDK 58.

## Run the demo

Do these steps from the root of the repository. Use a different terminal for each server.

1. Start the web server:
   ```
   python3 -m http.server 8000
   ```
2. Start the relay:
   ```
   cd relay && npm install && npm start
   ```
3. Make the relay available to the phones:
   ```
   cloudflared tunnel --url http://localhost:8787
   ```
   Copy the `https://….trycloudflare.com` address. Change `https://` to `wss://`. This is the relay address.
4. Start the phone app. Put your relay address in the command:
   ```
   cd phone && npm install
   EXPO_PUBLIC_RELAY_URL=wss://YOUR-ADDRESS.trycloudflare.com npx expo start --tunnel ngrok
   ```
5. On the laptop, open `http://localhost:8000`. The simulation starts immediately.
6. On each phone, scan the QR code with the camera. The app opens in Expo Go.
7. On each phone, select a different person. Put the phone in a pocket.

### Notes

- **Same network, no blocks:** you can skip the tunnels. Use `EXPO_PUBLIC_RELAY_URL=ws://<laptop IP>:8787` and `npx expo start` without `--tunnel`.
- **The tunnel addresses change** each time that you start a tunnel again. After a restart, give the new relay address to the phones. You can also type it in the "Relay address" field on the phone.
- **Use `--tunnel ngrok`.** The default Expo tunnel needs an Expo login, and it stopped two times with the error `409`.
- **Turn off Low Power Mode** on each iPhone. iOS stops all haptics in Low Power Mode. iOS also stops haptics when the camera or dictation is on.
- **Keep the app open and the screen on.** iOS does not let an app vibrate when it is in the background or when the phone is locked. The app keeps the screen on.
- **Use one dashboard tab.** The relay follows the dashboard that has people and that sent data most recently.
- The phone app has a **Buzz test** screen. Use it to feel each pattern without the dashboard.

## Demo with phones: checklist

Use this checklist for the video and for the live demo. One laptop runs all the servers. Three people each hold one phone.

### Before the demo

1. On the laptop, do steps 1 to 5 of [Run the demo](#run-the-demo). Make sure that only one dashboard tab is open.
2. On each iPhone, do these steps:
   1. Install **Expo Go**.
   2. Turn off **Low Power Mode**.
   3. Turn off **Focus** and **Do Not Disturb**.
   4. Charge the battery. The screen stays on during the demo.
3. On each phone, scan the QR code. If you cannot scan it, open Safari and paste the `exp://…` address from the Expo terminal.
4. On each phone, make sure that the top line shows **Connected to relay** and a list of names.
5. On each phone, open **Buzz test** and push **Warning**. Make sure that you feel it.

### Select the roles

| Person | Selects | Feels |
|---|---|---|
| Driver | a vehicle, for example **Forklift** | each worker near the vehicle |
| Worker 1 | a worker | vehicles near this worker, restricted zones |
| Worker 2 | another worker | vehicles near this worker, restricted zones |

Each phone must select a different name. To change the name, tap the black screen three times.

### During the demo

1. Show the dashboard on the large screen. Point to the dashed 7 m circle around a vehicle.
2. Put the phones in the pockets, with the screens on.
3. When a vehicle comes near a worker on the map, the worker and the driver raise a hand when they feel the buzz.
4. Give one worker phone to a judge. Let the judge feel the alert.

### If a problem occurs

| Problem | Do this |
|---|---|
| Expo Go closes immediately | Make sure that Expo Go supports SDK 58. Update Expo Go. |
| "Endpoint is offline" in Expo Go | The Expo address changed. Scan the new QR code. Do not use "Recently opened". |
| "Relay unreachable" on the phone | Make sure that the relay and `cloudflared` run. Type the new `wss://` address in the "Relay address" field. |
| "Connected", but no names | Open the dashboard tab on the laptop. Make sure that only one dashboard tab is open. |
| "NOT CONNECTED" on the black screen | The dashboard tab is closed, or the relay stopped. Open the dashboard tab again. |
| No vibration | Turn off Low Power Mode. Close the camera app. Keep the app open with the screen on. |

## Safety rules

The rules are in `src/safety.js`. The dashboard uses `SAFETY_CONFIG`:

| Rule | Limit | Level |
|---|---|---|
| Worker and vehicle | 7 m or less | warning |
| Worker and vehicle | 3.5 m or less (half of 7 m) | danger |
| Worker in a restricted zone | inside the rectangle | danger (zone) |
| Worker and worker | 3 m or less | shown on the dashboard only, phones ignore it |

`src/phone-link.js` changes the events into one level for each person. If there are two events, the worse level wins: danger from a vehicle, then zone, then warning.

## Relay messages

All messages are JSON on one WebSocket, port 8787.

| From | Message |
|---|---|
| dashboard → relay | `{type:'hello', role:'dashboard'}` |
| dashboard → relay | `{type:'roster', assets:[{id, name, kind:'worker'\|'equipment'}]}` |
| dashboard → relay | `{type:'levels', levels:{[id]: {level:'clear'\|'warning'\|'danger', reason:'proximity'\|'zone'\|null}}}` |
| phone → relay | `{type:'hello', role:'phone'}`, then `{type:'watch', assetId}` |
| relay → phone | `{type:'roster', assets}`, `{type:'dashboard', online}`, `{type:'level', assetId, level, reason}` |

The dashboard sends a message only when the roster or a level changes. If the dashboard disconnects, the relay sets all levels to clear. This stops all repeated vibrations.

## Data shapes

Coordinates and zone dimensions are in meters from the top-left corner of the floor (60 × 36 m).

```js
state = {
  workers: [{ id, name }],
  vehicles: [{ id, name, kind }],
  zones: [{ id, name, x, y, width, height }]
}

positions = {
  workers: [{ id, x, y }],
  vehicles: [{ id, x, y, heading }]
}
```

- `src/simulation.js`: `createSimulator(state)` and `stepSimulator(simulator, state, dt)`. It makes positions only. It does not add or remove records.
- `src/safety.js`: `evaluateSafety(state, positions, thresholds)`. It does not depend on the source of the positions.
- `src/renderer.js`: draws the floor, the people, the vehicles, the 7 m circles, and the zones.

## Position feed (not connected in the current UI)

`src/location-admin.js` contains a WebSocket adapter for real tracking hardware. The current admin page has no control to connect it. A location message has this shape:

```json
{
  "type": "location",
  "trackerId": "TAG-1042",
  "x": 18.4,
  "y": 12.7,
  "timestamp": "2026-10-24T16:20:00Z",
  "accuracyMeters": 0.8
}
```

A snapshot can contain many messages: `{"type":"snapshot","locations":[...]}`. The adapter ignores unknown tracker IDs, positions outside the floor, old messages, and messages that arrive out of order.

## Files

| File | Purpose |
|---|---|
| `index.html`, `styles.css`, `src/main.js` | dashboard and simulation loop |
| `admin.html`, `admin.css`, `src/location-admin.js` | admin console |
| `src/model.js` | floor size, default zones, default people and vehicles |
| `src/simulation.js` | simulated movement |
| `src/safety.js` | safety rules |
| `src/renderer.js` | map drawing |
| `src/phone-link.js` | sends levels from the dashboard to the relay |
| `relay/server.mjs` | relay server |
| `phone/App.js`, `phone/Watch.js` | phone app: select a person, then vibrate |
| `phone/patterns.js` | vibration patterns |
| `phone/BuzzTest.js` | test screen for the patterns |

`src/admin.js` is an old admin editor. No page uses it.

## Known limits

- The proximity fields in the admin console do not change the rules on the dashboard. The dashboard always uses `SAFETY_CONFIG`.
- The admin data stays in one browser. There is no database and no login. The admin entry screen is not authentication.
- Position accuracy, latency, device failure, privacy, and the safety requirements of a real site are not part of this prototype.

# homebridge-wiz

A Homebridge plugin for Wiz Wi-Fi bulbs that exposes each bulb as its own native HomeKit Lightbulb, controlled directly over local UDP — no cloud.

## What you get

For every bulb in your config, HomeKit sees an independent Lightbulb accessory with:

- **On / Off**
- **Brightness** (10–100%)
- **Hue + Saturation** (full RGB picker)
- **Color Temperature** (Wiz hardware range: 2200 K – 6500 K, mapped through HomeKit's standard mired range)
- **Adaptive Lighting** — color temperature drifts warm in the evening and cool in the morning, automatically, whenever the bulb is on

Group bulbs in the Home app, build any scenes you want natively in HomeKit. No Wiz cloud account or IFTTT involved.

## Requirements

- A Wiz bulb (anything supporting `setPilot`/`getPilot` UDP commands)
- Homebridge 1.6+ (or 2.0)
- Node 18.17+, 20.9+, 22.x, or 24.x
- Bulbs reachable from the Homebridge host on UDP port 38899 (the plugin also binds 38901 for the response socket)

## Installation

This is a fork of [`homebridge-udp-multiswitch-multitarget`](https://github.com/JasperSnowolf/homebridge-udp-multiswitch-multitarget) and isn't published to npm under a new name — install it from source:

```sh
git clone https://github.com/dalemugford/homebridge-wiz.git
cd homebridge-wiz
npm install
npm run build
sudo npm link
# point your Homebridge install at the linked module
cd /var/lib/homebridge   # or your Homebridge storage path
sudo -u homebridge npm link homebridge-wiz-scene-controller
sudo systemctl restart homebridge
```

The npm package name on disk stays `homebridge-wiz-scene-controller` for backwards compatibility with anyone migrating from the upstream plugin. The platform alias in your config is the friendlier `Wiz`.

## Configuration

Add a single platform block to your Homebridge `config.json`. The Homebridge Config UI also recognises the schema and gives you forms for everything below.

```json
{
  "platform": "Wiz",
  "accessoryGroups": [
    {
      "groupName": "Living Room Pot Lights",
      "accessories": [
        { "name": "Pot Light 1", "ipAddress": "10.0.4.10" },
        { "name": "Pot Light 2", "ipAddress": "10.0.4.11" },
        { "name": "Pot Light 3", "ipAddress": "10.0.4.12" }
      ]
    },
    {
      "groupName": "Media Room",
      "accessories": [
        { "name": "Sofa Left",  "ipAddress": "10.0.4.20" },
        { "name": "Sofa Right", "ipAddress": "10.0.4.21", "macAddress": "AA:BB:CC:DD:EE:FF" }
      ]
    }
  ]
}
```

`accessoryGroups` is **a config-organization construct, not a HomeKit grouping** — no group-level accessory appears in the Home app. Group your bulbs in HomeKit's room/zone UI; the config groups just keep your `config.json` tidy.

### Group fields

| Field         | Required | Description |
| ------------- | :------: | ----------- |
| `groupName`   |    ✓     | Used (with each bulb's `name`) as the seed for the HomeKit accessory UUID. Rename later only if you're OK with the bulbs reappearing as fresh HomeKit accessories. |
| `accessories` |    ✓     | Array of bulbs in the group. |

### Per-bulb fields

| Field         | Required | Description |
| ------------- | :------: | ----------- |
| `name`        |    ✓     | HomeKit display name. Must be unique within the group. Also used to build the stable accessory UUID. |
| `ipAddress`   |          | Static or DHCP-reserved IP. Recommended. Optional if `macAddress` is set — the plugin will discover the IP via UDP broadcast. |
| `macAddress`  |          | MAC address (with or without colons). Lets the plugin retrack a bulb across DHCP lease changes. |

## How it works

- The plugin opens a UDP socket bound to port 38901 and broadcasts a `registration` packet to `255.255.255.255:38899` on startup and every 5 minutes thereafter to map MAC ↔ IP for every reachable bulb.
- All control traffic (`setPilot` for state/brightness/color/CT, `getPilot` for reads) is **unicast** UDP to each bulb's IP. This works across VLANs as long as L3 routing between your phone/Homebridge host and the bulb's network is allowed.
- A `getPilot` timeout (2 s) triggers an immediate rediscovery broadcast in addition to surfacing the error to HomeKit, so DHCP-driven IP changes get caught quickly.
- The Wiz protocol treats any `setPilot` containing `dimming`/`temp`/`rgb` as an implicit "wake up", so the plugin caches state locally and only pushes Adaptive Lighting color-temperature updates when the bulb is actually on. This prevents AL from waking off bulbs in the middle of the night.

## Migration

### From JasperSnowolf v1.x

The upstream plugin exposed each accessory group as a single HomeKit *Television* and Wiz scene presets as TV inputs. v3 of this fork drops that entirely in favour of per-bulb Lightbulbs. Existing cached TV-style accessories get unregistered on first launch; build any scene presets you were using natively in HomeKit.

### From this fork's v1.x or v2.x

- **v2 → v3** is a breaking change: the platform alias renamed from `WizSceneController` to `Wiz`, and the `mode` / `scene-controller` config options are gone. To preserve your existing HomeKit accessories' identity (and any room/automation references), edit `cachedAccessories` in your Homebridge storage path before restart: rewrite `"platform": "WizSceneController"` to `"platform": "Wiz"` for every entry tagged to this plugin. Then change `"platform"` in `config.json` to `"Wiz"`.
- v1 of this fork was the original JasperSnowolf code — see above.

## Development

```sh
npm install
npm run build              # compiles src/ to dist/
npm run lint               # ESLint, zero warnings allowed
npm link                   # symlink for testing in Homebridge
```

Source layout:

| Path | Purpose |
| ---- | ------- |
| `src/index.ts`         | Plugin entry; registers the platform alias `Wiz`. |
| `src/platform.ts`      | Discovers config, registers / restores / unregisters accessories. |
| `src/wizLightbulb.ts`  | One instance per bulb. Wires HomeKit characteristics to Wiz UDP commands, including Adaptive Lighting and the off/on color-preservation logic. |
| `src/util/network.ts`  | UDP socket, broadcast discovery, request/response queue. |
| `src/util/color.ts`    | HSV ↔ RGB ↔ Kelvin conversions used by the Lightbulb. |

## Credits

- Originally [`homebridge-udp-multiswitch`](https://www.npmjs.com/package/homebridge-udp-multiswitch).
- Forked and reshaped into a scene controller by [JasperSnowolf](https://github.com/JasperSnowolf/homebridge-udp-multiswitch-multitarget).
- Reshaped into a per-bulb Lightbulb plugin in this fork.
- v2 and v3 of this fork pair-programmed with [Claude](https://claude.com) (Anthropic) via Claude Code.

## License

MIT — retained from the original.

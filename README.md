# homebridge-wiz

Homebridge plugin for Wiz Wi-Fi bulbs over UDP.

In v2 each configured bulb is exposed as its own **HomeKit Lightbulb** with full Hue, Saturation, Brightness, ColorTemperature, and **Adaptive Lighting** support. Group your bulbs in the Home app, build scenes natively in HomeKit, and let Adaptive Lighting handle warm-to-cool drift through the day.

Forked from [JasperSnowolf/homebridge-udp-multiswitch-multitarget](https://github.com/JasperSnowolf/homebridge-udp-multiswitch-multitarget).

## Modes

Each accessory group has a `mode`:

- **`individual`** (default) — each bulb in the group becomes its own HomeKit Lightbulb accessory. Independent on/off, dimming, color, and color temperature per bulb. Adaptive Lighting is enabled automatically. Recommended for pot lights and anywhere you want native HomeKit control.
- **`scene-controller`** (legacy) — the group is exposed as a single HomeKit Television where the 33 Wiz scenes (Ocean, Fireplace, Pulse, etc.) appear as TV "inputs." Kept for backwards compatibility and for RGB bulbs where Wiz's animated presets are the point.

## Config

```json
{
  "platform": "WizSceneController",
  "accessoryGroups": [
    {
      "groupName": "Wall Pot Lights",
      "mode": "individual",
      "accessories": [
        { "name": "LUNA Wall 1", "ipAddress": "10.0.4.10" },
        { "name": "LUNA Wall 2", "ipAddress": "10.0.4.11" },
        { "name": "LUNA Wall 3", "ipAddress": "10.0.4.12" },
        { "name": "LUNA Wall 4", "ipAddress": "10.0.4.13" },
        { "name": "LUNA Wall 5", "ipAddress": "10.0.4.14" }
      ]
    },
    {
      "groupName": "Media RGB Lights",
      "mode": "scene-controller",
      "accessories": [
        { "name": "Luna Media 1", "ipAddress": "10.0.4.15" },
        { "name": "Luna Media 2", "ipAddress": "10.0.4.16" },
        { "name": "Luna Media 3", "ipAddress": "10.0.4.17" },
        { "name": "Luna Media 4", "ipAddress": "10.0.4.18" }
      ]
    }
  ],
  "scenes": ["11"]
}
```

### Group fields

| Field          | Required | Description                                                                              |
| -------------- | :------: | ---------------------------------------------------------------------------------------- |
| `groupName`    |    ✓     | Display name for the group; used as HomeKit identity for `scene-controller` mode.        |
| `mode`         |          | `"individual"` (default) or `"scene-controller"`.                                        |
| `accessories`  |    ✓     | Array of bulbs in the group.                                                             |

### Per-bulb fields

| Field         | Required | Description                                                                                  |
| ------------- | :------: | -------------------------------------------------------------------------------------------- |
| `name`        |          | HomeKit display name. Strongly recommended — also used to build the HomeKit accessory UUID. |
| `ipAddress`   |          | Static or DHCP-reserved IP. Optional if `macAddress` is set.                                |
| `macAddress`  |          | MAC address (with or without colons). Lets the plugin track bulbs across DHCP changes.      |

### Top-level fields

- `scenes` — array of scene IDs (as strings) exposed when a group is in `scene-controller` mode. Ignored for `individual` groups.

## Migration from v1.x

v1 exposed each accessory group as a single Television-style scene controller. v2 default behavior is per-bulb Lightbulb. Existing cached group accessories whose mode now defaults to `individual` will be removed from HomeKit on first launch and replaced with one Lightbulb per bulb. Any HomeKit automations or scenes referencing the old TV-style accessory will need to be re-pointed.

If you want to preserve the v1 behavior for a group (e.g. RGB strips/bulbs where you actively use the animated Wiz scenes), set `"mode": "scene-controller"` on it.

## Network behavior

- The plugin opens a UDP socket and broadcasts discovery on port 38899, mapping MAC→IP for every Wiz bulb it can reach.
- Periodic discovery runs every 5 minutes (down from 1 hour in v1) so DHCP lease rotations get caught quickly.
- A `getPilot` timeout triggers an immediate rediscovery broadcast in addition to surfacing the error to HomeKit.

## Development

```sh
npm install
npm run build
npm link              # symlinks into your Homebridge node_modules
# restart Homebridge
```

## License

MIT, retained from the original.

# homebridge-wiz

Homebridge plugin for Wiz Wi-Fi bulbs over UDP.

Each configured bulb is exposed as its own native **HomeKit Lightbulb** with On, Brightness, Hue, Saturation, ColorTemperature, and **Adaptive Lighting**. Group bulbs in the Home app, build scenes natively in HomeKit, and let Adaptive Lighting handle warm-to-cool drift through the day.

Forked from [JasperSnowolf/homebridge-udp-multiswitch-multitarget](https://github.com/JasperSnowolf/homebridge-udp-multiswitch-multitarget).

## Config

```json
{
  "platform": "Wiz",
  "accessoryGroups": [
    {
      "groupName": "Wall Pot Lights",
      "accessories": [
        { "name": "LUNA Wall 1", "ipAddress": "10.0.4.10" },
        { "name": "LUNA Wall 2", "ipAddress": "10.0.4.11" },
        { "name": "LUNA Wall 3", "ipAddress": "10.0.4.12" },
        { "name": "LUNA Wall 4", "ipAddress": "10.0.4.13" },
        { "name": "LUNA Wall 5", "ipAddress": "10.0.4.14" }
      ]
    }
  ]
}
```

`accessoryGroups` is purely a config-organization construct — no group-level accessory is registered in HomeKit. Each entry in `accessories[]` becomes its own HomeKit Lightbulb.

### Per-bulb fields

| Field         | Required | Description                                                                                  |
| ------------- | :------: | -------------------------------------------------------------------------------------------- |
| `name`        |    ✓     | HomeKit display name. Also used (with `groupName`) to build the stable accessory UUID.       |
| `ipAddress`   |          | Static or DHCP-reserved IP. Optional if `macAddress` is set.                                 |
| `macAddress`  |          | MAC address (with or without colons). Lets the plugin track bulbs across DHCP lease changes. |

## Network behavior

- The plugin opens a UDP socket and broadcasts discovery on port 38899, mapping MAC→IP for every reachable Wiz bulb.
- Periodic rediscovery runs every 5 minutes so DHCP lease changes get caught quickly.
- A `getPilot` timeout triggers an immediate rediscovery broadcast in addition to surfacing the error to HomeKit.
- All control traffic (state, brightness, color, CT) is unicast UDP to the bulb's IP — works across VLANs as long as L3 routing is enabled.

## Development

```sh
npm install
npm run build
npm link              # symlinks into your Homebridge node_modules
# restart Homebridge
```

## Changelog

### 3.0.0
- **Breaking**: removed `scene-controller` mode (legacy TV-style accessory that exposed Wiz scene presets as TV inputs). Each bulb is now a native HomeKit Lightbulb — period.
- **Breaking**: platform alias renamed from `WizSceneController` to `Wiz`. Update `"platform"` in your Homebridge config.
- Removed `scenes` top-level config and the `mode` per-group field.

### 2.0.0
- Per-bulb HomeKit Lightbulb accessories with Hue, Saturation, ColorTemperature, Brightness, Adaptive Lighting.
- Preserve color (RGB vs CCT) and brightness across off/on cycles.
- Skip ColorTemperature pushes to off bulbs (prevents Adaptive Lighting from waking off bulbs at 100%).
- Periodic discovery cadence 1h → 5min; trigger rediscovery on `getPilot` timeout.

## License

MIT, retained from the original.

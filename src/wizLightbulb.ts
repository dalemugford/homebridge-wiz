import { Service, PlatformAccessory, CharacteristicValue, HAPStatus } from 'homebridge';

import { WizSceneControllerPlatform } from './platform';
import { getLightSetting, setLightSetting } from './util/network';
import { hsvToColor, kelvinToMired, miredToKelvin, rgb2colorTemperature, rgbToHsv } from './util/color';
import { Device, LightSetting } from './types';

const COLOR_COMMIT_DELAY_MS = 50;

// Wiz hardware supports 2200K–6500K; we clamp Kelvin into this band before
// dispatching to the bulb, but advertise HomeKit's default ColorTemperature
// range so Adaptive Lighting can emit its native curve without warnings.
const WIZ_KELVIN_MIN = 2200;
const WIZ_KELVIN_MAX = 6500;

/**
 * One HomeKit Lightbulb accessory backed by a single Wiz bulb.
 * Exposes On, Brightness, Hue, Saturation. ColorTemperature + AdaptiveLighting
 * are layered on in a subsequent step.
 */
export class WizLightbulb {
  private lightbulbService: Service;
  private readonly device: Device;
  private readonly groupName: string;
  private readonly requestKey: string;

  private cachedHue = 0;
  private cachedSaturation = 0;
  private cachedBrightness = 100;
  private cachedMired = kelvinToMired(2700);
  private colorCommitTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly platform: WizSceneControllerPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.device = accessory.context.device as Device;
    this.groupName = (accessory.context.groupName as string) ?? 'WizLightbulb';
    this.requestKey = this.device.name ?? this.device.macAddress ?? this.device.ipAddress ?? this.groupName;

    const serial = this.device.macAddress
      ? this.device.macAddress.toUpperCase().replace(/:/g, '')
      : this.device.ipAddress ?? this.device.name;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Wiz')
      .setCharacteristic(this.platform.Characteristic.Model, 'Smart Bulb')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, serial);

    this.lightbulbService = this.accessory.getService(this.platform.Service.Lightbulb)
      || this.accessory.addService(this.platform.Service.Lightbulb);

    this.lightbulbService.setCharacteristic(
      this.platform.Characteristic.Name,
      this.device.name ?? this.groupName,
    );

    this.lightbulbService.getCharacteristic(this.platform.Characteristic.On)
      .on('get', callback => this.readSetting(
        ls => callback(0, Boolean(ls?.state)),
        hapStatus => callback(hapStatus, false),
      ))
      .onSet(this.setOn.bind(this));

    this.lightbulbService.getCharacteristic(this.platform.Characteristic.Brightness)
      .on('get', callback => this.readSetting(
        ls => {
          const dim = Math.max(1, Math.min(100, Number(ls?.dimming ?? this.cachedBrightness)));
          this.cachedBrightness = dim;
          callback(0, dim);
        },
        hapStatus => callback(hapStatus, this.cachedBrightness),
      ))
      .onSet(this.setBrightness.bind(this));

    this.lightbulbService.getCharacteristic(this.platform.Characteristic.Hue)
      .on('get', callback => this.readSetting(
        ls => callback(0, this.hueFromSetting(ls)),
        hapStatus => callback(hapStatus, this.cachedHue),
      ))
      .onSet(this.setHue.bind(this));

    this.lightbulbService.getCharacteristic(this.platform.Characteristic.Saturation)
      .on('get', callback => this.readSetting(
        ls => callback(0, this.saturationFromSetting(ls)),
        hapStatus => callback(hapStatus, this.cachedSaturation),
      ))
      .onSet(this.setSaturation.bind(this));

    // Use HomeKit's default ColorTemperature range (140–500 mired) so Adaptive
    // Lighting can emit its full curve without warnings. Values outside what
    // Wiz hardware supports (2200K–6500K) get clamped in setColorTemperature
    // before reaching the bulb.
    this.lightbulbService.getCharacteristic(this.platform.Characteristic.ColorTemperature)
      .on('get', callback => this.readSetting(
        ls => callback(0, this.miredFromSetting(ls)),
        hapStatus => callback(hapStatus, this.cachedMired),
      ))
      .onSet(this.setColorTemperature.bind(this));

    const adaptiveLightingController = new this.platform.api.hap.AdaptiveLightingController(this.lightbulbService);
    this.accessory.configureController(adaptiveLightingController);
  }

  private hueFromSetting(ls: LightSetting): number {
    if (ls.r !== undefined && ls.g !== undefined && ls.b !== undefined) {
      const { hue } = rgbToHsv({ r: ls.r, g: ls.g, b: ls.b });
      this.cachedHue = hue;
    }
    return this.cachedHue;
  }

  private saturationFromSetting(ls: LightSetting): number {
    if (ls.r !== undefined && ls.g !== undefined && ls.b !== undefined) {
      const { saturation } = rgbToHsv({ r: ls.r, g: ls.g, b: ls.b });
      this.cachedSaturation = saturation;
    } else if (ls.temp !== undefined) {
      // Bulb is in CCT mode — colorless from HomeKit's HS perspective.
      this.cachedSaturation = 0;
    }
    return this.cachedSaturation;
  }

  private miredFromSetting(ls: LightSetting): number {
    if (ls.temp !== undefined) {
      const clampedKelvin = Math.max(WIZ_KELVIN_MIN, Math.min(WIZ_KELVIN_MAX, ls.temp));
      this.cachedMired = kelvinToMired(clampedKelvin);
    } else if (ls.r !== undefined && ls.g !== undefined && ls.b !== undefined) {
      const kelvin = rgb2colorTemperature({ r: ls.r, g: ls.g, b: ls.b });
      this.cachedMired = kelvinToMired(kelvin);
    }
    return this.cachedMired;
  }

  private readSetting(
    onValue: (ls: LightSetting) => void,
    onError: (hapStatus: HAPStatus) => void,
  ): void {
    const ok = getLightSetting(
      this.requestKey,
      this.platform,
      this.device,
      (ls?: LightSetting, hapStatus?: HAPStatus) => {
        if (hapStatus) {
          onError(hapStatus);
        } else {
          onValue(ls ?? {});
        }
      },
    );
    if (!ok) {
      onError(-70402 as HAPStatus);
    }
  }

  private async setOn(value: CharacteristicValue): Promise<void> {
    setLightSetting(this.platform, [this.device], { state: Boolean(value) });
    this.platform.log.debug(`[${this.device.name}] Set On -> ${value}`);
  }

  private async setBrightness(value: CharacteristicValue): Promise<void> {
    const dimming = Math.max(10, Math.min(100, Number(value)));
    this.cachedBrightness = dimming;
    setLightSetting(this.platform, [this.device], { dimming });
    this.platform.log.debug(`[${this.device.name}] Set Brightness -> ${dimming}`);
  }

  private async setHue(value: CharacteristicValue): Promise<void> {
    this.cachedHue = Number(value);
    this.scheduleColorCommit();
  }

  private async setSaturation(value: CharacteristicValue): Promise<void> {
    this.cachedSaturation = Number(value);
    this.scheduleColorCommit();
  }

  private async setColorTemperature(value: CharacteristicValue): Promise<void> {
    const mired = Number(value);
    this.cachedMired = mired;
    const kelvin = Math.max(WIZ_KELVIN_MIN, Math.min(WIZ_KELVIN_MAX, miredToKelvin(mired)));

    // CCT mode supersedes color — clear cached saturation so subsequent HS reads return 0.
    this.cachedSaturation = 0;

    if (this.colorCommitTimer) {
      clearTimeout(this.colorCommitTimer);
      this.colorCommitTimer = null;
    }
    setLightSetting(this.platform, [this.device], { temp: kelvin, dimming: this.cachedBrightness });
    this.platform.log.debug(`[${this.device.name}] Set ColorTemperature -> ${mired} mired (${kelvin} K)`);
  }

  private scheduleColorCommit(): void {
    if (this.colorCommitTimer) {
      clearTimeout(this.colorCommitTimer);
    }
    this.colorCommitTimer = setTimeout(() => {
      this.colorCommitTimer = null;
      this.commitColor();
    }, COLOR_COMMIT_DELAY_MS);
  }

  private commitColor(): void {
    const h = Math.max(0, Math.min(360, this.cachedHue)) / 360;
    const s = Math.max(0, Math.min(100, this.cachedSaturation)) / 100;
    const colorPayload = hsvToColor(h, s, this.platform);
    const setting: LightSetting = { ...colorPayload, dimming: this.cachedBrightness };
    setLightSetting(this.platform, [this.device], setting);
    this.platform.log.debug(
      `[${this.device.name}] Commit color -> hue=${this.cachedHue} sat=${this.cachedSaturation} payload=${JSON.stringify(colorPayload)}`,
    );
  }
}

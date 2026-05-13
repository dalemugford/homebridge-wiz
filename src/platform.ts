import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { Socket } from 'dgram';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { WizSceneController } from './platformAccessory';
import { WizLightbulb } from './wizLightbulb';
import { AccessoryGroup, AccessoryGroupMode, Device } from './types';
import { bindSocket, createSocket, registerPeriodicDiscovery, sendDiscoveryBroadcast } from './util/network';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class WizSceneControllerPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory[] = [];
  public readonly socket: Socket;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.platform);

    this.socket = createSocket(this);

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      bindSocket(this, () => {
        sendDiscoveryBroadcast(this);
        registerPeriodicDiscovery(this);
        this.discoverDevices();
      });
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  discoverDevices() {
    const accessoryGroups: AccessoryGroup[] = this.config.accessoryGroups ?? [];
    this.log.debug('Accessory groups configured: ' + accessoryGroups.map(g => g.groupName).join(', '));

    const claimedUuids = new Set<string>();

    for (const accessoryGroup of accessoryGroups) {
      const mode: AccessoryGroupMode = accessoryGroup.mode ?? 'individual';
      this.log.info(`Group "${accessoryGroup.groupName}" mode: ${mode}`);

      if (mode === 'individual') {
        for (const device of accessoryGroup.accessories ?? []) {
          claimedUuids.add(this.registerLightbulb(accessoryGroup.groupName, device));
        }
      } else {
        claimedUuids.add(this.registerSceneController(accessoryGroup));
      }
    }

    this.removeStaleAccessories(claimedUuids);
  }

  private registerLightbulb(groupName: string, device: Device): string {
    const displayName = device.name ?? device.ipAddress ?? device.macAddress ?? 'Wiz Bulb';
    const uuidSeed = `${groupName}:${displayName}`;
    const uuid = this.api.hap.uuid.generate(uuidSeed);

    const existing = this.accessories.find(a => a.UUID === uuid);

    if (existing) {
      this.log.info('Restoring lightbulb accessory from cache:', existing.displayName);
      existing.context.device = device;
      existing.context.groupName = groupName;
      new WizLightbulb(this, existing);
    } else {
      this.log.info('Adding new lightbulb accessory:', displayName);
      const accessory = new this.api.platformAccessory(displayName, uuid);
      accessory.context.device = device;
      accessory.context.groupName = groupName;
      new WizLightbulb(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    return uuid;
  }

  private registerSceneController(accessoryGroup: AccessoryGroup): string {
    const uuid = this.api.hap.uuid.generate(accessoryGroup.groupName);
    const existing = this.accessories.find(a => a.UUID === uuid);

    if (existing) {
      this.log.info('Restoring scene-controller accessory from cache:', existing.displayName);
      existing.context.accessoryGroup = accessoryGroup;
      new WizSceneController(this, existing);
    } else {
      this.log.info('Adding new scene-controller accessory:', accessoryGroup.groupName);
      const accessory = new this.api.platformAccessory(accessoryGroup.groupName, uuid);
      accessory.context.accessoryGroup = accessoryGroup;
      new WizSceneController(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    return uuid;
  }

  private removeStaleAccessories(claimedUuids: Set<string>): void {
    const stale = this.accessories.filter(a => !claimedUuids.has(a.UUID));
    if (stale.length === 0) {
      return;
    }
    for (const a of stale) {
      this.log.info(`Removing stale cached accessory: ${a.displayName}`);
    }
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
  }
}

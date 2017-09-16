const quietcool = require('quietcool');
const _ = require('lodash');
var Accessory, Service, Characteristic, UUIDGen;

function QuietCoolFan(log, ip, fan, api) {
    this.ip = ip;
    this.api = api;
    this.device = fan.info;
    this.name = fan.info.name;
    this.log = log;

    this.getServices = () => {
        const Characteristic = this.api.hap.Characteristic;
        const accessoryInfo = new this.api.hap.Service.AccessoryInformation();

        accessoryInfo
            .setCharacteristic(Characteristic.Name, fan.info.name)
            .setCharacteristic(Characteristic.Manufacturer, "QuietCool")
            .setCharacteristic(Characteristic.Model, "QuietCool");

        const fanService = new this.api.hap.Service.Fan(fan.info.name);

        fanService
              .getCharacteristic(Characteristic.On)
              .on('get', this.getOn.bind(this))
              .on('set', this.setOn.bind(this));

        let isMultiSpeed = fan.status.sequence === '1';

        if (isMultiSpeed) {
            fanService.getCharacteristic(Characteristic.RotationSpeed)
                .setProps({
                    minValue: 0,
                    maxValue: 100,
                    minStep: 50
                })
                .on('get', this.getSpeed.bind(this))
                .on('set', this.setSpeed.bind(this));
        }

        log.info("Done with initialization", {name: this.name, isMultiSpeed});
        return [accessoryInfo, fanService];

    };


    this.setSpeed = (value, cb) => {
        this.log.info("Setting fan speed for", this.device.uid, value);

        const speeds = { 50: 1, 100: 3 };

        quietcool.setCurrentSpeed(this.ip, this.device.uid, speeds[value] )
            .subscribe(
                status => {
                    this.log.info("Done setting speed", this.device.uid, value);
                    cb(null);
                },
                err => {
                    this.log.error('setSpeed', err);
                    cb(err);
                }
            );
    };
    this.getSpeed = (cb) => {
        this.log.info("Getting fan speed for", this.device.uid);
        quietcool.getFanStatus(this.ip, this.device.uid)
            .retry(5)
            .subscribe(
                status => {
                    const speeds = { 1: 50, 3: 100 };
                    let currentSpeed = speeds[status.speed];
                    this.log.info("Got speed value", status.speed, currentSpeed);
                    cb(null, currentSpeed);
                },
                err => {
                    this.log.error('getSpeed', err);
                    cb(err);
                }
            );
    };
    this.getOn = (cb) => {
        this.log.info("Getting fan on/off for", this.device.uid);
        quietcool.getFanInfo(this.ip, this.device.uid)
            .subscribe(
                info => {
                    this.log.info("Got on/off", info.status);
                    cb(null, info.status == 1);
                },
                err => {
                    this.log.error('getOn', err);
                    cb(err);
                }
            );
    };
    this.setOn = (on, cb) => {
        this.log.info("Turning fan on/off: ", on, this.device.name, this.device.uid);

        let method = on ? quietcool.turnFanOn : quietcool.turnFanOff;

        method(this.ip, this.device.uid)
            .subscribe(
                info => {
                    this.log.info("Done setting fan on/off", this.device.name);
                    cb(null);
                },
                err => {
                    this.log.error('setOn', err);
                    cb(err);
                }
            );
    };
}

function QuietCool(log, config, api) {
    log.info("Initializing QuietCool Platform");

    this.allFans = [];
    this.log = log;
    this.config = config;

    if (api) {
        this.api = api;
    }

    this.accessories = (cb) => {
        log.info("Querying QuietCool Controller for Fans");
        quietcool.listFansWithInfo(config.ip)
            .map(fan => new QuietCoolFan(log, config.ip, fan, api))
            .subscribe(
                fan => {
                    log.info("Found a fan", fan.device.name);
                    this.allFans.push(fan);
                },
                err => {
                    log.error(err);
                },
                () => {
                    log.info("Done finding all fans");
                    cb(this.allFans);
                });
    };
}

module.exports = (homebridge) => {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Accessory = homebridge.platformAccessory;
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform("quietcool-plugin", "QuietCool", QuietCool);
};

const quietcool = require('quietcool');
const _ = require('lodash');
var Accessory, Service, Characteristic, UUIDGen;

function QuietCoolFan(log, ip, fan, api) {
    this.ip = ip;
    this.api = api;
    this.device = fan;
    this.name = fan.name;
    this.log = log;

    this.getServices = () => {
        const Characteristic = this.api.hap.Characteristic;
        const accessoryInfo = new this.api.hap.Service.AccessoryInformation();

        accessoryInfo
            .setCharacteristic(Characteristic.Name, fan.name)
            .setCharacteristic(Characteristic.Manufacturer, "QuietCool")
            .setCharacteristic(Characteristic.Model, "QuietCool");

        const fanService = new this.api.hap.Service.Fan(fan.name);

        fanService
              .getCharacteristic(Characteristic.On)
              .on('get', this.getOn.bind(this))
              .on('set', this.setOn.bind(this));

        // fanService.getCharacteristic(Characteristic.RotationSpeed)
        //     .setProps({
        //         minValue: 0,
        //         maxValue: 100,
        //         minStep: 50
        //     })
        //     .on('get', this.getSpeed.bind(this))
        //     .on('set', this.setSpeed.bind(this));

        return [accessoryInfo, fanService];

    };


    this.setSpeed = (value, cb) => {
        this.log.info("Setting fan speed for", this.device.uid, value);

        const speeds = { 50: 1, 100: 3 };

        quietcool.setCurrentSpeed(this.ip, this.device.uid, speeds[value] )
            .subscribe(
                status => {
                    cb(null);
                },
                err => {
                    this.log.error(err);
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
                    this.log.error(err);
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
                    cb(null);
                },
                err => {
                    this.log.error(err);
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
        // Save the API object as plugin needs to register new accessory via this object
        this.api = api;

        // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories.
        // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
        // Or start discover new accessories.
        this.api.on('didFinishLaunching', function() {
            log("DidFinishLaunching");
        }.bind(this));
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

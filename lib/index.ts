import * as quietcool from "quietcool";
import * as _ from "lodash";

interface Logger {
  info(msg: string);
  info(msg: string, ...details: any[]);

  error(msg: string);
  error(msg: string, ...details: any[]);
}

interface HomebridgeApi {
  hap: any;
}

class QuietCoolFan {
  api: HomebridgeApi;
  fan: quietcool.FanDetails;
  name: string;
  log: Logger;

  constructor(log: Logger, fan: quietcool.FanDetails, api: HomebridgeApi) {
    this.api = api;
    this.fan = fan;
    this.name = fan.info.name;
    this.log = log;
    this.info("Initialized");
  }

  formatMsg(msg: string) {
    return `[${this.fan.info.name} | ${this.fan.id.uid}] ${msg}`;
  }

  info(msg: string, ...details: any[]) {
    this.log.info(this.formatMsg(msg), details);
  }

  error(msg: string, ...details: any[]) {
    this.log.error(this.formatMsg(msg), details);
  }

  getServices() {
    const Characteristic = this.api.hap.Characteristic;
    const accessoryInfo = new this.api.hap.Service.AccessoryInformation();

    accessoryInfo
      .setCharacteristic(Characteristic.Name, this.fan.info.name)
      .setCharacteristic(Characteristic.Manufacturer, "QuietCool")
      .setCharacteristic(Characteristic.Model, this.fan.info.model);

    const fanService = new this.api.hap.Service.Fan(this.fan.info.name);

    fanService
      .getCharacteristic(Characteristic.On)
      .on("get", this.getOn.bind(this))
      .on("set", this.setOn.bind(this));

    let isMultiSpeed = this.fan.status.sequence === "1";

    if (isMultiSpeed) {
      fanService
        .getCharacteristic(Characteristic.RotationSpeed)
        .setProps({
          minValue: 0,
          maxValue: 100,
          minStep: 50
        })
        .on("get", this.getSpeed.bind(this))
        .on("set", this.setSpeed.bind(this));
    }

    this.info("Done with initialization", { isMultiSpeed });
    return [accessoryInfo, fanService];
  }

  setSpeed(value, cb) {
    this.info("Setting fan speed", value);

    const speeds = { 50: 1, 100: 3 };

    quietcool.setCurrentSpeed(this.fan.id, speeds[value]).subscribe(
      status => {
        this.info("Done setting speed", value);
        cb(null);
      },
      err => {
        this.error("setSpeed", err);
        cb(err);
      }
    );
  }
  getSpeed(cb) {
    this.info("Getting fan speed");

    quietcool.getFanStatus(this.fan.id).subscribe(
      status => {
        const speeds = { 1: 50, 3: 100 };
        let currentSpeed = speeds[status.speed];
        this.info("Got speed value", status.speed, currentSpeed);
        cb(null, currentSpeed);
      },
      err => {
        this.error("getSpeed", err);
        cb(err);
      }
    );
  }
  getOn(cb) {
    this.info("Getting fan power");

    quietcool.getFanInfo(this.fan.id).subscribe(
      info => {
        this.info("Got power", info.status);
        cb(null, info.status == "1");
      },
      err => {
        this.error("getOn", err);
        cb(err);
      }
    );
  }
  setOn(on, cb) {
    this.info("Setting fan power", on);

    quietcool.power(this.fan.id, on).subscribe(
      info => {
        this.info("Done setting fan power", on);
        cb(null);
      },
      err => {
        this.error("setOn", err);
        cb(err);
      }
    );
  }
}

interface Config {
  ip: string;
}

type AccessoriesCallback = (accessories: QuietCoolFan[]) => void;

class QuietCool {
  allFans: QuietCoolFan[];
  log: Logger;
  config: Config;
  api: HomebridgeApi;

  constructor(log: Logger, config: Config, api: HomebridgeApi) {
    log.info("Initializing Platform");
    this.allFans = [];
    this.log = log;
    this.config = config;
    this.api = api;
  }

  accessories(cb: AccessoriesCallback) {
    this.log.info("Querying controller for fans");
    quietcool
      .listFansWithInfo(this.config.ip)
      .map(fan => new QuietCoolFan(this.log, fan, this.api))
      .subscribe(
        fan => {
          this.allFans.push(fan);
        },
        err => {
          this.log.error(err);
        },
        () => {
          this.log.info("Done finding all fans");
          cb(this.allFans);
        }
      );
  }
}

// Have to use "export =" because homebridge expects the function at the root require level
export = homebridge => {
  homebridge.registerPlatform("quietcool-plugin", "QuietCool", QuietCool);
};

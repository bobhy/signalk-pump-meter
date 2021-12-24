const Bacon = require('baconjs');
const SignalKPlugin = require('signalk-plugin-base');
const DeviceHandler = require('./DeviceHandler.js');


class PumpMeterPlugin extends SignalKPlugin {

  constructor(app) {
    super({ app, id: 'signalk-pump-meter', name: 'Pump Meter', description: 'Synthesizes pump runtime and cycle count from another SignalK value that indicates the device is running' });

    this.optObj({ propName: 'devices', title: 'Devices to monitor', isArray: true, itemTitle: 'Device' });
    // the following properties apply to each device
    this.optStr({ propName: 'name', title: 'Pump name', longDescription: "User-assigned name for this device, must be unique.", required: true });
    this.optStr({
      propName: 'skMonitorPath', title: 'SignalK value that indicates pump is on', required: true
      , longDescription: "Expected to be provided by some other source.  Any non-zero value or non-empty string (truthy value) means device is currently on."
      , defaultVal: "electrical.batteries.254.current"
    });
    this.optStr({
      propName: 'skRunStatsPath', title: 'SignalK path under which to report pump run data'
      , longDescription: 'Common SignalK path prefix under which to report pump statistics.  Leave blank to report under device name configured above.'
      , defaultVal: ""
    });
    this.optInt({ propName: 'secReportInterval', title: 'Run data reporting interval (secs)', defaultVal: 30, longDescription: 'Number of seconds between each report of pump run data' });
    this.optInt({ propName: 'secTimeout', title: 'Pump signal timeout (secs)', defaultVal: 300, longDescription: 'Declare the device off if no signal received for this interval.' });
    // end of device properties
    this.optObjEnd();

    this.unsub = [];
    this.handlers = [];
  }


  // Initialization of data streams and properties are done here...
  onPluginStarted() {

    this.pluginStarted = Date.now();

    var heartbeatInterval = 2000;
    this.evtHeartbeat = Bacon.fromPoll(heartbeatInterval, () => { return Date.now() });

    this.handlers = [];

    for (var device of this.options.devices) {
      if (device.name && device.skMonitorPath) {
        this.debug(`Configuring device ${device.name}`);
        if (device.skRunStatsPath === "") {
          device.skRunStatsPath = device.name;
        }
        let handler = new DeviceHandler(this, device);
        this.subscribeVal(this.evtHeartbeat, handler.onHeartbeat, handler);
        this.handlers.push(handler);
      }
    }

    this.setStatus('Started');

  }



  onPluginStopped() {
    for (var handler of this.handlers) {
      handler.stop();
    }
  }


  getHandler(id) {
    var retVal = null;
    for (var handler of this.handlers) {
      if (handler.id === id) {
        retVal = handler;
      }
    }
    return retVal;
  }


  /**
   * This is where RESTul API call responses are defined...
   * @param {object} router An ExpressJS "Router" object
   * @see https://expressjs.com/en/guide/routing.html
   */
  registerWithRouter(router) {

    this.debug("Registering routes...");
    router.get("/api/devices", (req, res) => {
      if (this.running) {
        let jReturnVal = [];
        for (var handler of this.handlers) {
          jReturnVal.push(handler.id);
        }
        this.debug(`api/devices: returning ${JSON.stringify(jReturnVal)}`)
        res.json(jReturnVal);
      }
      else {
        res.status(503).send('Plugin not running');
      }
    });

    router.get("/api/history/:deviceId", (req, res) => {
      if (this.running) {
        var handler = this.getHandler(req.params.deviceId);
        if (handler != null) {
          let jReturnVal = handler.getHistory(req.query.start, req.query.end);
          this.debug(`api/history/${deviceId}: returning ${JSON.stringify(jReturnVal)}`)
          res.json(jReturnVal);
        }
        else {
          res.status(404).send(`Unknown device [${req.params.deviceId}]`);
        }
      }
      else {
        res.status(503).send('Plugin not running');
      }
    });
  }
};


module.exports = function (app) {
  var plugin = new PumpMeterPlugin(app);
  return plugin;
}
const Bacon = require('baconjs');
const SignalKPlugin = require('signalk-plugin-base');
const {DeviceHandler} = require('./DeviceHandler.js');


class PumpMeterPlugin extends SignalKPlugin {

  constructor(app) {
    super({ app, id: 'signalk-pump-meter', name: 'Pump Meter', description: 
    'Synthesizes runtime and cycle count from another SignalK value that indicates the device is running.  Device can be any intermittent motor, not just a pump.' });

    this.optObj({ propName: 'devices', title: 'Devices to monitor', isArray: true, itemTitle: 'Device' });
    // the following properties apply to each device
    this.optStr({ propName: 'name', title: 'Device name', longDescription: "User-assigned name for this device, must be unique.", required: true });
    this.optStr({
      propName: 'skMonitorPath', title: 'SignalK value that indicates device is on', required: true
      , longDescription: "Expected to be provided by some other source.  Any non-zero value or non-empty string (truthy value) means device is currently on."
      , defaultVal: "electrical.batteries.254.current"
    });
    this.optStr({
      propName: 'skRunStatsPath', title: 'SignalK path under which to report device run data'
      , longDescription: 'Common SignalK path prefix under which to report device statistics.  Leave blank to report under device name configured above.'
      , defaultVal: ""
    });
    this.optInt({ propName: 'secReportInterval', title: 'Run data reporting interval (secs)', defaultVal: 30, longDescription: 'Number of seconds between each report of device run data' });
    this.optInt({ propName: 'secTimeout', title: 'Device signal timeout (secs)', defaultVal: 300, longDescription: 'Declare the device off if no signal received for this interval.' });
    this.optNum({ propName: 'noiseMargin', title: 'Noise margin', defaultVal: 0.010, longDescription: 'Range around zero to be considered zero for SkMonitorPath.' });

    this.optInt({ propName: 'secNominalRunTime', title: 'Default normal device run time (secs)', defaultVal: 30, longDescription: 'Expected normal duration of device run.' });
    this.optInt({ propName: 'secNominalOffTime', title: 'Default normal device time between runs (secs)', defaultVal: (24*60*60/2), longDescription: 'Expected normal time between device runs (half a day).' });

    this.optInt({ propName: 'dayAveragingWindow', title: 'Average statistics over this many days.', defaultVal: 7, longDescription: 'Window of time over which statistics are averaged, in days.' });
    this.optInt({ propName: 'historyCapacity', title: 'Number of entries in saved history.', defaultVal: 1000, longDescription: 'Number of entries in remembered history of cycles' });
    this.optInt({ propName: 'secCheckpoint', title: 'History checkpoint interval (sec)', defaultVal: 600, longDescription: 'How frequently to write cycle history to disk.' });
    


    // end of device properties
    this.optObjEnd();

    this.unsub = [];
    this.handlers = [];
    this.heartbeatMs = 2000;    // externally configurable for testability
  }


  // Initialization of data streams and properties are done here...
  onPluginStarted() {

    this.pluginStarted = Date.now();

    this.evtHeartbeat = Bacon.fromPoll(this.heartbeatMs, () => { return Date.now() });

    this.handlers = [];

    for (var device of this.options.devices) {
      if (!device.name || !device.skMonitorPath) {
        this.debug(`Can't configure device '${device.name}' -- name or skMonitorPath missing.`)
      } else {
        if (device.skRunStatsPath === "") {
          device.skRunStatsPath = device.name;
        }
        setImmediate(async () => { // do device handler initialization as async process
          let handler = new DeviceHandler(this, device);  // constructor can't be async
          this.debug(`Configuring device ${device.id}`);  // use canonic form of device name        
          if (handler.start) {
            await handler.start();    // do whatever long-running async the handler has.
          };
          this.subscribeVal(this.evtHeartbeat, handler.onHeartbeat, handler);
          this.handlers.push(handler);
        });
      }
    }

    this.setStatus('Started');  // with async init, check device status, not plugin status.

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
          // API returns error as {status:nnn, msg:"string"}, or normal as object with no 'status' key
          let jReturnVal = handler.getHistory(req.query.start, req.query.end);
          this.debug(`api/history/${deviceId}: returning ${JSON.stringify(jReturnVal)}`)
          if ('status' in jReturnVal) {
            res.status(jReturn.status).send(('msg' in jReturnVal) ? jReturnVal.msg : "Unknown error");
          }
          else {
            res.json(jReturnVal);
          };
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
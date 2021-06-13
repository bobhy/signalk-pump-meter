const Bacon = require('baconjs');
const SignalKPlugin = require('signalk-plugin-base');
const DeviceHandler = require('./DeviceHandler.js');


class PumpMeterPlugin extends SignalKPlugin {

  constructor(app) {
    super({app, id: 'signalk-pump-meter', name: 'Pump meter', description: 'Synthesizes pump meter runtime and cycle count when other SignalK values indicate the pump is running'});

    this.optObj({propName: 'devices', title: 'Devices for which to synthesize pump run meters', isArray: true, itemTitle: 'Device'});
    this.optStr({propName: 'name', title: 'Device name', required: true });    
    this.optStr({propName: 'skMonitorPath', title: 'SignalK value that indicates pump is on', required: true  });
    this.optInt({propName: 'secTimeout', title: 'SignalK timeout (secs)', defaultVal: 60, longDescription: 'The number of seconds of no SignalK data before pump assumed off', required: true});
    this.optInt({propName: 'secResume', title: 'SignalK resume last run (secs)', defaultVal: 300, longDescription: 'Resume tracking previous run if ON detected again within this many seconds', required: true});
    this.optStr({propName: 'skPumpsPath', title: 'SignalK path under which to emit pump run data', longDescription: 'Leave blank to disable'});
    this.optStr({propName: 'skStatusPath', title: 'SignalK path to output pump status', longDescription: 'Leave blank to disable'});
    this.optNum({propName: 'offsetHours', title: 'Hours already on pump', defaultVal: 0 });
    this.optInt({propName: 'secReportInterval', title: 'Reporting interval (secs)', defaultVal: 30, longDescription: 'Number of seconds between each report of pump run data', required: true});
    this.optObjEnd();

    this.unsub = [];
    this.handlers = [];
  }


  // Initialization of data streams and properties are done here...
  onPluginStarted() {
          
     this.pluginStarted = this.getTime();
     
     var heartbeatInterval = 2000;
     this.evtHeartbeat = Bacon.fromPoll(heartbeatInterval, () => { return this.getTime() });

     this.handlers = [];

     for (var device of this.options.devices) {
        if (device.name && device.skMonitorPath) {
          this.debug(`Configuring device ${device.name}`);
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
          this.debug(`Returning JSON value ${JSON.stringify(jReturnVal)}`)
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
              this.debug(`Returning JSON value ${JSON.stringify(jReturnVal)}`)
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
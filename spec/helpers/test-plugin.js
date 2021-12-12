// helpers for plugins testing.
//fixme revisit to generate a good test history
const Plugin = require('../../index.js');
const MockApp = require('./mocks.js').MockApp;
const tmp = require('tmp');
tmp.setGracefulCleanup();   //todo how to make the tmp files disappear??

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

/**
 * Instantiate plugin so tests can feed results and capture responses
 *
 * @class TestPlugin
 */
class TestPlugin {
    pluginDeviceName = 'testPluginName';
    plugin;
    dataPath;
    options;
    app;
    skMonitorPath = 'monitor.input';    // tbd -- does plugin insist on valid SK paths?
    skRunStatsPath = 'results.path.1';
    responses = [];

    constructor() {
        this.dataPath = tmp.dirSync().name;       // create temp directory and return name
        this.app = new MockApp(this.dataPath);
        this.debug = this.app.debug;            //puzzle why do I have to hoist this when I didn't in sim-pump-meter?
        this.plugin = new Plugin(this.app);
        this.options = {
            devices: [
                {
                    name: this.pluginDeviceName,
                    skMonitorPath: this.skMonitorPath,
                    skRunStatsPath: this.skRunStatsPath,
                    secTimeout: 10,
                    offsetHours: 0,
                    secReportInterval: 3
                }
            ]
        };

        this.responses = [];
        this.app.handleMessage = (id, delta) => {   // must use closure here to get the right 'this'
            this.responses.push(delta);  // hotwire handleMessage
        };
        this.plugin.start(this.options);
    }


    /**
     * feed a list of values to plugin, return any responses
     *
     * @param {*} vals -- list of values to feed the plugin, one at a time
     * @returns {[{path:, value:}]} -- (possibly empty) list of objects.
     * @memberof TestPlugin
     */
    sendTo(vals) {
        if (typeof (vals) != 'object') {
            vals = [vals]
        };

        this.responses = [];    // forget about any previous responses...

        vals.forEach(val => {
            this.app.streambundle.pushMockValue(this.skMonitorPath, { value: val });
        });



        return this.responses;
    }

    async getFrom() {

        await delay(6000);  // must wait a response period

        return this.responses;
    }

    /**
     * Retrieve (entire) plugin history
     *
     * @memberof TestPlugin
     */
    getHistory() {
        var history = this.plugin.getHandler(this.pluginDeviceName).getHistory();
        if (!!history) {
            history.forEach(h => {
                h.historyDate = new Date(h.historyDate);
                h.sessionStartDate = new Date(h.sessionStartDate);
                h.lastRunDate = new Date(h.lastRunDate);
                h.lastSampleDate = new Date(h.lastSampleDate);
            });
        }
        //console.debug(JSON.stringify(history, null, 2));
        return history;
    }

    stop() {
        this.plugin.stop();
    }
}

module.exports = {
    TestPlugin
};

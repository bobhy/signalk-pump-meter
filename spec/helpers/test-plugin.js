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
        //this.debug = this.app.debug;            //puzzle why do I have to hoist this when I didn't in sim-pump-meter?
        this.plugin = new Plugin(this.app);
        this.options = {
            devices: [
                {
                    name: this.pluginDeviceName,
                    skMonitorPath: this.skMonitorPath,
                    skRunStatsPath: this.skRunStatsPath,
                    secTimeout: 10,
                    offsetHours: 0,
                    secReportInterval: 2
                }
            ]
        };

        this.responses = [];
        this.app.handleMessage = (id, delta) => {   // must use closure here to get the right 'this'
            this.responses.push(delta);  // hotwire handleMessage
        };
        this.plugin.start(this.options);    //fixme this overrides the options defined in the UOT plugin!
                                            // but apparently in signalk-server, options are cons'ed sometime after constructor is run.
    }


    /**
     * feed a list of values to plugin, return any responses
     *
     * @param {*} vals -- list of values to feed the plugin, one at a time
     * @memberof TestPlugin
     */
    sendTo(vals) {
        if (typeof (vals) != 'object') {
            vals = [vals]
        };

        vals.forEach(val => {
            this.app.streambundle.pushMockValue(this.skMonitorPath, { value: val });
        });
    }

    async getFrom() {

        const startWait = Date.now();
        while (this.responses.length == 0) {
            //bugbug doesn't fail the test case or print anything unless the throw below is also executed.
            //bugbug expect(Date.now() - startWait).toBeLessThan(this.options.devices[0].secReportInterval*2*1000);
            if ((Date.now() - startWait) >= this.options.devices[0].secReportInterval*3*1000) {
                throw 'timed out waiting for a response from plugin'
            }
            //this.app.debug('... waiting for a response from plugin...')
            await delay(500);  // must wait a response period
        };

        expect(this.responses.length).toBeGreaterThan(0);
        expect(this.responses[0].updates).toBeDefined();
        expect(this.responses[0].updates[0].values).toBeDefined();

        var rv = [];

        this.responses.forEach(r => {
            r.updates.forEach(u => {
                let vv = {};
                u.values.forEach(pv => {
                    const lastPos = pv.path.lastIndexOf('.');
                    expect(pv.path.substring(0, lastPos)).toEqual(this.options.devices[0].skRunStatsPath);
                    vv[pv.path.substring(lastPos + 1)] = pv.value
                });
                rv.push(vv);
            });
        })

        this.responses = [];    // make room immediately to start collecting a new asynchronous response...

        return new RevChron(rv);
    }

    /**
     * Retrieve (entire) plugin history
     *
     * @memberof TestPlugin
     */
    getHistory() {
        var history = this.plugin.getHandler(this.pluginDeviceName).getHistory();   //bugbug -- this.pluginDeviceName same for all devices!
        if (!!history) {
            history.forEach(h => {
                h.historyDate = new Date(h.historyDate);
                h.sessionStartDate = new Date(h.sessionStartDate);
                h.lastRunDate = new Date(h.lastRunDate);
                h.lastSampleDate = new Date(h.lastSampleDate);
            });
        }
        //this.app.debug(JSON.stringify(history, null, 2));
        return history;
    }

    stop() {
        this.plugin.stop();
    }
}

/**
 * container for accessing array of results in reverse chonological order
 *
 * @class RevChron
 */
class RevChron {
    constructor(arr_of_obj) {
        this.data = arr_of_obj;
        this.data_len = arr_of_obj.length;

    }
    /**
     * get number of elements
     *
     * @readonly
     * @memberof RevChron
     */
    get length() { return this.data.length; }
    /**
     * get newest element
     *
     * @readonly
     * @memberof RevChron
     */
    get last() { return this.data[this.data_len - 1] }
    /**
     * get previous element
     *
     * @param {number} n -- reverse chronological index of element to fetch: 1 is 2nd newest, 2 is 3rd newest, etc.
     * @return {object}
     * @memberof RevChron
     */
    prev(n) { return this.data[this.data_len - 1 - n]; }
}

module.exports = {
    TestPlugin, RevChron
};

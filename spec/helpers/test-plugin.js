// helpers for plugins testing.
//fixme revisit to generate a good test history
const Plugin = require('../../index.js');
const MockApp = require('./mocks.js').MockApp;
const tmp = require('tmp');
tmp.setGracefulCleanup();   //todo how to make the tmp files disappear??
//const jasmine = require('jasmine');


//const mockClock = jasmine.clock().install();

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

/**
 * Turn duration measured in seconds back into a system time, based on a calibrating moment.
 *
 * The calculation is approximate, since the duration was rounded to the nearest second.
 *
 * @param {number} momentMs -- the moment against which the duration was calculated.
 * @param {number} durationSec - the measured duration.  This is usually rounded to nearest whole second.
 * @return {number} a unix system time (e.g from @see Date.now())
 */
function toAbsTime(momentMs, durationSec) {
    return momentMs - 1000*durationSec;
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
    heartbeatMs = 300;      // .toBeCloseTo() precision hacked till tests work for heartbeat [300, 2000].

    constructor() {
        this.dataPath = tmp.dirSync().name;       // create temp directory and return name
        this.app = new MockApp(this.dataPath);
        this.plugin = new Plugin(this.app);
        this.plugin.heartbeatMs = this.heartbeatMs;     // faster heartbeat to generate responses faster for faster testing!
        this.options = {
            devices: [
                {
                    name: this.pluginDeviceName,
                    skMonitorPath: this.skMonitorPath,
                    skRunStatsPath: this.skRunStatsPath,
                    secTimeout: 20,
                    offsetHours: 0,
                    secReportInterval: (this.heartbeatMs / 1000.0) //2
                }
            ]
        };

        this.responses = [];
        this.app.handleMessage = (id, delta) => {   // must use closure here to get the right 'this'
            this.responses.push(delta);  // hotwire handleMessage
            if (this.responses.length > 2) {
                var t = 1;
            }
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

    /**
     * retrieve SignalK deltas from UOT plugin., reformat results for easier testing (after validating delta itself).
     * Note that the plugin may have queued multiple deltas, this call clears them all.
     *
     * @return {[{keyName: value}]} -- array of deltas, each item is an object of key, value pairs.
     *                              key is leaf name of the SK path, e.g electrical.batteries.1.foo becomes just foo.
     *                              value is unmodified.
     * @memberof TestPlugin
     */
    async getFrom() {

        const startWait = Date.now();
        while (this.responses.length == 0) {
            //bugbug doesn't fail the test case or print anything unless the throw below is also executed.
            //bugbug expect(Date.now() - startWait).toBeLessThan(this.options.devices[0].secReportInterval*2*1000);
            if ((Date.now() - startWait) >= this.options.devices[0].secReportInterval*3*1000) {
                throw 'timed out waiting for a response from plugin'
            }
            //this.app.debug('... waiting for a response from plugin...')
            //this.mockClock.tick(499);
            await delay(this.heartbeatMs / 3);  // must wait a response period
        };

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
    getHistory(start, end) {
        var history = this.plugin.getHandler(this.pluginDeviceName).getHistory(start, end);   //bugbug -- this.pluginDeviceName same for all devices!
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
    TestPlugin, RevChron, delay, toAbsTime
};

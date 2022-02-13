// helpers for plugins testing.
const Plugin = require('../../index.js');
const MockApp = require('./mocks.js').MockApp;
const tmp = require('tmp');
tmp.setGracefulCleanup();   //todo how to make the tmp files disappear??
//const jasmine = require('jasmine');
const assert = require('assert').strict;
const _ = require('lodash');

const TIME_PREC = 0.5; // when comparing times, match to within 2 or 3 hundredths.  Jasmine *rounds* each value before comparing??!  takes fractional exponent?
const TIME_PREC_MS = -0.5   // likewise when comparing millisecond values, match within 2-3 tens of milliseconds.

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

// Parallel implementation of time-rounding function to_sec() used by device handler
function test_toSec(msValue) {
    return (Math.round(msValue) / 1000.0);
}


/**
 * Instantiate plugin so tests can feed results and capture responses
 *
 * Caveat: only supports a single device.
 *
 * @class TestPlugin
 */
class TestPlugin {
    deviceName = 'testPluginName';
    monPath = 'monitor.input';    // tbd -- does plugin insist on valid SK paths?
    rsPath = 'results.path.1';
    heartbeatMs = 300;      // .toBeCloseTo() precision hacked till tests work for heartbeat [300, 2000].
    
    constructor() {
        const deviceId = _.camelCase(this.deviceName);      // there can be only one (for now).
        this.dataPath = tmp.dirSync().name;       // create temp directory and return name
        this.app = new MockApp(this.dataPath);
        this.plugin = new Plugin(this.app);
        this.plugin.heartbeatMs = this.heartbeatMs;     // faster heartbeat to generate responses faster for faster testing!
        this.options = {
            devices: [
                {
                    name: this.deviceName,
                    id: deviceId,
                    skMonitorPath: this.monPath,
                    skRunStatsPath: this.rsPath,
                    secTimeout: 20,
                    offsetHours: 0,
                    secReportInterval: (this.heartbeatMs / 1000.0),
                    noiseMargin: 0.01,               //fixme need to duplicate any options defined in UOT plugin here.
                    secNominalRunTIme: 30,
                    secNominalOffTime: 24 * 60 * 60 / 2,
                    dayAveragingWindow: 7,
                }
            ]
        };

        this.deviceConfig = this.options.devices[0];    // plugin.getHandler not initialized yet.

        this.deltaCount = 0;
        this.responses = { values: {}, meta:{}};        // note, not [path:, value:], but {path: value}!
        this.lastDeltaReturned = Date.now();

        this.app.handleMessage = (id, delta) => {   // hotwire handleMessage
            expect(delta.updates.length).toBe(1);
            const duzed = delta.updates[0]; // we only deal with 1 update per delta.
            expect(duzed.source.label).toBe(this.deviceConfig.id);
            
            const devicePathPrefix = this.deviceConfig.skRunStatsPath;
            this.deltaCount += 1;

            for (const type of ['values', 'meta']) {
                if (type in duzed) {
                    for (const v of duzed[type]) {
                        expect(v.path.startsWith(devicePathPrefix)).toBeTrue();
                        this.responses[type][v.path.slice(1 + devicePathPrefix.length)] = v.value;
                        var t = 1;
                    }
                }
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
            this.app.streambundle.pushMockValue(this.deviceConfig.skMonitorPath, { value: val });
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

        await delay(1000 * this.deviceConfig.secReportInterval);    //experiment wait till next delta emitted.

        const startWait = Date.now();
        const startDeltaCount = this.deltaCount;

        while (this.deltaCount <= startDeltaCount) {
            //bugbug doesn't fail the test case or print anything unless the throw below is also executed.
            if ((Date.now() - startWait) >= Math.max(1000, this.deviceConfig.secReportInterval * 3 * 1000)) {
                throw 'timed out waiting for a response from plugin'
            }
            //this.app.debug('... waiting for a response from plugin...')
            await delay(this.heartbeatMs);  // must wait a response period
        };

        return this.responses;
    }
    /**
     * shim to invoke @see DeviceHandler.getHistory().
     *
     * @param {*} start
     * @param {*} end
     * @return {*} 
     * @memberof TestPlugin
     */
    getHistory(start, end) {
        var history = this.plugin.getHandler(this.deviceName).getHistory(start, end);   //bugbug -- this.pluginDeviceName same for all devices!
        //this.app.debug(JSON.stringify(history, null, 2));
        return history;
    }

    stop() {
        this.plugin.stop();
    }
}


/**
 * factory for TestPlugin, so we can do the patching after handlers are initialized.
 *
 * @return {TestPlugin}
 */
async function newTestPlugin() {
    const tp = new TestPlugin();
    await delay(100);       // give plugin time to initialize deviceHandler
    // do fixups here, if any.....
    return tp;
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
        assert.equal(this.data_len, 1, "No stacked responses?");
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
    TestPlugin, delay, newTestPlugin, test_toSec, TIME_PREC, TIME_PREC_MS
};

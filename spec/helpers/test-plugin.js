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
    heartbeatMs = 50;      // .toBeCloseTo() precision hacked till tests work for heartbeat [300, 2000].

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
                    secReportInterval: 2 * (this.heartbeatMs / 1000.0), // .getFrom protocol needs > 1 heartbeat.
                    noiseMargin: 0.01,               //fixme need to duplicate any options defined in UOT plugin here.
                    secNominalRunTIme: 30,
                    secNominalOffTime: 24 * 60 * 60 / 2,
                    dayAveragingWindow: 7,
                }
            ]
        };

        this.deviceConfig = this.options.devices[0];    // plugin.getHandler not initialized yet.

        this.sendTo_seqNum = 0;     // incremented when another sample is sent into plugin
        this.delta_seqNum = 0;      // incremented when plugin emits another delta (independent of samples)
        this.last_sendTo_gotten = 0;    // updated when getFrom() returns a delta to test, so test can choose to wait for a delta emitted after the sample was processed.
        this.last_delta_gotten = 0;     // updated when getFrom() returns a delta, so it never returns the same delta twice

        this.responses = [] // of { values: {}, meta: {} };        // note, not [path:, value:], but {path: value}!

        this.app.handleMessage = (id, delta) => {   // hotwire handleMessage
            const duzed = delta.updates[0]; // we only deal with 1 update per delta.
            expect(delta.updates.length).toBe(1);
            expect(duzed.source.label).toBe(this.deviceConfig.id);

            this.delta_seqNum += 1;     // so  the value after sending this delta matches what's in that delta
            // this would be a timing hazard in a fully multithreaded application.

            expect(!('values' in duzed) || !('meta' in duzed)).toBeTrue();

            var curResp = {
                timestamp: duzed.timestamp,
                delta_seqNum: this.delta_seqNum,
                sendTo_seqNum: this.sendTo_seqNum,
                values: {}, meta: {}
            }

            const devicePathPrefix = this.deviceConfig.skRunStatsPath;

            // loop through .values and .meta (delta should have only 1),
            // simplifying the key path and turning {path:, value:} into {path: value} for easier testing
            // (sounds like a glib rationalization that will come back to haunt me)
            for (const type of ['values', 'meta']) {
                if (type in duzed) {
                    for (const v of duzed[type]) {
                        expect(v.path.startsWith(devicePathPrefix)).toBeTrue();
                        expect(curResp[type][v.path.slice(1 + devicePathPrefix.length)]).toBeUndefined();
                        curResp[type][v.path.slice(1 + devicePathPrefix.length)] = v.value;
                        if (type == 'values' && v.path.endsWith('status')) {
                            var t = 1;
                        }
                    }
                }
            }

            // strip empty meta or values property -- unnecessarily hard!
            if (Object.keys(curResp.values).length == 0) { delete curResp.values; };
            if (Object.keys(curResp.meta).length == 0) { delete curResp.meta; };

            this.responses.push(curResp);
            expect(this.responses.length).toBe(this.delta_seqNum);
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

        this.sendTo_seqNum += 1;

        vals.forEach(val => {
            this.app.streambundle.pushMockValue(this.deviceConfig.skMonitorPath, { value: val });
        });
    }

    /**
     * retrieve SignalK deltas from UOT plugin., reformat results for easier testing (after validating delta itself).
     * Note that the plugin may have queued multiple deltas, this call clears them all.
     *
     * @param {number} desiredType <0 to fetch only .meta, 0 to fetch any type, >0 to fetch only .values
     * @param {boolean} noWaitForNewSample True to return a delta without waiting for a new input sample.
     * Note that getFrom() *always* waits for a new delta to be emitted, whether it has new values or not.
     * @return {[{keyName: value}]} -- array of deltas, each item is an object of key, value pairs.
     *                              key is leaf name of the SK path, e.g electrical.batteries.1.foo becomes just foo.
     *                              value is unmodified.
     * @memberof TestPlugin
     */
    async getAnyFrom(desiredType, noWaitForNewSample) {

        const startWait = new Date();

        assert(typeof desiredType == 'number', `getAnyFrom(): desiredType must be numeric`);
        var retVal = undefined;

        while (true) {
            if (this.responses.length - 1 > this.last_delta_gotten) {   // unseen message
                this.last_delta_gotten += 1;
                retVal = this.responses[this.last_delta_gotten];
                if ((
                    (desiredType == 0)
                    || (desiredType < 0 && 'meta' in retVal)
                    || (desiredType > 0 && 'values' in retVal)
                    )
                    && (noWaitForNewSample || (retVal.sendTo_seqNum > this.last_sendTo_gotten))
                ) {
                    this.last_sendTo_gotten = retVal.sendTo_seqNum;
                    return retVal;
                }
            } else {        // no messages in queue
                if (((new Date()) - startWait) >= 1000 * (Math.max(1, this.deviceConfig.secReportInterval * 3))) {
                    throw new Error('timed out waiting for a response from plugin');
                }
                //this.app.debug('... waiting for a response from plugin...')
                await delay(this.heartbeatMs);  // must wait a response period

            }
        }
    }

    async getFrom(noWaitForNewSample) {
        return await this.getAnyFrom(1, noWaitForNewSample);
    }
    async getMetaFrom(noWaitForNewSample) {
        return await this.getAnyFrom(-1, noWaitForNewSample);
    }

    async lookFor(type, key) {
        while (this.responses.length > 0) {
            //if matches and key, return it 
        }
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
        var history = this.plugin.getHandler(this.deviceName).getHistory(start, end);
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

module.exports = {
    TestPlugin, delay, newTestPlugin, test_toSec, TIME_PREC, TIME_PREC_MS
};

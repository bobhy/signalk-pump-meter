// helpers for plugins testing.
const Plugin = require('../../index.js');
const MockApp = require('./mocks.js').MockApp;
const tmp = require('tmp');
tmp.setGracefulCleanup();   //todo how to make the tmp files disappear??
//const jasmine = require('jasmine');
const assert = require('assert').strict;
const _ = require('lodash');

const TIME_PREC = 0.5; // when comparing times, match to within 2 or 3 hundredths.  Jasmine *rounds* each value before comparing??!  takes fractional exponent?
const TIME_PREC_MS = -0.5;   // likewise when comparing millisecond values, match within 2-3 tens of milliseconds.

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
        this.reportMs = 2 * this.heartbeatMs;           // faster reporting interval, too.  Tests depend on this for allowable timing slop.
        this.options = {
            devices: [
                {
                    name: this.deviceName,
                    id: deviceId,
                    skMonitorPath: this.monPath,
                    skRunStatsPath: this.rsPath,
                    historyCapacity: 10,
                    secTimeout: 20,
                    offsetHours: 0,
                    secReportInterval: this.reportMs / 1000.0, // .getFrom protocol needs > 1 heartbeat.
                    noiseMargin: 0.01,               //fixme need to duplicate any options defined in UOT plugin here.
                    secNominalRunTIme: 30,
                    secNominalOffTime: 24 * 60 * 60 / 2,
                    dayAveragingWindow: 7,
                    secCheckpoint: 1000, // sec
                }
            ]
        };


        this.deviceConfig = this.options.devices[0];    // plugin.getHandler not initialized yet.

        this.sendTo_seqNum = 0;     // incremented when another sample is sent into plugin
        this.delta_seqNum = 0;      // incremented when plugin emits another delta (independent of samples)
        this.last_sendTo_gotten = 0;    // updated when getFrom() returns a delta to test, so test can choose to wait for a delta emitted after the sample was processed.
        this.last_delta_gotten = 0;     // updated when getFrom() returns a delta, so it never returns the same delta twice

        this.responsesLog = []  // historical log -- all deltas

        // save the last message of each kind for tests
        //  make this: 0 - delta, 1 - full meta, 2 - incremental meta

        this.responses = [undefined, undefined, undefined] // of { values: {}, meta: {} };        // note, not [path:, value:], but {path: value}!

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
            }

            const devicePathPrefix = this.deviceConfig.skRunStatsPath;

            // loop through .values and .meta (delta should have only 1),
            // simplifying the key path and turning {path:, value:} into {path: value} for easier testing
            // (sounds like a glib rationalization that will come back to haunt me)
            for (const type of ['values', 'meta']) {
                if (type in duzed) {
                    curResp[type] = {};
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

            if ('values' in curResp) {
                this.responses[0] = curResp;
            } else if ('meta' in curResp && Object.keys(curResp.meta).length <= 3) {
                this.responses[1] = curResp;
            } else {
                this.responses[2] = curResp
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

        this.sendTo_seqNum += 1;

        vals.forEach(val => {
            this.app.streambundle.pushMockValue(this.deviceConfig.skMonitorPath, { value: val });
        });
    }

    /**
     * retrieve SignalK delta from UOT plugin.
     * 3 independent queues: .values, (incremental).meta and (full) .meta.
     * This call returns the *newest* of the selected queue, ignores the older ones (in that queue).
     * Only returns the element once, waits for UOT plugin to generate another, if none currently available.
     * Can throw timeout error if it waits "too" long.
     *
     * @param {number} desiredType (matches index in this.responses), 0 for .value, 1 for (incremental) .meta, 2 for full .meta
     * @param {boolean} noWaitForNewSample True to return a delta without waiting for a new input sample.
     * @return {{timestamp, sendTo_seqNum, values or meta}} -- in values or meta array of objects, {path: <full path>, value:<value>}
     *                                                          has been simplified to: {<leaf key name>: <value>}.
     *                              value is unmodified.
     * @memberof TestPlugin
     */
    async _getAnyFrom(desiredType, noWaitForNewSample) {

        const startWait = new Date();

        assert(typeof desiredType == 'number' && desiredType >= 0 && desiredType <= 2, `getAnyFrom(): desiredType must be numeric [0,2]`);

        var retVal = undefined;

        while (true) {
            retVal = this.responses[desiredType];
            this.responses[desiredType] = undefined;    // only process this delta once
            if ((retVal != undefined)
                && (noWaitForNewSample || (retVal.sendTo_seqNum > this.last_sendTo_gotten))) {
                if (retVal == undefined) {
                    var t = 1;
                }
                this.last_sendTo_gotten = retVal.sendTo_seqNum;
                return retVal;
            }
            // no message of appropriate type already queued.
            if (((new Date()) - startWait) >= 1000 * (Math.max(1, this.deviceConfig.secReportInterval * 3))) {
                throw new Error('timed out waiting for a response from plugin');
            }
            //this.app.debug('... waiting for a response from plugin...')
            await delay(this.heartbeatMs);  // must wait a response period
        }
        var t1 = 1;

    }

    async getFrom(noWaitForNewSample) {
        return await this._getAnyFrom(0, noWaitForNewSample);
    }
    async getMetaFrom(noWaitForNewSample) {
        return await this._getAnyFrom(1, noWaitForNewSample);
    }
    async getFullMetaFrom(noWaitForNewSample) {
        return await this._getAnyFrom(2, noWaitForNewSample);
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
    tp.deviceHandler = tp.plugin.getHandler(tp.deviceName);  // pick up singleton device handleer after it's valid to look it up.
    tp.addCycles = async (numCycles) => {
        for (var i = 0; i < numCycles; i++) {
            tp.sendTo(i + 1);
            var d = await tp.getFrom();
            tp.sendTo(0);
            d = await tp.getFrom();
        }
    };



    return tp;
}


/*-------------- */

/**
 * Run testing scenario
 * 
 * Process is:
 * 1. instantiate plugin
 * 1. feed it values from @see primer
 * 1. loop the following @see numIterations times
 * 1. execute closure @see compare_with_prev() (which is assumed to contain interesting expectations)
 * 
 *
 * @param {*} primer
 * @param {*} numIterations
 * @param {*} compare_with_prev
 */
async function runScenario(primer, numIterations, iterValues, compare_with_prev) {

    const iterValArr = (typeof itervalues) == 'number' ? [iterValues] : iterValues;
    const tp = await newTestPlugin();

    for (const v of primer) {
        tp.sendTo(v);
        await delay(1); // anti-fire-hose.
    };

    var prev_rsp = await tp.getFrom();
    var prev_time = new Date();
    var feed_forward = undefined;

    for (var iterNum = 0; iterNum < numIterations; iterNum++) {
        tp.sendTo(iterValArr[iterNum % iterValArr.length]);
        const cur_rsp = await tp.getFrom();
        const cur_time = new Date();

        feed_forward = await compare_with_prev(iterNum, prev_time, prev_rsp, cur_time, cur_rsp, feed_forward);
    };

    return feed_forward;

}

module.exports = {
    runScenario, TestPlugin, delay, newTestPlugin, test_toSec, TIME_PREC, TIME_PREC_MS
}

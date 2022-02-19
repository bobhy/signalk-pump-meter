const { SkMeta, SkValue } = require('./SkValue');
const CircularBuffer = require('circular-buffer');
const JSZip = require('jszip');
const _ = require('lodash');
const assert = require('assert').strict;
const Data = require('dataclass').Data;


// pump run statistics logged and reported periodically


/**
 * Convert internal time or time difference from milliseconds to SK units (seconds)
 *
 * @param {*} msValue Timestamp (or time difference) in internal units, milliseconds (since linux epoch).
 * @return {number}  Same value in SK-(== SI standard) time units (seconds). Value has 3 decimal places (milliseconds) for testability with sub-second heartbeat.
 */
function dateToSec(msValue) {
    return msValue / 1000.0     //todo round to 3 decimal places (ms)
}

/**
 * timestamp string of arbitrary time
 *
 * @param {Date} moment
 * @return {string} ISO format date/time stamp: yyyy-mm-ddThh:mm:ss.mmmZ
 */
function timestamp(moment) {
    return moment.toISOString();
}
/**
 * Enum for possible states of device: STOPPED, RUNNING, OFFLINE (means device hasn't reported any status in "too" long).
 *
 * inspired by https://2ality.com/2020/01/enum-pattern.html
 * 
 * @class DeviceStatus
 */
class DeviceStatus {
    static OFFLINE = new DeviceStatus("OFFLINE");
    static STOPPED = new DeviceStatus("STOPPED");
    static RUNNING = new DeviceStatus("RUNNING");

    constructor(label) {
        return this.label = label;
    }

    toString() {
        return this.label;
    }
}

/** @type {[string]} Array of all available device status values
 * Enums in other languages make this easier to get! 
 * 
 */
var DeviceStatus_all = [];
Object.keys(DeviceStatus).forEach(f => DeviceStatus_all.push(f))
DeviceStatus_all = Object.freeze(DeviceStatus_all); // whew!



/**
 * Device run time statistics
 * Since samples are collected (much?) more frequently than values are reported out, internal values optimized for efficient recording.
 * The reporting out {@link reportValues} calculates user-friendly statistics.
 *
 * @class DeviceReadings
 */
class DeviceReadings {

    /**
     * Creates an instance of DeviceReadings.
     *
     * @param {object} config Plugin config values.  Note these can change dynamically.
     * @memberof DeviceReadings
     */
    constructor(config) {

        this.config = config;

        this.status = new SkValue('status', DeviceStatus.OFFLINE, {
            displayName: "Current status", enum: DeviceStatus_all,
            description: "Current status of device.  OFFLINE means no status report in 'too' long."
        },
            (thatVal) => { return thatVal.toString() }
        );

        // statistics accumulated from a resettable starting point in time

        this.since = new SkValue('since',
            new Date(),
            {
                displayName: "Statistics Start", units: "timestamp",
                description: "Cycles and runtime accumulated since this moment"
            }
        );

        this.sinceCycles = new SkValue('sinceCycles', 0,
            {
                displayName: "Run Cycles",
                description: "On-off duty cycles since statistics start"
            }
        );

        this.sinceRunTime = new SkValue('sinceRunTime', 0,
            {
                displayName: "Run Time", units: "s"
                , description: "Cumulative run time since statistics start"
            },
            (thatVal) => { return dateToSec(thatVal) }
        );

        // statistics based on last completed cycle

        this.lastRunTime = new SkValue('lastRunTime', 0,
            {
                displayName: "Last Run Time", units: "s", displayScale: [0, 150]
                , description: "Runtime of last completed cycle"
                , zones: [
                    { lower: undefined, upper: 5, state: "alarm", message: "Run Time Alarm Low" },
                    { lower: 5, upper: 10, state: "warn", message: "Run Time Warning Low" },
                    { lower: 10, upper: 15, state: "alert", message: "Run Time Low" },
                    { lower: 20, upper: 27, state: "normal", message: "" },
                    { lower: 27, upper: 32, state: "nominal", message: "" },
                    { lower: 32, upper: 35, state: "normal", message: "" },
                    { lower: 35, upper: 40, state: "alert", message: "Run Time High" },
                    { lower: 40, upper: 45, state: "warn", message: "Run Time Warning High" },
                    { lower: 45, upper: undefined, state: "alarm", message: "Run Time Alarm High" },
                ]
            },
            (thatVal) => { return dateToSec(thatVal) }
        );
        const DAY_SEC = 24 * 60 * 60
        this.lastOffTime = new SkValue('lastOffTime', 0, {
            displayName: "Last Off Time", units: "s", displayScale: [0, 8 * DAY_SEC]
            , description: "Time pump has been off since last completed cycle"
            , zones: [
                { lower: undefined, upper: 0.33 * DAY_SEC, state: "alarm", message: "Time Between Cycles Alarm Low" },
                { lower: 0.33 * DAY_SEC, upper: 0.4 * DAY_SEC, state: "warn", message: "Time Between Cycles Warning Low" },
                { lower: 0.4 * DAY_SEC, upper: 0.5 * DAY_SEC, state: "alert", message: "Time Between Cycles Low" },
                { lower: 0.5 * DAY_SEC, upper: 1 * DAY_SEC, state: "normal", message: "" },
                { lower: 1 * DAY_SEC, upper: 1 * DAY_SEC, state: "nominal", message: "" },
                { lower: 1 * DAY_SEC, upper: 2 * DAY_SEC, state: "normal", message: "" },
                { lower: 2 * DAY_SEC, upper: 2.5 * DAY_SEC, state: "alert", message: "Time Between Cycles High" },
                { lower: 2.5 * DAY_SEC, upper: 4 * DAY_SEC, state: "warn", message: "Time Between Cycles Warning High" },
                { lower: 7 * DAY_SEC, upper: undefined, state: "alarm", message: "Time Between Cycles Alarm High" },
            ]
        });

        /* todo -- update meta zones to reflect long-term trends
        this.AvgRunTime = new SkValue('avgLastRunTime', 0, {
            displayName: "Average Run Time per cycle", units: "s", displayScale: [0, 150]
            , description: "Average runtime (see dayAveragingWindow)"
        });

        this.avgOffTime = new SkValue('avgOffTime', 0, {
            displayName: "Avg Off Time", units: "s", displayScale: [0, 150]
            , description: "Average time pump has been off between cycles (see dayAveragingWindow)"
        });
        */

        // initialize other working variables

        this.cycleStartDate = new Date();   // beginning of cycle: OFF to ON
        this.cycleWork = 0;

        this.cycleEndDate = new Date();     // end of cycle: ON to OFF

        this.cycles = new CircularBuffer(1000); // history of completed cycles: {start: <date/time>, run: <sec>})
        this.cycles.push({ date: (new Date()), runSec: 0 });  // dummy first completed cycle

        //todo: establish checkpoint schedule, save live data t ofile every N sec.
    }

    /**
     * Account for a new sample observation
     * If going from OFF to ON, start a new cycle.
     * While ON (including first ON after OFF), accumulate 'since' stats
     * If going from ON to OFF, mark current cycle completed, update 'last' cycle stats for newly-completed cycle,
     * and log completed cycle.
     * Optimized so no calculations need to be done for steady state OFF status.
     * 
     * Rant about `.push()`:
     * We use @see CircularBuffer to store history of completed cycles.  When adding the most recently completed cycle to the history,
     * we use `.push()` rather than `.enq()`. This ensures that `.toarray()[0]` or `.get(0)` is the *oldest* item in history,
     * which is the desired representation.
     * I suppose @see CircularBuffer is following the *bad* example of @see Array.prototype in having
     * `.push()` defined to append to the *end* of the buffer, but the CS101 definition of the operator is that
     * *enqueue* adds an element to the end of the buffer, so *push* should prepend to the beginning.
     * The fathers have eaten sour grapes and the children's teeth are set on edge.
     *
     *
     * @param {*} sampleValue       the observed value.  Any truthy value indicates device is ON.
     * @param {Date} sampleDate     the timestamp of the value (which, if pulled from a log, might not be "now")
     *                              So far, however, I can't figure out how to get the timestamp from the log, so
     *                              the played-back data is shifted into the present time.
     * @param {Number} prevValue    the last observed value
     * @param {Date} prevValueDate  timestamp when last value was presented
     * @memberof DeviceReadings
     */
    updateFromSample(sampleValue, sampleDate, prevValue, prevValueDate) {       // timestamp of new value (might be read from log)

        assert((typeof sampleValue) == 'number');
        //todo why? assert((sampleDate - prevValueDate > 0), `updateFromSample, sampleDate diff ${sampleDate - prevValueDate} not > 0`);

        if (sampleValue && (Math.abs(sampleValue) <= this.config.noiseMargin)) {       // clip noise to zero.
            sampleValue = 0.0;
        };

        if (sampleValue) {                  // pump *IS* running
            if (!prevValue) {        // but it was not previously --> start new cycle
                this.cycleWork = 0;

                this.lastOffTime.value = sampleDate - this.cycleEndDate;

                this.cycleStartDate = sampleDate;
            }
            // anyway, it's running now: extend this cycle
            const prevSampleInterval = sampleDate - prevValueDate;
            const curWork = sampleValue * dateToSec(prevSampleInterval);  // assume constant effort since last sample

            this.cycleWork += curWork;
            this.sinceRunTime.value += prevSampleInterval;
            this.status.value = DeviceStatus.RUNNING;

        } else {                            // pump *NOT* running
            if (prevValue) {          // but it was previously --> record end of cycle
                this.cycleEndDate = sampleDate;

                const curRunMs = sampleDate - this.cycleStartDate;
                this.lastRunTime.value = sampleDate - this.cycleStartDate
                this.sinceCycles.value += 1;

                this.cycles.push({           // append latest cycle to *end* of log...
                    date: this.cycleStartDate,
                    runSec: dateToSec(curRunMs),
                });
            };
            this.status.value = DeviceStatus.STOPPED;
        };
    }

    /**
     * Mark the device as OFFLINE
     *
     * Usually due to no status report for "too" long.
     *
     * @param {*} sampleDate
     * @memberof DeviceReadings
     */
    forceOffline(sampleDate) {
        this.status.value = DeviceStatus.OFFLINE;
        this.edgeDate = sampleDate;
    }

    /**
     * Reset 'since' statistics
     * 
     * Eventually, add a POST to trigger this.
     *
     * @param {*} sampleDate
     * @memberof DeviceReadings
     */
    resetSince(sampleDate) {
        this.sinceCycles.value = 0;
        this.sinceRunTime.value = 0;
        this.since.value = sampleDate;
    }

    /**
     * Restore checkpointed data, if possible
     *
     * Has the side effect of updating relevant properties of `this`.
     *
     * @param {*} filePath
     * @memberof DeviceReadings
     */
    restore(filePath) {
        const zipHandler = new JSZip();


    }


    /**
     * Save current values to disk
     *
     * @param {*} filePath
     * @memberof DeviceReadings
     */
    save(filePath) {

    }
}



/**
 * Handle a pump-style device (??)
 *
 * @class DeviceHandler
 */
class DeviceHandler {
    /**
     * Creates an instance of DeviceHandler.
     * @param {*} skPlugin
     * @param {*} deviceConfig - plugin config object
     * @memberof DeviceHandler
     */
    constructor(skPlugin, deviceConfig) {
        this._averageCounter = 0;
        this.skPlugin = skPlugin;
        this.deviceConfig = deviceConfig;
        this.id = _.camelCase(deviceConfig.name);       // the canonic form of name, use this instead of name

        this.status = "Starting";

        this.readings = new DeviceReadings(deviceConfig);
        this.historyPath = `${this.skPlugin.dataDir}/${this.id}.dat`;
        this.readings.restore(this.historyPath);

        // when device handler ready, arm the listener event.
        // unseen here, but on return from this constructor, plugin will arm the heartbeat event.

        this.skStream = skPlugin.getSKValues(deviceConfig.skMonitorPath);
        skPlugin.subscribeVal(this.skStream, this.onMonitorValue, this);

        this.lastSave = new Date();
        this.lastValue = 0;         //todo really shouldn't assume we know what type the value is.
        this.lastValueDate = new Date();
        this.lastSKReportDate = new Date();
        this.lastHeartbeatMs = new Date();
        this.status = "Started";
    }


    stop() {
        this.skPlugin.debug(`Stopping ${this.deviceConfig.id}`);
        this.readings.save(this.historyPath);
        this.status = "Stopped";
    }


    /**
     * Invoked on heartbeat event (e.g every 2 sec)
     *
     * @param {*} nowMs -- timer event
     * @memberof DeviceHandler
     */
    onHeartbeat(nowMs) {
        //this.skPlugin.debug(`onHeartbeat(${JSON.stringify(timer)})`);
        //fixme <timer> is a valid date/time, but does it match timestamp if data is played back from file?

        assert.equal(this.status, "Started", "No heartbeat event till device handler fully started");

        assert(Math.abs((Date.now() - nowMs)) < 60 * 60 * 1000, `OnHeartBeat: event time ${nowMs} not near current time ${Date.now()}`);
        assert(this.lastHeartbeatMs < nowMs, `No back-to-back heartbeats.  Detected interval is: ${nowMs - this.lastHeartbeatMs}.`);

        if (dateToSec(nowMs - this.lastValueDate) >= this.deviceConfig.secTimeout) {
            this.readings.forceOffline(nowMs);
        };

        if (dateToSec(nowMs - this.lastSKReportDate) >= this.deviceConfig.secReportInterval) {
            this.sendAllValues();
            this.sendAllMeta();     //not here!
            this.updateAveragesAndSend();
            this.lastSKReportDate = nowMs;
        };

        if (dateToSec(nowMs - this.lastSave) > this.deviceConfig.secCheckpoint) {
            this.readings.save(this.historyPath);
            this.lastSave = nowMs;
        }

        this.lastHeartbeatMs = nowMs;

    }


    /**
     * Invoked on receipt of a subscribed data value
     *
     * Just record the last observation in this event,
     * defer the edge detection and derived statistics calculation to
     * the heartbeat event (where we can fully tune the resource consumption).
     *
     * @param {*} val -- the value
     * @memberof DeviceHandler
     */
    onMonitorValue(val) {
        assert.equal(this.status, "Started", "No new input events till device handler fully started");

        this.skPlugin.debug(`onMonitorValue(${JSON.stringify(val)})`);
        if (typeof val != 'number') {
            val = (!!val) ? 1 : 0;      // if val is any kind of truthy, coerce to numeric 1, else 0.
            this.skPlugin.debug(`Sample non-numeric, converting to ${val}`)
        }
        this.readings.updateFromSample(val, new Date(), this.lastValue, this.lastValueDate);        // update readings and cyclecount history.

        this.lastValue = val;
        this.lastValueDate = new Date();        // remember last sample time for next time.        
    }
    /**
     * Update meta zones for lastRunTime and lastOffTime based on changes in the recent average
     * First guess: adjust only the 'nominal' zone upper and lower: make it +/- 1 standard deviation
     * with midpoint of the zone at the mean.
     * But for now, a simple hack: double and halve the range, just to make something flash on the screen.
     * @memberof DeviceHandler
     */
    updateAveragesAndSend() {
        function magnify(factor, skv) { // returns [skv, newZones]
            var zones = skv.meta.zones;

            for (const z of zones) {
                if (z.state == 'nominal') {
                    if (z.lower) z.lower *= factor; // bound might be undefined!  
                    if (z.upper) z.upper *= factor;
                }
            }
            return [skv, zones];

        }

        switch (this._averageCounter % 4) {
            case 0: // double the range
                this.updateMeta(
                    [magnify(2, this.readings.lastRunTime),
                    magnify(2, this.readings.lastOffTime)]
                );
                break;
            case 1: // halve the range
                this.updateMeta(
                    [magnify(0.5, this.readings.lastRunTime),
                    magnify(0.5, this.readings.lastOffTime)]
                );
                break;
            case 2: // halve the range
                this.updateMeta(
                    [magnify(0.5, this.readings.lastRunTime),
                    magnify(0.5, this.readings.lastOffTime)]
                );
                break;
            case 3: // double the range
                this.updateMeta(
                    [magnify(2, this.readings.lastRunTime),
                    magnify(2, this.readings.lastOffTime)]
                );
                break;
        };

        this._averageCounter += 1;
    }

    /**
     * Send a single SignalK Update message, which can contain either values or metadata
     * @param {string} type is 'values' or 'meta'.  Accept no substitutes
     * @param {[{path, value}]} values An array of one or more objects with each element
     *   being in the format { path: "signal.k.path", value: "someValue" }.  
     * Note object[i].value can be an object, especially when sending meta.
     * @see #sendSK
     */
    sendSKUpdate(type, values) {

        //if (!(type in ['meta', 'values'])){
        //    var t = 1;
        //};

        var delta = {
            //todo determine whether the delta should have 'context: <reference to self>
            "updates": [
                {
                    "source": {
                        "label": this.id,
                    },
                    "timestamp": new Date(),
                }
            ]
        };

        const dv = [];
        for (const v of values) {
            dv.push({
                path: this.deviceConfig.skRunStatsPath + '.' + v.key,
                value: v.value
            });
        }
        delta.updates[0][type] = dv;

        this.skPlugin.debug(`sending SignalK: ${JSON.stringify(delta, null, 2)}`);
        this.skPlugin.app.handleMessage(this.id, delta);
    }
    /**
     * Send an update containing *all* the device's current reading values.
     *
     * @memberof DeviceHandler
     */
    sendAllValues() {
        const values = []
        const keyPrefix = this.deviceConfig.skRunStatsPath;

        for (const [k, sv] of Object.entries(this.readings)) {
            if (sv instanceof SkValue) {
                values.push({
                    key: sv.key,
                    value: sv.valueOf()     // leverage custom transform for .value, if any.
                })
            }
        }

        this.sendSKUpdate('values', values);
    }

    /**
     * Send an update containing *all* the device's readings metadata.
     *
     * @memberof DeviceHandler
     */
    sendAllMeta() {
        const values = [];

        for (const [k, sv] of Object.entries(this.readings)) {
            if (sv instanceof SkValue) {
                values.push({
                    key: sv.key,
                    value: sv.meta
                });
            }
        }

        this.sendSKUpdate('meta', values);
    }
    /**
     * Update specified metadata properties of one or more readings, 
     * then send an SK update of the changed properties.
     *
     * @param {[SkValue, newMeta], . . .] } skObjMeta   A list of 2-element lists:
     * [skVal, newMeta], skVal - The reading statistic to update
     * newMeta   An object containing the new metadata, in form {<metaKey>: <metaValue>}.
     * Note that you must provide a *complete* new value for compound meta like `displayScale`
     * and `zones`, it's not enough to change just one element of that value.
     * @memberof DeviceHandler
     */
    updateMeta(skObjMeta) {

        var values = [];

        for (const [skValue, newMeta] of skObjMeta) {
            assert(skValue instanceof SkValue);
            Object.assign(skValue.meta, newMeta);
            values.push({
                key: skValue.key,
                value: newMeta
            });
        }

        this.sendSKUpdate('meta', values);
    }


    /**
     * Get values for a device history report
     * 
     * We assume the values get converted to JSON downstream of us.
     *
     * @param {string} start    Parsable date string for earliest date to retrieve (undefined to start with oldest record)
     * @param {string} end      Parsable date string for latest date to retrieve (undefined to end with newest)
     * @return {*} Can be an error of form {status:nnn, msg:string} or an array of values
     * @memberof DeviceHandler
     */
    getHistory(start, end) {
        assert.equal(this.status, "Started", "No API calls till device handler fully started");

        this.skPlugin.debug(`${this.deviceConfig.id} history request for ${start} thru ${end}`);

        var startRange = new Date(start || 0);
        var endRange = (end == undefined) ? new Date() : new Date(end);

        if (isNaN(endRange - startRange)) {
            return { status: 400, msg: `invalid date range [${start}, ${end}]` };
        };

        let res = [];

        const hist = this.readings.cycles;

        for (const item of hist.toarray()) {
            if (item.date > endRange) break;
            if (item.date >= startRange) res.push(item);
        }

        return res
    }


    /**
     * Get histogram of results
     *
     * Intended to be an at-a-glance kind of history
     * last 24h         cycles  aggregate_runTime
     * last week        cycles/day  average_runTime_perDay (week starting 24h ago)
     * last 2 months    cycles/day  average_runTime_perDay  (starting 8*24h ago)
     *
     * if the pump runs 1/day, each bucket would have ~~ 8x samples the previous, roughly logarithmic.
     *
     * @memberof DeviceHandler
     */
    getHistogram() {

    }
}

module.exports = { DeviceStatus, DeviceHandler };
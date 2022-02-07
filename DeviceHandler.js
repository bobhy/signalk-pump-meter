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
    return Math.round(msValue * 1000.0) / 1000.0;
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
DeviceStatus_all = Object.keys(DeviceStatus).forEach(f => DeviceStatus_all.push(f))
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
     * @memberof DeviceReadings
     */
    constructor() {

        //todo generate correct SK meta schema at runtime startup, until SkMeta API is fixed. DRY this out.

        this.status = new SkValue('status', DeviceStatus.OFFLINE, {
            label: "Current status", enum: DeviceStatus_all,
            description: "Current status of device.  OFFLINE means no status report in 'too' long."
        });

        // statistics accumulated from a resettable starting point in time

        this.since = new SkValue('since',
            Date.now(),
            {
                label: "Statistics Start", units: "timestamp",
                description: "cycles and runtime since this moment"
            },
            (v) => { return (new Date(v)).toISOString(); }
        );

        this.sinceCycles = new SkValue('sinceCycles', {
            label: "Run Cycles",
            description: "On-off duty cycles since statistics start"
        });

        this.sinceRunTime = new SkValue('sinceRunTime', {
            label: "Run Time", units: "s"
            , description: "Cumulative run time since statistics start"
        });

        this.sinceWork = new SkValue('sinceWork', {
            label: "Work", units: "C",
            description: "Cumulative work accomplished since statistics start in A.s (Coulombs).  Divide by 3600 for A.h."
        });

        // statistics updated per completed cycle (at end of cycle)

        this.lastRunTime = new SkValue('lastRunTime', {
            label: "Run Time", units: "s", scale: [0, 150]
            , description: "Runtime of last completed cycle"
            , range: [
                [undefined, 1, "alarm", "Pump run too short (alarm)"]
                , [1, 7, "warn", "Pump run too short"]
                , [7, 30, "nominal"]
                , [7, 60, "normal"]
                , [60, 120, "warn", "Pump run too long"]
                , [120, undefined, "alarm", "Pump run too long (alarm)"]
            ]
        });

        const AVERAGE_PUMP_CURRENT = 3;     // SWAG, average pump draw when running, used to set ranges

        this.lastWork = new SkValue('lastWork', {
            label: "Work", units: "C", scale: [0, 150]
            , description: "Work accomplished in last completed cycle"
            , range: [
                [undefined, AVERAGE_PUMP_CURRENT * 1, "alarm", "Pump run too short (alarm)"]
                , [1 * AVERAGE_PUMP_CURRENT, 7 * AVERAGE_PUMP_CURRENT, "warn", "Pump run too short"]
                , [7 * AVERAGE_PUMP_CURRENT, 30 * AVERAGE_PUMP_CURRENT, "nominal"]
                , [7 * AVERAGE_PUMP_CURRENT, 60 * AVERAGE_PUMP_CURRENT, "normal"]
                , [60 * AVERAGE_PUMP_CURRENT, 120 * AVERAGE_PUMP_CURRENT, "warn", "Pump run too long"]
                , [120 * AVERAGE_PUMP_CURRENT, undefined, "alarm", "Pump run too long (alarm)"]
            ]
        });


        // initialize other working variables

        this.cycleStartDate = Date.now();   // beginning of cycle: OFF to ON
        this.cycleWork = 0;

        this.cycles = new CircularBuffer(1000); // history of completed cycles: {start: <date/time>, run: <sec>})
        this.cycles.push({ date: Date.now(), runSec: 0 });  // dummy first completed cycle

        //todo: establish checkpoint schedule, save live data t ofile every N sec.
    }

    /**
    * emit SK metadata delta suitable for insertion into baseDeltas.json
    *
    * @export
    * @return {*} 
    */
    genDelta(basePath) {

        let mv = []

        pluginKeys.forEach(mk => {
            mv.push({ path: `${basePath}.${mk.key}`, value: mk.metaGen() })
        });

        return { context: "vessels.self", updates: [{ meta: [mv] }] }
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

        assert(sampleValue instanceof Number);

        if (Math.abs(sampleVal) <= this.config.NoiseMargin) {       // clip noise to zero.
            sampleValue = 0.0;
        };

        if (sampleValue) {                  // pump *IS* running
            if (!prevValue) {        // but it was not previously --> start new cycle
                this.cycleWork = 0;
                this.cycleStartDate = sampleDate;
            }
            // extend this cycle
            const prevSampleInterval = sampleDate - prevValueDate;
            const curWork = sampleVal * dateToSec(prevSampleInterval);  // assume constant effort since last sample

            this.cycleWork += curWork;
            this.sinceRunTime.value += prevSampleInterval;
            this.sinceWork.value += curWork;
            this.status.value = DeviceStatus.RUNNING;

        } else {                            // pump *NOT* running
            if (prevValue) {          // but it was previously --> record end of cycle
                const curRunMs = sampleDate - this.cycleStartDate;

                this.lastRunTime.value = sampleDate - this.cycleStartDate
                this.lastWork.value = this.cycleWork;
                this.sinceCycleCount.value += 1;

                this.cycles.push({           // append latest cycle to *end* of log...
                    date: timestamp(this.cycleStartDate),
                    work: this.cycleWork,
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
        this.status = _device_status.OFFLINE;
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
        this.sinceCycleCount.value = 0;
        this.sinceRunTime.value = 0;
        this.sinceWork.value = 0;
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
     * @param {*} config - plugin config object
     * @memberof DeviceHandler
     */
    constructor(skPlugin, config) {
        this.skPlugin = skPlugin;
        this.config = config;
        this.id = _.camelCase(config.name);

        this.status = "Starting";

        this.readings = new DeviceReadings();
        this.historyPath = `${this.skPlugin.dataDir}/${this.id}.dat`;
        this.readings.restore(this.historyPath);

        // when device handler ready, arm the listener event.
        // unseen here, but on return from this constructor, plugin will arm the heartbeat event.

        this.skStream = skPlugin.getSKValues(config.skMonitorPath);
        skPlugin.subscribeVal(this.skStream, this.onMonitorValue, this);

        this.lastSave = Date.now();
        this.lastValue = 0;         //bugbug really shouldn't assume we know what type the value is.
        this.lastValueDate = Date.now();
        this.lastSKReportDate = Date.now();
        this.lastHeartbeatMs = Date.now();
        this.status = "Started";
    }


    stop() {
        this.skPlugin.debug(`Stopping ${this.config.name}`);
        this.readings.save(this.historyPath);
        this.status = "Stopped";
    }


    /**
     * Invoked on heartbeat event (e.g every 2 sec)
     *
     * @param {*} timer -- timer event
     * @memberof DeviceHandler
     */
    onHeartbeat(nowMs) {
        //this.skPlugin.debug(`onHeartbeat(${JSON.stringify(timer)})`);
        //fixme <timer> is a valid date/time, but does it match timestamp if data is played back from file?

        assert(this.lastHeartbeatMs < nowMs, `No back-to-back heartbeats.  Detected interval is: ${nowMs - this.lastHeartbeatMs}.`);
        this.lastHeartbeatMs = nowMs;

        assert.equal(this.status, "Started", "No heartbeat event till device handler fully started");

        if (dateToSec(Date.now() - this.lastValueDate) >= this.config.secTimeout) {
            this.readings.forceOffline(this.lastValueDate);
        };

        if (dateToSec(Date.now() - this.lastSKReportDate) >= this.config.secReportInterval) {
            this.reportSK(nowMs);
            this.lastSKReportDate = nowMs;
        };

        if (dateToSec(Date.now() - this.lastSave) > this.config.secCheckpoint) {
            this.readings.save(this.historyPath);
            this.lastSave = nowMs;
        }
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
        if (!(val instanceof Number)) {
            val = (!!val) ? 1 : 0;      // if val is any kind of truthy, coerce to numeric 1, else 0.
            this.skPlugin.debug(`Sample non-numeric, converting to ${val}`)
        }
        this.readings.updateFromSample(val, Date.now(), this.lastValue, this.lastValueDate);        // update readings and cyclecount history.
        
        this.lastValue = val;
        this.lastValueDate = Date.now();        // remember last sample time for next time.        
    }


    /**
     * Construct and send a SignalK delta with current statistics from this device.
     *
     * @param {*} nowMs
     * @memberof DeviceHandler
     */
    reportSK(nowMs) {
        var values = [];

        for (const sv in this) {
            if (sv instanceof SkValue) {
                values.push({ path: `${this.config.skRunStatsPath}.${sv.key}`, value: sv.toString() });
            }
        }

        if (values.length > 0) {
            this.skPlugin.sendSKValues(values);
        }
        else {
            this.skPlugin.debug('... suppressed trying to send an empty delta.')
        }
    }



    parseDate(dt) {

        switch (dt.constructor.name) {
            case 'Number':
                return dt;
            //case 'Date':              // actual external API will never present this type
            //    return dt.getTime();
            default:
                const rv = Date.parse(dt);
                if (!rv) {
                    throw `Can't parse ${dt} as date/time`
                } else {
                    return rv;
                };
        };
    }


    /**
     * Get JSON values for a device history report
     *
     * @param {*} start
     * @param {*} end
     * @return {*} Can be an error of form {status:nnn, msg:string} or an array of values
     * @memberof DeviceHandler
     */
    getHistory(start, end) {
        assert.equal(this.status, "Started", "No API calls till device handler fully started");

        this.skPlugin.debug(`${this.config.name} history request for ${start} thru ${end}`);

        var startRange;
        var endRange;

        try {
            startRange = (start == undefined) ? 0 : this.parseDate(start);
            endRange = (end == undefined) ? Date.now() : this.parseDate(end);
        } catch (e) {
            return { status: 400, msg: e }; // http status 400 Bad Request
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

module.exports = DeviceHandler;
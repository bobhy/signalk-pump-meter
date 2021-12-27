const CircularBuffer = require('circular-buffer');
const JSZip = require('jszip');
const _ = require('lodash');
const assert = require('assert').strict;

// pump run statistics logged and reported periodically

/**
 * Convert an interval in units of ms to seconds.
 *
 * Round small (but non-zero) intervals up to 1 second, others to *nearest* second.
 * This won't make much difference in the real world (it says here), but is important
 * for testability, where we run with very short timeouts.
 *
 * @param {*} msValue
 * @return {*}
 */
function toSec(msValue) {   // convert MS to rounded # sec
    var retVal = 0;
    if (msValue > 500) {
        retVal = Math.round(msValue / 1000.0);
    } else if (msValue > 0) {
        retVal = 1;
    };
    return retVal;
}

/**
 * Convert a date/time (in ms) to a number of seconds prior to *now*.
 *
 * @param {*} msValue
 * @return {*}
 */
function dateToIntervalSec(msValue) {  // num sec before "now"
    const intervalMs = Date.now() - msValue;
    if (intervalMs > 500) {
        return Math.round(intervalMs / 1000.0);
    } else if (intervalMs > 0) {
        return 1;
    } else {
        return 0;
    }
}

/* allowed values of <reportPath>.status
 */

const _device_status = {
    OFFLINE: 'OFFLINE',    // device not currently reporting anything
    OFF: "OFF",         // device off (not running)
    ON: "ON"           // device on (is running)
}


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

        this.cycleCount = 0;                // number of OFF->ON transitions
        this.runTimeMs = 0;                 // integer number of ms
        this.historyDate = Date.now();      // timestamp of start of data recording history
        this.lastSample = 0;                // last sample seen
        this.status = _device_status.OFFLINE;
        this.edgeDate = Date.now();                  // most recent edge transition

        this.cycles = new CircularBuffer(1000); // history of completed cycles: {start: <date/time>, run: <sec>})
        this.cycles.push({ date: Date.now(), runSec: 0 });  // dummy first completed cycle

        //todo: establish checkpoint schedule, save live data t ofile every N sec.
    }

    /**
     * Construct values to report in next SignalK delta
     *
     * @return {{}} --  leaf names and values in SignalK units.
     *                  The actual SignalK path reported is @see Plugin.options.skRunStatsPath prepended to leaf name.
     * @memberof DeviceReadings
     */
    deltaValues() {
        const lastCycle = this.cycles.get(this.cycles.size()-1);     //bugbug cb considers most recently pushed element to be at *end* of queue?
        const retVal = {
            'status': this.status,
            'statusStart': dateToIntervalSec(this.edgeDate),
            'cycleCount': this.cycleCount,
            'runTime': toSec(this.runTimeMs),
            'historyStart': dateToIntervalSec(this.historyDate),
            'lastCycleStart': dateToIntervalSec(lastCycle.date),
            'lastCycleRunTime': lastCycle.runSec,
            //'moment': Date.now(),       // needed to calibrate all the xxStart values.
            //'startsMs': { 'statusStart': this.edgeDate, 'historyStart': this.historyDate, 'lastCycleStart': lastCycle.date },
        };
        if (retVal.lastCycleStart)
        return retVal;
    }


    /**
     * Account for a new sample observation
     * If going from OFF to ON, start a new cycle.
     * If going from ON to OFF, mark current cycle completed, add accumulated runTime to total runTime,
     * Optimized so no calculations need to be done while the value is unchanged, only on the rising or falling edge.
     *
     * Rant about `.push()`:
     * We use @see CircularBuffer to store history of completed cycles.  When adding the most recently completed cycle to the history,
     * we use `.push()` rather than `.enq()`. This ensures that `.toarray()[0]` or `.get(0)` is the *oldest* item in history,
     * which is the desired representation.
     * I suppose @see CircularBuffer is following the *bad* example of @see Array.prototype in having
     * `.push()` defined to append to the *end* of the buffer, but the CS101 definition of the operator is that
     * *enqueue* adds an element to the end of the buffer, so *push* should prepend to the beginning.
     * Oh well, the fathers have eaten sour grapes and the children's teeth are set on edge.
     *
     *
     * @param {*} sampleValue       - the observed value.  Any truthy value indicates device is ON.
     * @param {Date} sampleDate     - the timestamp of the value (which, if pulled from a log, might not be "now")
     * *                              So far, however, I can't figure out how to get the timestamp from the log, so
     *                                the played-back data is shifted into the present time.
     * @memberof DeviceReadings
     */
    updateFromSample(sampleValue, sampleDate) {       // timestamp of new value (might be read from log)

        const truthy_sample = !!sampleValue;

        if (truthy_sample != this.lastSample) {
            if (truthy_sample) {
                this.status = _device_status.ON;
            } else {
                this.status = _device_status.OFF;
                const curRunMs = sampleDate - this.edgeDate;
                this.cycleCount += 1;
                this.runTimeMs += curRunMs;
                this.cycles.push({           // append latest cycle to *end* of log...
                    date: this.edgeDate,
                    runSec: toSec(curRunMs),
                });
            };

            this.edgeDate = sampleDate;     // now we have a new edge to count from
            this.lastSample = truthy_sample;  // lastSample is a boolean.
        }
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

        this.readings = new DeviceReadings();
        this.historyPath = `${this.skPlugin.dataDir}/${this.id}.dat`;
        this.readings.restore(this.historyPath);

        // when device handler ready, arm the listener event.
        // unseen here, but on return from this constructor, plugin will arm the heartbeat event.

        this.skStream = skPlugin.getSKValues(config.skMonitorPath);
        skPlugin.subscribeVal(this.skStream, this.onMonitorValue, this);

        this.lastSave = Date.now();
        this.lastValueDate = Date.now();
        this.lastSKReportDate = Date.now();
        this.lastHeartbeatMs = Date.now();
        this.status = "Starting";
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

        if (dateToIntervalSec(this.lastValueDate) >= this.config.secTimeout) {
            this.readings.forceOffline(this.lastValueDate);
        };

        if (dateToIntervalSec(this.lastSKReportDate) >= this.config.secReportInterval) {
            this.reportSK(nowMs);
            this.lastSKReportDate = nowMs;
        };

        if (dateToIntervalSec(this.lastSave) > this.config.secCheckpoint) {
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
        this.lastValueDate = Date.now();
        this.readings.updateFromSample(val, Date.now());        // update readings and cyclecount history.
    }


    /**
     * Construct and send a SignalK delta with current statistics from this device.
     *
     * @param {*} nowMs
     * @memberof DeviceHandler
     */
    reportSK(nowMs) {
        var values = [];

        for (const [k, v] of Object.entries(this.readings.deltaValues())) {   //ugly k,v iteration!
            values.push({ path: `${this.config.skRunStatsPath}.${k}`, value: v })
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
const { round } = require('lodash');
const _ = require('lodash');
const FixedRecordFile = require("structured-binary-file").FixedRecordFile;
const Parser = require("binary-parser-encoder").Parser;

// pump run statistics logged and reported periodically

function toSec(msValue) {   // convert MS to rounded # sec
    return Math.round(msValue / 1000.0)
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

        this.cycleCount = 0             // number of OFF->ON transitions
        this.runTimeMs = 0              // integer number of ms
        this.lastRunDate = 0            // # ms since last observed OFF->ON transition (a long time ago)
        this.lastRunTimeMs = 0          // duration of last observed ON time (only updated when ON->OFF is seen)
        this.sessionStartDate = Date.now()   // timestamp of start of data recording session
        this.lastSample = 0             // last known sample value of the device
        this.lastSampleDate = Date.now()  // timestamp of last sample (ms since 1-jan-1970)
        this.status = _device_status.OFFLINE
    }


    /**
     * Construct a binary record parser for this object
     *
     * It's necessary to list all the fields a second time, but at least it's in the same class...
     *
     * @return {Parser}
     * @memberof DeviceReadings
     */
    GetParser() {
        return Parser.start()
            .endianess("big")  // network byte order even on (littleendian) intel-alike processors.
            .doublebe("sessionStartDate")  //puzzle why not int64?   date as ms since 1/1/70
            .int32("cycleCount")
            .int32("runtimeMs")
            .doublebe("lastRunDate")
            .int32("lastRunTimeMs")
            .int32("lastSample")        // real-world value coerced to boolean in history.
            .doublebe("lastSampleDate")
            .string("status", { length: 16, trim: true })     // value encoded by _device_status_encode()
    }


    /**
     * Account for a new sample observation
     * If going from OFF to ON, start a new cycle.
     * If going from ON to OFF, add accumulated runTime to total runTime
     * Optimized so no calculations need to be done while the value is unchanged, only on the rising or falling edge.
     *
     * @param {*} sampleValue       - the observed value.  Any truthy value indicates device is ON.
     * @param {Date} sampleDate     - the timestamp of the value (which, if pulled from a log, might not be "now")
     * *                              So far, however, I can't figure out how to get the timestamp from the log, so
     *                                the played-back data is shifted into the present time.
     * @memberof DeviceReadings
     */
    NewSample(sampleValue, sampleDate        // timestamp of new value (might be read from log)
    ) {
        if (!sampleValue != !this.lastSample) { // if value *has* changed from last sample
            if (!this.lastSample) {             // and last sample was OFF, so start a new ON cycle
                this.status = _device_status.ON
                this.lastRunDate = sampleDate   // 'last' cycle is the one starting now
                this.lastRunTimeMs = 0
                this.cycleCount += 1            // count cycles at start of cycle; i.e OFF->ON
            } else {                            // last sample was ON, so this is end of a run
                this.status = _device_status.OFF
                this.lastRunTimeMs = (sampleDate - this.lastRunDate)
                this.runTimeMs += this.lastRunTimeMs    // add last run to accumulated run
            }
        }                                       // if value unchanged, no calculations needed

        this.lastSampleDate = sampleDate        // time marches on...
        this.lastSample = !!sampleValue         // convert sample value of any type to its "truthy" value.
    }


    /**
     * Emit values for external consumption on the network
     *
     * Timestamps converted to relative elapsed time (and rounded to sec).
     * RunTime and LastRunTime adjusted for current run in progress if devce ON
     *
     * @param {number} nowMs - "current" time in caller's epoch
     * @return {object} -- keys: cycleCount, runTime, lastRunStart, lastRunTime, sessionStart
     * @memberof DeviceReadings
     */
    ReportValues(nowMs) {
        return {
            cycleCount: this.cycleCount
            , runTime: toSec(this.runTimeMs + (!this.lastSample ? 0 : (this.lastSampleDate - this.lastRunDate)))
            , lastRunStart: toSec(nowMs - this.lastRunDate)    // maybe more useful to report *end* of last cycle?
            // time from end of last cycle to start of current tells me how fast my bilge is filling up?
            , lastRunTime: toSec(!this.lastSample ? this.lastRunTimeMs : (nowMs - this.lastRunDate))
            , sessionStart: toSec(nowMs - this.sessionStartDate)
            , status: this.status
        }
    }
}

/**
 * Maintain a persistent history of old sessions
 *
 * @class SessionHistory
 * @extends {FixedRecordFile}
 */
class SessionHistory extends FixedRecordFile {
    /**
     * Creates an instance of SessionHistory.
     * @param {Parser} parser -- binary file parser for an instance of {@link DeviceReadings}
     * @param {String} file_name -- full path to file for storing history
     * @memberof SessionHistory
     */
    constructor(parser, file_name) {

        super(parser)
        this.file_name = file_name
    }

    /**
     * Extend the previous data session, if it is fresh enough; otherwise start a new session.
     *
     * @param {*} current_session -- default session values
     * @param {number} [session_continue_ms=0] -- resume prior session if last reading is within this interval (ms)
     * @return {*} -- updated session values
     * @memberof SessionHistory
     */
    ExtendSession(current_session, session_continue_ms = 0) {
        try {
            this.open(this.file_name)
            if (this.recordCount() > 0) {
                const prior_session = this.readRecord(this.recordCount() - 1)
                if (Date.now() - prior_session.lastSampleDate < session_continue_ms) {
                    Object.assign(current_session, prior_session)  // resume all values from old session
                }
            }

            // append a new session record in any case. (means might have 2 sessions with same start time...)
            this.appendRecord(current_session)
        } catch (e) {
            console.error(`${e} starting new session from history ${this.file_name}`)
        } finally {
            this.close()
        }

        return current_session
    }


    /**
     * Update current session data in persistent file.
     * Overwrite most recent record.
     *
     * @param {*} session
     * @memberof SessionHistory
     */
    CheckpointValues(session) {
        try {
            this.open(this.file_name)
            this.writeRecord(this.recordCount() - 1, session)
        } catch (e) {
            console.error(`${e} checkpointing session values to history ${this.file_name}.`)
        } finally {
            this.close()
        }
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
        this.skStream = skPlugin.getSKValues(config.skMonitorPath);
        skPlugin.subscribeVal(this.skStream, this.onMonitorValue, this);

        this.readings = new DeviceReadings();
        this.history = new SessionHistory(this.readings.GetParser(), `${this.skPlugin.dataDir}/${this.id}.dat`)
        this.readings = this.history.ExtendSession(this.readings, config.secTimeout*1000)

        this.lastSKReport = 0;
        //debug this.reportSK();
    }


    stop() {
        this.skPlugin.debug(`Stopping ${this.config.name}`);
        this.history.CheckpointValues(this.readings);
    }


    /**
     * Invoked on heartbeat event (e.g every 2 sec)
     *
     * @param {*} timer -- timer event
     * @memberof DeviceHandler
     */
    onHeartbeat(timer) {
        //this.skPlugin.debug(`onHeartbeat(${JSON.stringify(timer)})`);
        if (toSec(Date.now() - this.readings.lastSampleDate) > this.config.secTimeout) {
            this.skPlugin.debug(`Device data timeout, marking ${this.config.name} as offline}`)
            this.readings.NewSample(0, Date.now())
            this.readings.status = _device_status.OFFLINE   // override NewSample logic
            this.reportSK();    // emit offline status
        }
        if (toSec(Date.now() - this.lastSKReport) >= this.config.secReportInterval) {
            this.reportSK();
            this.history.CheckpointValues(this.readings)
        }
    }


    /**
     * Invoked on receipt of a subscribed data value
     *
     * @param {*} val -- the value
     * @memberof DeviceHandler
     */
    onMonitorValue(val) {
        this.skPlugin.debug(`onMonitorValue(${JSON.stringify(val)})`);
        this.readings.NewSample(val, Date.now());     //fixme timestamp should be from delta, not hard-coded
    }


    reportSK() {
        var values = [];

        for (const [k, v] of Object.entries(this.readings.ReportValues(Date.now()))) {   //ugly k,v iteration!
            values.push({ path: `${this.config.skRunStatsPath}.${k}`, value: v })
        }

        if (!_.isEmpty(values)) {
            this.skPlugin.sendSKValues(values);
        }

        this.lastSKReport = Date.now();
    }



    parseDate(dt, defaultVal) {

        if (typeof dt === 'string') {
            let val = Date.parse(dt);
            if (!isNaN(val)) {
                return val;
            }
            else {
                this.skPlugin.debug(`Ignoring invalid date format: ${dt}`);
            }
        }
        else if (typeof dt === 'number') {
            return dt;
        }
        return defaultVal;
    }



    getHistory(start, end) {

        console.debug(`${this.config.name} history request for ${start} thru ${end}`);
        let startRange = this.parseDate(start, 0);
        let endRange = this.parseDate(end, new Date().getTime());

        let res = []
        this.history.open(this.history.file_name)

        try {
            this.history.forEach(rec => {
                if (startRange <= rec.lastSampleDate && endRange >= rec.sessionStartDate) {
                    res.push({ historyDate: Date.now(), ...rec })
                }
            })
        }
        catch (e) {
            console.error(`${e} fetching session history from ${this.history.file_name}`)
        }
        finally {
            this.history.close()
        }

        return res

        //        const cur_sess = this.readings.ReportValues(Date.now());
        //const res = [{ historyDate: Date.now(), ...cur_sess }];   // array of 1 row
        //return res;
    }


    getDataFileName() {
        return `${this.skPlugin.dataDir}/${this.id}.dat`;
    }

}

module.exports = DeviceHandler;
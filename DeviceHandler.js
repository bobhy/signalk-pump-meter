const { round } = require('lodash');
const _ = require('lodash');
const DBRunLog = require('./DBRunLog.js');

// pump run statistics logged and reported periodically

function toSec(msValue) {   // convert MS to rounded # sec
    return Math.round(msValue / 1000.0)
}

/**
 * Device run time statistics
 * Since samples are collected (much?) more frequently than values are reported out, internal values optimized for efficient recording.
 * The reporting out {@link reportValues} calculates tractible statistics.
 *
 * @class DeviceReadings
 */
class DeviceReadings {

    /**
     * Creates an instance of DeviceReadings.
     * @memberof DeviceReadings
     */
    constructor(cycleCount = 0, runTimeMs = 0, lastRunDate) {
        this.cycleCount = 0             // number of OFF->ON transitions
        this.runTimeMs = 0              // integer number of ms
        this.lastRunDate = 0            // # sec since last observed OFF->ON transition (a long time ago)
        this.lastRunTimeMs = 0          // duration of last observed ON time (only updated when ON->OFF is seen)
        this.sessionStartDate = Date.now()   // timestamp of start of data recording session
        this.lastSample = 0             // last known sample value of the device
        this.lastSampleDate = Date.now()  // timestamp of last sample (ms since 1-jan-1970)
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
                this.lastRunDate = sampleDate   // 'last' cycle is the one starting now
                this.lastRunTimeMs = 0
                this.cycleCount += 1            // count cycles at start of cycle; i.e OFF->ON
            } else {                            // last sample was ON, so this is end of a run
                this.lastRunTimeMs = (sampleDate - this.lastRunDate)
                this.runTimeMs += this.lastRunTimeMs    // add last run to accumulated run
            }
        }                                       // if value unchanged, no calculations needed

        this.lastSampleDate = sampleDate        // time marches on...
        this.lastSample = sampleValue
    }

    /**
     * Export values for external consumption.
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
        }
    }

    /**
     *
     * @memberof DeviceReadings
    /**
     * Return loggable snapshot of current values which can be restored via {@link this.Deserialize}.
     *
     * @return {string} -- string representation of current values 
     * @memberof DeviceReadings
     */
    Serialize() {
        return JSON.stringify(this)
    }

    /**
     * Update running values from loggable snapshot (as provided by {@link this.Serialize}).
     *
     * @param {*} blob
     * @memberof DeviceReadings
     */
    Deserialize(blob) {
        new_vals = JSON.parse(blob)
        for ([k, v] in new_vals.entries()) {
            this[k] = v
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
        this.lastSKReport = 0; 

        // open log, fetch saved values
        //later this.readings.Deserialize( saved_values)

        //debug this.reportSK();
    }


    stop() {
        this.skPlugin.debug(`Stopping ${this.config.name}`);
        // serialize reading values
        // write to log
    }


    /**
     * Invoked on heartbeat event (e.g every 2 sec)
     *
     * @param {*} timer -- timer event
     * @memberof DeviceHandler
     */
    onHeartbeat(timer) {
        //this.skPlugin.debug(`onHeartbeat(${JSON.stringify(timer)})`);
        if (toSec(Date.now() - this.readings.lastSampleDate) > this.config.secTimeout){
            this.skPlugin.debug(`Device data timeout, marking ${this.config.name} as stopped}`)
            this.readings.NewSample(0, Date.now())
        }
        if (toSec(Date.now() - this.lastSKReport) >= this.config.secReportInterval) {
            this.reportSK();
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


        for ( const [ k, v ] of Object.entries(this.readings.ReportValues(Date.now()))) {   //ugly k,v iteration!
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

        console.log(`${this.config.name} history request for ${start} thru ${end}`);
        let startRange = this.parseDate(start, 0);
        let endRange = this.parseDate(end, new Date().getTime());

        //fixme return history over multiple sessions.  For now, only reports the current session.

        const cur_sess = this.readings.ReportValues(Date.now());
        const res = [{historyDate: Date.now(), ...cur_sess}];   // array of 1 row
        return res;
    }


    getDataFileName() {
        return `${this.skPlugin.dataDir}/${this.id}.dat`;
    }

}

module.exports = DeviceHandler;
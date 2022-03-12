
const assert = require('assert').strict;

/**
 * a value which can be emitted in a SignalK delta
 *
 * @class SkValue
 */
class SkValue {
    static SkMetaKeys = ['displayName', 'longName', 'shortName', 'description', 'units', 'enum', 'timeout', 'displayScale', 'alertMethod', 'alarmMethod', 'warnMethod', 'emergencyMethod', 'zones'];
    /**
     * Creates an instance of SkValue -- SignalK key with value and metadata.
     * @param {string} key key of the value in SK delta
     * @param {*} init_value initial value
     * @param {Object} init_meta initial metadata as defined in [SK Meta Spec](https://signalk.org/specification/1.5.0/doc/data_model_metadata.html)
     * @param {*} value_formatter function populate value key in SK delta.
     * Function of one parameter, the current internal .value.
     * @memberof SkValue
     */
    constructor(key, init_value, init_meta, value_formatter) {
        if (init_meta) {
            for (const k of Object.keys(init_meta)) {
                assert(SkValue.SkMetaKeys.includes(k), `invalid declaration for SkValue ${key}: non-standard meta key ${k}`);
            }
            assert(!('units' in init_meta && 'enum' in init_meta),
                `invalid declaration for SkValue ${key}: can't specify both meta units and enum.`);
        }
        this.key = key;
        this.value = init_value;
        this.meta = init_meta;
        this.value_formatter = value_formatter;
    }
    
    /**
     * Do custom transformation of .value, if specified
     * 
     * Overrides Object.valueOf(), you could look it up.
     *
     * @return {*} 
     * @memberof SkValue
     */
    valueOf() {
        if (this.value_formatter) {
            return this.value_formatter(this.value);
        } else {
            return this.value;
        }
    }

    /**
     * Compute (SK-meta-compatible) zones array for desired range percentages.
     * todo: scale and translate the zone to fix a scale that doesn't go from zero.
     * todo: actually use this, if it's useful.
     * 
     * we consider 'nominal' a single point, the center of the gauge, and not a range.
     * zones are a symmetric percentage below and above the interior zone.
     * Other patterns could be imagined, but maybe this is good enough for defaults.
     * * revisit* let caller specify overlapping ranges, this function generates non-overlapping
     * zone definitions based on "expected", vs SK priority of severity.
     * i.e: zone [0, 100, emergency, "this is emergency"]
     * and zone [30, 50, nominal]
     * would make (30,50) be in the emergency range too.
     * It's a lot more convenient to initialize things if the opposite were true.
     *
     * @param {number} nominal nominal value (somewhere in the middle of the scale)
     * @param {[ [number, string, string] ...} brackets array of arrays, in order: normal, alert, warn,alarm,emergency
     *              Each inner array is: percentage (above or below interior range), 'too low' string, 'too high' string
     */
    static computeZones(nominal, brackets) {
        const meta_state_label = ['nominal', 'normal', 'alert', 'warn', 'alarm', 'emergency']      // ref sk spec meta

        var zones = [[nominal, nominal, meta_state_label[0]]]   // initialize first (center) zone.

        for (var i = 0; i < brackets.length; i++) {
            const cur_break = [zones[0][0], zones[zones.length - 1][1]];
            const this_zone = [[], []];       // low, high zones to add

            this_zone[0] = [cur_break[0] * (1 - brackets[i][0]), cur_break[0], meta_state_label[i + 1]];
            if (brackets[i][1]) this_zone[0].push(brackets[i][1]);

            this_zone[1] = [cur_break[1], cur_break[1] * (1 + brackets[i][0]), meta_state_label[i + 1]];
            if (brackets[i][2]) this_zone[1].push(brackets[i][2]);

            //cur_break = [this_zone[0][0], this_zone[1][1]];

            zones.unshift(this_zone[0]);
            zones.push(this_zone[1]);
        }

        // outermost zone extends to edges of gauge scale (unless it's normal or nominal)

        if (zones.length > 3) {
            zones[0][0] = undefined;
            zones[(zones.length) - 1][1] = undefined;
        }

        return zones;
    }
}


module.exports = { SkValue }
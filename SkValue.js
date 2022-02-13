
// SignalK value and associated metadata

/**
 * a value which can be emitted in a SignalK delta
 *
 * @class SkValue
 */
class SkValue {
    /**
     * Creates an instance of SkValue
     * @param {string} key key of the value in SK delta
     * @param {*} init_value initial value
     * @param {Object} init_meta initial metadata as defined in [SK Meta Spec](https://signalk.org/specification/1.5.0/doc/data_model_metadata.html)
     * @param {*} value_formatter function of one parameter, return value to be emitted in SK delta.
     * @memberof SkValue
     */
    constructor(key, init_value, init_meta, value_formatter) {
        this.key = key;
        this.value = init_value;
        this.meta = init_meta;
        this.value_formatter = value_formatter;
    }


    /**
     * serialize value into SignalK delta
     *
     * If this.value_formatter is defined, it is invoked with the current value and its (string) value is returned.
     *
     * * @return {string} 
     * @memberof SkValue
     */
    toString() {
        return (this.value_formatter === undefined) ? this.value.toString() : this.value_formatter(this.value);
    }

    /**
     * Compute (SK-meta-compatible) zones array for desired range percentages.
     * todo: scale and translate the zone to fix a scale that doesn't go from zero.
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
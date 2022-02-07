
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
     * @param {Object} init_meta initial metadata initializer.  
     * Initializer is an object with the following keys, used to generate actual SK metadata schema
     * (this format is chosen to reduce redundancy between ranges and zones)
     *      label               // displayName in meta
     *      description         // description in meta
     *      units               // units in meta -- either units or enum
     *      enum                // e.g ['a', 'b', 'c'] for enum
     *      scale               // displayScale in meta
     *                          // [low, high] for linear, 
     *                          // [low, high, type] for 'logarithmic', 'squareroot'
     *                          // [ low, high, 'power', n] for power=0.5, 2, etc.
     *      range               // generates zones:
     *                          // [low, high] normal range
     *                          // [low, high, state, message] state and message
     *
     * @param {*} value_formatter function of one parameter, return value to be emitted in SK delta.
     * @memberof SkValue
     */
    constructor(key, init_value, init_meta, value_formatter) {
        this.key = key;
        this.value = init_value;
        this.init_meta = init_meta;
        this.value_formatter = value_formatter;
    }

    set init_meta(v) {
        if (v === undefined) return;
        if (('units' in v) && ('enum' in v)) {
            throw new TypeError('metadata can have units or enum, but not both')
        };
        if ('enum' in v && !(v.enum instanceof Object)) {
            throw new TypeError('metadata enum must be array')
        };

        this._meta = v;
    }

    get init_meta() {
        return this._meta;
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
     * generate SK metadata, based on current init_meta property
     *
     * @return {object} metadata object that is the 'value' of the metadata delta
     * @memberof SkValue
     */
    get_meta() {
        const meta_init = this._meta;

        var mv = {};
        if ('label' in meta_init) { mv.displayName = meta_init.label; }
        if ('description' in meta_init) { mv.description = meta_init.description; }
        if ('units' in meta_init) { mv.units = meta_init.units; }
        if ('enum' in meta_init) { mv.enum = meta_init.enum; }

        // displayScale -- set from meta_init.scale, lower/upper range and scale type
        if (('scale' in meta_init) && meta_init.scale.length >= 2) {
            mv.displayScale = {};
            mv.displayScale.lower = meta_init.scale[0];
            mv.displayScale.upper = meta_init.scale[1];
            switch (meta_init.scale.length) {
                case 2:
                    mv.displayScale.type = "linear"; break;
                case 3:
                    mv.displayScale.type = meta_init.scale[2]; break;
                case 4:
                    mv.displayScale.type = "power"; mv.displayScale.power = meta_init.scale[3];
                    break;
                default:
                    throw RangeError('SkMeta.scale not of recognized form');
            }
        };

        if ('range' in meta_init) {
            meta_init.range.forEach(r => {
                const z = {};
                if (r[0] !== undefined) z.lower = r[0];
                if (r[1] !== undefined) z.upper = r[1];
                z.state = 'normal';
                if (r[2] != undefined) z.state = r[2];
                if (r[3] != undefined) z.message = r[3];

                mv.zones.push(z);
            });
        };

        return mv;
    }
}


module.exports = { SkValue }
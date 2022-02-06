
import { Data } from 'dataclass'

/**
 * Define a SignalK key and associated metadata
 *
 * @class SK_Key
 * @extends {Data}
 */
export class SK_Key extends Data {
    key = "";                   // key in data objects
    label = "";                 // displayName in meta
    description = "";           // description in meta
    units = "";                 // units in meta, or ['a', 'b', 'c'] for enum
    scale = [];                 // [low, high] for linear, 
    // [low, high, type] for 'logarithmic', 'squareroot'
    // [ low, high, 'power', n] for power=0.5, 2, etc.
    range = [[]];               // generates displayRange and zones:
    // [low, high] normal range
    // [low, high, state, message] state and message

    /**
* generate metadata for a single key
*
* @return {object} metadata object per spec xxx.  has path and value
* @memberof SK_Key
*/
    metaGen() {
        var mv = {
            displayName: this.label,
            description: this.description,
            displayScale: {},
            zones: [],
        }

        if (this.units instanceof Object) {
            mv.enum = this.units;
        } else { mv.units = this.units };


        
        // displayScale -- set from this.scale, lower/upper range and scale type
        if (this.scale.length == 0) {
            mv.displayScale = { type: "linear", lower: low_gauge, upper: high_gauge };
        } else {
            mv.displayScale.lower = this.scale[0];
            mv.displayScale.upper = this.scale[1];
            switch (this.scale.length) {
                case 2:
                    mv.displayScale.type = "linear"; break;
                case 3:
                    mv.displayScale.type = this.scale[2]; break;
                case 4:
                    mv.displayScale.type = "power"; mv.displayScale.power = this.scale[3];
                    break;
                default:
                    throw RangeError('SK_Key.scale not of recognized form');

            }

        };

        this.range.forEach(r => {
            z = {};
            if (r[0] !== undefined) z.lower = r[0];
            if (r[1] !== undefined) z.upper = r[1];
            z.state = 'normal';
            if (r[2] != undefined) z.state = r[2];
            if (r[3] != undefined) z.message = r[3];

            mv.zones.push(z);
        });

        return mv;
    }
}

const AVERAGE_PUMP_CURRENT = 3;     // SWAG, average pump draw when running

export const plugin_keys = [

    // cumulative statistics accumulated over (resettable) statistics start d/t.
    SK_Key.create({
        key: "since", label: "Statistics Start", units: "timestamp",
        description: "cycles and runtime since this moment"
    })
    , SK_Key.create({
        key: "sinceCycles", label: "Run Cycles",
        description: "On-off duty cycles since statistics start"
    })
    , SK_Key.create({
        key: "sinceRunTime", label: "Run Time", units: "s"
        , description: "Cumulative run time since statistics start"
    })
    , SK_Key.create({
        key: "sinceWork", label: "Work", units: "C",
        description: "Cumulative work accomplished since statistics start in A.s (Coulombs).  Divide by 3600 for A.h."
    })

    // updated per completed cycle
    , SK_Key.create({
        key: "lastRunTime", label: "Run Time", units: "s", scale=[0, 150]
        , description: "Runtime of last completed cycle"
        , range: [
            [undefined, 1, "alarm", "Pump run too short (alarm)"]
            , [1, 7, "warn", "Pump run too short"]
            , [7, 30, "nominal"]
            , [7, 60, "normal"]
            , [60, 120, "warn", "Pump run too long"]
            , [120, undefined, "alarm", "Pump run too long (alarm)"]
        ]
    }) , SK_Key.create({
        key: "lastWork", label: "Work", units: "C", scale=[0, 150]
        , description: "Work accomplished in last completed cycle"
        , range: [
            [undefined,AVERAGE_PUMP_CURRENT * 1, "alarm", "Pump run too short (alarm)"]
            , [1 * AVERAGE_PUMP_CURRENT,7 * AVERAGE_PUMP_CURRENT, "warn", "Pump run too short"]
            , [7 * AVERAGE_PUMP_CURRENT,30 * AVERAGE_PUMP_CURRENT, "nominal"]
            , [7 * AVERAGE_PUMP_CURRENT,60 * AVERAGE_PUMP_CURRENT, "normal"]
            , [60 * AVERAGE_PUMP_CURRENT,120 * AVERAGE_PUMP_CURRENT, "warn", "Pump run too long"]
            , [120 * AVERAGE_PUMP_CURRENT, undefined, "alarm", "Pump run too long (alarm)"]
        ]
    })

    //TODO Try to define statistics per last 24h: cycles/, agg runtime, agg work.
    // see what kind of history plots we can generate with KIP first.

]

/**
 * emit SK metadata delta suitable for insertion into baseDeltas.json
 *
 * @export
 * @return {*} 
 */
export function genDelta(basePath) {

    let mv = []

    plugin_keys.forEach(mk => {
        mv.push({ path: `${basePath}.${mk.key}`, value: mk.genMeta() })
    });

    return { context: "vessels.self", updates: [{ meta: [mv] }] }
}


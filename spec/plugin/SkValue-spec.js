// test metaDef.js
// currently very superficial.

//const { newTestPlugin, TestPlugin, RevChron, delay, test_toSec, TIME_PREC, TIME_PREC_MS } = require("../helpers/test-plugin");

const { SkValue } = require('../../SkValue.js');

const exp_keys = {    // key: [hasRange,]
    since: [],
    sinceCycles: [],
    sinceRunTime: [],
    sinceWork: [],
    lastRunTime: [true],
    lastWork: [true],
};


describe("SkValue API", function () {
    it("can be instantiated and persists a mutable value", function () {
        const mk = new SkValue("random_Key", 22);
        expect(mk).toBeTruthy();
        expect(mk.key).toEqual('random_Key');
        expect(mk.value).toEqual(22);
        mk.value = 'argle bargle';
        expect(mk.value).toEqual('argle bargle');
        //const mkm = mk.get_meta();
        expect(mk.value).toEqual('argle bargle');
    });
    it("for use in delta, emits current value as string by default", function () {
        const mk = new SkValue("random_Key", 22);
        expect(mk.toString()).toEqual('22');
        const now = Date.now();
        mk.value = now;
        expect(mk.toString()).toEqual(now.toString());
    });
    it("for use in delta, can transform its value with user-specified function.", function () {
        const mk = new SkValue("random_Key", 22, undefined, v => {
            const nv = 2 * v;
            return `I have been transformed to ${nv}.`
        });
        expect(mk.toString()).toEqual("I have been transformed to 44.");
    });
});

const exp_mykey_meta = {
    label: "myKey label",
    description: "Random my key description",
    units: "s",
    scale: [-100, 100],
    range: []
};

const exp_meta_keys = ['displayName', 'displayScale', 'description', 'zones', 'units']

describe("SkValue metadata API", function () {
    it("generates well-formed metadata", function () {
        const emk = { ...exp_mykey_meta };
        delete emk.scale;
        const v = new SkValue("random_key", 22, emk);
        const mv = v.get_meta();
        expect(new Set(Object.keys(mv))).toEqual(new Set(
            ['displayName', 'description', 'units']));
        expect(mv.displayName).toEqual(exp_mykey_meta.label);
        expect(mv.units).toEqual(exp_mykey_meta.units);
        //expect(mv.displayScale).toEqual({lower: exp_mykey_meta.scale[0], type: 'linear', upper: exp_mykey_meta.scale[1]});
    });
    it("validates the initializer", function () {
        const mi = {label:'foo'}
        expect(()=>{
            return new SkValue('key', 22, {...mi, units:'s', enum:[]});
        }).toThrowError(/.*units or enum.*/);
        expect(()=>{
            return new SkValue('key', 22, {...mi, enum:''});
        }).toThrowError(/.*must be array.*/);
     });

    it("allows enum to be specified", function () {
        const mi = {
            label: 'foo',
            enum: ['first_value', 'second value', 22],
        };
        const v = new SkValue('key', 33, mi);
        const mv = v.get_meta();
        expect(mv.enum).toEqual(mi.enum);
        expect('units' in mv).toBeFalse();

        expect(() => {
            return new SkValue('key', 44, { ...mi, units: 'C' })
        }).toThrowError(TypeError);
    });

    xit("generates consistent zones", function () { 

    });


});


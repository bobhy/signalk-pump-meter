// test metaDef.js
// currently very superficial.

//const { newTestPlugin, TestPlugin, RevChron, delay, test_toSec, TIME_PREC, TIME_PREC_MS } = require("../helpers/test-plugin");

const { random } = require('lodash');
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
    });
    it("for use in delta, emits its .value, as a native value, by default", function () {
        //todo it's ;a,e to have to invoke .value_formatter() conditionally and explicitly -- maybe override .valueOf()?
        //todo but that's hard for initializer to provide closure that references the right 'this'.
        var sv = new SkValue("random_Key", 22);
        expect(sv.valueOf()).toEqual(22);
        sv = new SkValue("random_Key", 22, undefined, v => {
            return `I have been transformed to ${2 * v}.`
        });
        expect(sv.valueOf()).toEqual("I have been transformed to 44.");
    });
});

const exp_mykey_meta = {
    displayName: "myKey label",
    description: "Random my key description",
    units: "s",
    displayScale: [-100, 100],
    zones: []
};

describe("SkValue metadata API", function () {
    it("validates metadata initializer (to a limited extent)", function(){
        expect(() => {
            const sv = new SkValue('key', -2, {bogon: 'random', displayName: 'ok'});
        }).toThrowError(/.*meta key.*/);

        expect(() => {
            const sv = new SkValue('key', -2, {units:'s', enum:['a','b'], displayName: 'ok'});
        }).toThrowError(/.*units and enum.*/);

        expect(new SkValue('key', -2, {description:'random', displayName: 'ok'})).toBeTruthy();
    });

    it("allows enum to be specified", function () {
        const mi = {
            displayName: 'foo',
            enum: ['first_value', 'second value', 22],
        };
        const v = new SkValue('key', 33, mi);
        const mv = v.meta;
        expect(mv.enum).toEqual(mi.enum);
        expect('units' in mv).toBeFalse();
    });

    xit("generates consistent zones", function () { 

    });


});


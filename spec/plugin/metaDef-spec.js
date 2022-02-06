// test metaDef.js

const { newTestPlugin, TestPlugin, RevChron, delay, test_toSec, TIME_PREC, TIME_PREC_MS } = require("../helpers/test-plugin");

const { SK_Key, pluginKeys, genDelta } = require('../../metaDef.js');

const exp_keys = {    // key: [hasRange,]
    since: [],
    sinceCycles: [],
    sinceRunTime: [],
    sinceWork: [],
    lastRunTime: [true],
    lastWork: [true],
};

const exp_mykey_meta = {
    key: "myKey",
    label: "myKey label",
    units: "s",
    description: "Random my key description",
    scale: [-100, 100],
    range: []
};

describe("SK_Key API", function () {
    it("can be instantiated", function () {
        const my_key = SK_Key.create({key:"random_Key", scale: [-1, 1]});
        expect(my_key).toBeTruthy();
        expect(my_key.key).toEqual('random_Key');

    });
    it("generates correct metadata", function () { 
        const my_key = SK_Key.create(exp_mykey_meta);
        const mv = my_key.metaGen();

        expect(my_key.label).toEqual(mv.displayName);
        expect(my_key.description).toEqual(mv.description);
        
    });

});
describe("plugin_keys contents", function () { 
    it("contains keys with the expected names", function(){
        var pk_names = [];
        for (const pk of pluginKeys) {
            pk_names.push(pk.key);
        }
        expect(pk_names).toEqual(Object.keys(exp_keys));
    })
});
describe("genDelta metadata", function () {
    it("has metadata for each key", function () {
        const mva = genDelta('delta_base');
        expect(mva).toBeTruthy();

    });
    xit("provides ranges for certain keys", function () {

    });
});


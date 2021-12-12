// tests for pump meter api

const { TestPlugin } = require("../helpers/test-plugin");

/*
describe("pump meter devices api", function () {
    var firstTestVar = true;
    var secTestVar = false;
    it("ignores extra parameters")
    it("only returns currently active devices")
    it("doesn't blow up if no devices active or defined")
    it("returns all configured and active devices")
    it("returns just a string device ID")
})

describe("pump meter history api", function () {
    const end = new Date(Date.now() - 1000); // one sec ago
    const start = new Date(end - 100 * 1000);   // 100 sec before that

    beforeEach(function () { });       // load some sample values

    it("handles no parameters");

    for ([s, e] of [["argle", end.toString()],
    [start.toString(), "argle"],
    ]) {
        it(`handles non-time params start=${s} and end=${e}`, function () {
            // invoke with [json, status] = invoke(uri, {start: s, end: e})
            status = 505;
            expect(status).toBe(500)
        })
    }
    it("handles non-time params")
    it("returns data for the last 10 sec")
    it("ignores extra parameters if first 2 are good")
}
)
*/
describe("lifecycle of TestPlugin", function () {
    tp = null;

    it("can be instantiated", function () {
        tp = new TestPlugin();
        expect(tp).toBeTruthy();
        expect(tp.plugin).toBeTruthy();
        expect(tp.responses).toEqual([]);
        expect(tp.options.devices[0].name).toEqual('testPluginName');
    });
});

describe("initializes and finalizes OK", function () {
    var p = null;
    it("initializes with expected values", function () { });
    it("finalizes clean", function () { });
});

describe("emits and saves to history expected values - 1 cycle", function () {
    // 3 samples, capture all responses, compare to expected
    // get history, compare to expected history

});

describe("a variety of truthy values continue one 'cycle'.", function(){ });

describe("a variety of falsy values terminate a cycle", function() { });
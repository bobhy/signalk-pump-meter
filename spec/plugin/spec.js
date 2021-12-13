// tests for pump meter api

jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000;

const { propTypes } = require("react-widgets/lib/Calendar");
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
    tp = new TestPlugin();

    it("can be instantiated", function () {
        expect(tp).toBeTruthy();
        expect(tp.plugin).toBeTruthy();
        //expect(tp.responses).toEqual([]); //bugbug sometimes non-empty here!
        expect(tp.options.devices[0].name).toEqual('testPluginName');
    });

    it("can be started, communicated with and stopped OK", async function () {
        expect(tp.app.status).toEqual("Started");
        tp.sendTo(1);
        rsp = await tp.getFrom();
        expect(rsp).toBeTruthy();
        tp.plugin.stop();
        expect(tp.app.status).toEqual("Stopped");   //bugbug this is the wrong place to track plugin status!
    });
});

describe("emits status periodically, even if nothing is changing",  function() {
    tp = new TestPlugin()
    it("generates responses every polling interval period", async function(){
        tp.sendTo(2);
        start = Date.now();
        r1 = await tp.getFrom();
        firstRsp = Date.now();
        r2 = await tp.getFrom();
        secRsp = Date.now();
        expect(firstRsp - start).toBeGreaterThan(1000);
        expect(secRsp - firstRsp).toBeGreaterThan( (tp.options.devices[0].secReportInterval - 1)*1000);
        expect(r1.length).toBeGreaterThanOrEqual(1);
        expect(r2.length).toBeGreaterThanOrEqual(1);

        //bug r2 is empty!
    });


});


describe("emits and saves to history expected values - 1 cycle", function () {
    // 3 samples, capture all responses, compare to expected
    // get history, compare to expected history

});

describe("a variety of truthy values continue one 'cycle'.", function () { });

describe("a variety of falsy values terminate a cycle", function () { });
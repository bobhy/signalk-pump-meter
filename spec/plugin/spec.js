// tests for pump meter api


const { propTypes } = require("react-widgets/lib/Calendar");
//const { PluginDriver } = require("../helpers/plugin-driver");
const {TestPlugin} = require("../helpers/test-plugin");

jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000;

var activeSpecCount = 0;
beforeEach(() => {
    activeSpecCount += 1;
    if (activeSpecCount != 1) {
        console.error(`before spec, expected counter 1, actual ${activeSpecCount}`);
    }
})

afterEach(()=>{
    activeSpecCount -= 1;
    if (activeSpecCount != 0) {
        console.error(`after spec, expected 0, actual ${activeSpecCount}`);
    }
})

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
describe("lifecycle of PumpMeterPlugin", function () {
    var tp = new TestPlugin();

    it("can be instantiated", function () {
        expect(tp).toBeTruthy();
        expect(tp.plugin).toBeTruthy();
        //expect(tp.responses).toEqual([]); //bugbug sometimes non-empty here!
        expect(tp.options.devices[0].name).toEqual('testPluginName');
    });

    it("can be started, communicated with, stopped and restarted OK", async function () {
        expect(tp.app.status).toEqual("Started");
        tp.sendTo(1);
        rsp = await tp.getFrom();
        expect(rsp).toBeTruthy();
        tp.plugin.stop();
        expect(tp.app.status).toEqual("Stopped");
        await expectAsync(tp.getFrom()).toBeRejected();
        tp.plugin.start(tp.options);
        expect(tp.app.status).toEqual("Started");
        rsp = await tp.getFrom();
        expect(rsp.length).toBeGreaterThanOrEqual(1);
    });
});

describe("Steady state behavior when nothing is changing", function () {
    var tp = new TestPlugin();
    it("generates responses every polling interval period", async function () {
        tp.sendTo(0);
        var prev_time = Date.now();
        var prev_rsp = await tp.getFrom();
        const reportIntervalMs = 1000*tp.options.devices[0].secReportInterval;

        for (i=0; i < 5; i++) {
            const cur_time = Date.now();
            const cur_rsp = await tp.getFrom();   // wait for next response
            //not quantifiable! expect(cur_time - prev_time).toBeGreaterThanOrEqual(reportIntervalMs);
            expect(cur_time - prev_time).toBeLessThan(2*reportIntervalMs);
            expect(cur_rsp.length).toBeGreaterThanOrEqual(1);
            expect(cur_rsp.last.cycleCount).toEqual(prev_rsp.last.cycleCount);  // cycle counts and accumulated run times don't chanve
            expect(cur_rsp.last.runTime).toEqual(0);
            expect(cur_rsp.last.lastRunTime).toEqual(prev_rsp.last.lastRunTime);
            // right after start, not stable value?expect(cur_rsp.last.lastRunStart - prev_rsp.last.lastRunStart).toEqual(reportIntervalMs); // but when it last ran is receeding into the past.

            prev_time = cur_time;
            prev_rsp = cur_rsp;

        };
    });
});

describe("Details of emitted statistics", function () {
    var tp = new TestPlugin()
    it("extends current cycle while receiving a run of truthy values", function () { });
    it("terminates the current cycle when receiving a falsey value", function () { });
    it("doesn't extend runTimeMs while receiving falsey values", function () { });
    it("doesn't increment cycleCount till it sees an OFF to ON transition", function () { });
    it("maintains lastRunDate and lastRunTimeMs until it starts a new cycle, then it updates them for the new cycle", function () { });


    it("generates responses every polling interval period", async function () {
        tp.sendTo(2);
        start = Date.now();
        r1 = await tp.getFrom();
        firstRsp = Date.now();
        r2 = await tp.getFrom();
        secRsp = Date.now();
    });
});


describe("emits and saves to history expected values - 1 cycle", function () {
    // 3 samples, capture all responses, compare to expected
    // get history, compare to expected history

});

describe("a variety of truthy values continue one 'cycle'.", function () { });

describe("a variety of falsy values terminate a cycle", function () { });
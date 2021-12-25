// tests for pump meter api

const { propTypes } = require("react-widgets/lib/Calendar");
//const { PluginDriver } = require("../helpers/plugin-driver");
const { TestPlugin, RevChron, delay } = require("../helpers/test-plugin");

const TIME_PREC = 1; // when comparing times, match to within 2 hundredths.  Jasmine *rounds* each value before comparing??!

jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000;

/* debug specs not running sequentialy?
var activeSpecCount = 0;
beforeEach(() => {
    activeSpecCount += 1;
    if (activeSpecCount != 1) {
        console.error(`before spec, expected counter 1, actual ${activeSpecCount}`);
    }
})

afterEach(() => {
    activeSpecCount -= 1;
    if (activeSpecCount != 0) {
        console.error(`after spec, expected 0, actual ${activeSpecCount}`);
    }
})
*/

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

    it("can be instantiated", async function () {
        var tp = new TestPlugin();
        expect(tp).toBeTruthy();
        expect(tp.plugin).toBeTruthy();
        //expect(tp.responses).toEqual([]); //bugbug sometimes non-empty here!
        expect(tp.options.devices[0].name).toEqual('testPluginName');
    });

    it("can be started and starts emitting status", async function () {
        var tp = new TestPlugin();
        expect(tp.app.status).toEqual("Started");
        var rsp = await tp.getFrom();
        expect(rsp).toBeTruthy();
        expect(rsp.length).toBeGreaterThanOrEqual(1);
        expect(rsp.last.status).toEqual("OFFLINE");      //bug -- export pump status constants.
    });

    it("can be stopped and restarted and resumes emitting status", async function () {
        var tp = new TestPlugin();
        tp.plugin.stop();
        expect(tp.app.status).toEqual("Stopped");
        await expectAsync(tp.getFrom()).toBeRejected();
        tp.plugin.start(tp.options);
        expect(tp.app.status).toEqual("Started");
        var rsp = await tp.getFrom();
        expect(rsp.length).toBeGreaterThanOrEqual(1);
        expect(rsp.last.status).toEqual("OFFLINE");      //bug -- export pump status constants.
    });
});

describe("Steady state behavior when nothing is changing", function () {
    it("generates responses every polling interval period describing same last edge", async function () {
        var tp = new TestPlugin();
        tp.sendTo(0);
        const orig_rsp = await tp.getFrom();
        const reportIntervalMs = 1000 * tp.options.devices[0].secReportInterval;
        var prev_time = Date.now();
        var orig_time = prev_time;

        for (var i = 0; i < 5; i++) {
            const cur_rsp = await tp.getFrom();
            const cur_time = Date.now();

            expect(cur_time - prev_time).toBeLessThan(2 * reportIntervalMs);
            expect(cur_rsp.last.lastCycleStart - orig_rsp.last.lastCycleStart).toBeCloseTo((cur_time - orig_time) / 1000, 1);
            expect(cur_rsp.last.cycleCount).toEqual(orig_rsp.last.cycleCount);  // cycle counts and accumulated run times don't chanve
            expect(cur_rsp.last.runTime).toEqual(0);

            prev_time = cur_time;
        };
    });
});

xdescribe("Details of emitted statistics", function () {
    it("extends current cycle and tot run time while receiving a run of truthy values, doesn't extend last run time", async function () {
        //var tp = new TestPlugin();
        tp.sendTo(1);
        var prev_rsp = await tp.getFrom();
        var prev_time = Date.now();
        for (var i = 1; i < 5; i++) {
            tp.sendTo(i);
            var cur_rsp = await tp.getFrom();
            var cur_time = Date.now();
            expect(cur_rsp.last.cycleCount).toEqual(prev_rsp.last.cycleCount);
            expect(cur_rsp.last.runTime - prev_rsp.last.runTime).toBeCloseTo((cur_time - prev_time) / 1000, TIME_PREC);
            expect(cur_rsp.last.curCycleStart - prev_rsp.last.curCycleStart).toBeCloseTo((cur_time - prev_time) / 1000, TIME_PREC);
            expect(cur_rsp.last.lastCycleRunTime).toEqual(prev_rsp.last.lastCycleRunTime);
            expect(cur_rsp.last.lastCycleStart - prev_rsp.last.lastCycleStart).toBeCloseTo((cur_time - prev_time) / 1000, TIME_PREC);

            prev_rsp = cur_rsp;
            prev_time = cur_time;
        }
    });

    it("terminates the current cycle and doesn't extend runtime when receiving a falsey value, doesn't extend runtime ", async function () {
        //var tp = new TestPlugin();
        tp.sendTo(1);
        var prev_rsp = await tp.getFrom();
        var prev_time = Date.now();
        for (var i = 1; i < 5; i++) {
            tp.sendTo(0);
            var cur_rsp = await tp.getFrom();
            var cur_time = Date.now();
            expect(cur_rsp.last.cycleCount).toEqual(prev_rsp.last.cycleCount + 1);
            expect(cur_rsp.last.runTime - prev_rsp.last.runTime).toBeCloseTo((cur_time - prev_time) / 1000, TIME_PREC);
            expect(cur_rsp.last.lastCycleRunTime).toEqual(prev_rsp.lastCycleRunTime);
            expect(cur_rsp.last.lastCycleStart - prev_rsp.last.lastCycleStart).toBeCloseTo((cur_time - prev_time) / 1000, TIME_PREC);

            prev_rsp = cur_rsp;
            prev_time = cur_time;
        }
    });


    it("doesn't increment cycleCount till it sees an OFF to ON transition", function () { });
    it("maintains lastRunDate and lastRunTimeMs until it starts a new cycle, then it updates them for the new cycle", function () { });


    it("generates responses every polling interval period", async function () {
    });
});


xdescribe("emits and saves to history expected values - 1 cycle", function () {
    // 3 samples, capture all responses, compare to expected
    // get history, compare to expected history

});


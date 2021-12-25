// tests for pump meter api

const { propTypes } = require("react-widgets/lib/Calendar");
//const { PluginDriver } = require("../helpers/plugin-driver");
const { TestPlugin, RevChron, delay, toAbsTime } = require("../helpers/test-plugin");

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
        const tp = new TestPlugin();
        expect(tp).toBeTruthy();
        expect(tp.plugin).toBeTruthy();
        //expect(tp.responses).toEqual([]); //bugbug sometimes non-empty here!
        expect(tp.options.devices[0].name).toEqual('testPluginName');
    });

    it("can be started and starts emitting status", async function () {
        const tp = new TestPlugin();
        expect(tp.app.status).toEqual("Started");
        var rsp = await tp.getFrom();
        expect(rsp).toBeTruthy();
        expect(rsp.length).toBeGreaterThanOrEqual(1);
        expect(rsp.last.status).toEqual("OFFLINE");      //bug -- export pump status constants.
    });

    it("can be stopped and restarted and resumes emitting status", async function () {
        const tp = new TestPlugin();
        expect(tp.app.status).toEqual("Started");
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
        const tp = new TestPlugin();
        tp.sendTo(0);
        const orig_rsp = await tp.getFrom();
        const reportIntervalMs = 1000 * tp.options.devices[0].secReportInterval;
        var prev_time = Date.now();
        var orig_time = prev_time;

        for (var i = 0; i < 5; i++) {
            const cur_rsp = await tp.getFrom();
            const cur_time = Date.now();

            expect(cur_time - prev_time).toBeLessThan(2 * reportIntervalMs);
            expect(cur_rsp.last.lastCycleStart - orig_rsp.last.lastCycleStart).toBeCloseTo((cur_time - orig_time) / 1000, TIME_PREC);
            expect(cur_rsp.last.cycleCount).toEqual(orig_rsp.last.cycleCount);  // cycle counts and accumulated run times don't chanve
            expect(cur_rsp.last.runTime).toEqual(0);

            prev_time = cur_time;
        };
    });
});

describe("During run of truthy values", function () {
    it("extends current status duration, but doesn't increase aggregate run time or cycle count", async function () {
        const tp = new TestPlugin();
        tp.sendTo(1);
        var prev_rsp = await tp.getFrom();
        var prev_time = Date.now();
        for (var i = 1; i < 5; i++) {
            tp.sendTo(i);
            tp.sendTo(2);   // just to confirm it doesn't matter how many samples per heartbeat
            var cur_rsp = await tp.getFrom();
            var cur_time = Date.now();
            expect(cur_rsp.last.cycleCount).toEqual(prev_rsp.last.cycleCount);
            expect(cur_rsp.last.runTime).toEqual(prev_rsp.last.runTime);
            expect(cur_rsp.last.statusStart - prev_rsp.last.statusStart).toBeCloseTo((cur_time - prev_time) / 1000, TIME_PREC);

            prev_rsp = cur_rsp;
            prev_time = cur_time;
        }
    });
});

fdescribe("At ON to OFF transition", function () {

    it("increments cyclecount and saves last cycle history.", async function () {
        const tp = new TestPlugin();
        var prev_rsp;

        const pre_on_rsp = await tp.getFrom();

        tp.sendTo(20);
        const at_on_moment = Date.now();

        for (var i = 0; i < 3; i++) {
            tp.sendTo(10);
            prev_rsp = await tp.getFrom();
            expect(toAbsTime(prev_rsp.last.moment, prev_rsp.last.statusStart)).toBeCloseTo(at_on_moment, -3);
        }
        const during_on_rsp = prev_rsp;

        // now terminate this duty cycle with a "0" sample.

        tp.sendTo(0);       // terminate this duty cycle
        const at_off_moment = Date.now();

        // during ON status, the "lastCycle" reported is unchanged.
        expect(pre_on_rsp.last.lastCycleRunTime).toEqual(during_on_rsp.last.lastCycleRunTime);
        expect(toAbsTime(pre_on_rsp.last.moment, pre_on_rsp.last.lastCycleStart)).toBeCloseTo(
            toAbsTime(during_on_rsp.last.moment, during_on_rsp.last.lastCycleStart), -3);

        prev_rsp = await tp.getFrom();
        const at_off_rsp = prev_rsp;

        for (var i = 0; i < 10; i++) {
            if (i > 2)
                tp.sendTo(30);
            else if (i > 6)
                tp.sendTo(0);
            prev_rsp = await tp.getFrom();
        }
        expect(at_off_rsp.last.cycleCount).toEqual(during_on_rsp.last.cycleCount + 1);
        // last cycle was just ended.  That means it *started* when the first OFF to ON was seen,
        // and that its duration was all the time ONs were seen (which is the same duration)
        expect(at_off_rsp.last.lastCycleRunTime).toBeCloseTo((at_off_moment - at_on_moment) / 1000, 1);     // last cycle started when plugin saw first OFF to ON
        expect(toAbsTime(at_off_rsp.last.moment, at_off_rsp.last.lastCycleStart)).toBeCloseTo(at_on_moment, -3)
    });
});

xdescribe("After an ON to OFF followed by a run of falsey values", function () {
    xit("doesn't change cycleCount or ", async function () {
        /*
        expect(during_on_statusStart).toEqual(first_off_cycleStats.cycleRunTime);

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
        */
    });
});


xdescribe("emits and saves to history expected values - 1 cycle", function () {
    // 3 samples, capture all responses, compare to expected
    // get history, compare to expected history

});


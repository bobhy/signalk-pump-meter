// tests for pump meter plugin and basic operation

const { propTypes } = require("react-widgets/lib/Calendar");
//const { PluginDriver } = require("../helpers/plugin-driver");
const { newTestPlugin, TestPlugin, RevChron, delay, test_toSec, TIME_PREC, TIME_PREC_MS } = require("../helpers/test-plugin");

jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000;


describe("lifecycle of PumpMeterPlugin", function () {

    it("can be instantiated", async function () {
        const tp = await newTestPlugin();
        expect(tp).toBeTruthy();
        expect(tp.plugin).toBeTruthy();
        //expect(tp.responses).toEqual([]); //bugbug sometimes non-empty here!
        expect(tp.options.devices[0].name).toEqual('testPluginName');
    });

    it("can be started and starts emitting status", async function () {
        const tp = await newTestPlugin();
        expect(tp.app.status).toEqual("Started");
        var rsp = await tp.getFrom();
        expect(rsp).toBeTruthy();
        expect(rsp.status).toEqual("OFFLINE");      //bug -- export pump status constants.
    });

    it("can be stopped and restarted and resumes emitting status", async function () {
        const tp = await newTestPlugin();
        expect(tp.app.status).toEqual("Started");
        tp.plugin.stop();
        expect(tp.app.status).toEqual("Stopped");
        await expectAsync(tp.getFrom()).toBeRejected();
        tp.plugin.start(tp.options);
        expect(tp.app.status).toEqual("Started");
        var rsp = await tp.getFrom();
        expect(rsp.status).toEqual("OFFLINE");      //bug -- export pump status constants.
    });
});


describe("Behavior while pump not running", function(){
    it("increments time since last run, doesn't change lastRunTime or since statistics ")
});
describe("Behavior when pump starts running and continues to run", function(){
    it("ceases and retains time since last run, doesn't change lastRunTime and increments sinceRunTime");
});
describe("Behavior when pump stops running", function(){
    it("snapshots lastRuntime, increments sinceCycles, then starts incrementing timeSinceLastRun, stops accumulating sinceRunTime")
});
describe("Behavior when pump statistics are reset", function(){
    it("zeros since statistics, updates sinceTime to now");
});

describe("Managing the averages baseline", function(){
    it("trims averages to configured window as it accumulates statistics");
    it("pads average window with configured base value if actual history is too short");
});
xdescribe("Steady state behavior when nothing is changing", function () {
    it("generates responses every polling interval period describing same last edge", async function () {
        const tp = await newTestPlugin();
        tp.sendTo(0);
        const reportIntervalMs = 1000 * tp.options.devices[0].secReportInterval;
        const orig_rsp = await tp.getFrom();
        var prev_time = Date.now();
        var orig_time = prev_time;

        for (var i = 0; i < 5; i++) {
            const cur_rsp = await tp.getFrom();
            const cur_time = Date.now();

            expect(cur_time - prev_time).toBeLessThan(2.1 * reportIntervalMs);  // fudge factor for a few milliseconds difference
            expect(orig_rsp.lastCycleStart).toBeCloseTo(test_toSec(Date.now() - orig_time), TIME_PREC_MS);
            expect(cur_rsp.sinceCycles).toEqual(orig_rsp.sinceCycles);  // cycle counts and accumulated run times don't chanve
            expect(cur_rsp.sinceRunTime).toEqual(0);

            prev_time = cur_time;
        };
    });
});

describe("During run of truthy values", function () {
    it("extends current status duration, but doesn't increase aggregate run time or cycle count", async function () {
        const tp = await newTestPlugin();
        tp.sendTo(1);
        const orig_time = Date.now();
        var prev_rsp = await tp.getFrom();
        var prev_time = Date.now();
        for (var i = 1; i < 5; i++) {
            tp.sendTo(i);
            tp.sendTo(2);   // just to confirm it doesn't matter how many samples per heartbeat
            var cur_rsp = await tp.getFrom();
            var cur_time = Date.now();
            expect(cur_rsp.sinceCycles).toEqual(prev_rsp.sinceCycles);
            expect(cur_rsp.sinceRunTime).toEqual(prev_rsp.sinceRunTime);
            expect(cur_rsp.statusStart).toBeGreaterThan(prev_rsp.statusStart);
            expect(cur_rsp.statusStart).toBeCloseTo(test_toSec(Date.now() - orig_time), TIME_PREC_MS);

            prev_rsp = cur_rsp;
            prev_time = cur_time;
        }
    });
});

describe("At ON to OFF transition", function () {

    it("increments cyclecount and saves last cycle history.", async function () {
        const tp = await newTestPlugin();
        var prev_rsp;

        const pre_on_rsp = await tp.getFrom();

        tp.sendTo(0);       // make sure it's off
        tp.sendTo(20);
        const at_on_moment = Date.now();

        var prev_statusStart = 0;
        for (var i = 0; i < 3; i++) {
            tp.sendTo(10);
            prev_rsp = await tp.getFrom();

            // during ON time, is accumulating current cycle duration in statusStart
            expect(prev_rsp.statusStart).toBeCloseTo(test_toSec(Date.now() - at_on_moment), TIME_PREC_MS);
            prev_statusStart = prev_rsp.statusStart;

            // during ON status, the "lastCycle" reported is unchanged.
            expect(pre_on_rsp.lastCycleRunTime).toEqual(prev_rsp.lastCycleRunTime);
            expect(pre_on_rsp.lastCycleStart).toBeCloseTo(prev_rsp.lastCycleStart, TIME_PREC_MS);
        };

        const during_on_rsp = prev_rsp;

        // now terminate this duty cycle with a "0" sample.

        tp.sendTo(0);       // terminate this duty cycle
        const at_off_moment = Date.now();
        const at_off_rsp = await tp.getFrom();

        expect(at_off_rsp.sinceCycles).toEqual(during_on_rsp.sinceCycles + 1);
        expect(at_off_rsp.sinceCycles).toEqual(pre_on_rsp.sinceCycles + 1);

        // last cycle was just ended.  That means it *started* when the first OFF to ON was seen,
        // and that its duration was all the time ONs were seen (which is the same duration)
        expect(at_off_rsp.lastCycleRunTime * 1000 - (at_off_moment - at_on_moment)).toBeLessThan(510);     // last cycle started when plugin saw first OFF to ON
        expect(at_off_rsp.lastCycleStart).toBeCloseTo(test_toSec(Date.now() - at_on_moment), TIME_PREC_MS)
    });
});


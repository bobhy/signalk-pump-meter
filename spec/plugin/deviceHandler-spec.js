// tests for pump meter plugin and basic operation

const { runScenario, newTestPlugin, TestPlugin, delay, test_toSec, TIME_PREC, TIME_PREC_MS } = require("../helpers/test-plugin");
const { DeviceStatus } = require("../../DeviceHandler");

jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000;

const expKeys = ['status', 'since', 'sinceCycles', 'sinceRunTime', 'lastRunTime', 'lastOffTime', 'timeInState'];

describe("lifecycle of PumpMeterPlugin", () => {

    it("can be instantiated", async function () {
        const tp = await newTestPlugin();
        expect(tp).toBeTruthy();
        expect(tp.plugin).toBeTruthy();
        //expect(tp.responses).toEqual([]); //bugbug sometimes non-empty here!
        expect(tp.options.devices[0].name).toEqual('testPluginName');
    });

    it("emits full meta on initial startup", async () => {
        const tp = await newTestPlugin();
        expect(tp.app.status).toEqual("Started");
        var rsp = await tp.getFullMetaFrom(true);
        expect(rsp).toBeTruthy();
        expect(Object.keys(rsp.meta).length).toBe(expKeys.length);
        for (var k of expKeys) {
            expect(k in rsp.meta).toBeTrue();
        }
    });

    it("can be started and starts emitting status", async () => {
        const tp = await newTestPlugin();
        expect(tp.app.status).toEqual("Started");
        var rsp = await tp.getFrom(true);
        expect(rsp).toBeTruthy();
        expect(rsp.values.status).toEqual("OFFLINE");      //bug -- export pump status constants.
    });

    it("can be stopped and restarted and resumes emitting status", async function () {
        const tp = await newTestPlugin();
        expect(tp.app.status).toEqual("Started");
        tp.plugin.stop();
        expect(tp.app.status).toEqual("Stopped");
        await expectAsync(tp.getFrom()).toBeRejected();
        tp.plugin.start(tp.options);
        expect(tp.app.status).toEqual("Started");
        var rsp = await tp.getFrom(true);
        expect(rsp.values.status).toEqual("OFFLINE");      //bug -- export pump status constants.
    });
});

describe("Behavior of since* statistics", () => {
    it("sinceRuntime increments whenever pump is running", async () => {
        var rsp1;
        const tp = await newTestPlugin();
        rsp1 = await tp.getFrom(true);
        expect(rsp1.values.sinceRunTime).toBe(0);

        tp.sendTo(0);
        rsp1 = await tp.getFrom();
        expect(rsp1.values.sinceRunTime).toBe(0);

        tp.sendTo(100);
        await delay(10);
        rsp1 = await tp.getFrom();
        expect(rsp1.values.sinceRunTime).toBeGreaterThan(0.010);

        tp.sendTo(10);
        await delay(10);
        var rsp2 = await tp.getFrom();
        expect(rsp2.values.sinceRunTime).toBeGreaterThan(0.020);

    });

    it("since doesn't change, except after reset.  Reset zeros sinceCycles and sinceRunTime, too.", async () => {
        var rsp1;
        var t1 = new Date();
        const tp = await newTestPlugin();
        rsp1 = await tp.getFrom(true);
        expect(Math.abs(rsp1.values.since - t1)).toBeLessThan(tp.reportMs);

        tp.sendTo(20);      // start runtime incrementing
        await delay(10);
        tp.sendTo(20);      // start runtime incrementing
        await delay(10);
        var rsp2 = await tp.getFrom();
        expect(rsp2.values.sinceCycles).toBe(0);    // no falling edge yet
        expect(rsp2.values.sinceRunTime).toBeGreaterThan(0.010);   // +/- heartbeat period

        tp.sendTo(0);       // falling edge
        await delay(2);
        var rsp3 = await tp.getFrom();
        expect(rsp3.values.sinceCycles).toBe(1);
        expect(rsp3.values.since).toBe(rsp1.values.since);

        var t4 = new Date();
        tp.plugin.getHandler(tp.deviceName).readings.resetSince(t4) // somehow reset counts

        var rsp4 = await tp.getFrom(true);
        expect(rsp4.values.sinceCycles).toBe(0);
        expect(rsp4.values.since - t4).toBeCloseTo(0);
        expect(rsp4.values.sinceRunTime).toBe(0);

    });
    it("sinceCycles is incremented on the falling edge, is constant otherwise.", async () => {
        const tp = await newTestPlugin();

        for (var i = 0; i < 10; i++) {
            tp.sendTo(1); // start a cycle.        
            await delay(10);    // let cycle run just a little bit
            var rsp1 = await tp.getFrom();

            tp.sendTo(0);
            await delay(10);
            var rsp2 = await tp.getFrom();

            expect(rsp2.values.sinceCycles - rsp1.values.sinceCycles).toBe(1);
        };
    });
});

describe("Behavior of last* statistics", () => {
    it("lastRuntime is latched on falling edge, doesn't change otherwise.", async () => {
        const tp = await newTestPlugin();
        var t = await tp.getFrom(true);

        var last_key_rsp;

        for (var s of [0, 0, 0]) {
            tp.sendTo(s);
            var rsp = await tp.getFrom(); // drain queue of deltas.
        };

        for (var i = 0; i < 3; i++) {       // 1st run collects values used by 2nd; 2nd informs the 3rd

            var rsp1;
            const ones = (i % 2 == 0) ? [1] : [1, 1, 1, 1, 1];

            // prime with run of ones
            for (var s of ones) {
                tp.sendTo(s);
                const rsp = await tp.getFrom(); // drain queue of deltas.
                if (last_key_rsp) {
                    expect(rsp.values.lastRunTime).toBe(last_key_rsp.values.lastRunTime);  // not changing during run time
                }
            };

            // latch new value with a single ping

            tp.sendTo(0);
            rsp1 = await tp.getFrom();  // new off time
            if (last_key_rsp) {
                expect(rsp1.values.lastRunTime).not.toBe(last_key_rsp.values.lastRunTime);  // did change on the ON to OFF transition
            }

            for (var s of [0, 0, 0]) {
                tp.sendTo(s);
                var rsp = await tp.getFrom(); // drain queue of deltas.
                expect(rsp.values.lastRunTime).toBe(rsp1.values.lastRunTime);   // not changing during off time
            };

            last_key_rsp = rsp1; // save these results for next iteration
        };
    });

    it("lastOfftime measures previous OFF time, is latched on rising edge, but doesn't increment while OFF.", async () => {
        const tp = await newTestPlugin();
        var t = await tp.getFrom(true);

        var last_key_rsp;

        for (var s of [1, 1, 1]) {
            tp.sendTo(s);
            var rsp = await tp.getFrom(); // drain queue of deltas.
        };

        for (var i = 0; i < 3; i++) {       // first loop informs the 2nd; the 2nd, the third.

            var rsp1;
            const zeros = (i % 2 == 0) ? [0] : [0, 0, 0, 0, 0];

            // prime with run of zeros
            for (var s of zeros) {
                tp.sendTo(s);
                const rsp = await tp.getFrom(); // drain queue of deltas.
                if (last_key_rsp) {
                    expect(rsp.values.lastOffTime).toBe(last_key_rsp.values.lastOffTime);  // not changing during off time
                }
            };

            // latch new value with a single ping

            tp.sendTo(1);
            rsp1 = await tp.getFrom();  // new off time
            if (last_key_rsp) {
                expect(rsp1.values.lastOffTime).not.toBe(last_key_rsp.values.lastOffTime);
            }

            for (var s of [1, 1, 1]) {
                tp.sendTo(s);
                var rsp = await tp.getFrom(); // drain queue of deltas.
                expect(rsp.values.lastOffTime).toBe(rsp1.values.lastOffTime);
            };

            last_key_rsp = rsp1; // save these results for next iteration
        };
    });
});

describe("Behavior of current* statistics", () => {
    it("status is always STOPPED, RUNNING or OFFLINE, responds immediately to state changes.", async () => {
        const tp = await newTestPlugin();

        var rsp;

        rsp = await tp.getFrom(true);
        expect(rsp.values.status).toBe(DeviceStatus.OFFLINE.toString());

        tp.sendTo(1);
        rsp = await tp.getFrom();
        expect(rsp.values.status).toBe(DeviceStatus.RUNNING.toString());

        tp.sendTo(0);
        rsp = await tp.getFrom();
        expect(rsp.values.status).toBe(DeviceStatus.STOPPED.toString());


        tp.plugin.getHandler(tp.deviceName).deviceConfig.secTimeout = 1;        // this business of accessing deviceHandler options is getting wierd!

        await delay(1500);
        rsp = await tp.getFrom(true);
        expect(rsp.values.status).toBe(DeviceStatus.OFFLINE.toString());

    });
    it("timeInState is reset when device changes state, increments till next.", async () => {
        const tp = await newTestPlugin();

        var rsp;
        var prev_rsp;

        await delay(300);
        rsp = await tp.getFrom(true);
        expect(rsp.values.status).toBe(DeviceStatus.OFFLINE.toString());
        expect(rsp.values.timeInState).toBeGreaterThanOrEqual(0.3);

        tp.sendTo(1);
        prev_rsp = rsp;
        rsp = await tp.getFrom();
        expect(rsp.values.status).toBe(DeviceStatus.RUNNING.toString());
        expect(rsp.values.timeInState).toBeLessThan(prev_rsp.values.timeInState);
        await delay(200);
        rsp = await tp.getFrom(true);
        rsp = await tp.getFrom(true);   // something hacky here -- delay(200) only delays 0.105 sec (sometimes?)
        expect(rsp.values.timeInState).toBeGreaterThanOrEqual(0.2);

        tp.sendTo(0);
        prev_rsp = rsp;
        rsp = await tp.getFrom();
        expect(rsp.values.status).toBe(DeviceStatus.STOPPED.toString());
        expect(rsp.values.timeInState).toBeLessThan(prev_rsp.values.timeInState);
        await delay(550);
        rsp = await tp.getFrom(true);
        expect(rsp.values.timeInState).toBeGreaterThanOrEqual(0.5); // delay can be short by 50ms.


        tp.plugin.getHandler(tp.deviceName).deviceConfig.secTimeout = 1;        // this business of accessing deviceHandler options is getting wierd!

        await delay(1500);
        rsp = await tp.getFrom(true);
        expect(rsp.values.status).toBe(DeviceStatus.OFFLINE.toString());

    });

});




xdescribe("Managing the averages baseline", function () {
    it("trims averages to configured window as it accumulates statistics");
    it("pads average window with configured base value if actual history is too short");
});







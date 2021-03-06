// tests for pump meter history recording and api

const { newTestPlugin, TestPlugin, delay, TIME_PREC, TIME_PREC_MS } = require("../helpers/test-plugin");
const { DeviceReadings, xsave, xrestore } = require("../../DeviceHandler");
const CircularBuffer = require('circular-buffer');
const fs = require('fs');

jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000;

//todo: rethink storing cycles.date as a string(date). It's really awkward to test, probably is hard to use, too.

describe("History API", function () {
    beforeEach(async function () {
        // set up a canned history and attach it to a test plugin.  Return various useful parts in `this`
        this.tp = await newTestPlugin();
        this.mockHistLen = 19;      // # actual dummy entries.  Buffer is bigger (by 1)

        this.mockCb = new CircularBuffer(this.mockHistLen + 1);

        // prefill history with N entries, each an hour apart, value is # hours before current time.

        const endVal = Date.now();
        const startVal = endVal - this.mockHistLen * 3600 * 1000;
        for (var i = 0; i < this.mockHistLen; i++) {
            this.mockCb.push({ date: (new Date(startVal + i * 3600 * 1000)).toISOString(), runSec: i });    //<date> <num hrs from startVal>
        };

        this.expectedRet = this.mockCb.toarray();

        this.tp.plugin.getHandler(this.tp.deviceName).readings.cycles = this.mockCb;  // monkey patch known history

    });
    it("Validates parameters", function () {
        var retVal;

        // various ill formed requests
        retVal = this.tp.getHistory("foo");
        expect(retVal.status).toEqual(400);
        expect(retVal.msg).toContain("invalid date range");

        retVal = this.tp.getHistory(0, "bar");
        expect(retVal.status).toEqual(400);
        expect(retVal.msg).toContain("invalid date range");
    });

    it("Defaults start or end if not provided", function () {

        retVal = this.tp.getHistory();
        expect(retVal).toEqual(this.expectedRet)
        //expect(retVal.length).toEqual(this.expectedRet.length);
        //for (var i = 0; i < this.expectedRet.length; i++) {
        //    expect(retVal[i]).toEqual(this.expectedRet[i]);
        //}
    });

    it("Can convert numbers and wellformed strings to dates", function () {

        // can convert string date
        const rv1 = this.tp.getHistory(this.expectedRet[0].date,);
        //Date.toString truncates milliseconds, so need to pad end range below.
        const rv2 = this.tp.getHistory(0, this.expectedRet[this.mockHistLen - 1].date);
        expect(rv1).toEqual(rv2);

        // non-wellformed strings don't work.
        const bad_date = this.expectedRet[this.mockHistLen - 1].date.toString().replace("Z", "XYZ");
        const rv3 = this.tp.getHistory(0, bad_date);
        expect(rv3.status).toEqual(400);
    });

    it("Enforces both start and end limits", function () {
        const start = new Date((new Date(this.expectedRet[3].date) - 30 * 1000));   // test data is 1 hr apart
        const end = new Date((new Date(this.expectedRet[6].date).valueOf() + 20 * 1000));     // use start just before d/t one item and end just after d/t of another.
        const rv4 = this.tp.getHistory(start, end);
        expect(rv4).toEqual(this.expectedRet.slice(3, 7));
    });


});

describe("Live history accumulation", function () {
    beforeEach(async function () {
        // set up a canned history and attach it to a test plugin.  Return various useful parts in `this`
        this.tp = await newTestPlugin();
        this.mockHistCap = 10;

        this.mockCb = new CircularBuffer(this.mockHistCap);
        
        this.tp.plugin.getHandler(this.tp.deviceName).readings.cycles = this.mockCb;  // monkey patch known history

        this.addCycles = async (numCycles) => {
            this.tp.sendTo(0);
            for (var i = 0; i < numCycles; i++) {
                this.tp.sendTo(i + 1);
                var d = await this.tp.getFrom();
                await delay(5);
                this.tp.sendTo(0);
                d = await this.tp.getFrom();
            }
        };
    });

    it("Records completed duty cycles", async function () {
        const desiredCycles = Math.floor(this.mockCb.capacity() / 2);
        const orig_size = this.mockCb.size();   // current size including dummy initial cycles

        await this.addCycles(desiredCycles);

        const rv = this.tp.getHistory();
        expect(rv.length).toEqual(orig_size + desiredCycles);

        var prev_cycle = rv[0];
        for (var cur_cycle of rv.slice(1)) {
            expect(prev_cycle.date).toBeLessThan(cur_cycle.date);
            expect(cur_cycle.runSec).toBeGreaterThan(0);
            prev_cycle = cur_cycle;
        }
    });

    it("Drops the oldest item when wrapping", async function () {
        await this.addCycles(this.mockCb.capacity() - this.mockCb.size() - 1);
        const rv1 = this.tp.getHistory();
        await this.addCycles(3);        // first cycle fills buffer, next 2 cause oldest 2 to be dropped.
        const rv2 = this.tp.getHistory();
        const stillValid = rv2.length - 2;
        // test can be falsified  rv2[4] = {date:Date.now(), runSec:NaN}; // botch one value, see if test fails.
        expect(rv1.slice(2)).toEqual(rv2.slice(0, stillValid - 1));
    });
});

describe("Saving and restoring history to disk", function () {
    beforeEach(async function () {
        // set up a canned history and attach it to a test plugin.  Return various useful parts in `this`
        this.tp = await newTestPlugin();
        this.curDh =  this.tp.plugin.getHandler(this.tp.deviceName);

        this.mockHistCap = 10;
        this.mockCb = new CircularBuffer(this.mockHistCap);
        this.mockCb.push({ date: Date.now() - 1000, runSec: 0 });       // .deltaValues() presumes there's always at least one cycle in history.
        this.curDh.readings.cycles = this.mockCb;  // monkey patch known history

        this.addCycles = async (numCycles) => {
            for (var i = 0; i < numCycles; i++) {
                this.tp.sendTo(i + 1);
                var d = await this.tp.getFrom();
                this.tp.sendTo(0);
                d = await this.tp.getFrom();
            }
        };

        this.cleanSavedFile = () => {

        }
    });

    it("saves current context on demand", async function () {
        
        const tp = await newTestPlugin();
        expect(tp.deviceHandler.readings.cycles.size()).toBe(0);
        const ADDED_CYCLES = 8; // must be less than config of 10
        await tp.addCycles(ADDED_CYCLES);       // 
        expect(tp.deviceHandler.readings.cycles.size()).toBe(ADDED_CYCLES);
        DeviceReadings.save(tp.deviceHandler.readings, tp.deviceHandler.historyPath);
        const oldSave = JSON.parse(fs.readFileSync(tp.deviceHandler.historyPath));      // read and parse history
        expect(oldSave.cycles.length).toBe(ADDED_CYCLES);

        var foo;
        foo = DeviceReadings.restore(tp.deviceHandler.historyPath, tp.deviceHandler.deviceConfig);

    });
    it("loads old history from disk, if found", async function () {
        var t = 1;

    });

    xit("periodically checkpoints running history to disk", async function () {

    });

    xit("handles various kinds of data corruption when reloading from disk", async function () {

    });


});




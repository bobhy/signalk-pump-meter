const { newTestPlugin, TestPlugin, delay, TIME_PREC, TIME_PREC_MS } = require("../helpers/test-plugin");
jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000;


describe("verify sendTo / getFrom protocol used for testing synchronization", function () {
    it("times out if waiting for sendTo and none is executed.", async function () {
        const tp = await newTestPlugin();           // no updates yet.

        var first_rsp = await expectAsync(tp.getFrom()).toBeRejectedWithError('timed out waiting for a response from plugin');
    });

    it("waits for next delta even when not waiting for a sendTo.  Doesn't return same delta twice.", async function () {
        const tp = await newTestPlugin();           // no updates yet.

        var prev_rsp = await tp.getFrom(true);      // doesn't throw, and returns a delta
        expect(prev_rsp).toBeTruthy();

        var cur_rsp = await tp.getFrom(true);       // still doesn't throw, and returns a new delta
        expect(cur_rsp.timestamp).toBeGreaterThan(prev_rsp.timestamp);
    });

    it("waits for the sendTo when noWaitForNewSample is falsey (default)", async () => {
        const tp = await newTestPlugin();           // no updates yet.

        var rsp = await tp.getFrom(true);      // doesn't throw, and returns a delta
        expect(rsp).toBeTruthy();

        rsp = await expectAsync(tp.getFrom()).toBeRejectedWithError('timed out waiting for a response from plugin');

        tp.sendTo(0);
        tp.sendTo(0);

        rsp = await tp.getFrom();      // get delta after first send
        expect(rsp.sendTo_seqNum).toBe(2);      // test based on internal details: sendTo_seqNum is incremented *before* use, is 1-origin.
        expect(tp.sendTo_seqNum).toBeLessThanOrEqual(rsp.sendTo_seqNum);
        expect(tp.responses[0]).toBeUndefined();
        // having fetched a delta representing latest send, won't return another
        // delta for same sendTo.  (noWaitForSample == false,...) Insists on another send.
        //var cur_rsp = await tp.getFrom();
        var cur_rsp = await expectAsync(tp.getFrom()).toBeRejectedWithError('timed out waiting for a response from plugin');
        expect(cur_rsp).toBeFalsy();

        tp.sendTo(0);
        expect(tp.sendTo_seqNum).toBe(rsp.sendTo_seqNum+1);
        var cur_rsp = await tp.getFrom();      // get delta after first send
        expect(cur_rsp.sendTo_seqNum).toBe(3);

    });
    it("can fetch meta or values selectively", async () => {
        const tp = await newTestPlugin();

        tp.sendTo(0);        // get something going

        for (var i = 0; i < 5; i++) {
            const rsp = await tp.getFullMetaFrom(true);
            expect('meta' in rsp).toBeTrue();
            expect('since' in rsp.meta).toBeTrue(); // only in full meta
            expect(Object.keys(rsp.meta).length).toBeGreaterThan(3);
            expect('values' in rsp).toBeFalse();
        }
        expect(tp.responses[0]).toBeDefined();      // meaning I got meta even though values were pending.

        for (var i = 0; i < 5; i++) {
            const rsp = await tp.getMetaFrom(true);
            expect('meta' in rsp).toBeTrue();
            expect('values' in rsp).toBeFalse();
            expect('lastOffTime' in rsp.meta).toBeTrue();
            expect(Object.keys(rsp.meta).length).toBeLessThan(3);
        }
        expect(tp.responses[0]).toBeDefined();      // meaning I got meta even though values were pending.

        for (var i = 0; i < 5; i++) {
            const rsp = await tp.getFrom(true);
            expect('values' in rsp).toBeTrue();
            expect('meta' in rsp).toBeFalse();
            expect('status' in rsp.values).toBeTrue();
        }

    });
});
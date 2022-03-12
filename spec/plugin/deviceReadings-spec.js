const { delay, TIME_PREC, TIME_PREC_MS } = require("../helpers/test-plugin");
const { DeviceReadings } = require("../../DeviceHandler");
const { SkValue } = require("../../SkValue");
const CircularBuffer = require('circular-buffer');
const fsa = require('fs/promises');
const tmp = require('tmp');
tmp.setGracefulCleanup();   //todo how to make the tmp files disappear??

jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000;

describe("DeviceReadings save/restore behavior", function () {
    beforeEach( async () => {
        // 'this' is context of describe
        this.dataPath = tmp.dirSync().name;       // create temp directory and return name
        this.config = {historyCapacity: 10}
    });
        
    it("saves relevant properties to disk", async () => {
        // 'this' is context of describe
        const keysList = ['cycles', 'sinceCycles', 'sinceRunSec', 'cycles'];

        const fileList = await fsa.readdir(this.dataPath);
        expect(fileList.length).toBe(0);

        const dr1 = new DeviceReadings(this.config);
        
        dr1.since.value = (new Date()).toISOString();
        dr1.sinceCycles.value = 99;
        dr1.sinceRunTime.value = 10000;

        const startTime = new Date() - 10 * 1000;       // create 10 seconds worth of runtime history
        for(var t = startTime; t - startTime < 10 * 1000; t += 1000) {
            dr1.cycles.push({date: (new Date(t)).toISOString(), runSec: (t - startTime)/1000});
        }     

        const saveFile = `${this.dataPath}/dr.json`;
        DeviceReadings.save(dr1, saveFile);

        const ser_dr1 = JSON.parse(await fsa.readFile(saveFile));       // is the data stored on disk sane?
        const sk = Object.keys(ser_dr1);
        for (const k of ['since', 'sinceCycles', 'sinceRunTime']) {
            expect(sk).toContain(k);
        }
        expect(sk).not.toContain('status');
        

        const dr2 = DeviceReadings.restore(saveFile, this.config);

        expect(dr1.cycles).toEqual(dr2.cycles);
        for (const k of ['since', 'sinceCycles', 'sinceRunTime']) {
            expect(dr1[k].value).toEqual(dr2[k].value);
        }


        var t = 1;

    });
    xit("restores a new, empty instance when there is nothing to restore on disk, doesn't error out.", async () => {
        // 'this' is context of describe

    });
});

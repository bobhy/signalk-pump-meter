const Bacon = require('baconjs');

class MockStreambundle {

    constructor() {
        this._selfBus = {}
    }

    getSelfBus(path) {
        var bus = this._selfBus[path];
        if (!bus) {
            bus = new Bacon.Bus();
            this._selfBus[path] = bus;
        }
        return bus;
    }

    getSelfStream(skPath) {
        var bus = this.getSelfBus(skPath);
        const vv = bus.map(".value");
        return vv;

    }

    pushMockValue(path, value) {
        var bus = this.getSelfBus(path);
        bus.push(value);
    }

}


class MockApp {

    constructor(dataDir) {
        this._dataDir = dataDir;
        this.streambundle = new MockStreambundle();
        this.status = "constructed";
    }

    debug(output) {
        //todo define switch to enable verbose logging from mocks?
        // console.debug(output);
    }

    getDataDirPath() {
        return this._dataDir;
    }

    handleMessage(id, delta) { //todo capture this for unit test
        this.debug(`\nSignalK from ${id}:\n${JSON.stringify(delta, null, 2)}\n`)
    }

    setPluginStatus(msg) {
        this.status = msg;
        this.debug(`Plugin status: ${msg}`);
    }
}

module.exports = {
    MockStreambundle,
    MockApp
};

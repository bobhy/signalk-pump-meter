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
        return bus.map(".value");

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
    }

    debug(output) {
        console.log(output);
    }

    getDataDirPath() {
        return this._dataDir;
    }

    handleMessage(id, delta) { //todo capture this for unit test
        console.log(`\nSignalK from ${id}:\n${JSON.stringify(delta, null, 2)}\n`)
    }

    setProviderStatus(msg) {
        console.log(`Plugin status: ${msg}`);
    }

    setPluginStatus(msg) {
        console.log(`Plugin status: ${msg}`);
    }
}

module.exports = {
    MockStreambundle,
    MockApp
};

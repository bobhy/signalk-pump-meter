//fixme revisit to generate a good test history
const Plugin = require('./index.js');
const MockApp = require('./mocks.js').MockApp;


(function() {

    const pluginMonitorPath = "electrical.battery.253.current";
    const pluginStatsPath = "electrical.battery.252";
    const pluginDeviceName = "pump_metxx";

    const dataPath = "mockdir/signalk/data";

    var app = new MockApp(dataPath)

    var plugin = new Plugin(app);

    var options = {
       devices: [
            {
                name: pluginDeviceName,
                skMonitorPath: pluginMonitorPath,
                skRunStatsPath: pluginStatsPath,
                secTimeout: 5,
                secResume: 15,
                offsetHours: 2989.9,
                secReportInterval: 3
            }
       ]
    };

    plugin.start(options);


    var simTimer;

    function startGenSim() {
        console.log(`Starting ${pluginDeviceName} sim`);

        simTimer = setInterval(function() {
            app.streambundle.pushMockValue(pluginMonitorPath, { value: 325.7 });
        }, 2000);


        setTimeout(function() {
            clearInterval(simTimer);
        }, 17000);

        setTimeout(endGenSim, 29000);
    }


    function endGenSim() {
        console.log('Runtime history: ');
        var history = plugin.getHandler(pluginDeviceName).getHistory();
        console.log(JSON.stringify(history, null, 2));

        console.log('Stopping...');
        plugin.stop();
        console.log('Stopped');
        process.exit(0);
    }

    setTimeout(startGenSim, 5000);

})();

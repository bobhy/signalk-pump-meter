# SignalK-Pump-Meter
SignalK Pump Meter is a plugin and corresponding Webapp for the [SignalK Node Server](https://github.com/SignalK/signalk-server-node) that monitors
the device cycle count and run time of devices on your boat by watching for related SignalK data that indicates the device is currently on.  For example, if you are reporting amperage to your bilge pump at `electrical.batteries.254.current`, this plugin can generate and track `electrical.batteries.254.cycleCount` and `electrical.batteries.254.runtime` (and related statistics) based on on-off transitions.  These statistics are  emitted periodically and also stored in a session history which can be fetched using a JSON API.

Included in this project is a simple Webapp which can display the accumulated session history.  It is more a test tool than usable gauge: you must click a button to get an update.

This code is heavily based on [signalk-pump-meter](https://github.com/joelkoz/signalk-pump-meter) by JoelKoz, credit where credit is due.

## How it works
You configure the plugin to monitor a signal value from the device to be monitored.  This value can be an on/off or a numeric value such as voltage or current, so long as it falls to zero when the device is off.  There is a timeout as well, and the device is considered off no signal values are received within that timeout.

The plugin generates runtime statistics based on transitions in the signal value:
* session start -- how long ago the current data session started.  The rest of the statistics are accumulated over the current session.  
* run time -- how long the device has been ON during the current session.
* cycle count -- how many OFF->ON transitions have been seen.
* last run time -- now long the device ran during the most recent cycle in the session.
* last run start -- how long ago the most recent cycle ended (the ON->OFF transition).

In addition, the plugin can optionally generate a device status to report whether the device was last seen ON, OFF or incommunicato. 

## Configuration
To configure a new device, select `Server -> Plugin Config -> pump meter` from the node server menu. To add a new device definition, press the blue **+** button.  You can define more than one device if you would like. Simply repeat this step for each device you want to track.

The `Device name` is both a name you make up for the device, as well as an identifier used for the device in the Json API to retrieve history
reports via software. You can include spaces and punctuation
in the device name if you wish (they will be removed to create the device identifier), but once you set the name and start collecting data, do not
change it.  The device identifier, which is derived from the `Device name` is also used for the file name for the history storage.  Changing the name will cause a new history file to be created, losing all your previous data.

The `SignalK value that indicates device is on` is the SignalK path that is monitored by the plugin to determine if the device is on. This
value should already be created and reported by some other component of your system

The `SignalK timeout (secs)` is the number of seconds of "data silence" the pump meter plugin should tolerate before assuming the device has
been turned off.  The smaller this number, the quicker the plugin can determine the device has actually been turned off. However, you don't want
it so small that the plugin starts reporting sporadic 'on/off/on' situations.  The default value of 30 seconds is usually a good number.

The `SignalK path to output pump meter data` indicates the SignalK path the plugin will use to report total "life to date" run time. Note
that the existing SignalK specification already has definitions for many paths you may want to use.  They all end in `runTime`, so if
you do end up making up a new path, ending the name in `runTime` will at least stay consistent.  If you leave this field blank, no run time
data will be reported on the SignalK stream.  The plugin will still log run history, and can still report the status (below) if that path
is defined.

The `SignalK path to output device status` is used to report "ON" or "OFF" on the SignalK data stream.  If you do not want this report,
leave this field blank.

The `pumps already on device` allows you to enter a starting pump count for the device. This is useful if you have an analog pump meter
on the device you can take a reading off of.  You can periodically adjust this value if the reported pumps starts to drift from the
actual pumps.  The pump meter plugin always reports total run time as "monitored run time plus pumps already on device", so changing
this value after run time data has already recorded will in fact change the pumps reported.

The `Reporting interval (secs)` indicates how often the run time and/or status will be sent over the SignalK data stream when the
device is on.

## Reviewing the Data
The pump Meter plugin installs a simple Webapp interface that allows you to review the data it has recorded. You can
view this data in a web browser using the path `/signalk-pump-meter`.  For example:

```
http://my-server.local/signalk-pump-meter
```

It is also available to be selected from the *Webapps* menu option of the Node Server.

## API
You can also retrieve data using one of the two following API calls:

### Get device list
```
http://my-server.local/plugins/signalk-pump-meter/api/devices
```

will return a json array of the device Ids that are defined.

### Get device history
```
http://my-server.local/plugins/signalk-pump-meter/api/history/<deviceId>
```

where `<deviceId>` is one of the ids returned by the `/plugins/api/devices` call.  The `/plugins/api/history/<deviceId>` allows for
two optional `start` and `end` query parameters that lets you retrieve a small subset of history items:


Example:
```
http://my-server.local/plugins/signalk-pump-meter/api/history/portEngine?start=2019-10-01&end=2019-11-01
```

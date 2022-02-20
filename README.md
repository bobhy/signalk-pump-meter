# SignalK-Pump-Meter
SignalK Pump Meter is a plugin and corresponding Webapp for the [SignalK Node Server](https://github.com/SignalK/signalk-server-node) that monitors on / off signals from a device on your network and reports
the corresponding run time and duty cycle count of the device. For example, and this is the primary use case, if you are already monitoring the amperage consumed by a bilge pump, this plugin can generate and record pump runtime and count duty cycles. These statistics are emitted periodically and also stored in a session history which can be fetched using a JSON API.

Included in this project is a simple Webapp which can display the current statistics and accumulated session history.  It is more a test tool than usable gauge: you must click a button to see the numbers change.

NOTE:  The plugin is a Work In Progress (tm), see [below](#work-in-progress)

This code is heavily based on [signalk-hour-meter](https://github.com/joelkoz/signalk-hour-meter) by JoelKoz, credit where credit is due.


## Configuration
Install the plugin from the SignalK Store.

The plugin can be configured to monitor multiple devices and these are independent of each other.

From the SignalK node server menu, select `Server -> Plugin Config -> Pump meter`.
To add a new device definition, press the blue **+** button and fill in the following fields:

`Pump name`
This is a user-assigned name for the device, used to report statistics and as the target of the JSON API and history storage.  The name must be unique on your network.  If it is changed after you've accumulated some history, the old history will be forgotten and your statistics will be restarted from zero.

`SignalK value that indicates pump is on`
is the SignalK path that the plugin monitors to determine if the device is on. The Pump Meter plugin *listens* for a value on this path: something else in your network should be generating it.  Any non-zero numeric value or non-empty string is interpreted to mean the device is currently ON.  A zero value or empty string indicates the device is OFF.

`SignalK path under which to report pump run data`
Is the parent path of all the statistics reported by the plugin.  If you leave the configured value blank (the default), statistics will be reported under `Pump name`.  For example, if `Pump name` is configured as `BilgePump.1`, runtime statistics will be reported on SignalK path `BilgePump.1.since`, `BilgePump.1.sinceCycles` and so on (see complete list below. Note that `SignalK value that indicates pump is on` does not have to be under this path: these paths can be unrelated.

`Run data reporting interval (secs)`
indicates how often the run data statistics and status will be sent over the SignalK data stream.

`Pump signal timeout (secs)`
If the plugin does not hear *any* value (ON or OFF) from `SignalK value that indicates pump is on` for longer than this interval, it considers the device `offline`. It will also assume the pump has stopped running and update statistics appropriately.  Note that this value has nothing to do with the device being monitored, it has to do with the sensor and network being used to monitor the device.  This monitoring of the sensor network is included in this plugin because bilge pump status may be considered a critical metric and you might want early warning that the reading is stale.

The smaller this number, the quicker the plugin can determine the sensor network is having problems.  The default value of 300 seconds (5 min) is usually a good number.

## Pump run data

Under `SignalK path under which to report pump run data`, the pump meter plugin reports the following values:
* Current status -- these reflect what's happening 'right now', based on the last received `SignalK value that indicates pump is on`.
  * `status` -- Current device status, one of:
    * `STOPPED` -- device not currently running. (indicator has been received and is zero.)
    * `RUNNING` -- device *is* currently running.
    * `OFFLINE` -- No indicator value has been received in "too" long.
  * `timeInState` -- how long the device has been in `status` state (seconds).  This resets when device changes state, then starts incrementing again.
* Accumulated statistics -- sum total of what's happened since a moment in the past.  These statistics can be zeroed without affecting the ability to query the history for even earlier events. (means of zeroing the statistics is a [work in progress](#work-in-progress)).
  * `since` -- Timestamp when statistics were last zeroed.
  * `sinceCycles` -- Count of full duty cycles since `since`.  
  * `sinceRunTime` -- Accumulated time the device has been `RUNNING`, since `since`. (seconds).
* Last cycle statistics -- snapshot of the last complete duty cycle.  Note that the meta `zone` ranges for Nominal and Normal are periodically  adjusted automatically based on long-term averages of these.
    * `lastRunTime` -- how long the device was `RUNNING` in the  last full duty cycle (seconds).  This value is updated when the device completes its last run, e.g on the RUNNING to STOPPED transition.
    * `lastOffTime` -- how long the device was `STOPPED` in the last full duty cycle. (seconds).  This value is updated when the device completes its last off cycle, i.e, on the `STOPPED` to `RUNNING` transition.  Thus, if the device is currently in the STOPPED state, which it usually is, `lastOffTime` represents the *previous* duty cycle.  See `timeInState` if you want to know how long the device has been off right now, and compare this to `lastOffTime` if you are worried this might be "too" long.
    
## Reviewing the Data
The pump Meter plugin installs a simple Webapp interface that allows you to review the data it has recorded. You can
view this data in a web browser using the path `/signalk-pump-meter`.  For example:

```
http://my-server.local/signalk-pump-meter
```

It is also available to be selected from the *Webapps* menu option of the Node Server.

## API

**_Caveat -- API calls known to be broken currently.
Don't believe a word of what's written in this section._**


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

# Discussion
The plugin is most useful when the SignalK server and network can be left running when you're away from the boat, otherwise there will be data gaps where the device might have been running but the plugin doesn't see the data.
To cope with this possibility, the plugin includes its own up time in each report.  For example, it might report the bilge pump had 22 duty cycles and 60 minutes of accumulated run time *over the past 17 days and 3 hours*.  This lets you put the statistics in context: you might decide that having the bilge pump running a little more than once per day is normal.

Another challenge in monitoring runtime is detecting when there has been a recent change in the  historical pattern.  To give you some indication about this, the plugin includes the last individual duty cycle in each report: how long the device was on for the last cycle, and when that was.  For example, the plugin might report the above 22 duty cycles and 60 minutes since the plugin started and that the last duty cycle was 10 minutes long and happened yesterday.  You might conclude that 10 minutes is significantly longer than the average of 3 minutes, or you might know that there was a heavy rain last night and you have a leaky locker hatch. [[ this is admittedly crude: if you have ideas about more sophisticated statistics, let's talk.]]


# Work In Progress
Not ready for prime time yet.

Plugin:
* history of prior sessions
* optionally emit NMEA 2000

WebApp
* add support in some other gauges packages.

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
This is a user-assigned name for the device, used on gauges and also (after removing spaces and punctuation) as an identifier in the Json API and history storage.  The name must be unique (among devices monitored by this plugin), and it should also be eternal.  The identifier is used for the saved history (files on the server), if you update the configuration and change this name, it will abandon the old history.

`SignalK value that indicates pump is on`  
is the SignalK path that the plugin monitors to determine if the device is on. Any non-zero numeric value or non-empty string is interpreted to mean the device is currently ON.  A zero value or empty string indicates the device is OFF. The Pump Meter plugin *listens* for a value on this path: something else in your network should be generating it.

`SignalK path under which to report pump run data`  
Is the parent path of all the statistics reported by the plugin.  For example, if you set this to `electrical.batteries.254`, the plugin will report `electrical.batteries.254.runTime`, `electrical.batteries.254.cycleCountruntime` (and others, see below).  Note that `SignalK value that indicates pump is on` does not have to be under this path, nor does `SignalK path to output pump status`: these 3 paths can be unrelated.

`SignalK path to output device status`  
reports the string "ON", "OFF" or "OFFLINE" on the SignalK data stream.  If you do not want this report, leave this field blank.

`Run data reporting interval (secs)`  
indicates how often the run data statistics and status will be sent over the SignalK data stream.

`Pump signal timeout (secs)`  
is the number of seconds of "data silence" the pump meter plugin should tolerate before acting on a gap in the data.  If the plugin does not hear any report from `SignalK value that indicates pump is on` for longer than this interval, it will terminate any duty cycle that was in progress and change the reported device status to `Offline`.
The smaller this number, the quicker the plugin can determine the device has actually been turned off. However, you don't want
it so small that the plugin starts reporting sporadic 'on/off/on' situations.  The default value of 300 seconds (5 min) is usually a good number.

## Pump run data

Under the configured parent path, the pump meter plugin reports the following values:
`sessionStart` -- Length of the current data session. (seconds)  
`cycleCount` -- Number of ON->OFF cycles in the current data session  
`runTime` -- Cumulative length of time the device has been ON in the current data session.  (Seconds)  
`lastRunStart` -- How long ago the last duty cycle began (the OFF->ON transition, in seconds).  
`lastRunTime` -- Length of time the device was on in the last duty cycle. (Seconds)  

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
  
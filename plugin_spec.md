# signalk-pump-meter plugin specification

## keys

## history API (`signalk/v1/api/<path>/history`)

## configurables

# Design

## config
* device ID
* skMonitorPath -- external stat to monitor  
If units are amps, effort is aH; if gpm or m3/s

## monitoring 
* add 'timestamp' to list of valid units for properties in meta.
* current status: pump off, running (how hard?), OFFLINE (no statistics coming in)
* trend: how hard running, relative to long-term averages.  
(could extrapolate: how many days till exceed some limit?)
* for pump effort, could be just runtime or m3 moved, or aH as a proxy for volume moved.

## history
* timestamp 
* event: start cycle, end cycle, start offline, end offline
* data: 
  * end cycle: accum runtime, accum effort
  * 

## Todos
### Plugin
  - [ ] Move keys out from under `<context>.electrical.batteries.<instance>` to something like `<context>.pump.<deviceName>.`, once the spec issue is better firmed up.  
  - [ ] plugin updates meta at runtime, rather than depending on hand-crafted `baseDeltas.json` in server.  Some of the meta comes from config values.
 * keys updated after each cycle
    - [ ] time-between-cycles
    - [ ] time since last cycle (ended)
    - [ ] cycle runtime
    - [ ] cycle work done  
    Accumulation of skMonitorPath samples, units the integral of units samples (e.g aH for amps, gallon for gpm).
  * keys updated after each data sample (from `skMonitorPath`)
    - [ ] pump status, OFFLINE, RUNNING, STOPPED; current status (OR: is OFFLINE just a warning notification and back ONLINE an alert notification?)
    - [ ] pump running, 0 if OFFLINE or STOPPED, otherwise number of amps or gpm, based on skMonitorPath user configured. 
  * keys accumulated over time
    - [ ] count of cycles
    - [ ] aggregate runtime
    - [ ] date/time of start of accumulation
    - [ ] function to reset accumulation: can zero the count 'now', or can specify to reset since start of history
  - [ ] zones updated from history

### Kip instrument panel
- [ ] get meta working to set range, zones of instruments
- [ ] figure out how to use time series display with history API.
- [ ] support log, power scaling in addition to current linear
- [ ] embed a 2-way 'reset' (reset now, reset to start of history) iframe component.

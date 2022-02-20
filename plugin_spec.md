# signalk-pump-meter plugin specification

## keys

## history API (`signalk/v1/api/<path>/history`)

## configurables

# Design

## config


## monitoring 

## history


## Todos
### Plugin
  - [ ] Move keys out from under `<context>.electrical.batteries.<instance>` to something like `<context>.pump.<deviceName>.`, once the spec issue is better firmed up.  
  - [ ] plugin updates meta at runtime, rather than depending on hand-crafted `baseDeltas.json` in server.  Some of the meta comes from config values.
  - [ ] API
    - [ ] POST to reset accumulation: can zero the count 'now'
  - [ ] zones updated from history
  - [ ] persist history and reload it on plugin startup.
  - [ ] Finalize and document config and value key names and update doc.

### Instrumentation
- [ ] Display zone range changes on an instrument
- [ ] Finalize whether `timeInState` could be timestamp (can timestamp be displayed, especially relative to current time?)
- [ ] Use Graphana or something to visualize history as time series, rather than trying to shoehorn it into SK statistics.
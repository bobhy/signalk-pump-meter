'use strict';
import React, { Component } from "react";
import ReactDOM from "react-dom";

// Widgets used by this page
import { DateTimePicker, DropdownList } from 'react-widgets';
import ReactTable from "react-table";

// CSS for widgets
import "react-table/react-table.css";
import 'react-widgets/dist/css/react-widgets.css';


// Localization support...
import Moment from 'moment'
import momentLocalizer from 'react-widgets-moment';
import simpleNumberLocalizer from 'react-widgets-simple-number';

const devMode = false;

class MainPage extends React.Component {

  constructor(props) {
    super(props);

    // Setup the React "state" object used by this page...
    let now = new Date();
    this.state = {
      isLoaded: false,
      devices: null,
      currentDevice: null,
      data: null,
      error: null,
      startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      endDate: now
    };

    // Localization required by React Widgets
    Moment.locale('en');
    momentLocalizer();
    simpleNumberLocalizer();

    this.formatNumber = function (number) {
      return number.toFixed(2);
    }

    this.formatDate = function (date) {
      return Moment(date).format('L LT');
    }


    if (devMode) {
      this.state.isLoaded = true;
      this.state.devices = ['device1', 'device2', 'device3'];
    }

  }

  updateData() {
  }


  componentDidMount() {
    if (!devMode) {
      fetch("/plugins/signalk-pump-meter/api/devices")
        .then((res) => {
          return res.json()
        })
        .then(
          (data) => {
            this.setState({
              isLoaded: true,
              error: null,
              devices: data,
            });
          },
          (error) => {
            this.setState({
              isLoaded: true,
              error,
              devices: null
            });
          }
        )
    }
  }


  componentWillUnmount() {
  }



  getHours(secs) {
    return this.formatNumber(secs / 3600);
  }

  getMinutes(secs) {
    return this.formatNumber(secs / 60);
  }



  fetchHistory() {
    if (!devMode) {
      let sStart = this.state.startDate.toISOString();
      let sEnd = this.state.endDate.toISOString()
      fetch(`/plugins/signalk-pump-meter/api/history/${this.state.currentDevice}?start=${sStart}&end=${sEnd}`)
        .then((res) => {
          return res.json()
        })
        .then(
          (data) => {
            console.log("!! historyxx data", data)
            this.setState({
              isLoaded: true,
              error: null,
              data,
            });
          },
          (error) => {
            this.setState({
              isLoaded: true,
              error,
              data: null
            });
          }
        );

      this.setState({
        data: null
      });
    }
    else {
      // Mock data...
      this.setState({
        data: {
          totalRunTime: 217,
          historyRunTime: 217,
          history: [
            {
              start: "2019-10-29T21:09:35.122Z",
              end: "2019-10-29T21:12:12.529Z",
              runTime: 157
            },
            {
              start: "2019-10-29T21:15:59.224Z",
              end: "2019-10-29T21:16:59.211Z",
              runTime: 60
            }
          ]
        }
      });
    }
  }


  render() {
    const { isLoaded, devices, currentDevice, data, error } = this.state;

    if (!isLoaded) {
      return <div>Waiting for response from server...</div>;
    }
    else if (error) {
      return <div>Error: {error.message}</div>;
    }
    else {
      return (
        <div>

          <h1>Pump Meter xxx</h1>
          <div className="device section">
            <div className="formLabel">Device</div>
            <DropdownList
              data={devices}
              value={currentDevice}
              onChange={value => this.setState({ currentDevice: value, data: null })}
              className="inlineRight devicePicker" />
          </div>

          {currentDevice &&
            <div className="history">

              <div className="dateRange section">
                <div className="formLabel">Show history from</div>
                <DateTimePicker
                  className="inlineRight datePicker"
                  value={this.state.startDate}
                  onChange={value => this.setState({ startDate: value })} />
                <div className="inlineRight formLabel">thru</div>
                <DateTimePicker
                  className="inlineRight datePicker"
                  value={this.state.endDate}
                  onChange={value => this.setState({ endDate: value })} />

                <button className="inlineRight getButton" onClick={this.fetchHistory.bind(this)}>Get history</button>
              </div>

              {data &&
                <div className="section results">
                  <div className="section grid">
                    <ReactTable
                      data={data}

                      columns={[
                        {
                          Header: "History Timestamp",
                          id: "histDate",
                          className: 'colNumber',
                          accessor: h => this.formatDate(new Date(h.historyDate)),
                          sortMethod: (a, b) => { return a - b }
                        },
                        {
                          Header: "Session duration (h)",
                          id: "session",
                          className: 'colNumber',
                          accessor: h => this.getHours(h.sessionStart),
                          sortMethod: (a, b) => { return a - b },
                        },
                        {
                          Header: "Run time (h)",
                          id: "runTime",
                          accessor: h => this.getHours(h.runTime),
                          sortMethod: (a, b) => { return a - b },
                          className: 'colRunTime',
                        },
                        {
                          Header: "Cycles",
                          id: "cycles",
                          className: 'colNumber',
                          accessor: h => h.cycleCount,
                          sortMethod: (a, b) => { return a - b },
                        },
                        {
                          Header: "Last cycle start (min)",
                          id: "lastRunStart",
                          className: 'colNumber',
                          accessor: h => this.getMinutes(h.lastRunStart),
                          sortMethod: (a, b) => { return a - b },
                        },
                        {
                          Header: "Last run time (min)",
                          id: "lastRunTime",
                          className: 'colNumber',
                          accessor: h => this.getMinutes(h.lastRunTime),
                          sortMethod: (a, b) => { return a - b },
                        },
                      ]}

                      defaultSorted={[
                        {
                          id: "histDate",
                          desc: true
                        }
                      ]}

                      defaultPageSize={(history.length > 20 ? 20 : history.length)}

                      className="-striped -highlight"
                    />
                  </div>
                </div>
              }
            </div>
          }
        </div>
      );
    }
  }
}


let domContainer = document.querySelector('#mainBody');
ReactDOM.render(<MainPage />, domContainer);


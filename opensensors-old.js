 //var jsonfile = require('jsonfile')
var request = require('request');
var qs = require('querystring');
var fs = require('fs');


exports.setOpts = setOpts;
exports.download = download;
exports.status = dlstatus;

// module globals
// var outfile;
var downloadStatus = {};

function setOpts(opts){
  var csvfilename = opts["csv-output-filename"];
  if(!csvfilename) return;
  downloadStatus[csvfilename] = {};

  downloadStatus[csvfilename]["data"] = [];
  downloadStatus[csvfilename]["dataCount"] = 0;
  downloadStatus[csvfilename]["eggs"] = {};
  //outfile = opts["json-output-filename"];

  downloadStatus[csvfilename]["csvFields"] = opts["csv-fields"];
  downloadStatus[csvfilename]["numCsvFields"] = 0;
  if(downloadStatus[csvfilename]["csvFields"]){
    downloadStatus[csvfilename]["numCsvFields"] = downloadStatus[csvfilename]["csvFields"].length;
  }
  downloadStatus[csvfilename]["serialNumberFilters"] = JSON.parse(JSON.stringify(opts["filter-serial-numbers"]));

  downloadStatus[csvfilename]["apiurl"] = 'https://api.opensensors.io';
  downloadStatus[csvfilename]["topic"] = opts["opensensors-mqtt-topic"];
  downloadStatus[csvfilename]["params"] = {
    'start-date' : opts["opensensors-start-date"]
  };

  if(opts["opensensors-end-date"]){
    downloadStatus[csvfilename]["params"]["end-date"] = opts["opensensors-end-date"];
  }
  else if(opts["opensensors-duration"]){
    downloadStatus[csvfilename]["params"]["dur"] = opts["opensensors-duration"];
  }

  downloadStatus[csvfilename]["uri"] = apiurl + '/v1/messages/topic/' + qs.escape(topic);

  downloadStatus[csvfilename]["options"] = {
    method: 'GET',
    uri: uri,
    qs: downloadStatus[csvfilename]["params"],
    headers: {
      'Accept': 'application/json',
      'Authorization': 'api-key ' + opts["opensensors-api-key"]
    }
  };

  downloadStatus[csvfilename]["numRecords"] = 0;
  downloadStatus[csvfilename]["ready"] =  false;
};

// module local method
function handleResponse(error, response, body) {
  if (!error && response.statusCode == 200) {
    //console.log(body);
    body = body.replace(/nan/g, 'null');
    obj = JSON.parse(body);
    for(var i = 0; i < obj.messages.length; i++){
      var datum = JSON.parse(obj.messages[i].payload.text);

      if((serialNumberFilters != null) && (serialNumberFilters.indexOf(datum['serial-number']) == -1)){
        continue;
      }

      datum["timestamp"] = obj.messages[i].date;

      if(eggs[datum['serial-number']]){
        eggs[datum['serial-number']]++;
      }
      else{
        eggs[datum['serial-number']] = 1;
      }
      //data.push(datum);

      if(csvfilename){
        if(numCsvFields > 0){
          var fields = [];
          for(var jj = 0; jj < numCsvFields; jj++){
            fields.push(datum[csvFields[jj]]);
          }
          fs.appendFileSync(csvfilename, fields.join() + "\r\n");
        }
      }

    }

    if(obj.next){
      console.log(obj.next);
      options.uri = apiurl + obj.next;
      if(options.qs){
        delete options.qs;
      }
      setTimeout(function(){
        makeRequest(options, handleResponse);
      }, 0);
    }
    else{
      console.log("Done.");
      console.log(Object.keys(eggs).length + " Eggs found.");
      console.log(eggs);
      //if(outfile) {
      //  jsonfile.writeFile(outfile, data, function (err) {
      //    if (err) console.log(err);
      //  });
      //}

      //if(csvfilename){
      //  if(numCsvFields > 0){
      //    fs.writeFileSync(csvfilename, csvFields.join() + "\r\n");
      //    for(var ii = 0; ii < data.length; ii++){
      //      var fields = [];
      //      for(var jj = 0; jj < numCsvFields; jj++){
      //        fields.push(data[ii][csvFields[jj]]);
      //      }
      //      fs.appendFileSync(csvfilename, fields.join() + "\r\n");
      //    }
      //  }
      //}

      if(callback){
        callback();
      }
    }
  }
  else{
    console.log("Error: " + error);
    console.log("Response status code:" + response.statusCode);
  }
}

function makeRequest(opt, func){
  request(opt, func);
}

function download(cb){
  if(cb){
    callback = cb;
  }
  if(csvfilename){
    if (numCsvFields > 0) {
      fs.writeFileSync(csvfilename, csvFields.join() + "\r\n");
    }
  }

  request(options, handleResponse);
}

function dlstatus(fname){
  return downloadStatus[fname];
}
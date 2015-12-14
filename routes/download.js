var express = require('express');
var router = express.Router();
var Guid = require('guid');
var aqe = require('../airqualityegg')();
var extend = require('xtend');
var Promise = require("bluebird");
var fs = Promise.promisifyAll(require("fs"));
var AdmZip = require('adm-zip');
var rimrafAsync = Promise.promisify(require("rimraf"));
var moment = require('moment');

router.get('/', function(req, res, next) {
  res.render('download', { title: 'Air Quality Egg v2 - Download Data' });
});

router.get('/status', function(req, res, next){
  var dir = __dirname.split('/');
  dir = dir.slice(0, dir.length-1);
  var downloadsFolder = dir.join('/') + "/public/downloads";

  var guid = req.query.guid;
  return Promise.try(function () {
    return fs.readFileAsync(downloadsFolder + '/' + guid + '.json', 'utf8');
  }).catch(function(err){
    return null;
  }).then(function(content) {
    if(!content){
      res.error("unkown job");
      return;
    }

    var jsonData;
    try{
      jsonData = JSON.parse(content);
    }
    catch(e){
      jsonData = null;
    }

    return res.send(jsonData);
  });
});

// the client side javascript posts the download configuration data as a json object
// and gets back a GUID that is a handle to check
// the status of the download as well as to retrieve
// the downloaded file when it's ready
router.post('/', function(req, res, next) {
  // create a guid
  var guid = Guid.raw();

  // validate the request
  // what is supported:
  //    REQUIRED: at least one serial number
  var params = extend(req.body);

  if(params["serial-numbers"].length == 0){
    res.send({error: "at least one serial-number must be provided"});
    return;
  }

  var utcOffset = 0;
  if(params["start-date"] && (params["start-date"] != "")){
    var startDate = moment(params["start-date"]);
    utcOffset = moment.parseZone(startDate).utcOffset();
  }

  var numRowsWrittenToFile = 0;
  var numFilesWritten = 0;
  var dir = __dirname.split('/');
  dir = dir.slice(0, dir.length-1);
  var downloadsFolder = dir.join('/') + "/public/downloads";
  dir = dir.join('/') + "/public/downloads/" + guid;

  // call some function that uses the opensensors api
  // to return a result set that maps back to the request
  // it probably needs to be a map call of some kind that
  // invokes the API iteratively for each device and topic
  // and ultimately creates "CSV rows" of data
  // practically speaking this probably should generate a *set*
  // of files, one per Egg listed, and perhaps zip them up
  // when they've all downloaded, should possibly write some data
  // to a status file so that progress feedback can be
  // provided by to the client side
  Promise.try(function(){
    return fs.mkdirAsync(dir);
  }).then(function(){
    return res.send({
      guid: guid,
      uri: 'downloads/' + guid + '.zip'
    });
  }).then(function(){
    // seed the status json file with an object like:
    // {
    //   serialnumber1: {complete: false},
    //   serialnumber2: {complete: false}
    //   ... etc
    // }
    var initJson = {};
    for(var ii = 0; ii < params["serial-numbers"].length; ii++){
      initJson[params["serial-numbers"][ii]] = {complete: false};
    }
    return fs.writeFileAsync(downloadsFolder + '/' + guid +'.json', JSON.stringify(initJson));
  }).then(function(){
    params.status = {
      filename: downloadsFolder + '/' + guid + '.json',
    }
    return aqe(params);
  }).then(function(results){
    // so at this point results is an array,
    // with each entry having {
    //    serialNumber:xxx, messages: {
    //       topic1: [...]
    //       topic2: [...]
    //       topic3: [...]
    //    }
    return results;
  }).map(function(result){ // map for the data from each serial number
    var rows = [];
    var minlength = 1e10;
    var headerRow = [];
    Object.keys(result.messages).forEach(function(key){
      if(result.messages[key].length < minlength){
        minlength = result.messages[key].length;
      }
    });
    var first = true;

    if(minlength == 1e10){
      return null;
    }

    for(var ii = 0; ii < minlength; ii++){
      var row = [];
      // everything reports temperature and humidity
      // use the temperature timestamp as the timestamp for the row
      row.push(result.messages["/orgs/wd/aqe/temperature"][ii].timestamp);
      row.push(result.messages["/orgs/wd/aqe/temperature"][ii]['converted-value']);
      row.push(result.messages["/orgs/wd/aqe/humidity"][ii]['converted-value']);
      if(first) {
        headerRow.push("timestamp[GMT]");
        headerRow.push("temperature[" + result.messages["/orgs/wd/aqe/temperature"][ii]['converted-units'] + ']');
        headerRow.push("humidity[%]");
      }

      if(result.messages["/orgs/wd/aqe/no2"]){
        row.push(result.messages["/orgs/wd/aqe/no2"][ii]['compensated-value']);
        row.push(result.messages["/orgs/wd/aqe/co"][ii]['compensated-value']);
        row.push(result.messages["/orgs/wd/aqe/no2"][ii]['raw-value']);
        row.push(result.messages["/orgs/wd/aqe/co"][ii]['raw-value']);
        if(first) {
          headerRow.push("no2[ppb]");
          headerRow.push("co[ppm]");
          headerRow.push("no2[V]");
          headerRow.push("co[V]");
        }
      }

      if(result.messages["/orgs/wd/aqe/so2"]){
        row.push(result.messages["/orgs/wd/aqe/so2"][ii]['compensated-value']);
        row.push(result.messages["/orgs/wd/aqe/o3"][ii]['compensated-value']);
        row.push(result.messages["/orgs/wd/aqe/so2"][ii]['raw-value']);
        row.push(result.messages["/orgs/wd/aqe/o3"][ii]['raw-value']);
        if(first){
          headerRow.push("so2[ppb]");
          headerRow.push("o3[ppb]");
          headerRow.push("so2[V]");
          headerRow.push("o3[V]");
        }
      }

      if(result.messages["/orgs/wd/aqe/particulate"]){
        row.push(result.messages["/orgs/wd/aqe/particulate"][ii]['compensated-value']);
        row.push(result.messages["/orgs/wd/aqe/particulate"][ii]['raw-value']);
        if(first) {
          headerRow.push("pm[ug/m^3]");
          headerRow.push("pm[V]");
        }
      }

      // as a trailer every row gets a lat,lng,alt
      // again using temperature as the source for this
      row.push(result.messages["/orgs/wd/aqe/temperature"][ii].latitude || "---");
      row.push(result.messages["/orgs/wd/aqe/temperature"][ii].longitude || "---");
      row.push(result.messages["/orgs/wd/aqe/temperature"][ii].altitude || "---");
      if(first) {
        headerRow.push("latitude[deg]");
        headerRow.push("longitude[deg]");
        headerRow.push("altitude[m]");
      }

      rows.push(row);
      first = false;
    }

    return {
      serialNumber: result.serialNumber,
      rows: rows,
      header: headerRow
    };
  }).each(function(file){
    if(!file){
      return null;
    }

    numFilesWritten++;
    var filename = dir +'/' + file.serialNumber + '.csv';

    return Promise.try(function() {
      return fs.appendFileAsync(filename, file.header.join(",")+'\r\n');
    }).then(function() {
      return file.rows;
    }).each(function(row){
      numRowsWrittenToFile++;
      // convert timestamp back to user's timezone
      row[0] = moment(row[0]).utcOffset(utcOffset).format();
      return fs.appendFileAsync(filename, row.join(",")+'\r\n');
    });
  }).then(function(){
    // sweet we finished writing all the data to files
    // i guess we should let the client know or something
    var zip = new AdmZip();
    zip.addLocalFolder(dir, '/');
    zip.writeZip(downloadsFolder + '/' + guid + '.zip');
    return {};
  }).then(function(){
    // remove the temp folder
    return rimrafAsync(dir);
  });
});

router.get('/status', function(req, res, next){
  var jobname = req.query.guid; // what's the status of this job


});

module.exports = router;

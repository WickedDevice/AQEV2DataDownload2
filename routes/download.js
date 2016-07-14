var expressPromiseRouter = require("express-promise-router");
var router = expressPromiseRouter();
var uuid = require('node-uuid');
var aqe = require('../airqualityegg')();
var Promise = require("bluebird");
var fs = Promise.promisifyAll(require("fs"));
var rimrafAsync = Promise.promisify(require("rimraf"));
var moment = require('moment');
require('node-zip');

router.get('/', function(req, res) {
  res.render('download', { title: 'Air Quality Egg v2 - Download Data' });
});

router.get('/status', function(req, res){
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
router.post('/', function(req, res) {
  // create a guid
  var guid = uuid.v4();

  // validate the request
  // what is supported:
  //    REQUIRED: at least one serial number
  var params = Object.assign({}, {}, req.body);

  params["serial-numbers"] = params["serial-numbers"].filter(function(item){
    return item.trim() != "";
  });

  if(params["serial-numbers"].length == 0){
    res.send({error: "at least one serial-number must be provided"});
    return;
  }

  var utcOffset = 0;
  if(params["start-date"] && (params["start-date"] != "")){
    var startDate = moment(params["start-date"]);
    utcOffset = moment.parseZone(startDate).utcOffset();
  }

  var zipFilename = "";
  if(params.zipfilename){
    var m = moment();
    m.utcOffset(startDate.utcOffset());
    zipFilename = params.zipfilename + "-" + m.format();
    zipFilename = zipFilename.replace(/[^\x20-\x7E]+/g, ''); // no non-printable characters allowed
    ['\\\\','/',':','\\*','\\?','"','<','>','\\|'].forEach(function(c){
      var regex = new RegExp(c, "g");
      zipFilename = zipFilename.replace(regex, "_"); // turn illegal characters into '_'
    });

  }
  else{
    zipFilename = guid;
  }

  var use_instant_values = params.use_instant_values;
  var use_uncompensated_values = params.use_uncompensated_values;

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
      uri: 'downloads/' + zipFilename + '.zip'
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
    var earliest_date = null;
    var most_recent_date = null;
    var sernum = result.serialNumber;
    Object.keys(result.messages).forEach(function(key){
      var first_timestamp = null;
      var altkey = key + '/' + result.serialNumber;

      if(result.messages[key] && result.messages[key][0] && result.messages[key][0].timestamp !== null) {
        first_timestamp = moment(result.messages[key][0].timestamp);
      }
      else if(result.messages[altkey] && result.messages[altkey][0] && result.messages[altkey][0].timestamp !== null) {
        first_timestamp = moment(result.messages[altkey][0].timestamp);
      }

      var last_timestamp = null;
      if(result.messages[key] && result.messages[key][result.messages[key].length-1] && result.messages[key][result.messages[key].length-1].timestamp){
        last_timestamp = moment(result.messages[key][result.messages[key].length-1].timestamp);
      }
      else if(result.messages[altkey] && result.messages[altkey][result.messages[altkey].length-1] && result.messages[altkey][result.messages[altkey].length-1].timestamp){
        last_timestamp = moment(result.messages[altkey][result.messages[altkey].length-1].timestamp);
      }

      if(first_timestamp){
        if(!earliest_date){
          earliest_date = first_timestamp;
          most_recent_date = first_timestamp;
        }
        else if(first_timestamp.isBefore(earliest_date)){
          earliest_date = first_timestamp;
        }
        else if(first_timestamp.isAfter(most_recent_date)){
          most_recent_date = first_timestamp;
        }
      }

      if(last_timestamp){
        if(!earliest_date){
          earliest_date = last_timestamp;
          most_recent_date = last_timestamp;
        }
        else if(last_timestamp.isBefore(earliest_date)){
          earliest_date = last_timestamp;
        }
        else if(last_timestamp.isAfter(most_recent_date)){
          most_recent_date = last_timestamp;
        }
      }

    });

    var first = true;

    if(!earliest_date || !most_recent_date){
      console.log("Earliest Date: " + earliest_date + ", Most Recent Date: " + most_recent_date);
      return null;
    }

    console.log("Earliest Date: " + earliest_date.format() + ", Most Recent Date: " + most_recent_date.format());

    if(!most_recent_date.isAfter(earliest_date)){
      console.log("Most Recent Date is not after earliest date");
      return null;
    }

    var invalid_value_string = "---";
    var window_interval_seconds = 1;
    var start = moment();
    var latitude, longitude, altitude;
    console.log("Beginning post processing at " + start.format());

    var starting_indices_by_topic = {
      "/orgs/wd/aqe/temperature" : 0,
      "/orgs/wd/aqe/humidity" : 0,
      "/orgs/wd/aqe/no2" : 0,
      "/orgs/wd/aqe/co" : 0,
      "/orgs/wd/aqe/so2" : 0,
      "/orgs/wd/aqe/o3" : 0,
      "/orgs/wd/aqe/particulate" : 0,
      "/orgs/wd/aqe/co2": 0
    };

    // add the possibility of serial number extended topics
    var _valid_topics = Object.keys(starting_indices_by_topic);
    _valid_topics.forEach(function(top){
      starting_indices_by_topic[top+"/"+sernum] = 0;
    });

    // return #N/A if you don't find such a timestamp or if you don't find the target_field
    // otherwise return the target_field from the record containing the timestamp
    // if target_field is not provided, return the whole record
    function find_first_value_near_timestamp(topic, target_timestamp, within_seconds, target_field){
      var arr = result.messages[topic];

      if(!arr){
        return {};
      }

      if(typeof arr !== "object"){
        return {};
      }

      if(!arr.length){
        return {};
      }

      if(!target_timestamp){
        return {};
      }

      if(typeof within_seconds !== "number"){
        return {};
      }

      if(within_seconds <= 0){
        return {};
      }

      var start_of_target_window = moment(target_timestamp).subtract(within_seconds/2, "seconds");
      var end_of_target_window = moment(target_timestamp).add(within_seconds/2, "seconds");
      for(var ii = starting_indices_by_topic[topic]; ii < arr.length; ii++){
        if(arr[ii] && arr[ii].timestamp){
          // if this value is within the window and the target field exists in the associated record
          // then we should return that value
          if(start_of_target_window.isBefore(arr[ii].timestamp)){
            if(end_of_target_window.isAfter(arr[ii].timestamp)){
              starting_indices_by_topic[topic] = ii++;
              if(target_field && (arr[ii][target_field] !== null)) { // target field requested, and a non-null value exists
                return arr[ii][target_field] || {};
              }
              else if(!target_field){                                // no target field requested, return the whole record
                return arr[ii] || {};
              }
            }

            // otherwise we should return #N/A because the values are only going
            // to get farther away from this point forward
            starting_indices_by_topic[topic] = ii;
            return {};
          }
        }
      }

      // if we search the whole array and don't find a suitable value return #N/A
      return {};
    }

    function valueOrInvalid(value){
      if(value === null || value === undefined){
        return invalid_value_string;
      }

      return value;
    }

    var hasOwnProperty = Object.prototype.hasOwnProperty;
    function isEmptyObject(obj) {

      // null and undefined are "empty"
      if (obj == null) return true;

      // Assume if it has a length property with a non-zero value
      // that that property is correct.
      if (obj.length > 0)    return false;
      if (obj.length === 0)  return true;

      // Otherwise, does it have any properties of its own?
      // Note that this doesn't handle
      // toString and valueOf enumeration bugs in IE < 9
      for (var key in obj) {
        if (hasOwnProperty.call(obj, key)) return false;
      }

      return true;
    }

    while(earliest_date.isBefore(most_recent_date)){
      var row = [];
      latitude = null;
      longitude = null;
      altitude = null;

      row.push(earliest_date.format()); // every row gets a timestamp

      var record = find_first_value_near_timestamp("/orgs/wd/aqe/temperature", earliest_date, window_interval_seconds);
      if(isEmptyObject(record)){
        record = find_first_value_near_timestamp("/orgs/wd/aqe/temperature/" + sernum, earliest_date, window_interval_seconds);
      }

      if(!use_instant_values && !use_uncompensated_values) {
        row.push(valueOrInvalid(record['converted-value']));
      }
      else if(use_instant_values){
        row.push(valueOrInvalid(record['raw-instant-value']));
      }
      else if(use_uncompensated_values){
        row.push(valueOrInvalid(record['raw-value']));
      }

      if(latitude === null && record["latitude"]){
        latitude = record["latitude"];
        longitude = record["longitude"];
        altitude = record["altitude"];
      }

      record = find_first_value_near_timestamp("/orgs/wd/aqe/humidity", earliest_date, window_interval_seconds);
      if(isEmptyObject(record)){
        record = find_first_value_near_timestamp("/orgs/wd/aqe/humidity/" + sernum, earliest_date, window_interval_seconds);
      }
      if(!use_instant_values && !use_uncompensated_values) {
        row.push(valueOrInvalid(record['converted-value']));
      }
      else if(use_instant_values){
        row.push(valueOrInvalid(record['raw-instant-value']));
      }
      else if(use_uncompensated_values){
        row.push(valueOrInvalid(record['raw-value']));
      }

      if(latitude === null && record["latitude"]){
        latitude = record["latitude"];
        longitude = record["longitude"];
        altitude = record["altitude"];
      }

      if(first) {
        headerRow.push("timestamp");
        if(result.messages["/orgs/wd/aqe/temperature"] && result.messages["/orgs/wd/aqe/temperature"].length > 0) {
          headerRow.push("temperature[" + result.messages["/orgs/wd/aqe/temperature"][0]['converted-units'] + ']');
        }
        else if(result.messages["/orgs/wd/aqe/temperature/" + sernum] && result.messages["/orgs/wd/aqe/temperature/" + sernum].length > 0) {
          headerRow.push("temperature[" + result.messages["/orgs/wd/aqe/temperature/" + sernum][0]['converted-units'] + ']');
        }
        else{
          headerRow.push("temperature[???]");
        }
        headerRow.push("humidity[%]");
      }

      if((result.messages["/orgs/wd/aqe/no2"] && result.messages["/orgs/wd/aqe/o3"]) ||
        (result.messages["/orgs/wd/aqe/no2/" + sernum] && result.messages["/orgs/wd/aqe/o3/" + sernum])){
        var no2_record = find_first_value_near_timestamp("/orgs/wd/aqe/no2", earliest_date, window_interval_seconds);
        if(isEmptyObject(no2_record)){
          no2_record = find_first_value_near_timestamp("/orgs/wd/aqe/no2/" + sernum, earliest_date, window_interval_seconds);
        }
        var o3_record  = find_first_value_near_timestamp("/orgs/wd/aqe/o3", earliest_date, window_interval_seconds);
        if(isEmptyObject(o3_record)){
          o3_record = find_first_value_near_timestamp("/orgs/wd/aqe/o3/" + sernum, earliest_date, window_interval_seconds);
        }

        //if(!use_uncompensated_values) {
        row.push(valueOrInvalid(no2_record['compensated-value']));
        row.push(valueOrInvalid(o3_record['compensated-value']));
        //}
        //else{
        //  row.push(valueOrInvalid(no2_record['converted-value']));
        //  row.push(valueOrInvalid(o3_record['converted-value']));
        //}

        if(!use_instant_values) {
          row.push(valueOrInvalid(no2_record['raw-value']));
          row.push(valueOrInvalid(no2_record['raw-value2']));
          row.push(valueOrInvalid(o3_record['raw-value']));
        }
        else{
          row.push(valueOrInvalid(no2_record['raw-instant-value']));
          row.push(valueOrInvalid(no2_record['raw-instant-value2']));
          row.push(valueOrInvalid(o3_record['raw-instant-value']));
        }

        if(latitude === null && no2_record["latitude"]){
          latitude = no2_record["latitude"];
          longitude = no2_record["longitude"];
          altitude = no2_record["altitude"];
        }

        if(latitude === null && o3_record["latitude"]){
          latitude = o3_record["latitude"];
          longitude = o3_record["longitude"];
          altitude = o3_record["altitude"];
        }

        if(first) {
          headerRow.push("no2[ppb]");
          headerRow.push("o3[ppb]");
          headerRow.push("no2_we[V]");
          headerRow.push("no2_aux[V]");
          headerRow.push("o3[V]");
        }
      }
      else if((result.messages["/orgs/wd/aqe/no2"] && result.messages["/orgs/wd/aqe/co"]) ||
        (result.messages["/orgs/wd/aqe/no2/" + sernum] && result.messages["/orgs/wd/aqe/co/" + sernum])){
        var no2_record = find_first_value_near_timestamp("/orgs/wd/aqe/no2", earliest_date, window_interval_seconds);
        if(isEmptyObject(no2_record)){
          no2_record = find_first_value_near_timestamp("/orgs/wd/aqe/no2/" + sernum, earliest_date, window_interval_seconds);
        }
        var co_record  = find_first_value_near_timestamp("/orgs/wd/aqe/co", earliest_date, window_interval_seconds);
        if(isEmptyObject(co_record)){
          co_record = find_first_value_near_timestamp("/orgs/wd/aqe/co/" + sernum, earliest_date, window_interval_seconds);
        }

        //if(!use_uncompensated_values) {
        row.push(valueOrInvalid(no2_record['compensated-value']));
        row.push(valueOrInvalid(co_record['compensated-value']));
        //}
        //else{
        //  row.push(valueOrInvalid(no2_record['converted-value']));
        //  row.push(valueOrInvalid(co_record['converted-value']));
        //}

        if(!use_instant_values) {
          row.push(valueOrInvalid(no2_record['raw-value']));
          row.push(valueOrInvalid(co_record['raw-value']));
        }
        else{
          row.push(valueOrInvalid(no2_record['raw-instant-value']));
          row.push(valueOrInvalid(co_record['raw-instant-value']));
        }

        if(latitude === null && no2_record["latitude"]){
          latitude = no2_record["latitude"];
          longitude = no2_record["longitude"];
          altitude = no2_record["altitude"];
        }

        if(latitude === null && co_record["latitude"]){
          latitude = co_record["latitude"];
          longitude = co_record["longitude"];
          altitude = co_record["altitude"];
        }

        if(first) {
          headerRow.push("no2[ppb]");
          headerRow.push("co[ppm]");
          headerRow.push("no2[V]");
          headerRow.push("co[V]");
        }
      }
      else if((result.messages["/orgs/wd/aqe/so2"] && result.messages["/orgs/wd/aqe/o3"]) ||
        (result.messages["/orgs/wd/aqe/so2/" + sernum] && result.messages["/orgs/wd/aqe/o3/" + sernum])){
        var so2_record = find_first_value_near_timestamp("/orgs/wd/aqe/so2", earliest_date, window_interval_seconds);
        if(isEmptyObject(so2_record)){
          so2_record = find_first_value_near_timestamp("/orgs/wd/aqe/so2/" + sernum, earliest_date, window_interval_seconds);
        }
        var o3_record  = find_first_value_near_timestamp("/orgs/wd/aqe/o3", earliest_date, window_interval_seconds);
        if(isEmptyObject(o3_record)){
          o3_record = find_first_value_near_timestamp("/orgs/wd/aqe/o3/" + sernum, earliest_date, window_interval_seconds);
        }

        //if(!use_uncompensated_values) {
        row.push(valueOrInvalid(so2_record['compensated-value']));
        row.push(valueOrInvalid(o3_record['compensated-value']));
        //}
        //else{
        //  row.push(valueOrInvalid(so2_record['converted-value']));
        //  row.push(valueOrInvalid(o3_record['converted-value']));
        //}

        if(!use_instant_values) {
          row.push(valueOrInvalid(so2_record['raw-value']));
          row.push(valueOrInvalid(o3_record['raw-value']));
        }
        else{
          row.push(valueOrInvalid(so2_record['raw-instant-value']));
          row.push(valueOrInvalid(o3_record['raw-instant-value']));
        }

        if(latitude === null && so2_record["latitude"]){
          latitude = so2_record["latitude"];
          longitude = so2_record["longitude"];
          altitude = so2_record["altitude"];
        }

        if(latitude === null && o3_record["latitude"]){
          latitude = o3_record["latitude"];
          longitude = o3_record["longitude"];
          altitude = o3_record["altitude"];
        }

        if(first){
          headerRow.push("so2[ppb]");
          headerRow.push("o3[ppb]");
          headerRow.push("so2[V]");
          headerRow.push("o3[V]");
        }
      }
      else if(result.messages["/orgs/wd/aqe/particulate"] || result.messages["/orgs/wd/aqe/particulate/" + sernum] ){
        var pm_record = find_first_value_near_timestamp("/orgs/wd/aqe/particulate", earliest_date, window_interval_seconds);
        if(isEmptyObject(pm_record)){
          pm_record = find_first_value_near_timestamp("/orgs/wd/aqe/particulate/" + sernum, earliest_date, window_interval_seconds);
        }
        row.push(valueOrInvalid(pm_record['converted-value']));

        if(!use_instant_values) {
          row.push(valueOrInvalid(pm_record['raw-value']));
        }
        else{
          row.push(valueOrInvalid(pm_record['raw-instant-value']));
        }

        if(first) {
          headerRow.push("pm[ug/m^3]");
          headerRow.push("pm[V]");
        }
      }
      else if(result.messages["/orgs/wd/aqe/co2"] || result.messages["/orgs/wd/aqe/co2/" + sernum]){
        var co2_record = find_first_value_near_timestamp("/orgs/wd/aqe/co2", earliest_date, window_interval_seconds);
        if(isEmptyObject(co2_record)){
          co2_record = find_first_value_near_timestamp("/orgs/wd/aqe/co2/" + sernum, earliest_date, window_interval_seconds);
        }

        if(use_instant_values) {
          row.push(valueOrInvalid(co2_record['raw-instant-value']));
        }
        //else if(use_uncompensated_values){
        //  row.push(valueOrInvalid(co2_record['converted-value']));
        //}
        else{
          row.push(valueOrInvalid(co2_record['compensated-value']));
        }

        if(first) {
          headerRow.push("co2[ppm]");
        }
      }

      // as a trailer every row gets a lat,lng,alt
      // again using temperature as the source for this
      row.push(valueOrInvalid(latitude));
      row.push(valueOrInvalid(longitude));
      row.push(valueOrInvalid(altitude));

      if(first) {
        headerRow.push("latitude[deg]");
        headerRow.push("longitude[deg]");
        headerRow.push("altitude[m]");
      }

      var at_least_one_real_datum_in_row = false;
      for(var ii = 1; ii < row.length; ii++){
        if(row[ii] != invalid_value_string){
          at_least_one_real_datum_in_row = true;
          break;
        }
      }

      if(at_least_one_real_datum_in_row) {
        rows.push(row);
      }

      first = false;

      // add window to the timestamp and continue
      earliest_date.add(window_interval_seconds, "seconds");
    }

    console.log("Post Processing Complete - duration: " + (moment().diff(start)/1000.0) + "seconds");

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
    fs.appendFileSync(filename, file.header.join(",")+'\r\n');
    file.rows.forEach(function(row){
      numRowsWrittenToFile++;
      // convert timestamp back to user's timezone
      row[0] = moment(row[0]).utcOffset(utcOffset).format("MM/DD/YYYY HH:mm:ss");
      fs.appendFileSync(filename, row.join(",")+'\r\n');
    });
  }).then(function() {
    // sweet we finished writing all the data to files
    // i guess we should let the client know or something
    var zip = new JSZip();

    return Promise.try(function(){
      return params["serial-numbers"];
    }).map(function(serialNumber) {
      return {
        serialNumber: serialNumber
      };
    }).each(function(task){
      return Promise.try(function() {
        return fs.readFileAsync(downloadsFolder + '/' + guid + '/' + task.serialNumber + '.csv');
      }).catch(function(err){
        return null;
      }).then(function(data){
        task.data = data;
        return task;
      });
    }).filter(function(task){
      return (task.data != null);
    }).each(function(task){
      zip.file(task.serialNumber + ".csv", task.data);
    }).then(function(){
      var zipdata = zip.generate({base64: false, compression: 'DEFLATE'});
      return fs.writeFileSync(downloadsFolder + '/' + zipFilename + '.zip', zipdata, 'binary');
    });
  }).then(function(){
    // remove the temp folder
    return rimrafAsync(dir);
  }).then(function(){
    // parse the contents as JSON
    // open the status file
    var statusFileContents = fs.readFileSync(params.status.filename, 'utf8');
    try {
      var status = JSON.parse(statusFileContents);
      status.complete = true;
      fs.writeFileSync(params.status.filename, JSON.stringify(status));
    }
    catch(err){
      console.log(err);
      return null;
    }
  });
});

module.exports = router;

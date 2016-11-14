var expressPromiseRouter = require("express-promise-router");
var router = expressPromiseRouter();
var uuid = require('node-uuid');
var Promise = require("bluebird");
var moment = require('moment');
var promiseDoWhilst = require('promise-do-whilst');
var kue = require('kue')
  , queue = kue.createQueue();

router.get('/', function(req, res) {
  res.render('download', { title: 'Air Quality Egg v2 - Download Data' });
});

router.get('/status', function(req, res){

});

// this function returns a string to append to a url path
// to add the [flat] params object as a querystring
function urlParams(params){
  var ret = "";
  if(Object.keys(params).length > 0){ // if there are any optional params
    ret += '?';
    var encodeParams = Object.keys(params).map(function(key){
      if(key != "status") { // special case, not an OpenSensors parameter
        return key + '=' + encodeURIComponent(params[key]);
      }
    });

    ret += encodeParams.join('&');
  }
  return ret;
}

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
  var startDate;
  var endDate;
  if(params["start-date"] && (params["start-date"] != "")){
    startDate = moment(params["start-date"]);
    utcOffset = moment.parseZone(startDate).utcOffset();
  }
  else if(params["end-date"] && (params["end-date"] != "")){
    startDate = moment(params["end-date"]);
    utcOffset = moment.parseZone(endDate).utcOffset();
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

  startDate = params["start-date"] == "" ? null : params["start-date"];
  endDate = params["end-date"] == "" ? null : params["end-date"];

  var apiParams = {};
  if(startDate){
    apiParams["start-date"] = startDate;
  }
  if(endDate){
    apiParams["end-date"] = endDate;
  }
  apiParams.status = params.status;

  var urlparams = urlParams(apiParams);

  var url = 'https://api.opensensors.io/v1/messages/device/${serial-number}' + urlparams;
  var save_location = dir;
  var serials = params["serial-numbers"].slice();

  var job = queue.create('download', {
      title: 'downloading url ' + url.replace('${serial-number}', serials[0])
    , original_serials: serials.slice()
    , serials: serials.slice()
    , url: url
    , original_url: url
    , save_path: save_location
    , user_id: 'whatever'
    , email: 'victor.aprea@wickeddevice.com'
    , sequence: 1
    , compensated: !!!use_uncompensated_values
    , instantaneous: !!use_instant_values
    , utcOffset: utcOffset
    , zipfilename: zipFilename
  })
  .priority('high')
  .attempts(10)
  .backoff({delay: 60*1000, type:'exponential'})
  .save();

});

module.exports = router;

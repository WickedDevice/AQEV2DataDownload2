var expressPromiseRouter = require("express-promise-router");
var router = expressPromiseRouter();
var uuid = require('node-uuid');
var Promise = require("bluebird");
var moment = require('moment');
var promiseDoWhilst = require('promise-do-whilst');

router.get('/', function(req, res) {
  res.render('download', { title: 'Air Quality Egg v2 - Download Data' });
});

router.get('/status', function(req, res){

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

});

module.exports = router;

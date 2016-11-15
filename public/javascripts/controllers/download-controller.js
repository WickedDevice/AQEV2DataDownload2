angular.module('MyApp')
  .controller('DownloadController', ["$scope", "$interval", "$http", function($scope, $interval, $http){
    $scope.start_time = "";
    $scope.end_date = "";
    $scope.serial_numbers = "";
    $scope.durationDays = "";
    $scope.durationHours = "";
    $scope.durationMinutes = "";
    $scope.zipfilename = "";
    $scope.use_instant_values = false;
    $scope.use_uncompensated_values = false;
    $scope.showHelp = false;
    $scope.emailorwebhook = "";  
 
    //$interval(function(){
    //  console.log($scope.start_date);
    //}, 1000);

    $scope.toggleHelp = function(){
      if($scope.showHelp){
        $scope.showHelp = false;
      }
      else{
        $scope.showHelp = true;
      }
    };

    $scope.onDownloadClick = function(){
      // compose a valid JSON object

      // Serial Numbers
      var serialNumbers = [].concat($scope.serial_numbers.split("\n"));
      var validSerialNumbers = serialNumbers.map(function (serialNumber) {
        return serialNumber.trim();
      });

      if (validSerialNumbers.length == 0 || $scope.serial_numbers.trim() == "") {
        alert("Please enter at least one Serial Nubmer");
        return;
      }

      var postObj = {
        "serial-numbers": validSerialNumbers,
        "moment": moment().format()
      };

      // Start Date
      var startDateStr = $scope.start_date;
      var startDate = null;
      if(startDateStr) {
        startDate = moment(startDateStr);
      }
      if ($scope.start_date && startDateStr && startDate && !startDate.isValid()) {
        alert("Start date is not complete / valid.");
        return;
      }

      // End Date
      var endDateStr = $scope.end_date;
      var endDate = null;
      if(endDateStr) {
        endDate = moment(endDateStr);
      }
      if ($scope.end_date && endDateStr && endDate && !endDate.isValid()) {
        alert("End date is not complete / valid.");
      }

      if(startDateStr != "" && startDate && startDate.isValid() && endDateStr != "" && endDate && endDate.isValid()){
        if(!endDate.isAfter(startDate)){
          alert("End date must be *after* start date.");
          return;
        }
      }

      // Duration
      var duration = "";
      //if($("#durationYears").val() != ""){
      //    duration += $("#durationYears").val() + "Y";
      //}
      //if($("#durationMonths").val() != ""){
      //    duration += $("#durationMonths").val() + "M";
      //}

      if($scope.durationDays){
        duration += $scope.durationDays + "D";
      }

      if($scope.durationHours || $scope.durationMinutes){
        duration += "T";
        if($scope.durationHours){
          duration += $scope.durationHours + "H";
        }
        if($scope.durationMinutes){
          duration += $scope.durationMinutes + "M";
        }
      }
      if(duration != ""){
        duration = "P" + duration;
        postObj["duration"] = duration;
      }

      if(postObj["duration"] && postObj["end-date"] && postObj["start-date"]){
        alert("Duration cannot be used with *both* start date *and* end date");
        return;
      }

      function validStartDate(){
        return startDateStr != "" && startDate && startDate.isValid();
      }

      function validEndDate(){
        return endDateStr != "" && endDate && endDate.isValid();
      }

      function validDuration(){
        return duration != "";
      }

      // WORKAROUND: OpenSensors API supports a duration param
      //             but there is a bug that makes it not work
      //             if the query requires iteration
      //             ... so make duration become an end-date instead
      // Case #1: start date and duration provided, but not end date
      if(validDuration() && validStartDate() && !validEndDate()){
        var dur = moment.duration(duration);
        postObj["start-date"] = startDate.format();
        postObj["end-date"] = startDate.add(dur).format();
        delete postObj.duration;
      }
      // Case #2: end date and duration provided, but not start date
      else if(validDuration() && !validStartDate() && validEndDate()){
        var dur = moment.duration(duration);
        postObj["start-date"] = endDate.subtract(dur).format();
        postObj["end-date"] = endDate.format();
        delete postObj.duration;
      }
      // Case #3: duration provided, with neither start date nor end date
      else if(validDuration() && !validStartDate() && !validEndDate()){
        var dur = moment.duration(duration);
        endDate = moment();
        postObj["end-date"] = endDate.format();
        postObj["start-date"] = endDate.subtract(dur).format();
        delete postObj.duration;
      }
      // Case #4: neither duration, nor start date, nor end date were provided
      else if(!validDuration() && !validStartDate() && !validEndDate()){
        alert("Not providing any of duration, start date, or end date is invalid.");
        return;
      }
      // Case #5: all of duration, start date, and end date were provided
      else if(validDuration() && validStartDate() && validEndDate()){
        alert("Providing duration, start date, *and* end date is invalid.");
        return;
      }
      // Case #6: end date was provided, but neither duration, nor start date
      else if(!validDuration() && !validStartDate() && validEndDate()){
        alert("Providing a end date, but neither duration nor start date is invalid.");
        return;
      }
      // Case #7:
      else if(!validDuration() && validStartDate() && validEndDate()){
        // this is fine, nothing to do here
        // duration is not in play / implied
        postObj["start-date"] = startDate.format();
        postObj["end-date"] = endDate.format();
      }
      // Case #8: start date provided with neither end date nor duration
      else if(!validDuration() && validStartDate() && !validEndDate()){
        postObj["start-date"] = startDate.format();
        postObj["end-date"] = moment().format();
      }

      // restrict requests to 24 hours
      var requested_duration_in_hours = moment(postObj["end-date"]).diff(moment(postObj["start-date"]), 'seconds') / 60 / 60;
      if(requested_duration_in_hours > 168){
        alert("Please request no more than 168 hours of data at a time. You asked for " + Math.ceil(requested_duration_in_hours) + " hours." );
        return;
      }

      if($scope.emailorwebhook.trim().length == ""){
        alert("You must provide an email address or URL where we can send the link to your prepared zip file when it's ready.");
        return;
      }
      postObj.emailorwebhook = $scope.emailorwebhook;


      // zip filename, handle the user providing the zip extension, or not
      if($scope.zipfilename){
        var fname = $scope.zipfilename.trim();
        if(/\.zip$/.test(fname)){
          fname = fname.substr(0, fname.length - 4);
        }
        postObj.zipfilename = fname;
      }

      if($scope.use_instant_values){
        postObj.use_instant_values = true;
      }

      if($scope.use_uncompensated_values){
        postObj.use_uncompensated_values = true;
      }

      var uri = null;
      var guid = null;
      var statusIntervalId = null;
      $http.post("", postObj).success(function (resp) {
        uri = resp.uri;
        guid = resp.guid;
        $("#download_submit").removeClass("btn-primary").addClass("btn-success");
        setTimeout(function(){ $("#download_submit").removeClass("btn-success").addClass("btn-primary"); }, 5000);
        $("#download-file-links").html("<h3 style=\"font-color:#009900\">Thanks! We're building " + resp.filename + " for you now.</h3><h4>You can safely leave the page or submit another job while you await an email with the link to your file</h4>");
        alert("Thanks for submitting your download request.\nWe will email you with a link when your data is ready");
      })
    };
  }]);

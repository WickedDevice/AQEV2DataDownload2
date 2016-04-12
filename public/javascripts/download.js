$(function() {
    $.postJSON = function (url, data, callback) {
        return jQuery.ajax({
            'type': 'POST',
            'url': url,
            'contentType': 'application/json',
            'data': JSON.stringify(data),
            'dataType': 'json',
            'success': callback
        });
    };

    // attach a click handler to the download button
    $("#download_submit").click(function () {
        // compose a valid JSON object

        // Serial Numbers
        var serialNumbers = [].concat($("#serial_numbers").val().split("\n"));
        var validSerialNumbers = serialNumbers.map(function (serialNumber) {
            return serialNumber.trim();
        });

        if (validSerialNumbers.length == 0 || $("#serial_numbers").val().trim() == "") {
            alert("Please enter at least one Serial Nubmer");
            return;
        }

        var postObj = {
            "serial-numbers": validSerialNumbers
        };

        // Start Date
        if($('#start_date')[0].validity && !$('#start_date')[0].validity.valid){
            alert("Start date is not complete / valid.");
            return;
        }

        var startDateStr = $('#start_date').val().trim();
        var startDate = moment(startDateStr);
        if (startDateStr != "" && !startDate.isValid()) {
            alert("Start date is not complete / valid.");
            return;
        }
        else if (startDateStr != "") {
            postObj["start-date"] = startDate.format();
        }

        // End Date
        if($('#end_date')[0].validity && !$('#end_date')[0].validity.valid){
            alert("End date is not complete / valid.");
            return;
        }

        var endDateStr = $('#end_date').val().trim();
        var endDate = moment(endDateStr);
        if (endDateStr != "" && !endDate.isValid()) {
            alert("End date is not complete / valid.");
        }
        else if (endDateStr != "") {
            postObj["end-date"] = endDate.format();
        }

        if(startDateStr != "" && startDate.isValid() && endDateStr != "" && endDate.isValid()){
            if(!endDate.isAfter(startDate)){
                alert("End date must be *after* start date.");
                return;
            }
        }

        // Duration
        var duration = "";
        if($("#durationYears").val() != ""){
            duration += $("#durationYears").val() + "Y";
        }
        if($("#durationMonths").val() != ""){
            duration += $("#durationMonths").val() + "M";
        }
        if($("#durationDays").val() != ""){
            duration += $("#durationDays").val() + "D";
        }

        if(($("#durationHours").val() != "") || ($("#durationMinutes").val() != "")){
            duration += "T";
            if($("#durationHours").val() != ""){
                duration += $("#durationHours").val() + "H";
            }
            if($("#durationMinutes").val() != ""){
                duration += $("#durationMinutes").val() + "M";
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
            return startDateStr != "" && startDate.isValid();
        }

        function validEndDate(){
            return endDateStr != "" && endDate.isValid();
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
            postObj["end-date"] = startDate.add(dur).format();
            delete postObj.duration;
        }
        // Case #2: end date and duration provided, but not start date
        else if(validDuration() && !validStartDate() && validEndDate()){
            var dur = moment.duration(duration);
            postObj["start-date"] = endDate.subtract(dur).format();
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
        }
        // Case #8: start date provided with neither end date, but nor duration
        else if(!validDuration() && validStartDate() && !validEndDate()){
            postObj["end-date"] = moment().format();
        }


        // zip filename, handle the user providing the zip extension, or not
        if($("#zipfilename").val().trim() != ""){
            var fname = $("#zipfilename").val().trim();
            if(/\.zip$/.test(fname)){
                fname = fname.substr(0, fname.length - 4);
            }
            postObj.zipfilename = fname;;
        }

        if($("#use_instant_values").is(':checked')){
            postObj.use_instant_values = true;
        }

        if($("#use_uncompensated_values").is(':checked')){
            postObj.use_uncompensated_values = true;
        }

        var uri = null;
        var guid = null;
        var statusIntervalId = null;
        $('body').addClass("loading");
        $.postJSON("", postObj, function (resp) {
            uri = resp.uri;
            guid = resp.guid;
            $("#download-file-links").html("");
            var status_list = $("#status").html("");
            statusIntervalId = setInterval(function(){
                $.getJSON('/download/status?guid='+guid, function(data, textStatus, jqXHR){
                    if(data){
                        $("#status").html("<ul></ul>");
                        var status_list = $("#status ul")
                        var keys = Object.keys(data);
                        var allDone = true;
                        var atLeastOneWithNoError = false;

                        for(var ii = 0; ii < keys.length; ii++){
                            if(keys[ii] == "complete"){
                                continue;
                            }

                            if(!data[keys[ii]].complete){
                                allDone = false;
                            }

                            var m = moment(data[keys[ii]].timestamp);
                            // convert m to local time
                            m.utcOffset(moment().utcOffset());
                            var numResults = data[keys[ii]].numResults || 0;

                            if(!data[keys[ii]].error){
                                atLeastOneWithNoError = true;
                            }

                            status_list.append("<li>"
                                +keys[ii] + ': '
                                + (data[keys[ii]].complete ? 'done' : (numResults > 0 ? 'in progress' : 'pending'))
                                + ' / ' + numResults
                                + ' / ' + (data[keys[ii]].timestamp ? m.format("MM/DD/YYYY, hh:mm:ss A") : '---')
                                + ((data[keys[ii]].error) ? " [Error: " + data[keys[ii]].errorMessage + "]" : "" )
                                + '</li>');

                        }
                        if(allDone && data.complete){
                            clearInterval(statusIntervalId);
                            $('body').removeClass("loading");
                            if(atLeastOneWithNoError) {
                                $("#download-file-links").html('<a href="' + resp.uri + '">Download File</a><br/>');
                            }
                        }


                    }
                });
            }, 5000);
        });

    });
});
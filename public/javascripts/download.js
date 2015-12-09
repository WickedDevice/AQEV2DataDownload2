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

        if (validSerialNumbers.length == 0) {
            alert("Please enter at least one Serial Nubmer");
            return;
        }

        var postObj = {
            "serial-numbers": validSerialNumbers
        };

        // Start Date
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
        var endDateStr = $('#end_date').val().trim();
        var endDate = moment(endDateStr);
        if (endDateStr != "" && !endDate.isValid()) {
            alert("End date is not complete / valid.");
        }
        else if (endDateStr != "") {
            postObj["end-date"] = startDate.format();
        }

        // Duration
        var duration = $('#duration').val();
        // TODO: figure out how duration works

        $.postJSON("", postObj, function (resp) {
            if (resp.uri) {
                $("#download-file-links").append('<a href="' + resp.uri + '">Download File</a><br/>');
            }
        });

    });
});
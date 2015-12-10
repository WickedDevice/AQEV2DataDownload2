var config = require('../eggdataconfig')();
var opensensors = require('./opensensors')(config)
var Promise = require("bluebird");

module.exports = function() {
    // params has required fields: serial-numbers
    // params has optional fields; start-date, end-date, duration
    return function(params){
        var serialNumbers = params["serial-numbers"];
        var startDate = params["start-date"] == "" ? null : params["start-date"];
        var endDate = params["end-date"] == "" ? null : params["end-date"];
        var apiParams = {};
        if(startDate){
            apiParams["start-date"] = startDate;
        }
        if(endDate){
            apiParams["end-date"] = endDate;
        }

        return Promise.try(function(){
            return serialNumbers;
        }).map(function(serialNumber){
            return {
              serialNumber: serialNumber
            };
        }).map(function(task){ // task is object {serialNumber: 'xyz'}
            return Promise.try(function(){
                task.messages = {}; // this will be a set of arrays
                return opensensors.messages.byDevice(task.serialNumber, apiParams);
            }).catch(function(err){
                return null;
            }).then(function(allMessages){
                if(allMessages) {
                    allMessages.forEach(function (msg) {
                        if (!task.messages[msg.topic]) {
                            task.messages[msg.topic] = [];
                        }
                        task.messages[msg.topic].push(msg);
                    })
                }
                return task;
            });
        }).then(function(tasks){ // so tasks should look like an array of {serialNumber: 'xyz', messages: {topic1: [], topic2: [], ...}} objects
            return tasks;
        });

    };
}

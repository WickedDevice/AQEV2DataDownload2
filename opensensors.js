var Promise = require("bluebird");
var bhttp = Promise.promisifyAll(require("bhttp"));

// config encapsulates opensensors-api-key
// valid keys for config are: api-key (required)
module.exports = function(config) {
    var API_POST_OPTIONS = {
        headers: {
            Accept: "application/json",
            Authorization: "api-key " + config["api-key"]
        }
    };

    var API_BASE_URL = "https://api.opensensors.io";

    // helper (actually workhorse) method that does a GET to a URL
    // it appends the augmented payloads in the response to the second argument that gets passed to it
    // if the response body JSON contains a next element it recursively calls itself
    var recursiveGET = function(url, results){
        console.log("Current Num Results: " + results.length + " -> URL: " + url);
        return Promise.try(function(){
            return bhttp.get(url, API_POST_OPTIONS);
        }).catch(function(err){
            console.error(err);
        }).then(function(response){
            var augmentedPayloads = [];
            if(response.body.messages){
                augmentedPayloads = response.body.messages.map(function(msg){
                    // as it turns out nan is not valid JSON
                    var body = msg.payload.text.replace(/nan/g, 'null');
                    var datum = JSON.parse(body);
                    datum.timestamp = msg.date;
                    datum.topic = msg.topic;
                    return datum;
                });
            }

            var newResults = results.concat(augmentedPayloads);

            if(response.body.next){
                return recursiveGET(API_BASE_URL + response.body.next, newResults);
            }
            else{
                return newResults;
            }
        });
    };

    // this function returns a string to append to a url path
    // to add the [flat] params object as a querystring
    function urlParams(params){
        var ret = "";
        if(Object.keys(params).length > 0){ // if there are any optional params
            ret += '?';

            var encodeParams = Object.keys(params).map(function(key){
                return key + '=' + params[key];
            });

            ret += encodeParams.join('&');
        }
        return ret;
    }

    // this function returns a string to append to a url path
    // to add the [flat] params object as a querystring
    function collectMessagesBy(x, val, params){
        var API_MESSAGES_BY_PATH = "/v1/messages/" + x;
        var url = API_BASE_URL + API_MESSAGES_BY_PATH;
        if(!val){
            console.error(x + "is required");
            return Promise.resolve({});
        }

        url += "/" + val+ urlParams(params);

        return recursiveGET(url, []);
    }

    // returns an array of message payloads from the API, augmented with timestamp
    // valid optional param keys are "start-date", "end-date", and "dur"
    function collectMessagesByDevice(device, params){
        return collectMessagesBy("device", device, params);
    }

    // returns an array of message payloads from the API, augmented with timestamp
    // valid optional param keys are "start-date", "end-date", and "dur"
    function collectMessagesByTopic(topic, params){
        return collectMessagesBy("topic", topic, params);
    }

    // returns an array of message payloads from the API, augmented with timestamp
    // valid optional param keys are "start-date", "end-date", and "dur"
    function collectMessagesByUser(user, params){
        return collectMessagesBy("user", user, params);
    }

    // this is what require(opensensors)(config) actually will return
    return {
        messages: {
            byDevice: collectMessagesByDevice,
            byTopic: collectMessagesByTopic,
            byUser: collectMessagesByUser
        }
    };
};
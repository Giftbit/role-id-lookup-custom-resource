var aws = require("aws-sdk");

/**
 * A Simple Lambda to look up the User ID of a Role
 **/
exports.handler = function(event, context) {

    console.log("REQUEST RECEIVED:\n" + JSON.stringify(event));

    // For Delete requests, immediately send a SUCCESS response.
    if (event.RequestType == "Delete") {
        sendResponse(event, context, "SUCCESS", event.PhysicalResourceId);
        return;
    }

    var roleNames = (event.ResourceProperties.RoleNames || "")
        .split(",")
        .concat(event.ResourceProperties.RoleName)
        .map(function (r) { return r ? r.trim() : r; })
        .filter(function (r) { return r; });

    var iam = new aws.IAM();
    var hasErrored = false;
    var results = [];

    roleNames.forEach(function (roleName, ix) {
        iam.getRole({
            RoleName: roleName
        }, function(err, getRoleResult) {
            if (hasErrored) {
                return;
            }

            if (err) {
                hasErrored = true;
                var responseData = {Error: "Failed to retrieve the Role with Role Name: " + roleName}
                console.log(responseData.Error + ":\n", err);
                sendResponse(event, context, "FAILED", context.logStreamName);
            } else {
                results[ix] = getRoleResult.Role.RoleId;

                // Check if we've got all results.
                for (var i=0; i < roleNames.length; i++) {
                    if (!results[i]) {
                        // We don't.
                        return;
                    }
                }

                if (event.ResourceProperties.AsGrant !== false && event.ResourceProperties.AsGrant !== "false") {
                    results = results.map(function (r) { return r + ":*" });
                }

                sendResponse(event, context, "SUCCESS", results.join(","));
            }
        });
    });
};

// Send response to the pre-signed S3 URL
function sendResponse(event, context, responseStatus, physicalResourceId) {

    var responseBody = JSON.stringify({
        Status: responseStatus,
        Reason: "See the details in CloudWatch Log Stream: " + context.logStreamName,
        PhysicalResourceId: physicalResourceId,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        Data: {}
    });

    console.log("RESPONSE BODY:\n", responseBody);

    var https = require("https");
    var url = require("url");

    var parsedUrl = url.parse(event.ResponseURL);
    var options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.path,
        method: "PUT",
        headers: {
            "content-type": "",
            "content-length": responseBody.length
        }
    };

    console.log("SENDING RESPONSE...\n");

    var request = https.request(options, function(response) {
        console.log("STATUS: " + response.statusCode);
        console.log("HEADERS: " + JSON.stringify(response.headers));
        // Tell AWS Lambda that the function execution is done
        context.done();
    });

    request.on("error", function(error) {
        console.log("sendResponse Error:" + error);
        // Tell AWS Lambda that the function execution is done
        context.done();
    });

    // write data to request body
    request.write(responseBody);
    request.end();
}

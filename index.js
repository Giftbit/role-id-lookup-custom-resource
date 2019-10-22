var aws = require("aws-sdk");

/**
 * A Simple Lambda to look up the User ID of a Role
 */
exports.handler = async function(event, context) {

    console.log("REQUEST RECEIVED:\n" + JSON.stringify(event));

    // For Delete requests, immediately send a SUCCESS response.
    if (event.RequestType === "Delete") {
        sendResponse(event, context, "SUCCESS", event.PhysicalResourceId);
        return;
    }

    const roleNames = (event.ResourceProperties.RoleNames || "")
        .split(",")
        .concat(event.ResourceProperties.RoleName)
        .map(r => r ? r.trim() : r)
        .filter(r => !!r);

    const iam = new aws.IAM();
    const resultPromises = roleNames.map(roleName => new Promise((resolve, reject) => {
        iam.getRole({
            RoleName: roleName
        }, function (err, getRoleResult) {
            if (err) {
                reject(err);
            } else {
                resolve(getRoleResult.Role.RoleId);
            }
        });
    }));

    try {
        let results = await Promise.all(resultPromises);
        if (event.ResourceProperties.AsGrant !== false && event.ResourceProperties.AsGrant !== "false") {
            results = results.map(r => r + ":*");
        }
        sendResponse(event, context, "SUCCESS", results.join(","));
    } catch (err) {
        var responseData = {Error: "Failed to retrieve the Role with Role Name: " + roleName};
        console.log(responseData.Error + ":\n", err);
        sendResponse(event, context, "FAILED", context.logStreamName);
    }
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

    const https = require("https");
    const url = require("url");

    const parsedUrl = url.parse(event.ResponseURL);
    const options = {
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

    return new Promise((resolve, reject) => {
        const request = https.request(options, function(response) {
            console.log("STATUS: " + response.statusCode);
            console.log("HEADERS: " + JSON.stringify(response.headers));
            // Tell AWS Lambda that the function execution is done
            resolve();
        });

        request.on("error", function(error) {
            console.log("sendResponse Error:" + error);
            // Tell AWS Lambda that the function execution is done
            reject(error);
        });

        // write data to request body
        request.write(responseBody);
        request.end();
    });
}

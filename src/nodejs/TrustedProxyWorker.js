/* jshint esversion: 6 */
/* jshint node: true */
"use strict";

const fs = require('fs');
const http = require('http');
const deviceInfoUrl = 'http://localhost:8100/mgmt/shared/identified-devices/config/device-info';
const localauth = 'Basic ' + new Buffer('admin:').toString('base64');

const LOGGINGPREFIX = '[TrustedProxy] ';

/**
 * Trusted Device Proxy which handles only POST requests
 * @constructor
 */
class TrustedProxyWorker {

    constructor() {
        this.WORKER_URI_PATH = "shared/TrustedProxy";
        this.isPassThrough = true;
        this.isPublic = true;
        this.trustedDevices = {};
        this.machineId = null;
    }

    onStart(success, error) {
        if (fs.existsSync('/machineId')) {
            this.machineId = String(fs.readFileSync('/machineId', 'utf8')).replace(/[^ -~]+/g, "");
            this.logger.info('Found proxy machineId in /machineId file');
            this.logger.info('Setting proxy machineId to: ' + this.machineId);
        } else {
            const getDeviceOptions = {
                host: 'localhost',
                port: 8100,
                path: '/mgmt/shared/identified-devices/config/device-info',
                headers: {
                    'Authorization': localauth
                },
                method: 'GET'
            };
            const deviceRequest = http.request(getDeviceOptions, (res) => {
                let body = '';
                res.on('data', (seg) => {
                    body += seg;
                });
                res.on('end', () => {
                    this.machineId = JSON.parse(body).machineId;
                    this.logger.info(LOGGINGPREFIX + ' machineID is: ' + this.machineId);
                    success();
                });
                res.on('error', (err) => {
                    this.logger.severe(LOGGINGPREFIX + 'error: ' + err);
                    error();
                });
            });
            deviceRequest.end();
        }
    }

    /**
     * handle onGet HTTP request - get the query paramater token for a trusted device.
     * @param {Object} restOperation
     */
    onGet(restOperation) {
        const paths = restOperation.uri.pathname.split('/');
        const query = restOperation.getUri().query;
        const targetHost = query.targetHost;
        const targetUUID = query.targetUUID;
        let targetDevice = null;

        if (targetHost) {
            targetDevice = targetHost;
        } else if (targetUUID) {
            targetDevice = targetUUID;
        } else if (paths.length > 3) {
            targetDevice = paths[3];
        }

        if (this.trustedDevices[targetDevice]) {
            this.getToken(this.trustedDevices[targetDevice].address)
                .then((token) => {
                    if (token) {
                        token.targetUUID = this.trustedDevices[targetDevice].machineId;
                        token.targetHost = this.trustedDevices[targetDevice].address;
                        token.targetPort = this.trustedDevices[targetDevice].httpsPort;
                        delete token.address;
                        restOperation.statusCode = 200;
                        restOperation.body = token;
                        this.completeRestOperation(restOperation);
                    } else {
                        const err = new Error('target ' + targetDevice + ' has no token');
                        err.httpStatusCode = 500;
                        restOperation.fail(err);
                    }
                });
        } else {
            this.getTrustedDevices()
                .then((trustedDevices) => {
                    if (targetDevice) {
                        const tokenPromises = [];
                        let targetHostFound = false;
                        trustedDevices.map((trustedDevice) => {
                            if (trustedDevice.address == targetDevice || trustedDevice.machineId == targetDevice) {
                                targetHostFound = true;
                                const tokenPromise = this.getToken(trustedDevice.address)
                                    .then((token) => {
                                        if (token) {
                                            token.targetUUID = trustedDevice.machineId;
                                            token.targetHost = trustedDevice.address;
                                            token.targetPort = trustedDevice.httpsPort;
                                            delete token.address;
                                            restOperation.statusCode = 200;
                                            restOperation.body = token;
                                            this.completeRestOperation(restOperation);
                                        } else {
                                            const err = new Error('target ' + targetDevice + ' has no token');
                                            this.trustedDevices = {};
                                            err.httpStatusCode = 500;
                                            restOperation.fail(err);
                                        }
                                    });
                                tokenPromise.push(tokenPromise);
                            }
                        });
                        Promise.all(tokenPromises)
                            .then(() => {
                                if (!targetHostFound) {
                                    const err = new Error('target ' + targetDevice + ' is not a trusted device');
                                    this.trustedDevices = {};
                                    err.httpStatusCode = 404;
                                    restOperation.fail(err);
                                }
                            });
                    } else {
                        const tokens = {};
                        const tokenPromises = [];
                        trustedDevices.map((trustedDevice) => {
                            const tokenPromise = this.getToken(trustedDevice.address)
                                .then((token) => {
                                    if (token) {
                                        token.targetUUID = trustedDevice.machineId;
                                        token.targetHost = trustedDevice.address;
                                        token.targetPort = trustedDevice.httpsPort;
                                        delete token.address;
                                        tokens[trustedDevice.machineId] = token;
                                    }
                                });
                            tokenPromises.push(tokenPromise);
                        });
                        Promise.all(tokenPromises)
                            .then(() => {
                                restOperation.statusCode = 200;
                                restOperation.body = JSON.stringify(Object.keys(tokens).map(e => tokens[e]));
                                this.completeRestOperation(restOperation);
                            });
                    }
                });
        }
    }

    /**
     * handle onPost HTTP request - proxy reuest to trusted device.
     * @param {Object} restOperation
     */
    onPost(restOperation) {
        const body = restOperation.getBody();
        const refThis = this;
        const paths = restOperation.uri.pathname.split('/');
        if (paths.length > 3) {
            const targetUUID = paths[3];
            // get the targetHost for this UUID
            this.getTargetHostByUUID(targetUUID)
                .then((targetHost) => {
                    if (targetHost) {
                        const targetURI = 'https://' + targetHost + body.uri;
                        // Create the framework request RestOperation to proxy to a trusted device.
                        let identifiedDeviceRequest = this.restOperationFactory.createRestOperationInstance()
                            // Tell the ASG to resolve trusted device for this request.
                            .setIdentifiedDeviceRequest(true)
                            .setIdentifiedDeviceGroupName(body.groupName)
                            // Discern the type of request to proxy from the 'method' attributes in the request body.
                            .setMethod(body.method || "Get")
                            // Discern the URI for the request to proxy from the 'uri' attribute in the request body. 
                            .setUri(this.url.parse(targetURI))
                            // Discern the HTTP headers for the request to proxy from the 'headers' attribute in the request body.
                            .setHeaders(body.headers || restOperation.getHeaders())
                            // Discern the HTTP body for the request to proxy from the 'body' attribute in the request body.
                            .setBody(body.body)
                            // Derive the referer from the parsed URI.
                            .setReferer(this.getUri().href);
                        this.eventChannel.emit(this.eventChannel.e.sendRestOperation, identifiedDeviceRequest,
                            function (resp) {
                                // Return the HTTP status code from the proxied response.
                                restOperation.statusCode = resp.statusCode;
                                // Return the HTTP headers from the proxied response.
                                restOperation.headers = resp.headers;
                                // Return the body from the proxied response.
                                restOperation.body = resp.body;
                                // emmit event to complete this response through the REST framework.
                                refThis.completeRestOperation(restOperation);
                            },
                            function (err) {
                                // The proxied response was an error. Forward the error through the REST framework.
                                refThis.logger.severe(LOGGINGPREFIX + "request to %s failed: \n%s", body.uri, err ? err.message : "");
                                restOperation.fail(err);
                            }
                        );
                    } else {
                        const err = new Error(LOGGINGPREFIX + 'target ' + targetUUID + ' is not a trusted device');
                        err.httpStatusCode = 404;
                        restOperation.fail(err);
                    }
                });
        } else {
            // Create the framework request RestOperation to proxy to a trusted device.
            let identifiedDeviceRequest = this.restOperationFactory.createRestOperationInstance()
                // Tell the ASG to resolve trusted device for this request.
                .setIdentifiedDeviceRequest(true)
                .setIdentifiedDeviceGroupName(body.groupName)
                // Discern the type of request to proxy from the 'method' attributes in the request body.
                .setMethod(body.method || "Get")
                // Discern the URI for the request to proxy from the 'uri' attribute in the request body. 
                .setUri(this.url.parse(body.uri))
                // Discern the HTTP headers for the request to proxy from the 'headers' attribute in the request body.
                .setHeaders(body.headers || restOperation.getHeaders())
                // Discern the HTTP body for the request to proxy from the 'body' attribute in the request body.
                .setBody(body.body)
                // Derive the referer from the parsed URI.
                .setReferer(this.getUri().href);
            this.eventChannel.emit(this.eventChannel.e.sendRestOperation, identifiedDeviceRequest,
                function (resp) {
                    // Return the HTTP status code from the proxied response.
                    restOperation.statusCode = resp.statusCode;
                    // Return the HTTP headers from the proxied response.
                    restOperation.headers = resp.headers;
                    // Return the body from the proxied response.
                    restOperation.body = resp.body;
                    // emmit event to complete this response through the REST framework.
                    refThis.completeRestOperation(restOperation);
                },
                function (err) {
                    // The proxied response was an error. Forward the error through the REST framework.
                    refThis.logger.severe(LOGGINGPREFIX + "request to %s failed: \n%s", body.uri, err ? err.message : "");
                    restOperation.fail(err);
                }
            );
        }
    }

    /**
     * Lookup targetHost by targetUUID.
     * @param targetUUID
     */
    getTargetHostByUUID(targetUUID) {
        return new Promise((resolve) => {
            if (this.trustedDevices[targetUUID]) {
                resolve(this.trustedDevices[targetUUID].address + ":" + this.trustedDevices[targetUUID].httpsPort);
            } else {
                this.getTrustedDevices()
                    .then(() => {
                        if (this.trustedDevices[targetUUID]) {
                            resolve(this.trustedDevices[targetUUID].address + ":" + this.trustedDevices[targetUUID].httpsPort);
                        } else {
                            resolve(null);
                        }
                    });
            }
        });
    }

    /**
     * return back the proxy machine ID
     * @returns string machine UUID
     */
    getProxyMachineId() {
        return new Promise((resolve, reject) => {
            if ( this.machineId ) {
                resolve();
            } else if(fs.existsSync('/machineId')) {
                // this is an ASG container
                this.machineId = String(fs.readFileSync('/machineId', 'utf8')).replace(/[^ -~]+/g, "");
                this.logger.info('Found proxy machineId in /machineId file');
                this.logger.info('Setting proxy machineId to: ' + this.machineId);
                resolve();
            } else {
                const certGetRequest = this.restOperationFactory.createRestOperationInstance()
                    .setUri(this.url.parse(deviceInfoUrl))
                    .setBasicAuthorization(localauth)
                    .setIsSetBasicAuthHeader(true)
                    .setReferer(this.getUri().href);
                this.restRequestSender.sendGet(certGetRequest)
                    .then((response) => {
                        const deivceInfoBody = response.getBody();
                        if (deivceInfoBody.hasOwnProperty('machineId')) {
                            this.logger.info('Setting proxy machineId to: ' + deivceInfoBody.machineId);
                            this.machineId = deivceInfoBody.machineId;
                            resolve();
                        } else {
                            const err = new Error('can not resolve proxy machineId');
                            reject(err);
                        }
                    })
                    .catch((err) => {
                        const throwErr = new Error('Error get machineId on the proxy :' + err.message);
                        this.logger.severe(LOGGINGPREFIX + throwErr.message);
                        reject(throwErr);
                    });
            }
        });
    }


    /**
     * collect all trusted devices.
     */
    getTrustedDevices() {
        return new Promise((resolve) => {
            this.trustedDevices = {};
            const getDeviceGroupsOptions = {
                host: 'localhost',
                port: 8100,
                path: '/mgmt/shared/resolver/device-groups',
                headers: {
                    'Authorization': localauth
                },
                method: 'GET'
            };
            const deviceGroupRequest = http.request(getDeviceGroupsOptions, (res) => {
                let body = '';
                res.on('data', (seg) => {
                    body += seg;
                });
                res.on('end', () => {
                    if (res.statusCode < 400) {
                        const deviceGroups = JSON.parse(body).items;
                        const trustedGroups = [];
                        const trustedDevicePromises = [];
                        const trustedDevices = [];
                        deviceGroups.map((deviceGroup) => {
                            if (deviceGroup.groupName.startsWith('TrustProxy')) {
                                trustedGroups.push(deviceGroup.groupName);
                            }
                        });
                        trustedGroups.map((groupName) => {
                            const devicePromise = new Promise((resolve, reject) => {
                                const getDevicesOptions = {
                                    host: 'localhost',
                                    port: 8100,
                                    path: '/mgmt/shared/resolver/device-groups/' + groupName + '/devices',
                                    headers: {
                                        'Authorization': localauth
                                    },
                                    method: 'GET'
                                };
                                const deviceRequest = http.request(getDevicesOptions, (res) => {
                                    let body = '';
                                    res.on('data', (seg) => {
                                        body += seg;
                                    });
                                    res.on('end', () => {
                                        if (res.statusCode < 400) {
                                            const devices = JSON.parse(body).items;
                                            devices.map((device) => {
                                                if (this.machineId != device.machineId) {
                                                    // populate trustedDevices cache
                                                    this.trustedDevices[device.machineId] = device;
                                                    trustedDevices.push(device);
                                                }
                                            });
                                        }
                                        resolve();
                                    });
                                });
                                deviceRequest.end();
                            });
                            trustedDevicePromises.push(devicePromise);
                        });
                        Promise.all(trustedDevicePromises)
                            .then(() => {
                                resolve(trustedDevices);
                            });
                    } else {
                        this.logger.severe(LOGGINGPREFIX + 'no device groups found');
                        resolve([]);
                    }
                });
                res.on('error', (err) => {
                    this.logger.severe(LOGGINGPREFIX + 'error getting trusted devices:' + err.message);
                    resolve([]);
                });
            });
            deviceGroupRequest.end();
        });
    }

    /**
     * handle getToken request - get the query paramater token for a trusted device.
     * @param {String} trust token good for 10 minutes
     */
    getToken(targetHost) {
        return new Promise((resolve) => {
            const tokenBody = JSON.stringify({
                address: targetHost
            });
            let body = '';
            const postOptions = {
                host: 'localhost',
                port: 8100,
                path: '/shared/token',
                headers: {
                    'Authorization': localauth,
                    'Content-Type': 'application/json',
                    'Content-Length': tokenBody.length
                },
                method: 'POST'
            };
            const request = http.request(postOptions, (res) => {
                res.on('data', (seg) => {
                    body += seg;
                });
                res.on('end', () => {
                    resolve(JSON.parse(body));
                });
                res.on('error', (err) => {
                    this.logger.severe(LOGGINGPREFIX + 'error: ' + err);
                    resolve(null);
                });
            });
            request.write(tokenBody);
            request.end();
        });
    }
}

module.exports = TrustedProxyWorker;
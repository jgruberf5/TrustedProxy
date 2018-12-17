# TrustedProxy
**iControlLX extension to proxy iControl REST requests to trusted devices**

The iControlLX extension framework provides the ability to sign requests destined for trusted devices. This extension provides two modes of operation which provide request signing.

## Proxied Requests ##

Using iControl REST `POST` requests, this extension provides a full proxy to trusted TMOS devices. The `POST` request body syntax determines the proxied method type and the targeted device and iControl REST path. The returned response is a direct copy of the trusted device's response to the proxied request.

## Query Parameter Tokens ##

Using iControl REST `GET` requests, this extension provides query parameters which,when added to a direct iControl REST request on a trusted device, will provided `Administrator` role access. The supplied query parameters function as a signing token and are valid for only 10 minutes.

## Building the Extension ##

The repository includes the ability to simply run 

`npm run-script build` 

in the repository root folder. In order for this run-script to work, you will need to be on a linux workstation with the `rpmbuild` utility installed.

Alternatively rpm builds can be downloaded from the releases tab on github.

## Installing the Extension ##

The installation instructions for iControlLX rpm packages is found here:

[Installing iControlLX Extensions](https://clouddocs.f5.com/products/iapp/iapp-lx/docker-1_0_4/icontrollx_pacakges/working_with_icontrollx_packages.html)

This extension has been tested on TMOS version 13.1.1 and the [API Service Gateway](https://hub.docker.com/r/f5devcentral/f5-api-services-gateway/) container.

## Full Proxy Request Signing ##

This extension extends the iControl REST URI namespace at:

`/mgmt/shared/TrustedProxy`

Proxied request are issued using only the `POST` method. The `POST` body will determine the targeted trusted device and iControl REST URI to proxy a request. The `POST` takes the following form:

```
{
    "method": "Get|Post|Put|Patch|Delete",
    "uri": "[iControl REST URL]",
    "body": [iControl REST request body] - optional,
    "headers": [{"header_name": "header_value"}] - optional
}
```

As an example, to query the `/mgmt/shared/identified-devices/config/device-info` iControl REST URI endpoint on trusted host `172.13.1.107`, your proxy request would look like this:

`POST /mgmt/shared/TrustedProxy`

Body

```
{
    "method": "Get",
    "uri": https://172.13.1.107/mgmt/shared/identified-devices/config/device-info",
}
```

Response

```
{
    "baseMac": "FA:16:3E:60:23:F6",
    "hostMac": "FA:16:3E:60:23:F6",
    "time": 1545069331438,
    "halUuid": "e83742df-388d-6349-9760-659a10e35f55",
    "physicalMemory": 1984,
    "platform": "Z100",
    "chassisSerialNumber": "e83742df-388d-6349-659a10e35f55",
    "cpu": "Intel Core Processor (Skylake, IBRS)",
    "slots": [
        {
            "volume": "HD1.1",
            "product": "BIG-IP",
            "version": "13.1.1",
            "build": "0.0.4",
            "isActive": true
        }
    ],
    "license": {
        "licenseEndDateTime": "2019-01-29T00:00:00-08:00",
        "registrationKey": "XFIPS-JAOWV-NKZOB-OFRJU-XCZSAAT",
        "activeModules": [
            "APM, Base, VE GBB (500 CCU, 2500 Access Sessions)|HADEXXT-KPWUWHN|Anti-Virus Checks|Base Endpoint Security Checks|Firewall Checks|Network Access|Secure Virtual Keyboard|APM, Web Application|Machine Certificate Checks|Protected Workspace|Remote Desktop|App Tunnel",
            "Best Bundle, VE-10G|HOYCSOL-ADYGDYE|SSL, Forward Proxy, VE|DNS and GTM (250 QPS), VE|Advanced Protocols, VE|Rate Shaping|DNSSEC|GTM Licensed Objects, Unlimited|DNS Licensed Objects, Unlimited|DNS Rate Fallback, 250K|GTM Rate Fallback, 250K|GTM Rate, 250K|DNS Rate Limit, 250K QPS|ASM, VE|DNS-GTM, Base, 10Gbps|SSL, VE|Max Compression, VE|AFM, VE|Routing Bundle, VE|PSM, VE|VE, Carrier Grade NAT (AFM ONLY)",
            "PEM, ADD-VE, 5G|HCGBCYA-GBZKKSB"
        ],
        "generation": 0,
        "lastUpdateMicros": 1544816975846287
    },
    "interfaces": [
        "mgmt",
        "1.2",
        "1.1"
    ],
    "isIControlRestSupported": true,
    "icrdPort": 8100,
    "machineId": "7390b3b8-7682-4554-83e5-764e4f26703c",
    "address": "1.1.1.109",
    "hostname": "test-bigip2.sample.openstack.f5se.com",
    "version": "13.1.1",
    "product": "BIG-IP",
    "platformMarketingName": "BIG-IP Virtual Edition",
    "edition": "Final",
    "build": "0.0.4",
    "restFrameworkVersion": "13.1.1-0.0.4",
    "managementAddress": "192.168.245.102",
    "mcpDeviceName": "/Common/test-bigip2.novalocal",
    "trustDomainGuid": "6d668c34-3281-4e50-8363fa163e6023f6",
    "isClustered": false,
    "isVirtual": true,
    "generation": 0,
    "lastUpdateMicros": 0,
    "kind": "shared:resolver:device-groups:deviceinfostate",
    "selfLink": "https://localhost/mgmt/shared/identified-devices/config/device-info"
}
```

The response is a copy of what the remote trusted device replied to the proxy.

As an example of a proxied `POST` request, here is an example issuing an AS3 declaration to the trusted host at `172.13.1.107`:

`POST /mgmt/shared/TrustedProxy`

Body

```
{
	"method": "Post",
	"uri": "https://172.13.1.107/mgmt/shared/appsvcs/declare",
	"body": {
		"class": "AS3",
		"action": "deploy",
		"persist": true,
		"declaration": {
			"class": "ADC",
			"schemaVersion": "3.0.0",
			"id": "fghijkl7890",
			"label": "Sample 1",
			"remark": "HTTP with custom persistence",
			"Sample_http_01": {
				"class": "Tenant",
				"A1": {
					"class": "Application",
					"template": "http",
					"serviceMain": {
						"class": "Service_HTTP",
						"virtualAddresses": [
							"10.0.6.10"
						],
						"pool": "web_pool",
						"persistenceMethods": [{
							"use": "jsessionid"
						}]
					},
					"web_pool": {
						"class": "Pool",
						"monitors": [
							"http"
						],
						"members": [{
							"servicePort": 80,
							"serverAddresses": [
								"192.0.6.10",
								"192.0.6.11"
							]
						}]
					},
					"jsessionid": {
						"class": "Persist",
						"persistenceMethod": "cookie",
						"cookieMethod": "hash",
						"cookieName": "JSESSIONID"
					}
				}
			}
		}
	}
}
```

Response

```
{
    "results": [
        {
            "message": "success",
            "lineCount": 25,
            "code": 200,
            "host": "localhost",
            "tenant": "Sample_http_01",
            "runTime": 2368
        }
    ],
    "declaration": {
        "class": "ADC",
        "schemaVersion": "3.0.0",
        "id": "fghijkl7890",
        "label": "Sample 1",
        "remark": "HTTP with custom persistence",
        "Sample_http_01": {
            "class": "Tenant",
            "A1": {
                "class": "Application",
                "template": "http",
                "serviceMain": {
                    "class": "Service_HTTP",
                    "virtualAddresses": [
                        "10.0.6.10"
                    ],
                    "pool": "web_pool",
                    "persistenceMethods": [
                        {
                            "use": "jsessionid"
                        }
                    ]
                },
                "web_pool": {
                    "class": "Pool",
                    "monitors": [
                        "http"
                    ],
                    "members": [
                        {
                            "servicePort": 80,
                            "serverAddresses": [
                                "192.0.6.10",
                                "192.0.6.11"
                            ]
                        }
                    ]
                },
                "jsessionid": {
                    "class": "Persist",
                    "persistenceMethod": "cookie",
                    "cookieMethod": "hash",
                    "cookieName": "JSESSIONID"
                }
            }
        },
        "updateMode": "selective",
        "controls": {
            "archiveTimestamp": "2018-12-17T18:02:34.273Z"
        }
    }
}
```

## Query Parameter Token Signing ##

As an alternative to proxying the requests through an iControlLX extension, orchestration applications can directly access trusted devices through the use of query parameter tokens.

This is often the easier path for existing iControl REST applications which can not place all requests through a `POST` method. In addition, this method can ease the need for queuing associated with heavier weight iControl REST requests which are better handled by issuing the request directly to trusted hosts.

This extension extends the iControl REST URI namespace at:

`/mgmt/shared/TrustedProxy`

Placing `GET` requests to this iControl REST URI endpoint will either a list of tokens for all trusted devices, or a filtered list when a `targetHost` query parameter is supplied.

`GET /mgmt/shared/TrustedProxy`

Response

```
{
    "172.13.1.107": "{\"address\":\"172.13.1.107\",\"queryParam\":\"em_server_ip=1.1.1.104&em_server_auth_token=Lm7Pb7LerVQ6F9sIq0Mh0m%2FREdfXZE8oaApcXPTbDIQbYO8WT4D0yf2%2Bun58vON0aGMZDvM1YwN%2Fe%2FJrSBkpRJc79ZlVsZCRQgYgNnut6Xc5f1fj3ppnN0ABw6r%2BzDEnEzwdX5tTdRNAB1uCS4GnkZzSJm%2BJ9hy5qIx5WddYjLo247w6qR1L6FYWJk0mN%2F9qcnQg1e2KL1MMUMs8b6EMkKlEiMFLzw3SLRKEbb%2BSBk9g2iMPj99d%2FHH6K%2FCeP%2FgxkAmFq8DUYWseShQ3caJd7dlAkWQXOnsXV8awH6Rcr2s6LEJR9Lwu%2BHmmxuvFrqipfKue5DR46FHLMCxqaBqc2Q%3D%3D\",\"timestamp\":1545070309925}",
    "1.1.1.104": "{\"address\":\"1.1.1.104\",\"queryParam\":\"em_server_ip=1.1.1.104&em_server_auth_token=Lm7Pb7LerVQ6F9sIq0Mh0m%2FREdfXZE8oaApcXPTbDIQbYO8WT4D0yf2%2Bun58vON0aGMZDvM1YwN%2Fe%2FJrSBkpRJc79ZlVsZCRQgYgNnut6Xc5f1fj3ppnN0ABw6r%2BzDEnEzwdX5tTdRNAB1uCS4GnkZzSJm%2BJ9hy5qIx5WddYjLo247w6qR1L6FYWJk0mN%2F9qcnQg1e2KL1MMUMs8b6EMkKlEiMFLzw3SLRKEbb%2BSBk9g2iMPj99d%2FHH6K%2FCeP%2FgxkAmFq8DUYWseShQ3caJd7dlAkWQXOnsXV8awH6Rcr2s6LEJR9Lwu%2BHmmxuvFrqipfKue5DR46FHLMCxqaBqc2Q%3D%3D\",\"timestamp\":1545070309968}"
}
```

`GET /mgmt/shared/TrustedProxy?targetHost=172.13.1.107`

Response

```
{
    "172.13.1.107": "{\"address\":\"172.13.1.107\",\"queryParam\":\"em_server_ip=1.1.1.104&em_server_auth_token=VOtAcdlDL1bmXwPpNh%2F2c6Hp39dpy7wXLFIgLEpdtidJtgR%2FqrVnLQ2p3YlfY7RY%2BxadmcDCdrpTx7krkBtsvuGfCt%2BlfgpB%2FiP%2BqDOZ0SpiE6fhjC7RnYcW2%2FhCagaOw%2FnOSIqi%2BbqPXI77m4gPcYz0Mn%2BS9vd0Nc%2Fi4kFjpdH40SFI1CLX2GtkDDL8AEKUZvIvisRdQIDfo1NOi5jbH8N0BjxV1q%2FEHCz6Gn0w9vQnsl6oZRiAKSSL7GJ1arbfvvul4rlDGxH6CVXDR5aWbx2hXgdKDQ7oOzn5XpRnbTH7Cw3hhYfBSdWGg5DSn1wdbsfISQXMxPZ%2FiSh8XXPgZQ%3D%3D\",\"timestamp\":1545070378115}"
}
```

The response takes the form of:

```
{
    "[trusted_device]" : "{\"address\":\"[trusted_device]\",
                           \"queryParam\":\"[query_parameter_toke]\"
                           \"timestamp\":\"[unix_timestamp]\"}"
}
```

The value can be parsed as a JSON object. The resulting `queryParam` attribute can be appending to a direct iControl REST request instead of using credentials or including an `X-F5-Auth-Token` header. The `timestamp` parameter indicates the Unix epoch timestamp when the token was issued. The token is good for 10 minutes (600 seconds). 

Attempts to use a token beyond its lifetime will yield `401 Unauthorized` response. New tokens can be issued at any time.

As an example of using the above issued query parameter signing token, we could get the device information by directly querying trusted host `172.13.1.107` as follows:

`GET /mgmt/shared/identified-devices/config/device-info?em_server_ip=1.1.1.104&em_server_auth_token=VOtAcdlDL1bmXwPpNh%2F2c6Hp39dpy7wXLFIgLEpdtidJtgR%2FqrVnLQ2p3YlfY7RY%2BxadmcDCdrpTx7krkBtsvuGfCt%2BlfgpB%2FiP%2BqDOZ0SpiE6fhjC7RnYcW2%2FhCagaOw%2FnOSIqi%2BbqPXI77m4gPcYz0Mn%2BS9vd0Nc%2Fi4kFjpdH40SFI1CLX2GtkDDL8AEKUZvIvisRdQIDfo1NOi5jbH8N0BjxV1q%2FEHCz6Gn0w9vQnsl6oZRiAKSSL7GJ1arbfvvul4rlDGxH6CVXDR5aWbx2hXgdKDQ7oOzn5XpRnbTH7Cw3hhYfBSdWGg5DSn1wdbsfISQXMxPZ%2FiSh8XXPgZQ%3D%3D`

